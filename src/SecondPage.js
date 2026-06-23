import React, { useCallback, useMemo, useState, useEffect } from "react";
import { ArrowLeft, Bot, Settings, Trash2, UserCircle, Users, Volume2, VolumeX, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import RoomCreate from "./RoomCreate";
import JoinConfirmation from "./JoinConfirmation";
import { socket } from "./socket";
import CoinAmount from "./CoinAmount";

function SecondPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading, refreshUser } = useUser();
  const { settings, updateSetting, t, ui } = useSettings();
  const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  const [showCreatePopup, setShowCreatePopup] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [activeSlide, setActiveSlide] = useState(0);
  const [posterSlides, setPosterSlides] = useState([]);
  const [botStarting, setBotStarting] = useState(false);
  const isPrivateShareLaunch = new URLSearchParams(location.search).get("privateShare") === "1";

  const fallbackSlides = useMemo(() => [
    { image: "/a.png", alt: t("kartaBannerAlt", { number: 1 }) },
    { image: "/b.png", alt: t("kartaBannerAlt", { number: 2 }) },
    { image: "/c.png", alt: t("kartaBannerAlt", { number: 3 }) },
  ], [t]);
  const slides = posterSlides.length ? posterSlides : fallbackSlides;

  const formatRoomType = (roomType) => {
    const match = String(roomType || "").match(/^(\d+)-players$/);
    return match ? `${match[1]} ${t("players")}` : roomType || "";
  };

  const isUserInRoom = useCallback((room) => (
    Boolean(user?.telegramId) &&
    (room?.players || []).some((playerId) => String(playerId) === String(user.telegramId))
  ), [user?.telegramId]);

  const isRoomCreator = useCallback((room) => (
    Boolean(user?.telegramId) && String(room?.creatorId) === String(user.telegramId)
  ), [user?.telegramId]);

  const isListableRoom = useCallback((room) => (
    (
      room?.visibility !== "private" &&
      ["waiting", "playing", "ended"].includes(room?.status)
    ) ||
    (isUserInRoom(room) && ["waiting", "playing", "ended"].includes(room?.status))
  ), [isUserInRoom]);

  const fetchRooms = useCallback(async () => {
    try {
      const params = user?.telegramId ? `?userId=${encodeURIComponent(user.telegramId)}` : "";
      const response = await fetch(`${BASE_URL}/rooms${params}`);
      const data = await response.json();
      if (data.success) {
        setRooms((data.rooms || []).filter(isListableRoom));
      } else {
        console.error("Failed to fetch rooms:", data.error);
      }
    } catch (error) {
      console.error("Error fetching rooms:", error);
    }
  }, [BASE_URL, isListableRoom, user?.telegramId]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  useEffect(() => {
    let isMounted = true;

    const fetchLobbyPosters = async () => {
      try {
        const response = await fetch(`${BASE_URL}/settings/lobby`);
        const data = await response.json();
        if (!response.ok || !data.success) return;

        const activePosters = (data.posters || [])
          .map((poster, index) => ({
            image: poster.imageUrl,
            alt: poster.title || t("kartaBannerAlt", { number: index + 1 }),
          }))
          .filter((poster) => poster.image);

        if (isMounted) {
          setPosterSlides(activePosters);
          setActiveSlide(0);
        }
      } catch (error) {
        console.error("Error fetching lobby posters:", error);
      }
    };

    fetchLobbyPosters();

    return () => {
      isMounted = false;
    };
  }, [BASE_URL, t]);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((currentSlide) => (currentSlide + 1) % slides.length);
    }, 3200);

    return () => clearInterval(timer);
  }, [slides.length]);

  useEffect(() => {
    const handleNewRoom = (room) => {
      if (!isListableRoom(room)) return;
      setRooms((prevRooms) => {
        const nextRooms = prevRooms.filter((existingRoom) => existingRoom.id !== room.id);
        return [room, ...nextRooms];
      });
    };

    const handleRoomUnavailable = ({ roomId }) => {
      setRooms((prevRooms) => prevRooms.filter((room) => {
        if (room.id !== roomId) return true;
        return isUserInRoom(room);
      }));
      fetchRooms();
    };

    const handleRoomDeleted = ({ roomId }) => {
      setRooms((prevRooms) => prevRooms.filter((room) => room.id !== roomId));
    };

    const handleRoomUpdate = (payload) => {
      const room = payload?.room;
      if (!room) return;

      setRooms((prevRooms) => {
        const nextRooms = prevRooms.filter((existingRoom) => existingRoom.id !== room.id);
        if (!isListableRoom(room)) return nextRooms;
        return [room, ...nextRooms];
      });
    };

    socket.on("new_room_created", handleNewRoom);
    socket.on("room_unavailable", handleRoomUnavailable);
    socket.on("room_deleted", handleRoomDeleted);
    socket.on("room_update", handleRoomUpdate);

    return () => {
      socket.off("new_room_created", handleNewRoom);
      socket.off("room_unavailable", handleRoomUnavailable);
      socket.off("room_deleted", handleRoomDeleted);
      socket.off("room_update", handleRoomUpdate);
    };
  }, [fetchRooms, isListableRoom, isUserInRoom]);

  useEffect(() => {
    const roomId = new URLSearchParams(location.search).get("roomId");
    if (!roomId || selectedRoom) return;

    const fetchSharedRoom = async () => {
      try {
        const response = await fetch(`${BASE_URL}/room/${roomId}`);
        const data = await response.json();
        if (response.ok && data.success) {
          setSelectedRoom(data.room);
        }
      } catch (error) {
        console.error("Error fetching shared room:", error);
      }
    };

    fetchSharedRoom();
  }, [BASE_URL, location.search, selectedRoom]);

  const handleRoomCreated = (newRoom) => {
    if (!isListableRoom(newRoom)) return;
    setRooms(prevRooms => [newRoom, ...prevRooms]);
  };

  const resumeRoom = async (room) => {
    if (!user?.telegramId) return;

    try {
      const response = await fetch(`${BASE_URL}/join-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: room.id,
          userId: user.telegramId,
          socketId: socket.id,
        }),
      });
      const data = await response.json();
      if (data.alreadyInRoom && data.room?.id) {
        navigate(`/game/${data.room.id}`);
        return;
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("failedToJoinRoom"));
      }
      navigate(`/game/${room.id}`, {
        state: {
          room: data.room,
          players: data.players,
          redisData: data.redisData,
        },
      });
    } catch (error) {
      console.error("Error resuming room:", error);
    }
  };

  const handleJoinClick = (room) => {
    if (isUserInRoom(room) && ["waiting", "playing", "ended"].includes(room?.status)) {
      resumeRoom(room);
      return;
    }
    setSelectedRoom(room);
  };

  const closeSelectedRoom = () => {
    setSelectedRoom(null);
    if (new URLSearchParams(location.search).get("roomId")) {
      navigate("/second", { replace: true });
    }
  };

  const handlePlayWithBot = async () => {
    if (!user?.telegramId || botStarting) return;

    setBotStarting(true);
    try {
      const response = await fetch(`${BASE_URL}/bot-game/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.telegramId,
          socketId: socket.id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("actionFailed"));
      }

      navigate(`/game/${data.room.id}`, {
        state: {
          room: data.room,
          players: data.players,
          redisData: data.redisData,
        },
      });
    } catch (error) {
      console.error("Error starting bot game:", error);
    } finally {
      setBotStarting(false);
    }
  };

  const handleDeleteRoom = async (event, room) => {
    event.stopPropagation();
    if (!user?.telegramId || !isRoomCreator(room)) return;

    try {
      const response = await fetch(`${BASE_URL}/room/${room.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.telegramId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("actionFailed"));
      }
      await refreshUser?.();
      setRooms((prevRooms) => prevRooms.filter((existingRoom) => existingRoom.id !== room.id));
    } catch (error) {
      console.error("Error deleting room:", error);
    }
  };

  const renderSwitch = (key, label, Icon) => {
    const isEnabled = settings[key];
    const SwitchIcon = key === "sound" ? (isEnabled ? Volume2 : VolumeX) : Icon;

    return (
      <div style={styles.settingRow} key={key}>
        <span style={styles.settingLabel}>
          <SwitchIcon style={{ width: 16, height: 16, flexShrink: 0 }} />
          {label}
        </span>
        <div style={styles.switchWrap}>
          <span style={styles.switchText}>{isEnabled ? t("on") : t("off")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label={label}
            onClick={() => updateSetting(key, !isEnabled)}
            style={{
              ...styles.switchButton,
              background: isEnabled ? ui.colors.gold : "rgba(0,0,0,0.32)",
            }}
          >
            <span
              style={{
                ...styles.switchKnob,
                transform: isEnabled ? "translateX(30px)" : "translateX(0)",
              }}
            />
          </button>
        </div>
      </div>
    );
  };

  const renderThemeToggle = () => (
    <div style={styles.settingRow}>
      <span style={styles.settingLabel}>{t("theme")}</span>
      <div style={styles.themeToggle}>
        {["bright", "dark"].map((themeMode) => (
          <button
            key={themeMode}
            type="button"
            style={styles.themeOption(settings.themeMode === themeMode)}
            onClick={() => updateSetting("themeMode", themeMode)}
          >
            {themeMode === "bright" ? t("brightMode") : t("darkMode")}
          </button>
        ))}
      </div>
    </div>
  );

  const { colors, glassPanel, goldButton } = ui;
  const styles = {
    container: {
      minHeight: "100dvh",
      width: "100vw",
      overflowX: "hidden",
      overflowY: "auto",
      background: "var(--karta-bg)",
      backgroundSize: "auto, 42px 42px, 42px 42px, auto",
      color: colors.text,
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      position: "relative",
      padding: "96px 16px 16px",
      boxSizing: "border-box",
    },
    overlay: {
      position: "fixed", // Fixed so scrolling doesn't break the vignette
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0,0,0,0.12)",
      pointerEvents: "none",
      zIndex: 1,
    },
    bgCards: {
      position: "fixed",
      inset: 0,
      pointerEvents: "none",
      zIndex: 1,
      overflow: "hidden",
    },
    bgCard: (top, left, rotate, opacity = 0.12) => ({
      position: "absolute",
      top,
      left,
      width: "44px",
      height: "62px",
      borderRadius: "8px",
      border: `1px solid color-mix(in srgb, ${colors.gold} 38%, transparent)`,
      background: "rgba(245, 238, 194, 0.075)",
      color: colors.gold,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 900,
      fontSize: "1rem",
      transform: `rotate(${rotate}deg)`,
      opacity,
      boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
    }),
    contentWrapper: {
      position: "relative",
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      width: "100%",
      maxWidth: "430px",
      margin: "0 auto",
      paddingBottom: "18px",
    },
    topBar: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      marginBottom: "14px",
    },
    topRight: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    balanceText: {
      fontSize: "1rem",
      fontWeight: "bold",
      color: colors.gold,
      ...ui.field,
      padding: "7px 10px",
      borderRadius: "8px",
      backdropFilter: "blur(14px) saturate(1.3)",
      WebkitBackdropFilter: "blur(14px) saturate(1.3)",
    },
    iconBtn: {
      width: "36px",
      height: "36px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      ...ui.iconButton,
      color: colors.gold,
      borderRadius: "8px",
      cursor: "pointer",
      backdropFilter: "blur(14px) saturate(1.3)",
      WebkitBackdropFilter: "blur(14px) saturate(1.3)",
    },
    carousel: {
      width: "100%",
      height: "158px",
      overflow: "hidden",
      borderRadius: "10px",
      border: `2px solid color-mix(in srgb, ${colors.gold} 58%, transparent)`,
      background: "rgba(9,31,18,0.76)",
      boxShadow: "0 20px 46px rgba(0,0,0,0.36), 0 0 0 1px rgba(245, 238, 194, 0.18), inset 0 1px 0 rgba(255,255,255,0.34)",
      backdropFilter: "blur(16px) saturate(1.25)",
      WebkitBackdropFilter: "blur(16px) saturate(1.25)",
      marginBottom: "20px",
      position: "relative",
      transform: "translateY(-2px)",
    },
    carouselGlow: {
      position: "absolute",
      inset: "6px",
      borderRadius: "7px",
      border: "1px solid rgba(255,255,255,0.18)",
      pointerEvents: "none",
      zIndex: 2,
    },
    carouselTrack: {
      display: "flex",
      height: "100%",
      transform: `translateX(-${activeSlide * 100}%)`,
      transition: "transform 0.55s ease",
    },
    slide: {
      minWidth: "100%",
      height: "100%",
      position: "relative",
    },
    slideImage: {
      width: "100%",
      height: "100%",
      objectFit: "cover",
      display: "block",
    },
    slideDots: {
      position: "absolute",
      bottom: "9px",
      left: "18px",
      display: "flex",
      gap: "6px",
      zIndex: 3,
    },
    slideDot: (isActive) => ({
      width: isActive ? "18px" : "7px",
      height: "7px",
      borderRadius: "999px",
      background: isActive ? colors.gold : "rgba(245, 238, 194, 0.36)",
      transition: "width 0.25s ease, background 0.25s ease",
    }),
    modalBackdrop: {
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.58)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
      padding: "18px",
      boxSizing: "border-box",
    },
    settingsPanel: {
      width: "100%",
      maxWidth: "340px",
      ...glassPanel,
      borderRadius: "16px",
      padding: "18px",
      color: colors.text,
      boxSizing: "border-box",
    },
    settingsHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px",
    },
    settingsTitle: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      margin: 0,
      color: colors.cream,
      fontSize: "1.15rem",
    },
    closeButton: {
      width: "34px",
      height: "34px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      ...ui.iconButton,
      cursor: "pointer",
      padding: 0,
    },
    settingRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "14px",
      padding: "13px 0",
      borderTop: "1px solid rgba(255,255,255,0.12)",
    },
    settingLabel: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      color: colors.cream,
      fontSize: "0.95rem",
      fontWeight: 700,
    },
    languageSelect: {
      minWidth: "140px",
      ...ui.textField,
      color: colors.text,
      borderRadius: "10px",
      padding: "9px 10px",
      fontSize: "0.9rem",
      outline: "none",
    },
    switchButton: {
      width: "64px",
      height: "32px",
      border: "1px solid rgba(255,255,255,0.25)",
      borderRadius: "999px",
      padding: "3px",
      cursor: "pointer",
      position: "relative",
      transition: "background 0.2s",
    },
    switchKnob: {
      display: "block",
      width: "24px",
      height: "24px",
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      transition: "transform 0.2s",
    },
    switchText: {
      minWidth: "34px",
      color: "#fff",
      fontSize: "0.72rem",
      fontWeight: 800,
      textAlign: "center",
    },
    switchWrap: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    themeToggle: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
      width: "152px",
      padding: "3px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.22)",
    },
    themeOption: (isActive) => ({
      minHeight: "30px",
      borderRadius: "8px",
      border: isActive ? `1px solid ${colors.gold}` : "1px solid transparent",
      background: isActive ? `linear-gradient(180deg, ${colors.gold}, ${colors.goldDeep})` : "transparent",
      color: isActive ? colors.textDark : colors.cream,
      cursor: "pointer",
      fontSize: "0.7rem",
      fontWeight: 900,
      padding: "5px 7px",
    }),
    sectionHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      marginBottom: "15px",
      gap: "10px",
    },
    sectionTitle: {
      margin: 0,
      fontSize: "1.08rem",
      fontWeight: "bold",
      color: colors.gold,
      textTransform: "uppercase",
      letterSpacing: 0,
      borderBottom: `2px solid color-mix(in srgb, ${colors.gold} 70%, transparent)`,
      paddingBottom: "4px",
    },
    createRoomBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      ...goldButton,
      borderRadius: "8px",
      padding: "8px 12px",
      color: colors.textDark,
      fontWeight: "bold",
      fontSize: "0.74rem",
      cursor: "pointer",
    },
    sectionActions: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: "8px",
      flexWrap: "wrap",
    },
    botRoomBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      ...ui.secondaryButton,
      borderRadius: "8px",
      padding: "8px 12px",
      color: colors.cream,
      fontWeight: "bold",
      fontSize: "0.74rem",
      cursor: "pointer",
    },
    roomList: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: "8px",
    },
    roomCard: {
      ...glassPanel,
      borderRadius: "8px",
      padding: "9px 10px",
      width: "100%",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    },
    roomHeader: {
      display: "flex",
      justifyContent: "space-between",
      gap: "12px",
      borderBottom: `1px solid color-mix(in srgb, ${colors.gold} 22%, transparent)`,
      paddingBottom: "6px",
    },
    roomTitle: {
      margin: 0,
      fontSize: "0.92rem",
      color: colors.text,
      borderBottom: `1px solid color-mix(in srgb, ${colors.gold} 48%, transparent)`,
      display: "inline-block",
      paddingBottom: "1px",
      maxWidth: "220px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    roomSubtitle: {
      display: "block",
      marginTop: "3px",
      fontSize: "0.68rem",
      color: "rgba(245, 238, 194, 0.78)",
      lineHeight: 1.15,
    },
    feeCol: {
      textAlign: "right",
    },
    feeLabel: {
      display: "block",
      fontSize: "0.56rem",
      color: "rgba(245, 238, 194, 0.72)",
      textTransform: "uppercase",
    },
    feeAmount: {
      display: "block",
      fontSize: "0.86rem",
      fontWeight: "bold",
      color: colors.gold,
    },
    roomFooter: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
    },
    playersInfo: {
      fontSize: "0.72rem",
      color: colors.cream,
      fontWeight: 700,
    },
    joinBtn: {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      ...goldButton,
      borderRadius: "8px",
      padding: "6px 10px",
      fontSize: "0.7rem",
      fontWeight: "bold",
      color: colors.textDark,
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: 0,
      transition: "transform 0.1s",
    },
    roomActions: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      flexShrink: 0,
    },
    deleteRoomBtn: {
      width: "28px",
      height: "28px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      ...ui.iconButton,
      color: colors.gold,
      cursor: "pointer",
    }
  };

  return (
    <div style={styles.container}>
      {/* Vignette Overlay */}
      <div style={styles.overlay}></div>
      <div style={styles.bgCards}>
        <div style={styles.bgCard("12%", "8%", -18)}>A</div>
        <div style={styles.bgCard("24%", "82%", 16, 0.18)}>K</div>
        <div style={styles.bgCard("68%", "5%", 22, 0.18)}>Q</div>
        <div style={styles.bgCard("78%", "84%", -14, 0.2)}>J</div>
      </div>

      <div style={styles.contentWrapper}>
        <header style={styles.topBar}>
          <button style={styles.iconBtn} onClick={() => navigate("/")} aria-label={t("back")} title={t("back")}>
            <ArrowLeft size={19} />
          </button>
          <div style={styles.topRight}>
            <span style={styles.balanceText}>
              {loading ? "..." : <CoinAmount value={user?.balance} size={17} />}
            </span>
            <button
              style={styles.iconBtn}
              aria-label={t("settings")}
              title={t("settings")}
              onClick={() => setIsSettingsOpen(true)}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>

        <section style={styles.carousel}>
          <div style={styles.carouselGlow}></div>
          <div style={styles.carouselTrack}>
            {slides.map((slide, index) => (
              <div style={styles.slide} key={`${slide.image}-${index}`}>
                <img src={slide.image} alt={slide.alt} style={styles.slideImage} />
              </div>
            ))}
          </div>
          <div style={styles.slideDots}>
            {slides.map((slide, index) => (
              <span style={styles.slideDot(index === activeSlide)} key={`dot-${slide.image}-${index}`} />
            ))}
          </div>
        </section>

        {/* MAIN ROOM LIST */}
        <main style={{ width: "100%" }}>
          <div style={styles.sectionHeader}>
            <h4 style={styles.sectionTitle}>{t("gameRooms")}</h4>
            <div style={styles.sectionActions}>
              <button
                type="button"
                style={styles.botRoomBtn}
                onClick={handlePlayWithBot}
                disabled={botStarting}
              >
                <Bot size={15} />
                {botStarting ? t("starting") : t("playWithBot")}
              </button>
              <button 
                style={styles.createRoomBtn} 
                onClick={() => setShowCreatePopup(true)}
                onMouseDown={(e) => {
                  e.currentTarget.style.transform = "translateY(1px) scale(0.985)";
                  e.currentTarget.style.boxShadow = "0 8px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.5)";
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = goldButton.boxShadow;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = goldButton.boxShadow;
                }}
              >
                {t("createRoom")}
              </button>
            </div>
          </div>

          <div style={styles.roomList}>
            {rooms.map((room) => (
              <div style={styles.roomCard} key={room.id}>
                <div style={styles.roomHeader}>
                  <div>
                    <h5 style={styles.roomTitle}>{room.name}</h5>
                    <span style={styles.roomSubtitle}>
                      {room.maxPlayers} {t("players")} - {formatRoomType(room.type)}
                      {isUserInRoom(room) && ["waiting", "playing", "ended"].includes(room?.status) ? ` - ${t("inProgress")}` : ""}
                    </span>
                  </div>
                  <div style={styles.feeCol}>
                    <span style={styles.feeLabel}>{t("entryFee")}</span>
                    <span style={styles.feeAmount}><CoinAmount value={room.entryFee} /></span>
                  </div>
                </div>
                
                <div style={styles.roomFooter}>
                  <div style={styles.playersInfo}>
                    <span>
                      <Users size={13} style={{ verticalAlign: "-2px", marginRight: "4px" }} />
                      {t("players")}: {room.playerCount} / {room.maxPlayers}
                    </span>
                  </div>
                  <div style={styles.roomActions}>
                    {isRoomCreator(room) && (
                      <button
                        type="button"
                        aria-label={t("deleteRoom")}
                        title={t("deleteRoom")}
                        style={styles.deleteRoomBtn}
                        onClick={(event) => handleDeleteRoom(event, room)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                    <button 
                      style={styles.joinBtn} 
                      onClick={() => handleJoinClick(room)}
                      onMouseDown={(e) => {
                        e.currentTarget.style.transform = "translateY(1px) scale(0.985)";
                        e.currentTarget.style.boxShadow = "0 8px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.5)";
                      }}
                      onMouseUp={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = goldButton.boxShadow;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = goldButton.boxShadow;
                      }}
                    >
                      {isUserInRoom(room) && ["waiting", "playing", "ended"].includes(room?.status) ? t("getBack") : t("join")}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>

      {isSettingsOpen && (
        <div style={styles.modalBackdrop} onClick={() => setIsSettingsOpen(false)}>
          <div
            style={styles.settingsPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.settingsHeader}>
              <h2 id="settings-title" style={styles.settingsTitle}>
                <Settings style={{ width: 20, height: 20 }} />
                {t("settings")}
              </h2>
              <button
                type="button"
                style={styles.closeButton}
                aria-label={t("close")}
                onClick={() => setIsSettingsOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div style={styles.settingRow}>
              <label htmlFor="second-language-select" style={styles.settingLabel}>
                {t("language")}
              </label>
              <select
                id="second-language-select"
                value={settings.language}
                onChange={(event) => updateSetting("language", event.target.value)}
                style={styles.languageSelect}
              >
                <option value="amharic">{t("amharic")}</option>
                <option value="english">{t("english")}</option>
                <option value="oromifa">{t("oromifa")}</option>
              </select>
            </div>
            {renderThemeToggle()}
            {renderSwitch("sound", t("sound"), Volume2)}
            {renderSwitch("profileView", t("profileView"), UserCircle)}
          </div>
        </div>
      )}

      {showCreatePopup && (
        <RoomCreate onClose={() => setShowCreatePopup(false)} onRoomCreated={handleRoomCreated} />
      )}

      {selectedRoom && (
        <JoinConfirmation
          room={selectedRoom}
          user={user}
          isPrivateShare={isPrivateShareLaunch}
          onClose={closeSelectedRoom}
        />
      )}
    </div>
  );
}

export default SecondPage;
