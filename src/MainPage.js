import React, { useEffect, useState } from "react";
import { Gift, Settings, Volume2, VolumeX, UserCircle, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import logog from "./logo.png";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import { socket } from "./socket";
import CoinAmount from "./CoinAmount";
import { sharePreparedTelegramMessage, switchTelegramInlineQuery } from "./utils/telegramShare";

function MainPage() {
  const navigate = useNavigate();
  const { user, loading, refreshUser } = useUser();
  const { settings, updateSetting, t, ui } = useSettings();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

  useEffect(() => {
    if (user && user.id) {
      socket.emit("auth_user", user.id);
    }

  }, [user]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const previousOverscrollBehavior = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, []);

  const handleShare = async () => {
    try {
      let shareUrl = window.location.origin;
      let referralCode = "";
      let fallbackQuery = "";
      let preparedMessageId = "";
      if (user?.telegramId || user?.id) {
        const response = await fetch(`${API_BASE_URL}/share/referral`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.telegramId || user.id,
            origin: window.location.origin,
            botUsername: process.env.REACT_APP_BOT_USERNAME,
          }),
        });
        const data = await response.json();
        if (response.ok && data.success && data.link) {
          shareUrl = data.link;
          referralCode = data.code || "";
          fallbackQuery = data.fallbackQuery || (data.code ? `ref_${data.code}` : "");
          preparedMessageId = data.preparedMessageId || "";
        }
      }

      const shareData = {
        title: "Karta",
        text: t("shareInviteText"),
        url: shareUrl,
      };
      const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(shareData.url)}&text=${encodeURIComponent(shareData.text)}`;
      const tg = window.Telegram?.WebApp;

      if (sharePreparedTelegramMessage(tg, preparedMessageId)) {
        return;
      }

      if (switchTelegramInlineQuery(tg, fallbackQuery || (referralCode ? `ref_${referralCode}` : ""))) {
        return;
      }

      if (tg?.openTelegramLink) {
        tg.openTelegramLink(telegramShareUrl);
        return;
      }

      if (navigator.share) {
        await navigator.share(shareData);
        return;
      }
      await navigator.clipboard.writeText(shareData.url);
    } catch (error) {
      console.error("Share failed:", error);
    }
  };

  const openProfile = async () => {
    if (!user?.telegramId && !user?.id) return;
    const userId = user.telegramId || user.id;
    setIsProfileOpen(true);
    setProfileLoading(true);
    setProfileError("");

    try {
      const response = await fetch(`${API_BASE_URL}/user-profile/${encodeURIComponent(userId)}`);
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("profileLoadFailed"));
      }
      setProfile(data.profile);
      setProfileName(data.profile?.user?.displayName || "");
    } catch (error) {
      setProfileError(error.message || t("profileLoadFailed"));
    } finally {
      setProfileLoading(false);
    }
  };

  const saveProfileName = async () => {
    if (!user?.telegramId && !user?.id) return;
    setProfileLoading(true);
    setProfileError("");

    try {
      const response = await fetch(`${API_BASE_URL}/user-profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.telegramId || user.id,
          displayName: profileName,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("profileSaveFailed"));
      }
      await refreshUser?.();
      await openProfile();
    } catch (error) {
      setProfileError(error.message || t("profileSaveFailed"));
    } finally {
      setProfileLoading(false);
    }
  };

  const iconStyle = { width: 16, height: 16, flexShrink: 0 };
  const { colors, glassPanel, goldButton } = ui;

  const styles = {
    container: {
      height: "100dvh",
      minHeight: 0,
      width: "100vw",
      overflow: "hidden",
      overscrollBehavior: "none",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      background: "var(--karta-bg)",
      backgroundSize: "auto, 42px 42px, 42px 42px, auto",
      color: colors.text,
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      position: "relative",
      padding: "96px 20px 12px",
      boxSizing: "border-box",
    },
    bgCards: {
      position: "absolute",
      inset: 0,
      pointerEvents: "none",
      zIndex: 1,
      overflow: "hidden",
    },
    bgCard: (top, left, rotate, opacity = 0.12) => ({
      position: "absolute",
      top,
      left,
      width: "44px",
      height: "62px",
      borderRadius: "8px",
      border: `1px solid color-mix(in srgb, ${colors.gold} 38%, transparent)`,
      background: "rgba(245, 238, 194, 0.075)",
      color: colors.gold,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 900,
      fontSize: "1rem",
      transform: `rotate(${rotate}deg)`,
      opacity,
      boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
    }),
    content: {
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "flex-start",
      width: "100%",
      maxWidth: "350px",
      flex: 1,
      minHeight: 0,
      gap: "clamp(8px, 1.8dvh, 16px)",
      boxSizing: "border-box",
      paddingTop: "clamp(8px, 2.8dvh, 24px)",
    },
    topBar: {
      position: "absolute",
      top: "72px",
      left: "15px",
      right: "15px",
      zIndex: 10,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "10px",
    },
    profileIconButton: {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      padding: 0,
      border: `2px solid color-mix(in srgb, ${colors.gold} 72%, transparent)`,
      background: "rgba(0, 0, 0, 0.25)",
      overflow: "hidden",
      cursor: "pointer",
      boxShadow: "0 6px 14px rgba(0,0,0,0.25)",
    },
    topRight: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    balancePill: {
      color: colors.gold,
      background: "rgba(0, 0, 0, 0.28)",
      border: `1px solid color-mix(in srgb, ${colors.gold} 42%, transparent)`,
      borderRadius: "8px",
      padding: "8px 10px",
      fontSize: "0.9rem",
      fontWeight: "bold",
      backdropFilter: "blur(5px)",
    },
    settingsButton: {
      width: "40px",
      height: "40px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: `color-mix(in srgb, ${colors.gold} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${colors.gold} 46%, transparent)`,
      color: colors.gold,
      borderRadius: "8px",
      padding: 0,
      cursor: "pointer",
      backdropFilter: "blur(5px)",
    },
    modalBackdrop: {
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.58)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 50,
      padding: "18px",
      boxSizing: "border-box",
    },
    settingsPanel: {
      width: "100%",
      maxWidth: "340px",
      maxHeight: "calc(100dvh - 36px)",
      overflowY: "auto",
      ...glassPanel,
      borderRadius: "16px",
      padding: "18px",
      color: colors.text,
      boxSizing: "border-box",
    },
    settingsHeader: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "16px",
    },
    settingsTitle: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      margin: 0,
      color: colors.cream,
      fontSize: "1.15rem",
    },
    closeButton: {
      width: "34px",
      height: "34px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      ...ui.iconButton,
      cursor: "pointer",
      padding: 0,
    },
    settingRow: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "14px",
      padding: "13px 0",
      borderTop: "1px solid rgba(255,255,255,0.12)",
    },
    profileStatsGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
      marginTop: "12px",
    },
    profileStat: {
      ...ui.field,
      borderRadius: "8px",
      padding: "10px",
      minHeight: "58px",
    },
    profileStatLabel: {
      display: "block",
      color: "rgba(245, 238, 194, 0.72)",
      fontSize: "0.68rem",
      fontWeight: 800,
      textTransform: "uppercase",
      marginBottom: "5px",
    },
    profileStatValue: {
      display: "block",
      color: colors.gold,
      fontSize: "0.95rem",
      fontWeight: 900,
      lineHeight: 1.2,
    },
    profileInput: {
      width: "100%",
      marginTop: "12px",
      padding: "10px 11px",
      borderRadius: "8px",
      ...ui.textField,
      color: colors.text,
      outline: "none",
    },
    profileActions: {
      display: "flex",
      gap: "8px",
      marginTop: "12px",
    },
    profileSaveBtn: {
      flex: 1,
      ...goldButton,
      color: colors.textDark,
      borderRadius: "8px",
      padding: "10px",
      fontWeight: 900,
      cursor: "pointer",
    },
    profileError: {
      color: "#ffb4ab",
      fontSize: "0.8rem",
      marginTop: "10px",
      lineHeight: 1.35,
    },
    settingLabel: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      color: colors.cream,
      fontSize: "0.95rem",
      fontWeight: 700,
    },
    languageSelect: {
      minWidth: "140px",
      ...ui.textField,
      color: colors.text,
      borderRadius: "10px",
      padding: "9px 10px",
      fontSize: "0.9rem",
      outline: "none",
    },
    switchButton: {
      width: "64px",
      height: "32px",
      border: "1px solid rgba(255,255,255,0.25)",
      borderRadius: "999px",
      padding: "3px",
      cursor: "pointer",
      position: "relative",
      transition: "background 0.2s",
    },
    switchKnob: {
      display: "block",
      width: "24px",
      height: "24px",
      borderRadius: "50%",
      background: "#fff",
      boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
      transition: "transform 0.2s",
    },
    switchText: {
      minWidth: "34px",
      color: "#fff",
      fontSize: "0.72rem",
      fontWeight: 800,
      textAlign: "center",
    },
    switchWrap: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    },
    themeToggle: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "6px",
      width: "152px",
      padding: "3px",
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(0,0,0,0.22)",
    },
    themeOption: (isActive) => ({
      minHeight: "30px",
      borderRadius: "8px",
      border: isActive ? `1px solid ${colors.gold}` : "1px solid transparent",
      background: isActive ? `linear-gradient(180deg, ${colors.gold}, ${colors.goldDeep})` : "transparent",
      color: isActive ? colors.textDark : colors.cream,
      cursor: "pointer",
      fontSize: "0.7rem",
      fontWeight: 900,
      padding: "5px 7px",
    }),
    logoWrap: {
      width: "clamp(120px, 34dvh, 260px)",
      height: "clamp(120px, 34dvh, 260px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
    profileArea: {
      width: "100%",
      maxWidth: "350px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      boxSizing: "border-box",
      padding: "10px 12px",
      ...glassPanel,
      borderRadius: "14px",
    },
    userSection: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      color: colors.cream,
      minWidth: 0,
    },
    avatar: {
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      border: `2px solid ${colors.gold}`,
      objectFit: "cover",
      flexShrink: 0,
    },
    balanceAmount: {
      fontSize: "1.05rem",
      fontWeight: "bold",
      color: colors.gold,
      margin: 0,
      textShadow: "0 0 5px rgba(255,246,94,0.4)",
      textAlign: "right",
    },
    actionRow: {
      display: "flex",
      gap: "20px",
      width: "100%",
      maxWidth: "350px",
    },
    buttonGroup: {
      width: "100%",
      maxWidth: "350px",
      display: "flex",
      flexDirection: "column",
      gap: "clamp(8px, 1.5dvh, 14px)",
    },
    shareCard: {
      width: "100%",
      maxWidth: "350px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "14px",
      padding: "clamp(10px, 1.8dvh, 14px)",
      minHeight: "clamp(58px, 9dvh, 78px)",
      boxSizing: "border-box",
      borderRadius: "10px",
      ...glassPanel,
    },
    shareText: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      color: colors.cream,
      fontSize: "0.95rem",
      fontWeight: 800,
      minWidth: 0,
      lineHeight: 1.2,
    },
    shareIconBubble: {
      width: "42px",
      height: "42px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      color: colors.gold,
      background: `color-mix(in srgb, ${colors.gold} 12%, transparent)`,
      border: `1px solid color-mix(in srgb, ${colors.gold} 28%, transparent)`,
      flexShrink: 0,
    },
    shareBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      borderRadius: "10px",
      ...goldButton,
      color: colors.textDark,
      padding: "11px 14px",
      fontWeight: 900,
      fontSize: "0.84rem",
      cursor: "pointer",
      whiteSpace: "nowrap",
    },
    actionBtnPrimary: {
      flex: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      ...goldButton,
      borderRadius: "10px",
      padding: "clamp(9px, 1.5dvh, 12px) 10px",
      color: colors.textDark,
      fontWeight: "bold",
      fontSize: "0.85rem",
      cursor: "pointer",
    },
    playBtn: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "9px",
      ...goldButton,
      borderRadius: "10px",
      padding: "clamp(10px, 1.8dvh, 14px) 20px",
      width: "100%",
      maxWidth: "350px",
      fontSize: "clamp(1rem, 2.4dvh, 1.2rem)",
      fontWeight: "900",
      color: colors.textDark,
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: "1px",
      transition: "transform 0.1s",
    },
  };

  const renderSwitch = (key, label, Icon) => {
    const isEnabled = settings[key];
    const SwitchIcon = key === "sound" ? (isEnabled ? Volume2 : VolumeX) : Icon;

    return (
      <div style={styles.settingRow} key={key}>
        <span style={styles.settingLabel}>
          <SwitchIcon style={iconStyle} />
          {label}
        </span>
        <div style={styles.switchWrap}>
          <span style={styles.switchText}>{isEnabled ? t("on") : t("off")}</span>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label={label}
            onClick={() => updateSetting(key, !isEnabled)}
            style={{
              ...styles.switchButton,
              background: isEnabled ? colors.gold : "rgba(0,0,0,0.32)",
            }}
          >
            <span
              style={{
                ...styles.switchKnob,
                transform: isEnabled ? "translateX(30px)" : "translateX(0)",
              }}
            />
          </button>
        </div>
      </div>
    );
  };

  const renderThemeToggle = () => (
    <div style={styles.settingRow}>
      <span style={styles.settingLabel}>{t("theme")}</span>
      <div style={styles.themeToggle}>
        {["bright", "dark"].map((themeMode) => (
          <button
            key={themeMode}
            type="button"
            style={styles.themeOption(settings.themeMode === themeMode)}
            onClick={() => updateSetting("themeMode", themeMode)}
          >
            {themeMode === "bright" ? t("brightMode") : t("darkMode")}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.bgCards}>
        <div style={styles.bgCard("14%", "7%", -17)}>A</div>
        <div style={styles.bgCard("28%", "82%", 14, 0.18)}>K</div>
        <div style={styles.bgCard("62%", "4%", 20, 0.17)}>Q</div>
        <div style={styles.bgCard("74%", "84%", -13, 0.19)}>J</div>
      </div>

      <div style={styles.topBar}>
        <button style={styles.profileIconButton} aria-label={t("profileView")} onClick={openProfile}>
          <img
            src={user?.photo || "https://cdn-icons-png.flaticon.com/512/149/149071.png"}
            alt={t("profileView")}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </button>
        <div style={styles.topRight}>
          <span style={styles.balancePill}>
            {loading ? "..." : <CoinAmount value={user?.balance} size={17} />}
          </span>
          <button style={styles.settingsButton} onClick={() => setIsSettingsOpen(true)} aria-label={t("settings")}>
            <Settings style={{ width: 18, height: 18 }} />
          </button>
        </div>
      </div>

      {isProfileOpen && (
        <div style={styles.modalBackdrop} onClick={() => setIsProfileOpen(false)}>
          <div
            style={styles.settingsPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.settingsHeader}>
              <h2 id="profile-title" style={styles.settingsTitle}>
                {profile?.user?.displayName || profile?.user?.firstName || t("user")}
              </h2>
              <button
                type="button"
                style={styles.closeButton}
                aria-label={t("close")}
                onClick={() => setIsProfileOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder={t("visibleGameplayName")}
              style={styles.profileInput}
              disabled={profileLoading}
            />

            <div style={styles.profileStatsGrid}>
              <div style={styles.profileStat}>
                <span style={styles.profileStatLabel}>{t("balance")}</span>
                <span style={styles.profileStatValue}><CoinAmount value={profile?.user?.balance} /></span>
              </div>
              <div style={styles.profileStat}>
                <span style={styles.profileStatLabel}>{t("games")}</span>
                <span style={styles.profileStatValue}>{profile?.gameStats?.gamesPlayed || 0}</span>
              </div>
              <div style={styles.profileStat}>
                <span style={styles.profileStatLabel}>{t("amountPlayed")}</span>
                <span style={styles.profileStatValue}><CoinAmount value={profile?.gameStats?.amountPlayed} /></span>
              </div>
              <div style={styles.profileStat}>
                <span style={styles.profileStatLabel}>{t("shared")}</span>
                <span style={styles.profileStatValue}>{profile?.referralStats?.shareCount || 0}</span>
              </div>
              <div style={styles.profileStat}>
                <span style={styles.profileStatLabel}>{t("gotCoins")}</span>
                <span style={styles.profileStatValue}><CoinAmount value={profile?.referralStats?.earnedCoins ?? profile?.referralStats?.earnedBirr} /></span>
              </div>
              <div style={styles.profileStat}>
                <span style={styles.profileStatLabel}>{t("rewardsLeft")}</span>
                <span style={styles.profileStatValue}>{profile?.referralStats?.rewardsLeft || 0}</span>
              </div>
            </div>

            {profileError && <div style={styles.profileError}>{profileError}</div>}
            <div style={styles.profileActions}>
              <button type="button" style={styles.profileSaveBtn} onClick={saveProfileName} disabled={profileLoading}>
                {profileLoading ? t("loading") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {isSettingsOpen && (
        <div style={styles.modalBackdrop} onClick={() => setIsSettingsOpen(false)}>
          <div
            style={styles.settingsPanel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.settingsHeader}>
              <h2 id="settings-title" style={styles.settingsTitle}>
                <Settings style={{ width: 20, height: 20 }} />
                {t("settings")}
              </h2>
              <button
                type="button"
                style={styles.closeButton}
                aria-label={t("close")}
                onClick={() => setIsSettingsOpen(false)}
              >
                <X size={17} />
              </button>
            </div>

            <div style={styles.settingRow}>
              <label htmlFor="language-select" style={styles.settingLabel}>
                {t("language")}
              </label>
              <select
                id="language-select"
                value={settings.language}
                onChange={(event) => updateSetting("language", event.target.value)}
                style={styles.languageSelect}
              >
                <option value="amharic">{t("amharic")}</option>
                <option value="english">{t("english")}</option>
                <option value="oromifa">{t("oromifa")}</option>
              </select>
            </div>

            {renderThemeToggle()}
            {renderSwitch("sound", t("sound"), Volume2)}
            {renderSwitch("profileView", t("profileView"), UserCircle)}
          </div>
        </div>
      )}

      <div style={styles.content}>
        <div style={styles.logoWrap}>
          <img
            src={logog}
            alt="logo"
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        <div style={styles.shareCard}>
          <div style={styles.shareText}>
            <span style={styles.shareIconBubble}>
              <Gift size={18} />
            </span>
            <span>{t("shareReward")}</span>
          </div>
          <button style={styles.shareBtn} onClick={handleShare}>
            {t("share")}
          </button>
        </div>

        <div style={styles.buttonGroup}>
          <div style={styles.actionRow}>
            <button style={styles.actionBtnPrimary} onClick={() => navigate("/deposit")}>
              {t("deposit")}
            </button>
            <button style={styles.actionBtnPrimary} onClick={() => navigate("/withdraw")}>
              {t("withdraw")}
            </button>
          </div>

          <button
            onClick={() => navigate("/second")}
            style={styles.playBtn}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "translateY(1px) scale(0.985)";
              e.currentTarget.style.boxShadow = "0 8px 18px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.5)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = goldButton.boxShadow;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = goldButton.boxShadow;
            }}
          >
            {t("play")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default MainPage;
