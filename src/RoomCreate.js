import React, { useState } from "react";
import { Globe2, Lock, Play, Send, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import CoinAmount from "./CoinAmount";
import { MIN_ROOM_ENTRY_COINS } from "./utils/money";
import ShareToast from "./ShareToast";
import TinySpinner from "./TinySpinner";
import { sharePreparedTelegramMessage, switchTelegramInlineQuery } from "./utils/telegramShare";
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
  const [createdRoom, setCreatedRoom] = useState(null);
  const [loading, setLoading] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [goToGameLoading, setGoToGameLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareToast, setShareToast] = useState(null);

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

  const handleTelegramShare = async () => {
    if (!createdRoomId || shareLoading) return;

    setError("");
    setShareLoading(true);
    const fallbackQuery = `join_room_${createdRoomId}`;
    const tg = window.Telegram?.WebApp;
    const shareRoom = createdRoom || {};
    const shareContent = [
      shareRoom.name || roomName.trim() || "Private Karta game",
      `${Number(shareRoom.playerCount || 0)}/${Number(shareRoom.maxPlayers || 0) || "?"} ${t("players")}`,
      `${Number(shareRoom.entryFee || entryFee || 0)} ${t("coins")}`,
    ].join(" · ");
    const showShareToast = (type, messageKey) => {
      setShareToast({
        type,
        title: t(messageKey, { content: shareContent }),
      });
    };

    try {
      const response = await fetch(`${BASE_URL}/share/private-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user?.telegramId || user?.id,
          roomId: createdRoomId,
          botUsername: process.env.REACT_APP_BOT_USERNAME,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("shareTelegramUnavailable"));
      }

      if (
        sharePreparedTelegramMessage(tg, data.preparedMessageId, {
          onSent: () => showShareToast("success", "telegramShareSent"),
          onCanceled: () => showShareToast("info", "telegramShareCanceled"),
        })
      ) {
        return;
      }

      if (switchTelegramInlineQuery(tg, data.fallbackQuery || fallbackQuery)) {
        showShareToast("info", "telegramShareFallbackOpened");
        return;
      }
    } catch (shareError) {
      console.warn("Telegram private room share failed:", shareError);
      showShareToast("error", "telegramShareCanceled");
    } finally {
      setShareLoading(false);
    }

    setError(t("shareTelegramUnavailable"));
  };

  const handleGoToGame = async () => {
    if (!createdRoomId || goToGameLoading) return;

    setGoToGameLoading(true);
    setError("");
    try {
      await handleJoinRoom(createdRoomId);
    } catch (goError) {
      console.error("Error opening private room:", goError);
      setError(goError.message || t("failedToJoinRoom"));
    } finally {
      setGoToGameLoading(false);
    }
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
      setCreatedRoom(createData.room);
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
    goToGameBtn: {
      width: "100%",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      ...goldButton,
      borderRadius: "10px",
      padding: "10px",
      color: colors.textDark,
      fontWeight: "bold",
      cursor: "pointer",
      fontSize: "0.8rem",
    },
    buttonDisabled: {
      opacity: 0.66,
      cursor: "wait",
      filter: "saturate(0.82)",
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
      <ShareToast toast={shareToast} onClose={() => setShareToast(null)} />

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
            <button
              style={{ ...styles.telegramBtn, ...(shareLoading ? styles.buttonDisabled : {}) }}
              onClick={handleTelegramShare}
              disabled={shareLoading || goToGameLoading}
            >
              {shareLoading ? <TinySpinner size={15} /> : <Send size={15} />}
              {shareLoading ? t("preparingTelegramShare") : t("shareTelegram")}
            </button>
            <button
              style={{ ...styles.goToGameBtn, ...(goToGameLoading ? styles.buttonDisabled : {}) }}
              onClick={handleGoToGame}
              disabled={shareLoading || goToGameLoading}
            >
              {goToGameLoading ? <TinySpinner size={15} /> : <Play size={15} />}
              {goToGameLoading ? t("joining") : t("goToGame")}
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
