import React, { useEffect, useState } from "react";
import { WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import CoinAmount from "./CoinAmount";
import { COIN_BIRR_VALUE, birrToCoins, coinsToBirr, formatCoins, isWholeBirrUnit } from "./utils/money";

function WithdrawPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useUser();
  const { t, ui } = useSettings();

  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  const minWithdraw = 1;
  const maxWithdraw = balance;
  const minWithdrawBirr = coinsToBirr(minWithdraw);
  const maxWithdrawBirr = coinsToBirr(maxWithdraw);
  const telegramId = user?.telegramId || user?.id;

  useEffect(() => {
    if (user?.balance !== undefined) {
      setBalance(Number(user.balance) || 0);
    }
  }, [user]);

  useEffect(() => {
    if (!telegramId) return;

    fetch(`${API_BASE_URL}/telegram-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ telegramId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success) {
          setBalance(Number(data.user?.balance || 0));
        }
      })
      .catch((error) => {
        console.error("Failed to refresh balance:", error);
      });
  }, [API_BASE_URL, telegramId]);

  const handleWithdraw = async (event) => {
    event.preventDefault();
    setResult(null);

    if (!telegramId) {
      setResult({ type: "error", text: t("userNotTelegram") });
      return;
    }

    const parsedBirrAmount = Number(amount);
    if (!isWholeBirrUnit(parsedBirrAmount) || parsedBirrAmount < minWithdrawBirr) {
      setResult({ type: "error", text: t("minWithdrawError", { amount: formatCoins(minWithdraw) }) });
      return;
    }

    const parsedAmount = birrToCoins(parsedBirrAmount);

    if (parsedAmount > maxWithdraw) {
      setResult({ type: "error", text: t("withdrawBalanceError") });
      return;
    }

    try {
      setSubmitting(true);

      const response = await fetch(`${API_BASE_URL}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telegramId,
          amount: parsedAmount,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || t("withdrawFailed"));
      }

      setBalance(Number(data.newBalance || 0));
      await refreshUser?.();
      setAmount("");
      setResult({
        type: "success",
        text: data.message || t("withdrawSuccess"),
      });
    } catch (error) {
      setResult({
        type: "error",
        text: error.message || t("withdrawFailed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const { colors, glassPanel, field: glassField, goldButton } = ui;

  const styles = {
    page: {
      minHeight: "100dvh",
      width: "100vw",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      background:
        "var(--karta-bg)",
      backgroundSize: "auto, 42px 42px, 42px 42px, auto",
      padding: "96px 18px 18px",
      boxSizing: "border-box",
      color: colors.cream,
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
    },
    card: {
      width: "100%",
      maxWidth: "420px",
      ...glassPanel,
      borderRadius: "14px",
      padding: "20px",
      position: "relative",
    },
    title: {
      margin: "0 0 14px 0",
      color: colors.gold,
      fontSize: "1.5rem",
    },
    statCard: {
      ...glassField,
      borderRadius: "10px",
      padding: "12px",
      marginBottom: "14px",
    },
    statLabel: {
      fontSize: "0.82rem",
      opacity: 0.85,
      marginBottom: "4px",
      textTransform: "uppercase",
      letterSpacing: "0.6px",
    },
    statValue: {
      fontSize: "1.4rem",
      fontWeight: 700,
      color: colors.gold,
      margin: 0,
    },
    infoText: {
      margin: "4px 0",
      fontSize: "0.9rem",
      opacity: 0.92,
    },
    label: {
      display: "block",
      marginBottom: "8px",
      fontSize: "0.85rem",
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      opacity: 0.88,
      marginTop: "14px",
    },
    input: {
      width: "100%",
      borderRadius: "10px",
      ...ui.textField,
      color: colors.text,
      padding: "12px",
      boxSizing: "border-box",
      outline: "none",
      fontSize: "0.95rem",
      marginBottom: "12px",
    },
    actions: {
      display: "flex",
      gap: "10px",
      justifyContent: "space-between",
    },
    button: {
      flex: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      border: "none",
      borderRadius: "8px",
      padding: "10px 12px",
      fontWeight: 700,
      cursor: "pointer",
    },
    backButton: {
      ...ui.secondaryButton,
      color: colors.cream,
    },
    submitButton: {
      ...goldButton,
      color: colors.textDark,
    },
    result: {
      marginTop: "14px",
      padding: "10px",
      borderRadius: "8px",
      fontSize: "0.9rem",
      border: "1px solid transparent",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}><WalletCards size={22} style={{ verticalAlign: "-4px", marginRight: "8px" }} />{t("withdraw")}</h2>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>{t("yourBalance")}</div>
          <h3 style={styles.statValue}><CoinAmount value={balance} size={22} /></h3>
          <p style={styles.infoText}>{t("minWithdraw")}: <CoinAmount value={minWithdraw} /></p>
          <p style={styles.infoText}>{t("maxWithdraw")}: <CoinAmount value={maxWithdraw} /></p>
        </div>

        <form onSubmit={handleWithdraw}>
          <label style={styles.label}>{t("withdrawAmount")}</label>
          <input
            type="number"
            min={minWithdrawBirr}
            max={maxWithdrawBirr}
            step={COIN_BIRR_VALUE}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("withdrawPlaceholder")}
            style={styles.input}
            disabled={submitting}
          />

          <div style={styles.actions}>
            <button
              type="button"
              style={{ ...styles.button, ...styles.backButton }}
              onClick={() => navigate("/")}
              disabled={submitting}
            >
              {t("back")}
            </button>
            <button
              type="submit"
              style={{ ...styles.button, ...styles.submitButton }}
              disabled={submitting}
            >
              {submitting ? t("sending") : t("withdraw")}
            </button>
          </div>
        </form>

        {result && (
          <div
            style={{
              ...styles.result,
              background: result.type === "success" ? "rgba(46, 125, 50, 0.3)" : "rgba(198, 40, 40, 0.3)",
              borderColor: result.type === "success" ? "rgba(129, 199, 132, 0.6)" : "rgba(239, 154, 154, 0.6)",
            }}
          >
            {result.text}
          </div>
        )}
      </div>
    </div>
  );
}

export default WithdrawPage;
