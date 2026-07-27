import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from "react-router-dom";
import { UserProvider, useUser } from "./contexts/UserContext";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";

import MainPage from "./MainPage";
import SecondPage from "./SecondPage";
import GamePage from "./GamePage";
import DepositPage from "./DepositPage";
import WithdrawPage from "./withdrawpage";
import SplashScreen from "./SplashScreen";
import CoinAmount from "./CoinAmount";
import { formatBirr } from "./utils/money";

function getSharedRoomId() {
  const tg = window.Telegram?.WebApp;
  const params = new URLSearchParams(window.location.search);
  const launchParam = tg?.initDataUnsafe?.start_param || params.get("startapp") || "";
  const match = String(launchParam).match(/^room_([A-Za-z0-9_-]+)$/);
  return match?.[1] || "";
}

function LaunchRoute() {
  const roomId = getSharedRoomId();
  return roomId
    ? <Navigate to={`/second?roomId=${encodeURIComponent(roomId)}&privateShare=1`} replace />
    : <MainPage />;
}

function requestLaunchFullscreen() {
  if (typeof window.__requestKartaFullscreen === "function") {
    window.__requestKartaFullscreen();
    return;
  }

  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.ready?.();
  tg.expand?.();
  tg.disableVerticalSwipes?.();

  try {
    const fullscreenRequest = tg.requestFullscreen?.();
    fullscreenRequest?.catch?.(() => {});
  } catch {
    // Older Telegram clients may expose WebApp without fullscreen support.
  }
}

function getAnalyticsSessionId() {
  const existing = sessionStorage.getItem("karta_analytics_session");
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem("karta_analytics_session", next);
  return next;
}

