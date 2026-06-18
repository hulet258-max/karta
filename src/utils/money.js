export const COIN_BIRR_VALUE = 5;
export const MIN_DEPOSIT_BIRR = 20;
export const MIN_DEPOSIT_COINS = 4;
export const MIN_ROOM_ENTRY_COINS = 2;
export const WELCOME_GIFT_COINS = 2;

export function toWholeCoins(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

export function formatCoins(value) {
  const coins = toWholeCoins(value);
  return `${coins} ${coins === 1 ? "coin" : "coins"}`;
}

export function formatBirr(value) {
  return formatCoins(value);
}

export function formatBirrValue(value) {
  const amount = Number(value || 0);
  return `${amount.toFixed(Number.isInteger(amount) ? 0 : 2)} Birr`;
}
