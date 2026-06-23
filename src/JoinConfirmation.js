import React, { useState } from "react";
import { Lock, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { socket } from "./socket";
import CoinAmount from "./CoinAmount";
import { formatCoins } from "./utils/money";

function JoinConfirmation({ room, user, onClose, isPrivateShare = false }) {
  const navigate = useNavigate();
  const { t, ui } = useSettings();
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

  if (!room || !user) return null;

  const canJoin = (user.balance || 0) >= room.entryFee;
  const isPrivateGame = isPrivateShare || room.visibility === "private";

  const handleConfirm = async () => {
    if (!canJoin) return;

    setLoading(true);
    setErrorMsg("");

    const payload = {
      roomId: room.id,
      userId: user.telegramId,
      socketId: socket.id,
    };

    try {
      const res = await fetch(`${API_BASE_URL}/join-room`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        throw new Error(t("invalidServerResponse"));
      }

      if (data?.mustDeleteOwnRoom) {
        throw new Error(t("deleteOwnRoomFirst"));
      }

      if (data?.alreadyInRoom && data.room?.id) {
        throw new Error(t("leaveCurrentRoomFirst"));
      }

      if (!res.ok) {
        throw new Error(data?.error || t("actionFailed"));
      }

      if (data.success) {
        navigate(`/game/${room.id}`, {
          state: {
            room: data.room,
            players: data.players,
            redisData: data.redisData,
          },
        });
      } else {
        throw new Error(data.error || t("failedToJoinRoom"));
      }
    } catch (err) {
      setErrorMsg(err.message || t("actionFailed"));
    }

    setLoading(false);
  };

  const handleDeposit = () => {
    navigate("/deposit");
  };

  const { colors, glassPanel, goldButton } = ui;

  const styles = {
    overlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.74)",
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
      borderRadius: "12px",
      padding: "20px",
      width: "100%",
      maxWidth: "320px",
      color: colors.cream,
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      boxSizing: "border-box",
    },
    header: {
      textAlign: "center",
      marginBottom: "15px",
    },
    title: {
      margin: 0,
      fontSize: "1.2rem",
      color: colors.gold,
      borderBottom: "2px solid rgba(255,246,94,0.6)",
      display: "inline-block",
      paddingBottom: "4px",
    },
    detailsBox: {
      background: "linear-gradient(180deg, rgba(255,255,255,0.09), rgba(255,255,255,0.045))",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "8px",
      padding: "15px",
      marginBottom: "20px",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 8px 18px rgba(0,0,0,0.16)",
    },
    row: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      margin: "0 0 10px 0",
      fontSize: "0.9rem",
    },
    value: {
      fontWeight: "bold",
      color: colors.gold,
    },
    note: {
      margin: "10px 0 0 0",
      fontSize: "0.75rem",
      color: `color-mix(in srgb, ${colors.cream} 60%, transparent)`,
      textAlign: "center",
      lineHeight: "1.4",
    },
    privateWarning: {
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
      margin: "0 0 12px",
      padding: "10px",
      borderRadius: "8px",
      background: "rgba(255,246,94,0.1)",
      border: "1px solid rgba(255,246,94,0.22)",
      color: colors.cream,
      fontSize: "0.75rem",
      lineHeight: 1.35,
    },
    errorText: {
      color: "#e74c3c",
      fontWeight: "bold",
      textAlign: "center",
      marginTop: "10px",
      fontSize: "0.85rem",
    },
    footer: {
      display: "flex",
      gap: "10px",
      justifyContent: "space-between",
    },
    cancelBtn: {
      flex: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      ...ui.secondaryButton,
      borderRadius: "8px",
      padding: "10px",
      color: colors.cream,
      fontSize: "0.85rem",
      cursor: "pointer",
      transition: "background 0.2s",
    },
    confirmBtn: {
      flex: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      ...goldButton,
      background: goldButton.background,
      border: goldButton.border,
      borderRadius: "8px",
      padding: "10px",
      color: colors.textDark,
      fontWeight: "bold",
      fontSize: "0.85rem",
      cursor: "pointer",
      boxShadow: goldButton.boxShadow,
      transition: "transform 0.1s",
    },
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.popupContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>
            {isPrivateGame ? t("privateGameJoinTitle") : t("confirmJoinTitle", { room: room.name })}
          </h3>
        </div>

        <div style={styles.detailsBox}>
          {isPrivateGame && (
            <div style={styles.privateWarning}>
              <Lock size={16} style={{ color: colors.gold, flexShrink: 0, marginTop: "1px" }} />
              <span>{t("privateGameJoinWarning")}</span>
            </div>
          )}

          {isPrivateGame && (
            <p style={styles.row}>
              <span>{t("roomName")}:</span>
              <span style={styles.value}>{room.name}</span>
            </p>
          )}

          <p style={styles.row}>
            <span>{t("entryFeeLabel")}:</span>
            <span style={styles.value}><CoinAmount value={room.entryFee} /></span>
          </p>
          <p style={styles.row}>
            <span>{t("yourBalanceLabel")}:</span>
            <span style={styles.value}><CoinAmount value={user.balance} /></span>
          </p>

          <p style={styles.note}>
            {t("joinNote", { amount: formatCoins(room.entryFee) })}
          </p>

          {!canJoin && (
            <div style={styles.errorText}>{t("insufficientBalance")}</div>
          )}

          {errorMsg && (
            <div style={styles.errorText}>{errorMsg}</div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            style={styles.cancelBtn}
            onClick={onClose}
            disabled={loading}
          >
            <XCircle size={15} />
            {t("cancel")}
          </button>

          <button
            style={styles.confirmBtn}
            onClick={canJoin ? handleConfirm : handleDeposit}
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
            {loading ? t("joining") : canJoin ? t("confirmAndJoin") : t("depositToJoin")}
          </button>
        </div>
      </div>
    </div>
  );
}

export default JoinConfirmation;
