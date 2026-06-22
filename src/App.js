import { useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Routes, Route } from "react-router-dom";
import { UserProvider, useUser } from "./contexts/UserContext";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";

import MainPage from "./MainPage";
import SecondPage from "./SecondPage";
import GamePage from "./GamePage";
import DepositPage from "./DepositPage";
import WithdrawPage from "./withdrawpage";
import SplashScreen from "./SplashScreen";
import CoinAmount from "./CoinAmount";

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
    ? <Navigate to={`/game/${encodeURIComponent(roomId)}`} replace />
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

function WelcomeGiftPopup() {
  const { user, dismissFirstRunGift } = useUser();
  const { t, ui } = useSettings();
  const giftCoins = Number(user?.firstRunGiftCoins || 0);

  if (!giftCoins) return null;

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
    coin: {
      width: "58px",
      height: "58px",
      objectFit: "contain",
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
          <img src="/coin.png" alt="" aria-hidden="true" style={styles.coin} />
        </div>
        <h2 id="welcome-gift-title" style={styles.title}>{t("welcomeGiftTitle")}</h2>
        <p style={styles.text}>{t("welcomeGiftText", { amount: giftCoins })}</p>
        <CoinAmount value={giftCoins} size={22} style={styles.amount} />
        <button type="button" style={styles.button} onClick={dismissFirstRunGift}>
          {t("welcomeGiftButton")}
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
      <Routes>
        <Route path="/" element={<LaunchRoute />} />
        <Route path="/deposit" element={<DepositPage />} />
        <Route path="/withdraw" element={<WithdrawPage />} />
        <Route path="/second" element={<SecondPage />} />
        <Route path="/game/:roomId" element={<GamePage />} />
      </Routes>
      <WelcomeGiftPopup />
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
