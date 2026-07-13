import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { socket } from "../socket";

const UserContext = createContext(null);

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
  const [notifications, setNotifications] = useState([]);

  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

  const loadBackendUser = useCallback(async (id, tgUser = null, fallbackPhoto = null) => {
    const res = await fetch(`${API_BASE_URL}/telegram-user`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegramId: id,
        username: tgUser?.username || "",
        firstName: tgUser?.first_name || "",
        lastName: tgUser?.last_name || "",
      }),
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
    try {
      const notificationResponse = await fetch(`${API_BASE_URL}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
      const notificationData = await notificationResponse.json();
      if (notificationResponse.ok && notificationData.success) {
        setNotifications(notificationData.notifications || []);
      }
    } catch (notificationError) {
      console.warn("Could not load notifications:", notificationError);
    }
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

  const dismissFirstRunGift = useCallback(async () => {
    const id = telegramId || user?.telegramId || user?.id;
    setUser((currentUser) => currentUser ? {
      ...currentUser,
      isFirstRun: false,
      firstRunGiftBirr: 0,
      welcomeGiftSeen: true,
    } : currentUser);
    if (!id) return;
    try {
      await fetch(`${API_BASE_URL}/welcome-gift/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id }),
      });
    } catch (ackError) {
      console.warn("Could not acknowledge welcome gift:", ackError);
    }
  }, [API_BASE_URL, telegramId, user?.telegramId, user?.id]);

  const dismissNotification = useCallback(async (notificationId) => {
    const id = telegramId || user?.telegramId || user?.id;
    setNotifications((current) => current.filter((item) => Number(item.id) !== Number(notificationId)));
    if (!id || !notificationId) return;
    try {
      await fetch(`${API_BASE_URL}/notifications/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, notificationId }),
      });
    } catch (ackError) {
      console.warn("Could not acknowledge notification:", ackError);
    }
  }, [API_BASE_URL, telegramId, user?.telegramId, user?.id]);

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
    const handleNotification = (notification) => {
      if (!notification?.id) return;
      setNotifications((current) => current.some((item) => Number(item.id) === Number(notification.id))
        ? current
        : [...current, notification]);
    };
    socket.on("user_notification", handleNotification);

    return () => {
      socket.off("balance_update", handleBalanceUpdate);
      socket.off("user_notification", handleNotification);
    };
  }, [telegramId, telegramUser?.photo_url, user?.telegramId, user?.id]);

  const value = {
    user,
    telegramId,
    telegramUser,
    refreshUser,
    dismissFirstRunGift,
    notifications,
    dismissNotification,
    loading,
    error,
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
