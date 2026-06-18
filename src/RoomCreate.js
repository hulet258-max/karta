import React, { useState } from "react";
import { Globe2, Lock, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import CoinAmount from "./CoinAmount";
import { MIN_ROOM_ENTRY_COINS } from "./utils/money";
import { socket } from "./socket"; // 🔌 Import your socket instance

function RoomCreate({ onClose, onRoomCreated }) {
  const { user } = useUser();
  const { t, ui } = useSettings();
  const navigate = useNavigate();
  const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  const [roomName, setRoomName] = useState("");
  const [gameType, setGameType] = useState("2-players");
  const [entryFee, setEntryFee] = useState(String(MIN_ROOM_ENTRY_COINS));
  const [visibility, setVisibility] = useState("public");
  const [createdRoomId, setCreatedRoomId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getBotUsername = () => String(
    process.env.REACT_APP_BOT_USERNAME ||
    process.env.REACT_APP_TELEGRAM_BOT_USERNAME ||
    ""
  ).replace(/^@/, "").trim();

  const openTelegramShareFallback = (inlineQuery) => {
    const botUsername = getBotUsername();

    if (!botUsername) {
      return false;
    }

    const shareText = `@${botUsername} ${inlineQuery}`;
    const shareUrl = `https://t.me/share/url?text=${encodeURIComponent(shareText)}`;
    const tg = window.Telegram?.WebApp;

    try {
      if (tg?.openTelegramLink && tg?.initData) {
        tg.openTelegramLink(shareUrl);
        return true;
      }
    } catch (shareError) {
      console.warn("Telegram share fallback failed:", shareError);
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
    return true;
  };

  const handleJoinRoom = async (roomId) => {
    const joinRes = await fetch(`${BASE_URL}/join-room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        userId: user.telegramId,
        socketId: socket.id,
      }),
    });
    const joinData = await joinRes.json();
    if (joinData.mustDeleteOwnRoom) {
      throw new Error(t("deleteOwnRoomFirst"));
    }
    if (joinData.alreadyInRoom && joinData.room?.id) {
      throw new Error(t("leaveCurrentRoomFirst"));
    }
    if (!joinRes.ok || !joinData.success) {
      throw new Error(joinData.error || t("failedToJoinRoom"));
    }
    navigate(`/game/${joinData.room.id}`, {
      state: {
        room: joinData.room,
        players: joinData.players,
        redisData: joinData.redisData,
      },
    });
  };

  const handleTelegramShare = () => {
    if (!createdRoomId) return;

    setError("");
    const inlineQuery = `join_room_${createdRoomId}`;
    const tg = window.Telegram?.WebApp;
    const isTelegramMiniApp = Boolean(tg?.initData || tg?.initDataUnsafe?.user);

    try {
      if (isTelegramMiniApp && tg?.switchInlineQuery) {
        tg.switchInlineQuery(inlineQuery, ["users", "groups"]);
        return;
      }
    } catch (shareError) {
      console.warn("Telegram inline share failed:", shareError);
    }

    if (openTelegramShareFallback(inlineQuery)) {
      return;
    }

    setError(t("shareTelegramUnavailable"));
  };

  const handleCreate = async () => {
    if (!user || !roomName.trim() || !entryFee) {
      setError(t("fillAllFields"));
      return;
    }

    const entryFeeCoins = Number(entryFee);
    if (!Number.isInteger(entryFeeCoins) || entryFeeCoins < MIN_ROOM_ENTRY_COINS) {
      setError(t("minRoomEntryError", { amount: MIN_ROOM_ENTRY_COINS }));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const createRes = await fetch(`${BASE_URL}/create-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: roomName.trim(),
          gameType,
          entryFee: entryFeeCoins,
          visibility,
          creatorId: user.telegramId,
          socketId: socket.id,
        }),
      });
      const createData = await createRes.json();

      if (createData.mustDeleteOwnRoom) {
        throw new Error(t("deleteOwnRoomBeforeCreate"));
      }

      if (createData.alreadyInRoom && createData.room?.id) {
        throw new Error(t("leaveCurrentRoomBeforeCreate"));
      }

      if (!createRes.ok || !createData.success) {
        throw new Error(createData.error || t("failedToCreateRoom"));
      }

      if (visibility === "public") {
        onRoomCreated(createData.room);
        await handleJoinRoom(createData.room.id);
        return;
      }

      setCreatedRoomId(createData.room.id);
    } catch (err) {
      console.error("Error in room creation process:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const { colors, glassPanel, field: glassField, goldButton } = ui;

  const styles = {
    overlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(2, 8, 5, 0.76)",
      backdropFilter: "blur(12px) saturate(1.2)",
      WebkitBackdropFilter: "blur(12px) saturate(1.2)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 100,
      padding: "15px",
      boxSizing: "border-box",
    },
    popupContent: {
      ...glassPanel,
      borderRadius: "10px",
      padding: "18px",
      width: "100%",
      maxWidth: "360px",
      color: colors.cream,
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: "14px",
    },
    header: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: "12px",
    },
    titleBlock: {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      minWidth: 0,
    },
    titleIcon: {
      width: "34px",
      height: "34px",
      borderRadius: "8px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(255,246,94,0.14)",
      color: colors.gold,
      boxShadow: "inset 0 0 0 1px rgba(255,246,94,0.2)",
      flexShrink: 0,
    },
    title: {
      margin: 0,
      fontSize: "1.08rem",
      color: colors.gold,
      textTransform: "uppercase",
      letterSpacing: 0,
      lineHeight: 1.1,
    },
    subtitle: {
      margin: "3px 0 0",
      color: `color-mix(in srgb, ${colors.cream} 68%, transparent)`,
      fontSize: "0.74rem",
      lineHeight: 1.25,
    },
    closeBtn: {
      background: "transparent",
      border: "none",
      color: `color-mix(in srgb, ${colors.cream} 70%, transparent)`,
      cursor: "pointer",
      padding: 0,
      width: "34px",
      height: "34px",
      borderRadius: "8px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "color 0.2s",
    },
    formGroup: {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
    },
    label: {
      fontSize: "0.75rem",
      color: `color-mix(in srgb, ${colors.cream} 80%, transparent)`,
      textTransform: "uppercase",
      letterSpacing: "1px",
      fontWeight: 700,
    },
    input: {
      width: "100%",
      padding: "11px 12px",
      borderRadius: "8px",
      ...ui.textField,
      color: colors.text,
      fontSize: "0.9rem",
      boxSizing: "border-box",
      outline: "none",
      transition: "border-color 0.2s",
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "10px",
    },
    visibilityGroup: {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: "8px",
    },
    visibilityBtn: {
      minHeight: "58px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      borderRadius: "8px",
      ...glassField,
      color: `color-mix(in srgb, ${colors.cream} 78%, transparent)`,
      cursor: "pointer",
      fontWeight: 800,
    },
    visibilityBtnActive: {
      border: "1px solid rgba(255,246,94,0.75)",
      background: "rgba(255,246,94,0.18)",
      color: colors.text,
      boxShadow: "0 0 0 2px rgba(255,246,94,0.08), inset 0 1px 0 rgba(255,255,255,0.32)",
    },
    errorText: {
      color: "#e74c3c",
      textAlign: "center",
      fontSize: "0.85rem",
    },
    privateLinkBox: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginTop: "6px",
      padding: "10px",
      borderRadius: "8px",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.22)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.22)",
    },
    privateLinkTitle: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "8px",
      color: colors.gold,
      fontWeight: 800,
      fontSize: "0.78rem",
      textTransform: "uppercase",
    },
    telegramBtn: {
      width: "100%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      borderRadius: "10px",
      border: "1px solid rgba(255, 255, 255, 0.34)",
      background: "linear-gradient(180deg, #2aa0d6, #1f8fcb)",
      color: "#fff",
      padding: "10px",
      fontWeight: "bold",
      cursor: "pointer",
      fontSize: "0.8rem",
      boxShadow: "0 14px 26px rgba(0,0,0,0.24), 0 0 22px rgba(49,172,238,0.18), inset 0 1px 0 rgba(255,255,255,0.38)",
    },
    createBtn: {
      width: "100%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      ...goldButton,
      borderRadius: "8px",
      padding: "12px",
      color: colors.textDark,
      fontWeight: "bold",
      fontSize: "0.9rem",
      cursor: "pointer",
      textTransform: "uppercase",
      letterSpacing: "1px",
      marginTop: "10px",
      transition: "transform 0.1s",
    }
  };

  const privateRoomCreated = visibility === "private" && createdRoomId;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.popupContent} onClick={(e) => e.stopPropagation()}>
        
        <div style={styles.header}>
          <div style={styles.titleBlock}>
            <span style={styles.titleIcon}>
              {visibility === "private" ? <Lock size={18} /> : <Globe2 size={18} />}
            </span>
            <div>
              <h2 style={styles.title}>
                {privateRoomCreated ? t("privateRoomReady") : t("createRoom")}
              </h2>
              {!privateRoomCreated && (
                <p style={styles.subtitle}>
                  {visibility === "private" ? t("privateRoomShareHint") : t("publicRoomHint")}
                </p>
              )}
            </div>
          </div>
          <button 
            onClick={onClose} 
            style={styles.closeBtn}
            aria-label={t("close")}
            title={t("close")}
            onMouseOver={(e) => e.currentTarget.style.color = colors.text}
            onMouseOut={(e) => e.currentTarget.style.color = `color-mix(in srgb, ${colors.cream} 70%, transparent)`}
          >
            <X size={22} />
          </button>
        </div>

        {!privateRoomCreated && (
          <div>
            <div style={styles.formGroup}>
              <label htmlFor="room-name" style={styles.label}>{t("roomName")}</label>
              <input
                type="text"
                id="room-name"
                placeholder={t("roomPlaceholder")}
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                style={styles.input}
              />
            </div>

            <div style={styles.grid}>
              <div style={styles.formGroup}>
                <label htmlFor="game-type" style={styles.label}>{t("gameType")}</label>
                <select
                  id="game-type"
                  value={gameType}
                  onChange={(e) => setGameType(e.target.value)}
                  style={{...styles.input, appearance: "auto"}}
                >
                  <option value="2-players" style={{ background: "#0a1e12" }}>2 {t("players")}</option>
                  <option value="3-players" style={{ background: "#0a1e12" }}>3 {t("players")}</option>
                  <option value="4-players" style={{ background: "#0a1e12" }}>4 {t("players")}</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label htmlFor="entry-fee" style={styles.label}>{t("entryFee")} ({t("coins")})</label>
                <input
                  type="number"
                  id="entry-fee"
                  min={MIN_ROOM_ENTRY_COINS}
                  step="1"
                  placeholder={String(MIN_ROOM_ENTRY_COINS)}
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={{ ...styles.privateLinkBox, marginTop: "10px", padding: "9px" }}>
              <div style={styles.privateLinkTitle}>
                <span>{t("minimumRoomEntry")}</span>
                <CoinAmount value={MIN_ROOM_ENTRY_COINS} size={15} />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>{t("visibility")}</label>
              <div style={styles.visibilityGroup}>
                <button
                  type="button"
                  style={{
                    ...styles.visibilityBtn,
                    ...(visibility === "public" ? styles.visibilityBtnActive : {}),
                  }}
                  onClick={() => setVisibility("public")}
                >
                  <Globe2 size={16} />
                  {t("public")}
                </button>
                <button
                  type="button"
                  style={{
                    ...styles.visibilityBtn,
                    ...(visibility === "private" ? styles.visibilityBtnActive : {}),
                  }}
                  onClick={() => setVisibility("private")}
                >
                  <Lock size={16} />
                  {t("private")}
                </button>
              </div>
            </div>
          </div>
        )}

        {error && <div style={styles.errorText}>{error}</div>}

        {privateRoomCreated && (
          <div style={styles.privateLinkBox}>
            <button style={styles.telegramBtn} onClick={handleTelegramShare}>
              {t("shareTelegram")}
            </button>
          </div>
        )}

        {!privateRoomCreated && (
          <div>
          <button 
            style={styles.createBtn} 
            onClick={handleCreate}
            disabled={loading}
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
            {loading ? t("creating") : visibility === "private" ? t("createRoom") : t("createAndJoin")}
          </button>
          </div>
        )}

      </div>
    </div>
  );
}

export default RoomCreate;
