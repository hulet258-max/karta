export const sharePreparedTelegramMessage = (tg, preparedMessageId, handlers = {}) => {
  if (!tg || typeof tg.shareMessage !== "function" || !preparedMessageId) {
    return false;
  }

  try {
    tg.shareMessage(preparedMessageId, (sent) => {
      if (sent === false) handlers.onCanceled?.();
      else handlers.onSent?.();
    });
    return true;
  } catch (error) {
    console.warn("Telegram prepared message share failed:", error);
    return false;
  }
};

export const switchTelegramInlineQuery = (tg, query, chatTypes = ["users", "groups"]) => {
  if (!tg || typeof tg.switchInlineQuery !== "function" || !query) {
    return false;
  }

  try {
    tg.switchInlineQuery(query, chatTypes);
    return true;
  } catch (error) {
    console.warn("Telegram inline share failed:", error);
    return false;
  }
};
