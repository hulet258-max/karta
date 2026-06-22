import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { socket } from "../socket";

const UserContext = createContext(null);

const TELEGRAM_LOGIN_FIELDS = [
  "id",
  "first_name",
  "last_name",
  "username",
  "photo_url",
  "auth_date",
  "hash",
];

const getTelegramLoginDataFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  if (!params.get("id") || !params.get("hash") || !params.get("auth_date")) return null;

  return TELEGRAM_LOGIN_FIELDS.reduce((loginData, field) => {
    const value = params.get(field);
    if (value !== null) loginData[field] = value;
    return loginData;
  }, {});
};

const removeTelegramLoginDataFromUrl = () => {
  const url = new URL(window.location.href);
  TELEGRAM_LOGIN_FIELDS.forEach((field) => url.searchParams.delete(field));
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
};

const getReferralCodeFromLaunch = () => {
  const tg = window.Telegram?.WebApp;
  const startParam = tg?.initDataUnsafe?.start_param || "";
  const params = new URLSearchParams(window.location.search);
  const rawCode = params.get("ref") || params.get("startapp") || startParam;
  if (String(rawCode || "").startsWith("room_")) return "";
  return String(rawCode || "").replace(/^ref_/, "").trim();
};

const isLocalhost = () => (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
);

const getDevTelegramUser = () => {
  const id = process.env.REACT_APP_DEV_TELEGRAM_ID;
  if (!id || !isLocalhost()) return null;

  return {
    id: String(id),
  };
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [telegramId, setTelegramId] = useState(null);
  const [telegramUser, setTelegramUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

  const loadBackendUser = useCallback(async (id, tgUser = null, fallbackPhoto = null) => {
    const res = await fetch(`${API_BASE_URL}/telegram-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId: id }),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || data.message || "Failed to load user");
    }

    const nextUser = {
      id: String(id),
      telegramId: String(id),
      ...data.user,
      photo: tgUser?.photo_url || fallbackPhoto || null,
    };

    setUser(nextUser);
    return nextUser;
  }, [API_BASE_URL]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);

      const tg = window.Telegram?.WebApp;
      if (tg) {
        tg.ready();
        tg.expand();
        console.log("Telegram WebApp:", tg);
      }

      let id = null;
      let tgUser = null;

      if (tg?.initDataUnsafe?.user) {
        tgUser = tg.initDataUnsafe.user;
        id = String(tgUser.id);
        console.log("Telegram ID (initDataUnsafe):", id);
      } else if (tg?.initData) {
        try {
          const params = new URLSearchParams(tg.initData);
          const userParam = params.get("user");

          if (userParam) {
            const parsedUser = JSON.parse(userParam);
            if (parsedUser?.id) {
              tgUser = parsedUser;
              id = String(parsedUser.id);
              console.log("Telegram ID (initData parsed):", id);
            }
          }
        } catch (err) {
          console.warn("initData parse failed:", err);
        }
      }

      if (!id) {
        const loginData = getTelegramLoginDataFromUrl();
        if (loginData) {
          try {
            const loginResponse = await fetch(`${API_BASE_URL}/telegram-login`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ loginData }),
            });
            const loginResult = await loginResponse.json();
            if (!loginResponse.ok || !loginResult.success) {
              throw new Error(loginResult.error || "Telegram login failed.");
            }

            tgUser = loginResult.telegramUser;
            id = String(tgUser.id);
            removeTelegramLoginDataFromUrl();
          } catch (loginError) {
            console.error("Telegram login URL verification failed:", loginError);
          }
        }
      }

      if (!id) {
        const devUser = getDevTelegramUser();

        if (devUser) {
          tgUser = devUser;
          id = String(devUser.id);
          console.warn(`Using local env Telegram ID: ${id}`);
        } else {
          const msg = "Telegram ID not found. Open via bot button or run a player dev script.";
          console.error(msg);
          setError(msg);
          setLoading(false);
          return;
        }
      }

      setTelegramId(id);
      setTelegramUser(tgUser);

      try {
        await loadBackendUser(id, tgUser);
        const referralCode = getReferralCodeFromLaunch();
        const referralKey = referralCode ? `karta_referral_${referralCode}_${id}` : "";
        if (referralCode && localStorage.getItem(referralKey) !== "done") {
          try {
            const referralResponse = await fetch(`${API_BASE_URL}/referral-open`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ code: referralCode, userId: id }),
            });
            const referralData = await referralResponse.json();
            if (referralResponse.ok && referralData.success) {
              localStorage.setItem(referralKey, "done");
            }
          } catch (referralError) {
            console.warn("Referral check failed:", referralError);
          }
        }
        console.log("User synced with backend");
      } catch (err) {
        console.error("Fetch error:", err);
        setUser({
          id,
          telegramId: id,
          photo: null,
        });
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [API_BASE_URL, loadBackendUser]);

  const refreshUser = useCallback(async () => {
    const id = telegramId || user?.telegramId || user?.id;
    if (!id) return null;
    return loadBackendUser(String(id), telegramUser, user?.photo);
  }, [loadBackendUser, telegramId, telegramUser, user?.telegramId, user?.id, user?.photo]);

  const dismissFirstRunGift = useCallback(() => {
    setUser((currentUser) => currentUser ? {
      ...currentUser,
      isFirstRun: false,
      firstRunGiftCoins: 0,
    } : currentUser);
  }, []);

  useEffect(() => {
    const handleBalanceUpdate = ({ userId, balance, user: updatedUser }) => {
      const currentId = telegramId || user?.telegramId || user?.id;
      if (!currentId || String(userId) !== String(currentId)) return;

      setUser((currentUser) => ({
        ...(currentUser || {}),
        ...(updatedUser || {}),
        id: String(currentId),
        telegramId: String(currentId),
        balance: Number(balance || 0),
        photo: currentUser?.photo || updatedUser?.photo || telegramUser?.photo_url || null,
      }));
    };

    socket.on("balance_update", handleBalanceUpdate);

    return () => {
      socket.off("balance_update", handleBalanceUpdate);
    };
  }, [telegramId, telegramUser?.photo_url, user?.telegramId, user?.id]);

  const value = {
    user,
    telegramId,
    telegramUser,
    refreshUser,
    dismissFirstRunGift,
    loading,
    error,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
