// src/GamePage.js
import React, { useCallback, useState, useEffect, useMemo, useRef } from "react";
import { HelpCircle, History, X } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import { socket } from "./socket";
import { formatBirr } from "./utils/money";
import CoinAmount from "./CoinAmount";

const rankOrder = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
const PAGE_TOP_PADDING = "80px";
const suitOrder = ["♠", "♥", "♦", "♣"];

const roundMoney = (value) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
};

const getCommissionRate = (entryFee, gamesPlayed = 0) => {
  const fee = Number(entryFee || 0);
  if (fee <= 0) return 0;
  let rate = 0.02;
  if (fee >= 250) rate = 0.12;
  else if (fee >= 100) rate = 0.1;
  else if (fee >= 50) rate = 0.08;
  else if (fee >= 25) rate = 0.06;
  else if (fee >= 10) rate = 0.04;
  return Math.min(rate + Math.max(Number(gamesPlayed || 0), 0) * 0.01, 0.25);
};

const calculateCommissionAmount = (totalPot, entryFee, gamesPlayed = 0) => {
  const pot = roundMoney(totalPot);
  if (pot <= 0) return 0;
  return Math.min(pot, Math.max(1, Math.ceil(pot * getCommissionRate(entryFee, gamesPlayed))));
};

const isJoker = (card) => String(card?.rank || "").toUpperCase() === "JOKER";
const isBotPlayer = (playerId) => String(playerId || "").startsWith("botgamer:");
const getJokerIconSrc = (card) => {
  if (!isJoker(card)) return "";
  const cardColor = String(card?.color || "").toLowerCase();
  return cardColor.includes("e74") || cardColor.includes("red")
    ? "/jockericonR.png"
    : "/jockericonB.png";
};

const getRankCounts = (cards = [], includeJokers = false) => cards.reduce((acc, card) => {
  const rank = card?.rank;
  if (!rank) return acc;
  if (!includeJokers && isJoker(card)) return acc;
  acc[rank] = (acc[rank] || 0) + 1;
  return acc;
}, {});

const matchesWinningPattern = (counts = []) => {
  const pattern = counts.slice().sort((a, b) => b - a);
  return pattern.length === 4 &&
    pattern[0] === 4 &&
    pattern[1] === 3 &&
    pattern[2] === 3 &&
    pattern[3] === 1;
};

const canCompletePatternWithJokers = (counts = [], jokerCount = 0) => {
  const search = (currentCounts, remainingJokers) => {
    if (remainingJokers === 0) return matchesWinningPattern(currentCounts);

    for (let index = 0; index < currentCounts.length; index += 1) {
      if (currentCounts[index] >= 4) continue;
      const nextCounts = [...currentCounts];
      nextCounts[index] += 1;
      if (search(nextCounts, remainingJokers - 1)) return true;
    }

    return false;
  };

  return search(counts.slice(), jokerCount);
};

const analyzeWinningHand = (cards = []) => {
  const jokerCount = cards.filter(isJoker).length;
  const naturalCounts = Object.values(getRankCounts(cards, false)).sort((a, b) => b - a);
  const naturalPattern = matchesWinningPattern(naturalCounts);
  const jokerBonus = false;

  return {
    isWinning: naturalPattern || canCompletePatternWithJokers(naturalCounts, jokerCount),
    jokerCount,
    jokerBonus,
  };
};

