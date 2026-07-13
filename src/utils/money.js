export const MIN_DEPOSIT_BIRR = 20;
export const MIN_ROOM_ENTRY_BIRR = 10;
export const ROOM_ENTRY_STEP_BIRR = 5;
export const WELCOME_GIFT_BIRR = 10;

export function toWholeBirr(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

export function formatBirr(value) {
  return formatBirrValue(value);
}

export function formatBirrValue(value) {
  const amount = Number(value || 0);
  const exact = amount.toFixed(4).replace(/\.?0+$/, "");
  return `${exact || "0"} Birr`;
}

export function isWholeBirrUnit(birr) {
  const amount = Number(birr || 0);
  return Number.isInteger(amount);
}

export function isValidRoomEntryBirr(birr) {
  const amount = Number(birr || 0);
  return isWholeBirrUnit(amount) &&
    amount >= MIN_ROOM_ENTRY_BIRR &&
    amount % ROOM_ENTRY_STEP_BIRR === 0;
}
