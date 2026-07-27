import React, { useEffect, useRef, useState } from "react";
import { WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import CoinAmount from "./CoinAmount";
import { formatBirr, isWholeBirrUnit } from "./utils/money";

const MIN_WITHDRAWAL_GAMES = 6;
const MIN_WITHDRAWAL_PLAY_DAYS = 3;
const MIN_WITHDRAW_BIRR = 10;
const MIN_REMAINING_BALANCE_BIRR = 20;

function WithdrawPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useUser();
  const { t, ui } = useSettings();

  const [balance, setBalance] = useState(0);
  const [withdrawableBalance, setWithdrawableBalance] = useState(0);
  const [lockedGiftBalance, setLockedGiftBalance] = useState(0);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [withdrawalsEnabled, setWithdrawalsEnabled] = useState(true);
  const requestIdRef = useRef("");

  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  const minWithdraw = MIN_WITHDRAW_BIRR;
  const maxWithdraw = Math.max(
    0,
    Math.min(withdrawableBalance, balance - MIN_REMAINING_BALANCE_BIRR)
  );
  const minWithdrawBirr = minWithdraw;
  const telegramId = user?.telegramId || user?.id;

  const isValidPhoneNumber = (value) => {
    const compact = String(value || "").trim().replace(/[\s-]/g, "");
    return /^(?:\+251|251|0)[79]\d{8}$/.test(compact);
  };

  useEffect(() => {
    if (user?.balance !== undefined) {
      setBalance(Number(user.balance) || 0);
      setWithdrawableBalance(Number(user.withdrawableBalance ?? user.balance) || 0);
      setLockedGiftBalance(Number(user.nonWithdrawableBalance || 0));
      setPhone(user.phone || "");
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
          setWithdrawableBalance(Number(data.user?.withdrawableBalance ?? data.user?.balance) || 0);
          setLockedGiftBalance(Number(data.user?.nonWithdrawableBalance || 0));
          setPhone(data.user?.phone || "");
        }
      })
      .catch((error) => {
        console.error("Failed to refresh balance:", error);
      });
  }, [API_BASE_URL, telegramId]);

  useEffect(() => {
    let mounted = true;
    fetch(`${API_BASE_URL}/settings/withdrawals`)
      .then((response) => response.json())
      .then((data) => {
        if (mounted && data?.success) setWithdrawalsEnabled(data.enabled !== false);
      })
      .catch((error) => console.error("Failed to load withdrawal availability:", error));
    return () => { mounted = false; };
  }, [API_BASE_URL]);

  const handleWithdraw = async (event) => {
    event.preventDefault();
    setResult(null);

    if (!withdrawalsEnabled) {
      setResult({ type: "error", text: t("withdrawUnavailable") });
      return;
    }

    if (!telegramId) {
      setResult({ type: "error", text: t("userNotTelegram") });
      return;
    }

    const phoneNumber = phone.trim();
    if (!isValidPhoneNumber(phoneNumber)) {
      setResult({ type: "error", text: t("withdrawPhoneError") });
      return;
    }

    const parsedBirrAmount = Number(amount);
    if (!isWholeBirrUnit(parsedBirrAmount) || parsedBirrAmount < minWithdrawBirr) {
      setResult({ type: "error", text: t("minWithdrawError", { amount: formatBirr(minWithdraw) }) });
      return;
    }

    const parsedAmount = parsedBirrAmount;

    if (balance - parsedAmount < MIN_REMAINING_BALANCE_BIRR) {
      setResult({
        type: "error",
        text: t("withdrawReserveError", { amount: formatBirr(MIN_REMAINING_BALANCE_BIRR) }),
      });
      return;
    }

    if (parsedAmount > withdrawableBalance) {
      setResult({ type: "error", text: t("withdrawBalanceError") });
      return;
    }

    try {
      setSubmitting(true);
      if (!requestIdRef.current) {
        requestIdRef.current = window.crypto?.randomUUID?.()
          || `withdraw-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      const response = await fetch(`${API_BASE_URL}/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telegramId,
          amount: parsedAmount,
          phone: phoneNumber,
          requestId: requestIdRef.current,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        if (data.code === "WITHDRAWALS_DISABLED") {
          setWithdrawalsEnabled(false);
          throw new Error(t("withdrawUnavailable"));
        }
        if (data.code === "WITHDRAWAL_ACTIVITY_REQUIRED") {
          throw new Error(t("withdrawActivityRequiredError", {
            remaining: data.remainingGames,
            required: data.gamesRequired || MIN_WITHDRAWAL_GAMES,
            daysRemaining: data.remainingPlayDays,
            daysRequired: data.playDaysRequired || MIN_WITHDRAWAL_PLAY_DAYS,
          }));
        }
        if (data.code === "WITHDRAWAL_MIN_BALANCE_REQUIRED") {
          throw new Error(t("withdrawReserveError", {
            amount: formatBirr(data.minimumRemainingBalance || MIN_REMAINING_BALANCE_BIRR),
          }));
        }
        if (data.code === "WITHDRAWAL_DAILY_LIMIT_EXCEEDED") {
          throw new Error(t("withdrawDailyLimitError"));
        }
        throw new Error(data.error || t("withdrawFailed"));
      }

      setBalance(Number(data.newBalance || 0));
      setWithdrawableBalance(Number(data.newWithdrawableBalance ?? data.limits?.maxWithdraw ?? 0));
      setLockedGiftBalance(Number(data.nonWithdrawableBalance || 0));
      setPhone(data.phone || phoneNumber);
      await refreshUser?.();
      setAmount("");
      requestIdRef.current = "";
      setResult({
        type: "success",
        text: t("withdrawRequestSentInfo"),
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
      width: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      background:
        "var(--karta-bg)",
      backgroundSize: "auto, 42px 42px, 42px 42px, auto",
      padding: "96px 18px 18px",
      boxSizing: "border-box",
      overflowX: "hidden",
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
      boxSizing: "border-box",
      minWidth: 0,
      overflowWrap: "anywhere",
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
      flexWrap: "wrap",
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
    phoneWarning: {
      margin: "-3px 0 14px",
      padding: "10px 11px",
      borderRadius: "9px",
      border: "1px solid rgba(255, 193, 7, 0.5)",
      background: "rgba(255, 152, 0, 0.13)",
      color: colors.cream,
      fontSize: "0.82rem",
      lineHeight: 1.45,
    },
  };

  return (
    <div className="money-page" style={styles.page}>
      <div className="money-card" style={styles.card}>
        <h2 style={styles.title}><WalletCards size={22} style={{ verticalAlign: "-4px", marginRight: "8px" }} />{t("withdraw")}</h2>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>{t("yourBalance")}</div>
          <h3 style={styles.statValue}><CoinAmount value={balance} size={22} /></h3>
          <p style={styles.infoText}>{t("minWithdraw")}: <CoinAmount value={minWithdraw} /></p>
          <p style={styles.infoText}>{t("maxWithdraw")}: <CoinAmount value={maxWithdraw} /></p>
          <p style={styles.infoText}>{t("withdrawReserveRule", { amount: formatBirr(MIN_REMAINING_BALANCE_BIRR) })}</p>
          {lockedGiftBalance > 0 && (
            <p style={styles.infoText}>{t("lockedGiftBalance")}: <CoinAmount value={lockedGiftBalance} /></p>
          )}
        </div>

        <form onSubmit={handleWithdraw} noValidate>
          <label style={styles.label}>{t("withdrawAmount")}</label>
          <input
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder={t("withdrawPlaceholder")}
            style={styles.input}
          />

          <label style={styles.label}>{t("withdrawPhone")}</label>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t("withdrawPhonePlaceholder")}
            style={styles.input}
            autoComplete="tel"
            inputMode="tel"
            required
          />
          <div style={styles.phoneWarning} role="note">
            {t("withdrawPhoneWarning")}
          </div>

          <div className="money-actions" style={styles.actions}>
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