function GamePage() {

  const location = useLocation();
  const navigate = useNavigate();
  const { roomId: routeRoomId } = useParams();
  const { user, refreshUser } = useUser();
  const { settings, t, ui } = useSettings();
  
  // Update this to match your actual backend URL/port
  const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

  // ✨ Use state to hold game data, making it reactive to socket updates
  const [room, setRoom] = useState(location.state?.room || null);
  const [players, setPlayers] = useState(location.state?.players || []);
  const [gameState, setGameState] = useState(location.state?.redisData || {});

  // Click & Action States
  const [selectedHandIndex, setSelectedHandIndex] = useState(null);
  const [deckSelected, setDeckSelected] = useState(false);
  const [laidSelected, setLaidSelected] = useState(false);
  const [highlightedCardKey, setHighlightedCardKey] = useState(null);
  const prevMyCardsRef = useRef([]);
  const prevGameStatusRef = useRef(location.state?.redisData?.status || null);
  const prevGameEndedRef = useRef(Boolean(location.state?.redisData?.gameEnded || location.state?.redisData?.status === "ended"));
  const prevTurnRef = useRef(location.state?.redisData?.turn || null);
  const prevWaitingRef = useRef(false);
  const prevLedgerKeyRef = useRef("");
  const audioRefs = useRef({});
  const [flyingCard, setFlyingCard] = useState(null);
  const [isDealing, setIsDealing] = useState(false);
  const [isWinning, setIsWinning] = useState(false);
  
  // ✨ UI feedback states
  const [errorMsg, setErrorMsg] = useState("");
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [practiceHelpDismissed, setPracticeHelpDismissed] = useState(false);
  const [leaveSummary, setLeaveSummary] = useState(null);
  const [playerProfiles, setPlayerProfiles] = useState({});
  const [insufficientBalancePopup, setInsufficientBalancePopup] = useState(null);
  const [pickedCardDecision, setPickedCardDecision] = useState(null);
  const [opponentPickIndicator, setOpponentPickIndicator] = useState(null);
  const [showGameRules, setShowGameRules] = useState(false);
  const lastPickNonceRef = useRef(null);
  const laidHistoryRef = useRef(null);
  const isLeavingRef = useRef(false);

  useEffect(() => {
    if (room || !routeRoomId || !user?.telegramId) return;

    const resumeGame = async () => {
      try {
        const roomResponse = await fetch(`${BASE_URL}/room/${encodeURIComponent(routeRoomId)}`);
        const roomInfo = await roomResponse.json().catch(() => ({}));
        const routeRoom = roomInfo?.room;
        const routeRoomPlayers = (routeRoom?.players || []).map(String);
        if (
          roomResponse.ok &&
          routeRoom?.visibility === "private" &&
          !routeRoomPlayers.includes(String(user.telegramId))
        ) {
          navigate(`/second?roomId=${encodeURIComponent(routeRoomId)}&privateShare=1`, { replace: true });
          return;
        }

        const response = await fetch(`${BASE_URL}/join-room`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: routeRoomId,
            userId: user.telegramId,
            socketId: socket.id,
          }),
        });
        const data = await response.json();
        if (data.alreadyInRoom && data.room?.id) {
          navigate(`/game/${data.room.id}`, { replace: true });
          return;
        }
        if (!response.ok || !data.success) {
          navigate("/second", { replace: true });
          return;
        }
        setRoom(data.room);
        setPlayers(data.players || []);
        setGameState(data.redisData || {});
      } catch (error) {
        console.error("Error resuming game:", error);
        navigate("/second", { replace: true });
      }
    };

    resumeGame();
  }, [BASE_URL, navigate, room, routeRoomId, user?.telegramId]);

  useEffect(() => {
    const handleRoomUpdate = (data) => {
      console.log("📢 Received room_update:", data);
      setRoom(data.room);
      setPlayers(data.players);
      setGameState(data.redisData);
    };
    socket.on("room_update", handleRoomUpdate);

    return () => {
      socket.off("room_update", handleRoomUpdate);
    };
  }, []); 

  useEffect(() => {
    if (!room) return undefined;

    const activeRoomId = String(room.id || room.roomId || room.name);
    const handleRoomDeleted = ({ roomId }) => {
      if (String(roomId) === activeRoomId) {
        navigate("/second", { replace: true });
      }
    };

    socket.on("room_deleted", handleRoomDeleted);

    return () => {
      socket.off("room_deleted", handleRoomDeleted);
    };
  }, [navigate, room]);

  // Extract game state from the state variable
  const playerCards = useMemo(() => gameState.playerCards || {}, [gameState.playerCards]);
  const laidCards = useMemo(() => gameState.laidCards || [], [gameState.laidCards]);
  const turn = gameState.turn;
  const gameEnded = Boolean(gameState.gameEnded || gameState.status === "ended");
  const gameResult = gameState.gameResult || null;
  const gamePaused = Boolean(gameState.paused || gameState.leaveVote?.active);
  const isRoomCreator = Boolean(user && room && String(room.creatorId) === String(user.telegramId));
  const roomStats = gameState.roomStats || room?.roomStats || {};
  const isPracticeGame = Boolean(gameState.practice || roomStats.practice);
  const botProfile = roomStats.botProfile || gameState.botProfile || room?.roomStats?.botProfile || null;
  const gameHistory = roomStats.games || [];
  const currentRoundNumber = Number(roomStats.gamesPlayed || 0) + (gameState.status === "playing" ? 1 : 0);
  const progressPlayers = (roomStats.escrowPlayers?.length ? roomStats.escrowPlayers : players) || [];
  const completedPot = Number(roomStats.totalPot || 0);
  const currentRoundPot = Number(roomStats.currentRoundPot || 0);
  const totalPot = completedPot + currentRoundPot;
  const ledgerKey = [
    roomStats.feeEscrowed ? "escrowed" : "not-escrowed",
    roomStats.escrowRefunded ? "refunded" : "not-refunded",
    roomStats.escrowSettled ? "settled" : "not-settled",
    roomStats.finalizedAt || "",
  ].join(":");
  const myUserId = user?.telegramId ? String(user.telegramId) : "";
  const storedCommissionAmount = Number(roomStats.commissionAmount || 0);
  const currentRoundCommission = roomStats.feeEscrowed && currentRoundPot > 0
    ? calculateCommissionAmount(currentRoundPot, roomStats.entryFee || room?.entryFee, Number(roomStats.gamesPlayed || 0) + 1)
    : 0;
  const projectedCommission = Math.round(
    (roomStats.escrowSettled || roomStats.finalizedAt)
      ? storedCommissionAmount
      : storedCommissionAmount + currentRoundCommission
  );
  const myFeesPaid = Number(roomStats.playerFeesPaid?.[myUserId] || 0);
  const myProjectedWin = Number(
    roomStats.payouts?.[myUserId] || 0
  );
  const completedGamesForYou = gameHistory.filter((game) => (
    (game.players || []).some((playerId) => String(playerId) === myUserId)
  ));
  const myCompletedWins = completedGamesForYou.filter((game) => String(game.winnerId) === myUserId).length;
  const myCompletedLosses = Math.max(completedGamesForYou.length - myCompletedWins, 0);
  const myPaidOut = Number(roomStats.payouts?.[myUserId] || 0);
  const currentRoundFeeAtRisk = roomStats.feeEscrowed &&
    (roomStats.currentRoundPlayers || []).some((playerId) => String(playerId) === myUserId)
      ? Number(roomStats.entryFee || room?.entryFee || 0)
      : 0;
  const getPlayerName = useCallback((playerId) => {
    const normalizedId = String(playerId || "");
    if (String(user?.telegramId || "") === normalizedId) {
      return t("you");
    }
    if (isBotPlayer(normalizedId)) {
      return botProfile?.displayName || t("teachingBot");
    }

    return playerProfiles[normalizedId]?.displayName || `${t("player")} ${normalizedId.slice(-4)}`;
  }, [botProfile?.displayName, playerProfiles, t, user?.telegramId]);

  useEffect(() => {
    const playerIds = [...new Set((players || []).map(String).filter((playerId) => playerId && !isBotPlayer(playerId)))];
    if (!playerIds.length) return undefined;

    let isCancelled = false;
    const loadProfiles = async () => {
      try {
        const response = await fetch(`${BASE_URL}/users/public`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userIds: playerIds }),
        });
        const data = await response.json();
        if (!response.ok || !data.success || isCancelled) return;
        setPlayerProfiles(Object.fromEntries((data.users || []).map((profile) => [
          String(profile.telegramId),
          profile,
        ])));
      } catch (error) {
        console.warn("Could not load player profiles:", error);
      }
    };

    loadProfiles();
    return () => {
      isCancelled = true;
    };
  }, [BASE_URL, players]);

  const playSound = useCallback((name) => {
    if (!settings.sound) return;

    const sources = {
      turn: "/1.mp3",
      waiting: "/2.mp3",
      deal: "/3.mp3",
    };
    const source = sources[name] || sources.deal;

    try {
      if (!audioRefs.current[name]) {
        audioRefs.current[name] = new Audio(source);
      }

      const audio = audioRefs.current[name];
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch (error) {
      console.warn("Could not play sound:", error);
    }
  }, [settings.sound]);

  // Get actual cards for the logged-in user
  const myCards = useMemo(
    () => (user && playerCards[user.telegramId] ? playerCards[user.telegramId] : []),
    [playerCards, user]
  );

  useEffect(() => {
    if (!ledgerKey || ledgerKey === prevLedgerKeyRef.current) return;

    const shouldRefreshBalance = Boolean(
      roomStats.feeEscrowed ||
      roomStats.escrowRefunded ||
      roomStats.escrowSettled ||
      roomStats.finalizedAt
    );

    prevLedgerKeyRef.current = ledgerKey;
    if (shouldRefreshBalance) {
      refreshUser?.();
    }
  }, [
    ledgerKey,
    refreshUser,
    roomStats.escrowRefunded,
    roomStats.escrowSettled,
    roomStats.feeEscrowed,
    roomStats.finalizedAt,
  ]);

  useEffect(() => {
    const previousStatus = prevGameStatusRef.current;
    const currentStatus = gameState.status || null;

    if (previousStatus !== "playing" && currentStatus === "playing") {
      playSound("deal");
      setIsDealing(true);
      const timer = setTimeout(() => setIsDealing(false), 900);
      prevGameStatusRef.current = currentStatus;
      return () => clearTimeout(timer);
    }

    prevGameStatusRef.current = currentStatus;
    return undefined;
  }, [gameState.status, playSound]);

  useEffect(() => {
    const wasEnded = prevGameEndedRef.current;
    if (!wasEnded && gameEnded) {
      setIsWinning(true);
      const timer = setTimeout(() => setIsWinning(false), 1800);
      prevGameEndedRef.current = gameEnded;
      return () => clearTimeout(timer);
    }

    prevGameEndedRef.current = gameEnded;
    return undefined;
  }, [gameEnded]);

  // Detect newly picked card and highlight it
  useEffect(() => {
    const prevCards = prevMyCardsRef.current || [];

    if (prevCards.length > 0 && myCards.length === prevCards.length + 1) {
      const countCards = (cards) => {
        return cards.reduce((acc, card) => {
          const key = `${card.rank}-${card.suit}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});
      };

      const prevMap = countCards(prevCards);
      const newMap = countCards(myCards);
      let newKey = null;
      Object.keys(newMap).forEach((key) => {
        if ((prevMap[key] || 0) < newMap[key]) {
          newKey = key;
        }
      });

      if (newKey) {
        setHighlightedCardKey(newKey);
      }
    }

    prevMyCardsRef.current = myCards;
  }, [myCards]);

  // Trigger and clean up flying card animation
  useEffect(() => {
    if (!flyingCard || flyingCard.animate) return;

    const raf = requestAnimationFrame(() => {
      setFlyingCard((prev) => (prev ? { ...prev, animate: true } : prev));
    });

    const timer = setTimeout(() => {
      setFlyingCard(null);
    }, 600);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
  }, [flyingCard]);

  // ✨ GAME RULES LOGIC
  const isMyTurn = user && String(turn) === String(user.telegramId);
  const canPick = !gameEnded && !gamePaused && isMyTurn && myCards.length === 10;
  const canLay = !gameEnded && !gamePaused && isMyTurn && myCards.length === 11;
  const winAnalysis = analyzeWinningHand(myCards);
  const canDeclareWin =
    !gameEnded &&
    !gamePaused &&
    isMyTurn &&
    myCards.length === 11 &&
    winAnalysis.isWinning;
  const currentPracticeTip = useMemo(() => {
    if (!isPracticeGame || gameEnded) return null;
    if (canDeclareWin) {
      return { key: "win", text: t("practiceCoachWin"), placement: "win" };
    }
    if (canLay) {
      return { key: "lay", text: t("practiceCoachLay"), placement: "hand" };
    }
    if (canPick) {
      return { key: "pick", text: t("practiceCoachPick"), placement: "deck" };
    }
    if (!isMyTurn) {
      return { key: "watch", text: t("practiceCoachWatch"), placement: "opponent" };
    }
    return null;
  }, [canDeclareWin, canLay, canPick, gameEnded, isMyTurn, isPracticeGame, t]);
  const showPracticeTip = Boolean(currentPracticeTip && !practiceHelpDismissed);

  useEffect(() => {
    const previousTurn = prevTurnRef.current;
    const currentTurn = turn || null;
    const currentUserId = user?.telegramId;

    if (
      currentUserId &&
      String(currentTurn) === String(currentUserId) &&
      String(previousTurn) !== String(currentUserId) &&
      !gameEnded &&
      !gamePaused
    ) {
      playSound("turn");
    }

    prevTurnRef.current = currentTurn;
  }, [gameEnded, gamePaused, playSound, turn, user?.telegramId]);

  useEffect(() => {
    const isWaiting = Boolean(gameState.status === "waiting" || gamePaused);

    if (isWaiting && !prevWaitingRef.current && !gameEnded) {
      playSound("waiting");
    }

    prevWaitingRef.current = isWaiting;
  }, [gameEnded, gamePaused, gameState.status, playSound]);

  // Helper to show errors
  const showError = (msg) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(""), 3000); // clear after 3 seconds
  };

  // Always arrange cards in grouped order for display
  const groupedAndSortedCards = myCards
    .map((card, originalIndex) => ({ ...card, originalIndex }))
    .sort((a, b) => {
      if (isJoker(a) !== isJoker(b)) return isJoker(a) ? -1 : 1;

      const sameRankCountA = myCards.filter((card) => card.rank === a.rank).length;
      const sameRankCountB = myCards.filter((card) => card.rank === b.rank).length;

      if (sameRankCountA !== sameRankCountB) {
        return sameRankCountB - sameRankCountA;
      }

      if (a.rank !== b.rank) {
        const rankAIndex = rankOrder.includes(a.rank) ? rankOrder.indexOf(a.rank) : rankOrder.length;
        const rankBIndex = rankOrder.includes(b.rank) ? rankOrder.indexOf(b.rank) : rankOrder.length;

        if (rankAIndex !== rankBIndex) {
          return rankAIndex - rankBIndex;
        }
      }

      const suitAIndex = suitOrder.indexOf(a.suit);
      const suitBIndex = suitOrder.indexOf(b.suit);

      if (suitAIndex !== suitBIndex) {
        return suitAIndex - suitBIndex;
      }

      return a.originalIndex - b.originalIndex;
    });

  // Map opponent positions around the top and sides in a top-down view
  const getOpponentPosition = (index, total) => {
    const positions = [
      { top: "10%", left: "50%", transform: "translateX(-50%)" }, // Top Center
      { top: "17%", left: "12%" }, // Top Left
      { top: "17%", right: "12%" }, // Top Right
      { top: "42%", left: "4%" }, // Mid Left
      { top: "42%", right: "4%" }, // Mid Right
    ];
    return positions[index % positions.length];
  };

  // Click Handlers
  const handleCardClick = (index) => {
    setSelectedHandIndex(index === selectedHandIndex ? null : index);
    setDeckSelected(false);
    setLaidSelected(false);
  };

  const handleDeckClick = () => {
    setDeckSelected(!deckSelected);
    setSelectedHandIndex(null);
    setLaidSelected(false);
  };

  const handleLaidClick = () => {
    if (laidCards.length === 0) return; // Ignore if empty
    if (isJoker(laidCards[laidCards.length - 1])) return;
    setLaidSelected(!laidSelected);
    setSelectedHandIndex(null);
    setDeckSelected(false);
  };

  // Action Handler connected to Backend Endpoints
  const handleAction = async (e, action, target, cardData = null) => {
    e.stopPropagation();
    
    // Safety check before hitting the API
    if (action === "Pick" && !canPick) return showError(t("alreadyPicked"));
    if (action === "Pick" && target === "Laid Card" && isJoker(laidCards[laidCards.length - 1])) {
      return showError(t("jokerPickBlocked"));
    }
    if (action === "Lay" && !canLay) return showError(t("mustPickFirst"));

    const payload = {
      userId: user.telegramId,
      roomId: room.id || room.roomId || room.name,
      // ✨ Add socketId to ensure server has the latest for emitting updates
      socketId: socket.id
    };

    try {
      let endpoint = "";
      if (action === "Pick" && target === "Deck") {
        endpoint = "/gameplay/take-card";
      } else if (action === "Pick" && target === "Laid Card") {
        endpoint = "/gameplay/pick-card";
      } else if (action === "Lay") {
        endpoint = "/gameplay/lay-card";
        payload.card = cardData;
      }

      if (endpoint) {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        // Handle backend errors (like out of turn, etc)
        if (!response.ok || data.error) {
          showError(data.error || t("actionFailed"));
          console.error(`❌ Server error from ${endpoint}:`, data);
        } else {
          console.log(`✅ Server response from ${endpoint}:`, data);

          // Trigger flying card animation on successful pick/lay actions
          if (action === "Pick" && target === "Deck" && data.pickedCard) {
            setPickedCardDecision({ card: data.pickedCard, revealed: false });
            requestAnimationFrame(() => {
              setPickedCardDecision((current) => current ? { ...current, revealed: true } : current);
            });
          } else if (action === "Pick" && target === "Laid Card") {
            if (topLaidCard) {
              setFlyingCard({
                type: "deckToHand",
                variant: "face",
                card: topLaidCard,
                animate: false,
              });
            }
          } else if (action === "Lay" && cardData) {
            setFlyingCard({
              type: "handToLaid",
              variant: "face",
              card: cardData,
              animate: false,
            });
          }
        }
      }
    } catch (error) {
      showError(t("networkError"));
      console.error("❌ Error performing action:", error);
    }
    
    // Reset selections after action
    setSelectedHandIndex(null);
    setDeckSelected(false);
    setLaidSelected(false);
    if (action === "Lay") {
      // After laying a card, remove highlight from the previously picked card
      setHighlightedCardKey(null);
    }
  };

  const postGameplayAction = useCallback(async (endpoint, extraPayload = {}) => {
    if (!user || !room) return null;
    const payload = {
      userId: user.telegramId,
      roomId: room.id || room.roomId || room.name,
      socketId: socket.id,
      ...extraPayload,
    };

    setIsActionLoading(true);
    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || data.error) {
        if (endpoint === "/gameplay/play-again" && data.code === "INSUFFICIENT_BALANCE" && data.depositRequired) {
          setInsufficientBalancePopup({ entryFee: data.entryFee });
          await refreshUser?.();
          return null;
        }
        showError(data.error || t("actionFailed"));
        return null;
      }
      if (["/gameplay/leave-game", "/gameplay/declare-win", "/gameplay/play-again"].includes(endpoint)) {
        await refreshUser?.();
      }
      return data;
    } catch (error) {
      showError(t("networkError"));
      console.error(`❌ Error calling ${endpoint}:`, error);
      return null;
    } finally {
      setIsActionLoading(false);
    }
  }, [BASE_URL, refreshUser, room, t, user]);

  const performLeaveGame = useCallback(async (forceLeave = false) => {
    if (isLeavingRef.current) return;
    isLeavingRef.current = true;
    const result = await postGameplayAction("/gameplay/leave-game", { forceLeave });
    const finalStats = result?.redisData?.roomStats;
    if (forceLeave && result) {
      await refreshUser?.();
      navigate("/second", { replace: true });
      return;
    }
    if (finalStats?.finalizedAt || finalStats?.escrowRefunded || finalStats?.escrowSettled) {
      setLeaveSummary(finalStats);
      return;
    }
    if (result) {
      navigate("/second", { replace: true });
    } else {
      isLeavingRef.current = false;
    }
  }, [navigate, postGameplayAction, refreshUser]);

  const handleLeaveGame = useCallback(() => {
    if (isPracticeGame) {
      performLeaveGame(false);
      return;
    }

    if ((gameState.status === "playing" || (gameState.status === "waiting" && !isRoomCreator)) && !gameEnded) {
      setShowLeaveConfirm(true);
      return;
    }

    performLeaveGame(false);
  }, [gameEnded, gameState.status, isPracticeGame, isRoomCreator, performLeaveGame]);

  const handleConfirmLeaveGame = useCallback(() => {
    setShowLeaveConfirm(false);
    performLeaveGame(true);
  }, [performLeaveGame]);

  const handleReturnToLobby = useCallback(() => {
    performLeaveGame(false);
  }, [performLeaveGame]);

  const handleContinueAfterLeave = useCallback(async () => {
    await postGameplayAction("/gameplay/continue-after-leave", { continueGame: true });
  }, [postGameplayAction]);

  const handleDeclareWin = async () => {
    if (!canDeclareWin) return showError(t("winningHandError"));
    await postGameplayAction("/gameplay/declare-win");
  };

  const handlePlayAgain = async () => {
    await postGameplayAction("/gameplay/play-again");
  };

  const handleInsertPickedCard = () => {
    setPickedCardDecision(null);
  };

  const handleLayPickedCard = async () => {
    const card = pickedCardDecision?.card;
    if (!card) return;
    const result = await postGameplayAction("/gameplay/lay-card", { card });
    if (result) {
      setPickedCardDecision(null);
      setHighlightedCardKey(null);
    }
  };

  const topLaidCard = laidCards.length > 0 ? laidCards[laidCards.length - 1] : null;
  const topLaidIsJoker = isJoker(topLaidCard);
  const visibleLaidCards = laidCards.slice(-6);

  useEffect(() => {
    const lastPick = gameState.lastPick;
    if (!lastPick?.nonce || lastPickNonceRef.current === lastPick.nonce) return undefined;
    lastPickNonceRef.current = lastPick.nonce;
    if (String(lastPick.playerId) === String(user?.telegramId)) return undefined;

    setOpponentPickIndicator(lastPick.source);
    const timer = setTimeout(() => setOpponentPickIndicator(null), 700);
    return () => clearTimeout(timer);
  }, [gameState.lastPick, user?.telegramId]);

  useEffect(() => {
    const history = laidHistoryRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [laidCards.length]);

  useEffect(() => {
    if (gameEnded || gameState.status !== "playing") setPickedCardDecision(null);
  }, [gameEnded, gameState.status]);

  useEffect(() => {
    if (!room || !user) return undefined;

    const handleBack = () => {
      handleReturnToLobby();
    };
    const tgBackButton = window.Telegram?.WebApp?.BackButton;

    window.history.pushState({ kartaGameBackGuard: true }, "");
    window.addEventListener("popstate", handleBack);

    if (tgBackButton) {
      tgBackButton.show();
      tgBackButton.onClick(handleBack);
    }

    return () => {
      window.removeEventListener("popstate", handleBack);
      if (tgBackButton) {
        tgBackButton.offClick(handleBack);
        tgBackButton.hide();
      }
    };
  }, [handleReturnToLobby, room, user]);

  const { colors, glassPanel, field: glassField, goldButton } = ui;

  const styles = {
    container: {
      minHeight: "100dvh",
      width: "100vw",
      overflow: "hidden",
      background: "var(--karta-bg)",
      backgroundSize: "auto, 42px 42px, 42px 42px, auto",
      position: "relative",
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      color: colors.text,
      display: "flex",
      flexDirection: "column",
      paddingTop: PAGE_TOP_PADDING,
      boxSizing: "border-box",
    },
    errorToast: {
      position: "absolute",
      top: "15%",
      left: "50%",
      transform: "translateX(-50%)",
      background: "#d9534f",
      color: "white",
      padding: "10px 20px",
      borderRadius: "10px",
      fontWeight: "bold",
      border: "1px solid rgba(255,255,255,0.36)",
      boxShadow: "0 14px 30px rgba(0,0,0,0.42), inset 0 1px 0 rgba(255,255,255,0.42)",
      zIndex: 1000,
      opacity: errorMsg ? 1 : 0,
      transition: "opacity 0.3s ease",
      pointerEvents: "none",
    },
    centerArea: {
      position: "absolute",
      top: "45%",
      left: "50%", 
      transform: "translate(-50%, -50%)",
      display: "flex",
      gap: "34px",
      zIndex: 2,
    },
    deckCard: {
      width: "clamp(45px, 8vw, 65px)", 
      height: "clamp(70px, 12vw, 100px)",
      background: "#8f2f2f",
      border: "2px solid rgba(255,255,255,0.92)",
      borderRadius: "8px",
      boxShadow: "-2px 3px 10px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.76)",
      cursor: isMyTurn ? "pointer" : "default", // Only show pointer if it's your turn
    },
    laidCardSlot: {
      width: "clamp(58px, 10vw, 82px)", 
      height: "clamp(82px, 14vw, 112px)",
      border: "none",
      borderRadius: "6px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      background: "transparent",
      cursor: isMyTurn && laidCards.length > 0 && !topLaidIsJoker ? "pointer" : "default",
      position: "relative",
    },
    pickGlow: (active) => ({
      position: "relative",
      filter: active ? "drop-shadow(0 0 5px #ef4444) drop-shadow(0 0 12px #ef4444)" : "none",
      animation: active ? "pickSourceGlow 0.72s ease-in-out infinite alternate" : "none",
      borderRadius: "8px",
      zIndex: active ? 30 : "auto",
    }),
    laidHistory: {
      position: "absolute",
      left: "calc(100% + 20px)",
      top: "50%",
      transform: "translateY(-50%)",
      width: "72px",
      height: "2.55rem",
      overflowY: "auto",
      scrollbarWidth: "none",
      color: "rgba(255,255,255,0.42)",
      fontSize: "0.62rem",
      lineHeight: 1.35,
      textAlign: "left",
      pointerEvents: "auto",
      touchAction: "pan-y",
      overscrollBehavior: "contain",
    },
    laidPileCard: (card, index, total) => {
      const offsets = [
        { x: -7, y: 5, rotate: -10 },
        { x: 5, y: -4, rotate: 7 },
        { x: -3, y: -7, rotate: -4 },
        { x: 8, y: 4, rotate: 11 },
        { x: -8, y: -1, rotate: 5 },
        { x: 2, y: 7, rotate: -7 },
      ];
      const offset = offsets[index % offsets.length];
      return {
        ...styles.deckCard,
        position: "absolute",
        top: "50%",
        left: "50%",
        background: "#fffaf0",
        color: card.color,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.4rem",
        fontWeight: "bold",
        lineHeight: 1,
        cursor: "inherit",
        transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) rotate(${offset.rotate}deg)`,
        zIndex: index + 1,
        boxShadow: index === total - 1
          ? "0 9px 20px rgba(0,0,0,0.62), inset 0 1px 0 rgba(255,255,255,0.82)"
          : "-2px 3px 9px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.7)",
      };
    },
    opponentWrapper: {
      position: "absolute",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      zIndex: 3,
      transition: "all 0.3s ease",
    },
    avatar: (isActive) => ({
      width: "clamp(40px, 8vw, 55px)",
      height: "clamp(40px, 8vw, 55px)",
      borderRadius: "50%",
      border: `3px solid ${colors.gold}`,
      background: "rgba(255,255,255,0.08)",
      objectFit: "cover",
      boxShadow: isActive
        ? "0 0 22px rgba(255,246,94,0.8), 0 0 36px rgba(111,255,233,0.16)"
        : "0 8px 18px rgba(0,0,0,0.48), inset 0 1px 0 rgba(255,255,255,0.26)",
    }),
    playerName: (isActive) => ({
      fontSize: "0.75rem",
      background: isActive
        ? "rgba(255,246,94,0.18)"
        : "rgba(0,0,0,0.38)",
      padding: "3px 8px",
      borderRadius: "8px",
      marginTop: "5px",
      border: `1px solid ${isActive ? colors.gold : "rgba(245, 238, 194, 0.2)"}`,
      whiteSpace: "nowrap",
      color: isActive ? colors.gold : "rgba(255,255,255,0.9)",
      fontWeight: isActive ? "bold" : "normal",
      backdropFilter: "blur(12px) saturate(1.25)",
      WebkitBackdropFilter: "blur(12px) saturate(1.25)",
      boxShadow: "0 7px 16px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.22)",
    }),
    cardCount: {
      fontSize: "0.6rem",
      background: "#d9534f",
      color: "white",
      borderRadius: "50%",
      width: "18px",
      height: "18px",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      position: "absolute",
      top: "-5px",
      right: "-5px",
      fontWeight: "bold",
      border: "1px solid rgba(255,255,255,0.7)",
      boxShadow: "0 4px 10px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.42)",
    },
    statusDisplay: {
      ...glassField,
      padding: '8px 15px',
      borderRadius: '10px',
      marginBottom: '10px',
      fontSize: '0.9rem',
      fontWeight: 'bold',
      color: colors.gold,
      border: '1px solid rgba(255,255,255,0.26)',
      textAlign: 'center',
      minWidth: '250px',
      boxShadow: '0 10px 22px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.24)',
      zIndex: 11,
    },
    playerArea: {
      position: "absolute",
      bottom: "2vh", 
      left: "0",
      width: "100%",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      zIndex: 10,
    },
    handContainer: {
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-end",
      marginTop: "8px",
      height: "clamp(90px, 15vw, 130px)",
      paddingBottom: "35px",
    },
    card: {
      width: "clamp(40px, 8vw, 60px)", 
      height: "clamp(60px, 12vw, 90px)",
      background: "#fffaf0",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.82)",
      boxShadow: "-3px 2px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.86)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-start",
      alignItems: "center",
      paddingTop: "6px",
      fontWeight: "bold",
      fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
      position: "relative",
      transition: "transform 0.2s, z-index 0.2s",
      cursor: "pointer",
    },
    jokerIcon: {
      width: "72%",
      height: "72%",
      objectFit: "contain",
      display: "block",
      margin: "auto",
      pointerEvents: "none",
    },
    actionPopupBtn: {
      position: "absolute",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "5px",
      bottom: "-35px",
      left: "50%",
      transform: "translateX(-50%)",
      ...goldButton,
      color: colors.textDark,
      padding: "5px 15px",
      borderRadius: "8px",
      fontSize: "0.8rem",
      fontWeight: "bold",
      cursor: "pointer",
      zIndex: 100, 
    },
    actionButtons: {
      display: "flex",
      gap: "15px",
      marginTop: "5px",
    },
    btnLeave: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      color: colors.text,
      borderRadius: "8px",
      padding: "8px 25px",
      fontSize: "0.85rem",
      cursor: "pointer",
      backdropFilter: "blur(14px) saturate(1.25)",
      WebkitBackdropFilter: "blur(14px) saturate(1.25)",
      boxShadow: "0 10px 22px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.22)",
      transition: "background 0.2s",
    },
    btnWin: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      ...goldButton,
      color: colors.textDark,
      fontWeight: "bold",
      borderRadius: "8px",
      padding: "8px 25px",
      fontSize: "0.85rem",
      cursor: "pointer",
      transition: "transform 0.1s",
    },
    btnWinDisabled: {
      opacity: 0.45,
      cursor: "not-allowed",
      boxShadow: "none",
      filter: "grayscale(0.5)",
    },
    gameOverOverlay: {
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.62)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2000,
      padding: "20px",
    },
    gameOverPopup: {
      width: "min(520px, 92vw)",
      ...glassPanel,
      borderRadius: "14px",
      padding: "18px 20px",
    },
    gameOverTitle: {
      margin: 0,
      fontSize: "1.2rem",
      color: colors.gold,
    },
    gameOverSubtitle: {
      marginTop: "8px",
      opacity: 0.85,
      fontSize: "0.9rem",
    },
    gameOverDetails: {
      marginTop: "14px",
      fontSize: "0.85rem",
      ...glassField,
      borderRadius: "8px",
      padding: "10px 12px",
      lineHeight: 1.5,
    },
    gameOverActions: {
      marginTop: "16px",
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
    },
    confirmOverlay: {
      position: "absolute",
      inset: 0,
      background: "rgba(0,0,0,0.62)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 2100,
      padding: "20px",
    },
    confirmPopup: {
      width: "min(420px, 92vw)",
      ...glassPanel,
      borderRadius: "10px",
      padding: "18px",
      color: colors.cream,
    },
    pickedCardOverlay: {
      position: "absolute",
      inset: 0,
      zIndex: 2200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(0,0,0,0.46)",
      perspective: "900px",
    },
    pickedCardDecision: {
      display: "grid",
      gridTemplateColumns: "minmax(72px, 1fr) 120px minmax(72px, 1fr)",
      alignItems: "center",
      gap: "14px",
      width: "min(390px, 92vw)",
    },
    pickedCard: {
      width: "120px",
      height: "174px",
      position: "relative",
      transformStyle: "preserve-3d",
      transition: "transform 0.5s ease",
    },
    pickedCardFace: {
      position: "absolute",
      inset: 0,
      borderRadius: "8px",
      border: "2px solid rgba(255,255,255,0.9)",
      backfaceVisibility: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontSize: "2rem",
      fontWeight: "bold",
      overflow: "hidden",
    },
    decisionButton: {
      minWidth: 0,
      padding: "9px 10px",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.32)",
      background: "rgba(20,20,20,0.78)",
      color: "#fff",
      fontSize: "0.78rem",
      fontWeight: 700,
      cursor: "pointer",
    },
    confirmTitle: {
      margin: 0,
      color: colors.gold,
      fontSize: "1rem",
      borderBottom: "2px solid rgba(255,246,94,0.55)",
      display: "inline-block",
      paddingBottom: "4px",
    },
    confirmText: {
      margin: "12px 0 0",
      lineHeight: 1.45,
      fontSize: "0.88rem",
      opacity: 0.9,
    },
    confirmActions: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "10px",
      marginTop: "18px",
    },
    confirmCancelBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.22)",
      background: "rgba(255,255,255,0.08)",
      color: colors.text,
      padding: "9px 14px",
      fontWeight: 800,
      cursor: "pointer",
    },
    confirmLeaveBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.32)",
      ...goldButton,
      color: colors.textDark,
      padding: "9px 14px",
      fontWeight: 900,
      cursor: "pointer",
    },
    inactiveBadge: {
      marginTop: "12px",
      display: "inline-flex",
      alignItems: "center",
      borderRadius: "999px",
      padding: "6px 10px",
      border: "1px solid rgba(255,246,94,0.32)",
      background: "rgba(255,246,94,0.12)",
      color: colors.gold,
      fontSize: "0.78rem",
      fontWeight: 800,
    },
    roomInfoBanner: {
      position: "absolute",
      top: `calc(${PAGE_TOP_PADDING} + 4px)`,
      left: "20px",
      display: "inline-flex",
      alignItems: "center",
      zIndex: 20,
    },
    progressIconBtn: {
      width: "30px",
      height: "30px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      border: "1px solid rgba(255,246,94,0.38)",
      background: "rgba(255,246,94,0.12)",
      color: colors.gold,
      cursor: "pointer",
      padding: 0,
    },
    historyButton: {
      width: "42px",
      height: "42px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      border: "1px solid rgba(255,246,94,0.48)",
      background: "linear-gradient(180deg, rgba(255,246,94,0.18), rgba(255,255,255,0.08))",
      color: colors.gold,
      cursor: "pointer",
      padding: 0,
      boxShadow: "0 14px 28px rgba(0,0,0,0.36), 0 0 20px rgba(255,246,94,0.14), inset 0 1px 0 rgba(255,255,255,0.28)",
      backdropFilter: "blur(14px) saturate(1.25)",
      WebkitBackdropFilter: "blur(14px) saturate(1.25)",
    },
    progressPanel: {
      position: "absolute",
      top: `calc(${PAGE_TOP_PADDING} + 58px)`,
      left: "20px",
      width: "min(320px, calc(100vw - 40px))",
      maxHeight: "54vh",
      overflowY: "auto",
      ...glassPanel,
      borderRadius: "8px",
      padding: "12px",
      zIndex: 40,
      color: colors.cream,
    },
    progressHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
      marginBottom: "9px",
    },
    progressTitle: {
      margin: 0,
      color: colors.gold,
      fontSize: "0.92rem",
      fontWeight: 900,
    },
    progressGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
      marginBottom: "10px",
    },
    progressDetails: {
      display: "flex",
      flexDirection: "column",
      gap: "7px",
      marginBottom: "10px",
    },
    progressDetailRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
      border: "1px solid rgba(245,238,194,0.14)",
      borderRadius: "7px",
      padding: "7px 8px",
      ...glassField,
      fontSize: "0.72rem",
    },
    progressDetailLabel: {
      color: "rgba(245,238,194,0.82)",
      whiteSpace: "nowrap",
    },
    progressDetailValue: {
      color: colors.gold,
      fontWeight: 900,
      minWidth: 0,
      textAlign: "right",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    progressStat: {
      border: "1px solid rgba(245,238,194,0.14)",
      borderRadius: "7px",
      padding: "7px",
      ...glassField,
      fontSize: "0.72rem",
    },
    progressValue: {
      display: "block",
      marginTop: "3px",
      color: colors.gold,
      fontWeight: 900,
      fontSize: "0.86rem",
    },
    progressList: {
      display: "flex",
      flexDirection: "column",
      gap: "7px",
    },
    practiceHelpButton: {
      position: "absolute",
      top: `calc(${PAGE_TOP_PADDING} + 54px)`,
      left: "20px",
      width: "34px",
      height: "34px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      border: "1px solid rgba(255,246,94,0.48)",
      background: "rgba(0,0,0,0.34)",
      color: colors.gold,
      cursor: "pointer",
      padding: 0,
      zIndex: 21,
      boxShadow: "0 10px 22px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.2)",
      backdropFilter: "blur(12px) saturate(1.2)",
      WebkitBackdropFilter: "blur(12px) saturate(1.2)",
    },
    practiceTip: (placement) => {
      const placements = {
        deck: {
          top: "calc(45% - 122px)",
          left: "50%",
          transform: "translateX(-78%)",
        },
        hand: {
          left: "50%",
          bottom: "calc(2vh + 170px)",
          transform: "translateX(-50%)",
        },
        opponent: {
          top: "calc(17% + 82px)",
          left: "50%",
          transform: "translateX(-50%)",
        },
        win: {
          left: "50%",
          bottom: "calc(2vh + 18px)",
          transform: "translateX(14px)",
        },
      };

      return {
        position: "absolute",
        width: "min(230px, calc(100vw - 36px))",
        ...glassPanel,
        ...(placements[placement] || placements.deck),
        borderRadius: "8px",
        padding: "9px 34px 9px 10px",
        zIndex: 120,
        color: colors.cream,
        fontSize: "0.72rem",
        lineHeight: 1.3,
        fontWeight: 750,
      };
    },
    practiceTipClose: {
      position: "absolute",
      top: "6px",
      right: "6px",
      width: "22px",
      height: "22px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.22)",
      color: colors.cream,
      cursor: "pointer",
      padding: 0,
    },
    practiceTipArrow: (placement) => {
      const isDown = placement === "deck" || placement === "opponent";
      const isUp = placement === "hand" || placement === "win";
      return {
        position: "absolute",
        left: placement === "deck" ? "35%" : "50%",
        [isDown ? "bottom" : "top"]: "-8px",
        transform: "translateX(-50%) rotate(45deg)",
        width: "14px",
        height: "14px",
        background: colors.panelBottom,
        borderRight: isDown ? "1px solid rgba(255,255,255,0.14)" : "none",
        borderBottom: isDown ? "1px solid rgba(255,255,255,0.14)" : "none",
        borderLeft: isUp ? "1px solid rgba(255,255,255,0.14)" : "none",
        borderTop: isUp ? "1px solid rgba(255,255,255,0.14)" : "none",
      };
    },
    practiceTipTitle: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: "4px",
      color: colors.gold,
      fontSize: "0.72rem",
      fontWeight: 900,
    },
    progressRound: {
      border: "1px solid rgba(245,238,194,0.12)",
      borderRadius: "7px",
      padding: "8px",
      background: "rgba(255,255,255,0.06)",
      fontSize: "0.74rem",
      lineHeight: 1.45,
    },
    turnLoader: {
      marginTop: "6px",
      width: "28px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    turnLoaderDot: (delay) => ({
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: "linear-gradient(180deg, rgba(255,246,94,0.98), rgba(222,212,70,0.94))",
      animation: `turnPulse 1s ease-in-out ${delay}s infinite`,
      boxShadow: "0 0 6px rgba(255,246,94,0.7)",
    }),
    flyingCard: (config) => {
      const base = {
        position: "absolute",
        width: "clamp(40px, 8vw, 60px)",
        height: "clamp(60px, 12vw, 90px)",
        borderRadius: "6px",
        boxShadow: "0 6px 14px rgba(0,0,0,0.7)",
        zIndex: 999,
        pointerEvents: "none",
        transition: "transform 0.55s ease-out, opacity 0.55s ease-out",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: "bold",
        fontSize: "clamp(1rem, 2.5vw, 1.4rem)",
      };

      let top = "45%";
      let left = "50%";
      let transformFrom = "translate3d(-50%, -50%, 0)";
      let transformTo = "translate3d(-50%, 40vh, 0)";

      if (config?.type === "handToLaid") {
        top = "82%";
        left = "50%";
        transformFrom = "translate3d(-50%, -50%, 0)";
        transformTo = "translate3d(-50%, -42vh, 0)";
      }

      const transform = config?.animate ? transformTo : transformFrom;
      const opacity = config?.animate ? 0 : 1;

      return {
        ...base,
        top,
        left,
        transform,
        opacity,
      };
    },
  };

  const renderCardFace = (card) => {
    if (isJoker(card)) {
      return (
        <img
          src={getJokerIconSrc(card)}
          alt=""
          aria-hidden="true"
          style={styles.jokerIcon}
        />
      );
    }

    return (
      <>
        <div style={{ lineHeight: "1" }}>{card?.rank}</div>
        <div style={{ lineHeight: "1" }}>{card?.suit}</div>
      </>
    );
  };

  if (!room) return <p style={{ color: "white", textAlign: "center", marginTop: PAGE_TOP_PADDING }}>{t("loadingGame")}</p>;

  const displayOpponents = players && user 
    ? players.filter(playerId => String(playerId) !== String(user.telegramId)) 
    : [];

  const leaveVoteRequiredIds = (gameState.leaveVote?.requiredIds || []).map(String);
  const myLeaveVote = user ? gameState.leaveVote?.votes?.[String(user.telegramId)] : null;
  const canVoteToContinue = Boolean(
    user &&
    gameState.leaveVote?.active &&
    leaveVoteRequiredIds.includes(String(user.telegramId)) &&
    !myLeaveVote
  );
  const pausedMessage = !gameState.inactiveMessage || gameState.inactiveMessage === "Game paused. Waiting for players."
    ? t("gamePausedWaiting")
    : gameState.inactiveMessage;
  const leaveSummaryPayout = Number(leaveSummary?.payouts?.[myUserId] || 0);
  const leaveSummaryFees = Number(leaveSummary?.playerFeesPaid?.[myUserId] || myFeesPaid || 0);
  const leaveSummaryPot = Number(leaveSummary?.totalPot || totalPot || 0);
  const leaveSummaryCommission = Number(leaveSummary?.commissionAmount || 0);
  const formatVote = (vote) => {
    if (vote === "continue") return t("continue");
    if (vote === "leave") return t("leave");
    return vote;
  };
  const formatResultReason = (reason) => {
    if (!reason || reason === "valid-hand") return t("validHand");
    return reason;
  };

  return (
    <div style={styles.container}>
      <style>
        {`
          @keyframes turnPulse {
            0%, 80%, 100% {
              transform: scale(0.7);
              opacity: 0.35;
            }
            40% {
              transform: scale(1);
              opacity: 1;
            }
          }
          @keyframes dealCardIn {
            0% {
              opacity: 0;
              transform: translate3d(0, -55px, 0) rotate(-8deg) scale(0.82);
            }
            70% {
              opacity: 1;
              transform: translate3d(0, 5px, 0) rotate(2deg) scale(1.04);
            }
            100% {
              opacity: 1;
              transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
            }
          }
          @keyframes laidCardDrop {
            0% {
              opacity: 0;
              filter: brightness(1.45);
            }
            60% {
              opacity: 1;
              filter: brightness(1.15);
            }
            100% {
              opacity: 1;
              filter: brightness(1);
            }
          }
          @keyframes winPopup {
            0% {
              opacity: 0;
              transform: translateY(18px) scale(0.88) rotate(-1deg);
            }
            45% {
              opacity: 1;
              transform: translateY(-5px) scale(1.04) rotate(1deg);
            }
            100% {
              opacity: 1;
              transform: translateY(0) scale(1) rotate(0);
            }
          }
          @keyframes winGlow {
            0%, 100% {
              box-shadow: 0 12px 30px rgba(0,0,0,0.5), 0 0 0 rgba(255,246,94,0);
            }
            50% {
              box-shadow: 0 12px 30px rgba(0,0,0,0.5), 0 0 34px rgba(255,246,94,0.55);
            }
          }
          @keyframes pickSourceGlow {
            from { filter: drop-shadow(0 0 4px rgba(239,68,68,0.75)) drop-shadow(0 0 8px rgba(239,68,68,0.55)); }
            to { filter: drop-shadow(0 0 8px #ef4444) drop-shadow(0 0 18px rgba(239,68,68,0.95)); }
          }
          .laid-history::-webkit-scrollbar { display: none; }
        `}
      </style>
      {/* ✨ Error Notification Toast */}
      {errorMsg && <div style={styles.errorToast}>{errorMsg}</div>}

      <div style={styles.roomInfoBanner}>
        <button
          type="button"
          style={{
            ...styles.historyButton,
            background: showProgress
              ? `linear-gradient(180deg, ${colors.gold}, ${colors.goldDeep})`
              : styles.historyButton.background,
            color: showProgress ? colors.textDark : colors.gold,
            transform: showProgress ? "translateY(-1px) scale(1.04)" : "translateY(0) scale(1)",
            transition: "transform 0.18s ease, background 0.18s ease, color 0.18s ease",
          }}
          aria-label={t("gameProgress")}
          title={t("gameProgress")}
          onClick={() => setShowProgress((isOpen) => !isOpen)}
        >
          <History size={19} />
        </button>
      </div>

      {!gameEnded && (
        <button
          type="button"
          style={styles.practiceHelpButton}
          aria-label={t("gameRulesTitle")}
          title={t("gameRulesTitle")}
          onClick={() => setShowGameRules(true)}
        >
          <HelpCircle size={17} />
        </button>
      )}

      {showProgress && (
        <div style={styles.progressPanel}>
          <div style={styles.progressHeader}>
            <h3 style={styles.progressTitle}>{t("gameProgress")}</h3>
            <button
              type="button"
              style={styles.progressIconBtn}
              aria-label={t("close")}
              onClick={() => setShowProgress(false)}
            >
              <X size={14} />
            </button>
          </div>

          <div style={styles.progressDetails}>
            <div style={styles.progressDetailRow}>
              <span style={styles.progressDetailLabel}>{t("roomName")}</span>
              <span style={styles.progressDetailValue} title={room.name}>{room.name}</span>
            </div>
            <div style={styles.progressDetailRow}>
              <span style={styles.progressDetailLabel}>{t("fee")}</span>
              <span style={styles.progressDetailValue}>
                {isPracticeGame ? t("practiceFreeNote") : <CoinAmount value={room.entryFee} size={15} />}
              </span>
            </div>
          </div>

          <div style={styles.progressGrid}>
            <div style={styles.progressStat}>
              {t("players")}
              <span style={styles.progressValue}>{progressPlayers.length}</span>
            </div>
            <div style={styles.progressStat}>
              {t("totalToWin")}
              <span style={styles.progressValue}>{isPracticeGame ? t("practiceMode") : formatBirr(totalPot)}</span>
            </div>
            <div style={styles.progressStat}>
              {t("currentGame")}
              <span style={styles.progressValue}>{currentRoundNumber || 1}</span>
            </div>
            <div style={styles.progressStat}>
              {t("completed")}
              <span style={styles.progressValue}>{Number(roomStats.gamesPlayed || 0)}</span>
            </div>
          </div>

          <div style={styles.progressList}>
            {gameHistory.length > 0 ? (
              gameHistory.map((game) => (
                <div style={styles.progressRound} key={`round-${game.round}`}>
                  <div>
                    <strong style={{ color: colors.gold }}>{t("gameRound", { round: game.round })}</strong>
                    {" "} - {t("winner")}: {getPlayerName(game.winnerId)}
                    {game.jokerBonus ? ` (${t("jokerBonus")})` : ""}
                  </div>
                  <div>{t("players")}: {(game.players || []).map((playerId) => getPlayerName(playerId)).join(", ")}</div>
                  <div>{t("totalAmount")}: {formatBirr(game.totalAmountToWin)}</div>
                </div>
              ))
            ) : (
              <div style={styles.progressRound}>
                {t("noCompletedGames")}
              </div>
            )}
          </div>
        </div>
      )}

      {showPracticeTip && (
        <div style={styles.practiceTip(currentPracticeTip.placement)}>
          <span style={styles.practiceTipArrow(currentPracticeTip.placement)} />
          <button
            type="button"
            style={styles.practiceTipClose}
            aria-label={t("close")}
            title={t("close")}
            onClick={() => setPracticeHelpDismissed(true)}
          >
            <X size={12} />
          </button>
          <div style={styles.practiceTipTitle}>
            <HelpCircle size={13} />
            <span>{t("practiceCoachTitle")}</span>
          </div>
          <div>{currentPracticeTip.text}</div>
        </div>
      )}

      {/* Center Table (Deck & Discard Pile) */}
      <div style={styles.centerArea}>
        {/* The remaining deck */}
        <div style={styles.pickGlow(opponentPickIndicator === "deck")} onClick={handleDeckClick}>
          <div style={styles.deckCard}></div>
          <div style={{...styles.deckCard, position: "absolute", top: "-2px", left: "2px", zIndex: -1 }}></div>
          {/* ✨ Only show Pick button if it's your turn AND you have 10 cards */}
          {deckSelected && canPick && (
            <button style={styles.actionPopupBtn} onClick={(e) => handleAction(e, "Pick", "Deck")}>
              {t("pick")}
            </button>
          )}
        </div>

        {/* Discard / Laid Cards Pile */}
        <div 
          style={{ ...styles.laidCardSlot, ...styles.pickGlow(opponentPickIndicator === "laid") }}
          onClick={handleLaidClick}
        >
          {topLaidCard ? (
            visibleLaidCards.map((card, index) => (
              <div
                key={`${card.rank}-${card.suit}-${laidCards.length - visibleLaidCards.length + index}`}
                style={{
                  ...styles.laidPileCard(card, index, visibleLaidCards.length),
                  animation: index === visibleLaidCards.length - 1
                    ? "laidCardDrop 0.28s ease-out"
                    : "none",
                }}
              >
                {renderCardFace(card)}
              </div>
            ))
          ) : (
            null
          )}
          
          {/* The pick button is positioned relative to the slot */}
          {laidSelected && topLaidCard && canPick && !topLaidIsJoker && (
            <button style={styles.actionPopupBtn} onClick={(e) => handleAction(e, "Pick", "Laid Card")}>
              {t("pick")}
            </button>
          )}
          {laidCards.length > 0 && (
            <div ref={laidHistoryRef} className="laid-history" style={styles.laidHistory} aria-label={t("laidHistory")}>
              {laidCards.map((card, index) => (
                <div key={`laid-history-${card.rank}-${card.suit}-${index}`}>
                  {isJoker(card) ? t("joker") : `${card.rank}${card.suit || ""}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Opponents */}
      {displayOpponents.map((opponentId, index) => {
        const isOpponentTurn = String(turn) === String(opponentId);
        const opponentCardCount = playerCards[opponentId]?.length || 0;

        return (
          <div 
            key={index} 
            style={{ 
              ...styles.opponentWrapper, 
              ...getOpponentPosition(index, displayOpponents.length) 
            }}
          >
            <div style={{ position: "relative" }}>
              <img 
                src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${opponentId}`} 
                alt={t("opponent")} 
                style={styles.avatar(isOpponentTurn)} 
              />
              <div style={styles.cardCount}>{opponentCardCount}</div>
            </div>
            <div style={styles.playerName(isOpponentTurn)}>
              {getPlayerName(opponentId)}
            </div>
            {isOpponentTurn && (
              <div style={styles.turnLoader}>
                <div style={styles.turnLoaderDot(0)}></div>
                <div style={styles.turnLoaderDot(0.2)}></div>
                <div style={styles.turnLoaderDot(0.4)}></div>
              </div>
            )}
          </div>
        );
      })}

      {showLeaveConfirm && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h3 style={styles.confirmTitle}>{t("leaveGameTitle")}</h3>
            <p style={styles.confirmText}>
              {t("leaveGameText")}
            </p>
            <div style={styles.gameOverDetails}>
              <div>{t("gamesYouPlayed")}: {completedGamesForYou.length}</div>
              <div>{t("youWon")}: {myCompletedWins}</div>
              <div>{t("youLost")}: {myCompletedLosses}</div>
              <div>{t("entryFeesPaid")}: {formatBirr(myFeesPaid)}</div>
              <div>{t("wonAndAdded")}: {formatBirr(myPaidOut)}</div>
              <div>{t("currentRoundFee")}: {formatBirr(currentRoundFeeAtRisk)}</div>
            </div>
            <div style={styles.confirmActions}>
              <button
                style={styles.confirmCancelBtn}
                onClick={() => setShowLeaveConfirm(false)}
                disabled={isActionLoading}
              >
                {t("cancel")}
              </button>
              <button
                style={styles.confirmLeaveBtn}
                onClick={handleConfirmLeaveGame}
                disabled={isActionLoading}
              >
                {t("ok")}
              </button>
            </div>
          </div>
        </div>
      )}

      {leaveSummary && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h3 style={styles.confirmTitle}>{t("balanceSummary")}</h3>
            <p style={styles.confirmText}>
              {t("balanceSummaryText")}
            </p>
            <div style={styles.gameOverDetails}>
              <div>{t("playedWith")}: {formatBirr(leaveSummaryFees)}</div>
              <div>{t("totalRoomAmount")}: {formatBirr(leaveSummaryPot)}</div>
              <div>{t("commission")}: {formatBirr(leaveSummaryCommission)}</div>
              <div>{t("youReceive")}: {formatBirr(leaveSummaryPayout)}</div>
              <div>{t("gamesPlayed")}: {Number(leaveSummary.gamesPlayed || 0)}</div>
            </div>
            <div style={styles.progressList}>
              {(leaveSummary.games || []).map((game) => (
                <div style={styles.progressRound} key={`leave-round-${game.round}`}>
                  {t("gameRound", { round: game.round })}: {t("winner")} {getPlayerName(game.winnerId)}
                  {game.jokerBonus ? ` (${t("jokerBonus")})` : ""}
                  {" "}({formatBirr(game.roundAmountToWin)})
                </div>
              ))}
            </div>
            <div style={styles.confirmActions}>
              <button
                style={styles.confirmLeaveBtn}
                onClick={() => navigate("/second", { replace: true })}
              >
                {t("ok")}
              </button>
            </div>
          </div>
        </div>
      )}

      {gamePaused && !showLeaveConfirm && !gameEnded && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h3 style={styles.confirmTitle}>{t("roomInactive")}</h3>
            <p style={styles.confirmText}>{pausedMessage}</p>
            {myLeaveVote && (
              <div style={styles.inactiveBadge}>{t("yourVote")}: {formatVote(myLeaveVote)}</div>
            )}
            {!canVoteToContinue && !myLeaveVote && (
              <div style={styles.inactiveBadge}>{t("waiting")}</div>
            )}
            <div style={styles.confirmActions}>
              {canVoteToContinue && (
                <button
                  style={styles.confirmLeaveBtn}
                  onClick={handleContinueAfterLeave}
                  disabled={isActionLoading}
                >
                  {t("continue")}
                </button>
              )}
              <button
                style={styles.confirmCancelBtn}
                onClick={handleConfirmLeaveGame}
                disabled={isActionLoading}
              >
                {t("leave")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showGameRules && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <div style={styles.progressHeader}>
              <h3 style={styles.confirmTitle}>{t("gameRulesTitle")}</h3>
              <button style={styles.progressIconBtn} onClick={() => setShowGameRules(false)} aria-label={t("close")}>
                <X size={14} />
              </button>
            </div>
            <div style={styles.gameOverDetails}>
              <div>1. {t("gameRulesPick")}</div>
              <div>2. {t("gameRulesLay")}</div>
              <div>3. {t("gameRulesGoal")}</div>
              <div>4. {t("gameRulesJoker")}</div>
              <div>5. {t("gameRulesDeclare")}</div>
            </div>
            {isPracticeGame && (
              <div style={styles.confirmActions}>
                <button style={styles.confirmLeaveBtn} onClick={() => {
                  setPracticeHelpDismissed(false);
                  setShowGameRules(false);
                }}>
                  {t("showCurrentHelp")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {insufficientBalancePopup && (
        <div style={styles.confirmOverlay}>
          <div style={styles.confirmPopup}>
            <h3 style={styles.confirmTitle}>{t("insufficientBalance")}</h3>
            <p style={styles.confirmText}>
              {t("playAgainBalanceRequired", { fee: insufficientBalancePopup.entryFee })}
            </p>
            <div style={styles.confirmActions}>
              <button style={styles.confirmCancelBtn} onClick={() => setInsufficientBalancePopup(null)}>
                {t("cancel")}
              </button>
              <button style={styles.confirmLeaveBtn} onClick={() => navigate("/deposit")}>
                {t("deposit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pickedCardDecision?.card && !gameEnded && (
        <div style={styles.pickedCardOverlay}>
          <div style={styles.pickedCardDecision}>
            <button style={styles.decisionButton} onClick={handleInsertPickedCard}>
              {t("insertCard")}
            </button>
            <div style={{
              ...styles.pickedCard,
              transform: pickedCardDecision.revealed ? "rotateY(180deg)" : "rotateY(0deg)",
            }}>
              <div style={{ ...styles.pickedCardFace, background: "#8f2f2f" }} />
              <div style={{
                ...styles.pickedCardFace,
                background: "#fffaf0",
                color: pickedCardDecision.card.color || "#111",
                transform: "rotateY(180deg)",
              }}>
                {renderCardFace(pickedCardDecision.card)}
              </div>
            </div>
            <button style={styles.decisionButton} onClick={handleLayPickedCard} disabled={isActionLoading}>
              {t("layCard")}
            </button>
          </div>
        </div>
      )}

      {gameEnded && gameResult && (
        <div style={styles.gameOverOverlay}>
          <div
            style={{
              ...styles.gameOverPopup,
              animation: isWinning
                ? "winPopup 0.48s ease-out, winGlow 1.2s ease-in-out 0.15s 2"
                : "none",
            }}
          >
            <h3 style={styles.gameOverTitle}>{t("gameOver")}</h3>
            <div style={styles.gameOverSubtitle}>
              {t("winner")}: {getPlayerName(gameResult.winnerId)}
            </div>
            <div style={styles.gameOverDetails}>
              <div>{t("pattern")}: {gameResult.winnerPattern || "4-3-3-1"}</div>
              <div>{t("reason")}: {formatResultReason(gameResult.reason)}</div>
              {gameResult.jokerBonus && <div>{t("jokerBonusDetail")}</div>}
              {isPracticeGame ? (
                <div>{t("practiceFreeNote")}</div>
              ) : (
                <>
                  <div>{t("playedWith")}: {formatBirr(myFeesPaid)}</div>
                  <div>{t("totalRoomAmount")}: {formatBirr(totalPot)}</div>
                  <div>{t("commission")}: {formatBirr(projectedCommission)}</div>
                  <div>{t("youReceived")}: {formatBirr(myProjectedWin)}</div>
                </>
              )}
              <div>
                {t("ended")}:{" "}
                {gameResult.endedAt
                  ? new Date(gameResult.endedAt).toLocaleString()
                  : t("notAvailable")}
              </div>
            </div>
            <div style={styles.gameOverActions}>
              <button
                style={styles.btnLeave}
                onClick={handleLeaveGame}
                disabled={isActionLoading}
              >
                {t("leave")}
              </button>
              <button
                style={styles.btnWin}
                onClick={handlePlayAgain}
                disabled={isActionLoading}
              >
                {isActionLoading ? t("starting") : t("playAgain")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Flying card animation overlay */}
      {flyingCard && (
        <div style={styles.flyingCard(flyingCard)}>
          {flyingCard.variant === "back" ? (
            <div
              style={{
                width: "100%",
                height: "100%",
                borderRadius: "6px",
                background:
                  "#8f2f2f",
                border: "2px solid #fff",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "#fff",
                borderRadius: "6px",
                border: `2px solid ${colors.gold}`,
                color: flyingCard.card?.color || "#000",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {renderCardFace(flyingCard.card)}
            </div>
          )}
        </div>
      )}

      {/* Main Player Bottom Area */}
      <div style={styles.playerArea}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <img
            src={user?.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
            alt={t("you")}
            style={{
              ...styles.avatar(isMyTurn),
              width: "clamp(50px, 9vw, 65px)",
              height: "clamp(50px, 9vw, 65px)",
            }}
          />
          <div style={styles.playerName(isMyTurn)}>
            {user ? (user.displayName || user.firstName || t("you")) : t("you")}
          </div>
          {isMyTurn && (
            <div style={styles.turnLoader}>
              <div style={styles.turnLoaderDot(0)}></div>
              <div style={styles.turnLoaderDot(0.2)}></div>
              <div style={styles.turnLoaderDot(0.4)}></div>
            </div>
          )}
        </div>
        <div style={styles.handContainer}>
          {groupedAndSortedCards.length > 0 ? (
            groupedAndSortedCards.map((card, index) => {
              const isSelected = selectedHandIndex === index;
              const isHighlighted = highlightedCardKey === `${card.rank}-${card.suit}`;
              return (
                <div
                  key={`${card.rank}-${card.suit}-${index}`}
                  style={{
                    ...styles.card,
                    color: card.color,
                    ...(isJoker(card) ? { justifyContent: "center", paddingTop: 0 } : {}),
                    marginLeft: index === 0 ? "0" : "clamp(-18px, -4vw, -10px)",
                    zIndex: isSelected ? 50 : index,
                    transform: isSelected ? "translateY(-15px)" : "translateY(0)",
                    animation: isDealing
                      ? `dealCardIn 0.42s ease-out ${Math.min(index * 0.045, 0.42)}s both`
                      : "none",
                    border: isHighlighted ? `2px solid ${colors.gold}` : styles.card.border,
                    boxShadow: isHighlighted
                      ? "0 0 10px rgba(255,246,94,0.9)"
                      : styles.card.boxShadow,
                  }}
                  onClick={() => handleCardClick(index)}
                  onMouseOver={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = "translateY(-10px)";
                      e.currentTarget.style.zIndex = "50";
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.zIndex = index;
                    }
                  }}
                >
                  {renderCardFace(card)}
                  {isSelected && canLay && (
                    <button
                      style={styles.actionPopupBtn}
                      onClick={(e) => handleAction(e, "Lay", "Hand", card)}
                    >
                      {t("lay")}
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div style={{ opacity: 0.5, fontStyle: "italic", marginTop: "10px" }}>
              {t("waitingForCards")}
            </div>
          )}
        </div>
        <div style={styles.actionButtons}>
          <button
            style={styles.btnLeave}
            onClick={handleLeaveGame}
            disabled={isActionLoading}
            onMouseOver={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.12)"}
            onMouseOut={(e) => e.currentTarget.style.background = styles.btnLeave.background}
          >
            {t("leave")}
          </button>
          <button
            style={{
              ...styles.btnWin,
              ...(canDeclareWin ? {} : styles.btnWinDisabled),
            }}
            onClick={handleDeclareWin}
            disabled={!canDeclareWin || isActionLoading}
          >
            {isActionLoading ? "..." : t("win")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GamePage;