function ExperienceAnalytics() {
  const location = useLocation();
  const { user } = useUser();
  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  const sessionId = getAnalyticsSessionId();
  const userId = user?.telegramId || user?.id || null;

  useEffect(() => {
    const send = (eventName, metadata = {}) => fetch(`${API_BASE_URL}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName, sessionId, userId, path: location.pathname, metadata }),
      keepalive: true,
    }).catch(() => {});

    const sessionKey = `karta_session_started_${sessionId}`;
    if (!sessionStorage.getItem(sessionKey)) {
      sessionStorage.setItem(sessionKey, "1");
      send("session_start", {
        language: navigator.language,
        platform: window.Telegram?.WebApp?.platform || "web",
      });
    }
    send(location.pathname.startsWith("/game/") ? "game_view" : "page_view");
  }, [API_BASE_URL, location.pathname, sessionId, userId]);

  useEffect(() => {
    const startedAt = Date.now();
    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      fetch(`${API_BASE_URL}/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: "heartbeat",
          sessionId,
          userId,
          path: window.location.pathname,
          metadata: { elapsedSeconds: Math.round((Date.now() - startedAt) / 1000) },
        }),
        keepalive: true,
      }).catch(() => {});
    };
    const timer = setInterval(heartbeat, 60_000);
    return () => clearInterval(timer);
  }, [API_BASE_URL, sessionId, userId]);

  useEffect(() => {
    const reportError = (kind) => {
      fetch(`${API_BASE_URL}/analytics/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName: "app_error",
          sessionId,
          userId,
          path: window.location.pathname,
          metadata: { kind },
        }),
        keepalive: true,
      }).catch(() => {});
    };
    const handleError = () => reportError("window_error");
    const handleRejection = () => reportError("unhandled_rejection");
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [API_BASE_URL, sessionId, userId]);

  return null;
}

function WelcomeGiftPopup() {
  const { user, dismissFirstRunGift } = useUser();
  const { t, ui } = useSettings();
  const giftBirr = Number(user?.firstRunGiftBirr || 0);

  if (!giftBirr) return null;

  const styles = {
    backdrop: {
      position: "fixed",
      inset: 0,
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "18px",
      background: "rgba(0,0,0,0.64)",
      backdropFilter: "blur(10px)",
      WebkitBackdropFilter: "blur(10px)",
      boxSizing: "border-box",
    },
    panel: {
      width: "100%",
      maxWidth: "320px",
      ...ui.glassPanel,
      borderRadius: "12px",
      padding: "20px",
      textAlign: "center",
      color: ui.colors.cream,
      boxSizing: "border-box",
    },
    iconWrap: {
      width: "82px",
      height: "82px",
      margin: "0 auto 12px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: "rgba(241,196,15,0.13)",
      border: "1px solid rgba(241,196,15,0.32)",
    },
    birrBadge: {
      width: "58px",
      height: "58px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(180deg, #f1c40f, #d4af37)",
      color: ui.colors.textDark,
      fontWeight: 900,
      fontSize: "1.3rem",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 6px 18px rgba(0,0,0,0.26)",
    },
    title: {
      margin: "0 0 8px",
      color: ui.colors.gold,
      fontSize: "1.35rem",
      letterSpacing: 0,
    },
    text: {
      margin: "0 0 18px",
      lineHeight: 1.45,
      color: ui.colors.cream,
    },
    amount: {
      justifyContent: "center",
      marginBottom: "18px",
      color: ui.colors.gold,
      fontWeight: 900,
      fontSize: "1.1rem",
    },
    button: {
      width: "100%",
      ...ui.goldButton,
      color: ui.colors.textDark,
      borderRadius: "8px",
      padding: "11px 14px",
      fontWeight: 900,
      cursor: "pointer",
    },
  };

  return (
    <div style={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="welcome-gift-title">
      <div style={styles.panel}>
        <div style={styles.iconWrap}>
          <div aria-hidden="true" style={styles.birrBadge}>Br</div>
        </div>
        <h2 id="welcome-gift-title" style={styles.title}>{t("welcomeGiftTitle")}</h2>
        <p style={styles.text}>{t("welcomeGiftText", { amount: formatBirr(giftBirr) })}</p>
        <CoinAmount value={giftBirr} size={22} style={styles.amount} />
        <button type="button" style={styles.button} onClick={dismissFirstRunGift}>
          {t("welcomeGiftButton")}
        </button>
      </div>
    </div>
  );
}

function ReferralRewardPopup() {
  const { user, notifications, dismissNotification } = useUser();
  const { t, ui } = useSettings();
  const notification = notifications.find((item) => item.type === "referral_reward");
  if (!notification || Number(user?.firstRunGiftBirr || 0) > 0) return null;

  const amount = Number(notification.data?.amount || 0);
  const player = notification.data?.referredUserName || t("newPlayer");
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 201, display: "flex", alignItems: "center",
        justifyContent: "center", padding: "18px", background: "rgba(0,0,0,0.64)",
        backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxSizing: "border-box",
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="referral-reward-title"
    >
      <div style={{ width: "100%", maxWidth: "320px", ...ui.glassPanel, borderRadius: "12px", padding: "22px", textAlign: "center", color: ui.colors.cream }}>
        <div aria-hidden="true" style={{ fontSize: "2.5rem", marginBottom: "8px" }}>🎉</div>
        <h2 id="referral-reward-title" style={{ margin: "0 0 9px", color: ui.colors.gold, fontSize: "1.3rem" }}>
          {t("referralRewardTitle")}
        </h2>
        <p style={{ margin: "0 0 14px", lineHeight: 1.5 }}>
          {t("referralRewardText", { player, amount: formatBirr(amount) })}
        </p>
        <CoinAmount value={amount} size={22} style={{ marginBottom: "18px", color: ui.colors.gold, fontWeight: 900 }} />
        <button
          type="button"
          style={{ width: "100%", ...ui.goldButton, color: ui.colors.textDark, borderRadius: "8px", padding: "11px 14px", fontWeight: 900, cursor: "pointer" }}
          onClick={() => dismissNotification(notification.id)}
        >
          {t("referralRewardButton")}
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { loading } = useUser();
  const [minimumSplashDone, setMinimumSplashDone] = useState(false);

  useEffect(() => {
    requestLaunchFullscreen();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setMinimumSplashDone(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !minimumSplashDone) {
    return <SplashScreen />;
  }

  return (
    <>
      <ExperienceAnalytics />
      <Routes>
        <Route path="/" element={<LaunchRoute />} />
        <Route path="/deposit" element={<DepositPage />} />
        <Route path="/withdraw" element={<WithdrawPage />} />
        <Route path="/second" element={<SecondPage />} />
        <Route path="/game/:roomId" element={<GamePage />} />
      </Routes>
      <WelcomeGiftPopup />
      <ReferralRewardPopup />
    </>
  );
}

function App() {
  return (
    <SettingsProvider>
      <UserProvider>
        <Router>
          <AppShell />
        </Router>
      </UserProvider>
    </SettingsProvider>
  );
}

export default App;
