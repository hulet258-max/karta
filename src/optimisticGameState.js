export const cardsMatch = (left, right) => (
  Boolean(left && right) &&
  String(left.rank) === String(right.rank) &&
  String(left.suit || "") === String(right.suit || "")
);

const playerIdsFrom = (state, fallbackPlayers = []) => {
  const source = Array.isArray(state?.players) && state.players.length
    ? state.players
    : fallbackPlayers;
  return source
    .map((player) => String(player?.telegramId ?? player?.id ?? player))
    .filter(Boolean);
};

export const findAddedCard = (previousCards = [], nextCards = []) => {
  const remaining = previousCards.map((card) => ({ card, used: false }));
  return nextCards.find((candidate) => {
    const match = remaining.find((entry) => !entry.used && cardsMatch(entry.card, candidate));
    if (match) {
      match.used = true;
      return false;
    }
    return true;
  }) || null;
};

export const optimisticallyPickLaidCard = (state, userId) => {
  const laidCards = state?.laidCards || [];
  const topCard = laidCards[laidCards.length - 1];
  if (!topCard) return state;

  const key = String(userId);
  const playerCards = state?.playerCards || {};
  return {
    ...state,
    laidCards: laidCards.slice(0, -1),
    playerCards: {
      ...playerCards,
      [key]: [...(playerCards[key] || []), topCard],
    },
  };
};

export const optimisticallyLayCard = (state, userId, card, fallbackPlayers = []) => {
  const key = String(userId);
  const playerCards = state?.playerCards || {};
  const hand = playerCards[key] || [];
  const cardIndex = hand.findIndex((candidate) => cardsMatch(candidate, card));
  if (cardIndex < 0) return state;

  const nextHand = [...hand];
  const [laidCard] = nextHand.splice(cardIndex, 1);
  const playerIds = playerIdsFrom(state, fallbackPlayers);
  const currentIndex = playerIds.indexOf(key);
  const nextTurn = currentIndex >= 0 && playerIds.length
    ? playerIds[(currentIndex + 1) % playerIds.length]
    : state.turn;

  return {
    ...state,
    turn: nextTurn,
    laidCards: [...(state.laidCards || []), laidCard],
    playerCards: {
      ...playerCards,
      [key]: nextHand,
    },
  };
};

export const serverStateConfirmsAction = (transaction, state, userId) => {
  if (!transaction || !state) return false;
  const key = String(userId);
  const beforeHand = transaction.snapshot?.playerCards?.[key] || [];
  const currentHand = state.playerCards?.[key] || [];

  if (transaction.kind === "deck-pick" || transaction.kind === "laid-pick") {
    const expectedSource = transaction.kind === "deck-pick" ? "deck" : "laid";
    return String(state.lastPick?.playerId || "") === key &&
      state.lastPick?.source === expectedSource &&
      currentHand.length === beforeHand.length + 1;
  }

  if (transaction.kind === "lay") {
    return String(state.lastLay?.playerId || "") === key &&
      cardsMatch(state.lastLay?.card, transaction.card) &&
      currentHand.length === beforeHand.length - 1;
  }

  return false;
};

