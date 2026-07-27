import {
  findAddedCard,
  optimisticallyLayCard,
  optimisticallyPickLaidCard,
  serverStateConfirmsAction,
} from "./optimisticGameState";

const card = (rank, suit = "S") => ({ rank, suit });

test("optimistically picks the top laid card", () => {
  const state = {
    turn: "1",
    laidCards: [card("4"), card("K")],
    playerCards: { "1": [card("A")] },
  };

  const next = optimisticallyPickLaidCard(state, "1");
  expect(next.laidCards).toEqual([card("4")]);
  expect(next.playerCards["1"]).toEqual([card("A"), card("K")]);
  expect(state.laidCards).toHaveLength(2);
});

test("optimistically lays only one matching duplicate and advances the turn", () => {
  const duplicate = card("7", "H");
  const state = {
    players: [{ telegramId: "1" }, { telegramId: "2" }],
    turn: "1",
    laidCards: [],
    playerCards: { "1": [duplicate, duplicate, card("A")] },
  };

  const next = optimisticallyLayCard(state, "1", duplicate);
  expect(next.playerCards["1"]).toEqual([duplicate, card("A")]);
  expect(next.laidCards).toEqual([duplicate]);
  expect(next.turn).toBe("2");
});

test("finds an added card when the hand contains duplicates", () => {
  expect(findAddedCard(
    [card("A"), card("A"), card("K")],
    [card("A"), card("Q"), card("A"), card("K")]
  )).toEqual(card("Q"));
});

test("matches a confirmed deck pick to its pending transaction", () => {
  const snapshot = { playerCards: { "1": [card("A")] } };
  const confirmed = {
    lastPick: { playerId: "1", source: "deck" },
    playerCards: { "1": [card("A"), card("K")] },
  };

  expect(serverStateConfirmsAction({ kind: "deck-pick", snapshot }, confirmed, "1")).toBe(true);
});
