export const getDailyWithdrawalLimit = (gamesPlayed) => {
  const games = Math.max(0, Math.floor(Number(gamesPlayed) || 0));
  if (games <= 100) return 50;
  if (games < 200) return 200;
  if (games <= 300) return 500;
  return null;
};
