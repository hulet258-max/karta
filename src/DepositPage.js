import React, { useEffect, useState } from "react";
import { ImagePlus, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import { socket } from "./socket";
import CoinAmount from "./CoinAmount";
import { MIN_DEPOSIT_BIRR, MIN_DEPOSIT_COINS, coinsToBirr, formatBirrValue } from "./utils/money";

const FALLBACK_PAY_NUMBERS = [{ id: "fallback", phoneNumber: "+251-900-000-000" }];

function DepositPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useUser();
  const { t, ui } = useSettings();
  const [inputMode, setInputMode] = useState("text");
  const [messageOrLink, setMessageOrLink] = useState("");
  const [screenshotFile, setScreenshotFile] = useState(null);
  const [screenshotPreviewUrl, setScreenshotPreviewUrl] = useState("");
  const [confirmPaid, setConfirmPaid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";
  const [payNumbers, setPayNumbers] = useState(FALLBACK_PAY_NUMBERS);

  useEffect(() => {
    let isMounted = true;

    const fetchDepositNumbers = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/settings/deposit-numbers`);
        const data = await response.json();
        if (!response.ok || !data.success) return;

        const activeNumbers = (data.numbers || []).filter((number) => number.phoneNumber);
        if (isMounted) {
          setPayNumbers(activeNumbers.length ? activeNumbers : FALLBACK_PAY_NUMBERS);
        }
      } catch (error) {
        console.error("Error fetching deposit numbers:", error);
      }
    };

    fetchDepositNumbers();

    return () => {
      isMounted = false;
    };
  }, [API_BASE_URL]);

  useEffect(() => {
    if (!screenshotFile) {
      setScreenshotPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(screenshotFile);
    setScreenshotPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [screenshotFile]);

  const handleScreenshotChange = (event) => {
    const file = event.target.files?.[0] || null;
    setScreenshotFile(file);
  };

  const submitReceiptCheck = async (receiptValue) => {
    const response = await fetch(`${API_BASE_URL}/check-receipt-demo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        receiptTextOrLink: String(receiptValue).trim(),
        confirmedByUser: confirmPaid,
        socketId: socket.id,
        userId: user?.telegramId || user?.id,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || t("receiptCheckFailed"));
    }

    return data;
  };

  const extractFromScreenshot = async () => {
    const formData = new FormData();
    formData.append("screenshot", screenshotFile);

    const response = await fetch(`${API_BASE_URL}/ocr-screenshot`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || t("screenshotReadFailed"));
    }

    return data.transactionId;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!confirmPaid) {
      setResult({ type: "error", text: t("confirmPaymentError") });
      return;
    }

    if (inputMode === "text" && !messageOrLink.trim()) {
      setResult({ type: "error", text: t("pasteReceiptError") });
      return;
    }

    if (inputMode === "screenshot" && !screenshotFile) {
      setResult({ type: "error", text: t("screenshotError") });
      return;
    }

    try {
      setSubmitting(true);
      setResult(null);

      let receiptInput = messageOrLink.trim();

      if (inputMode === "screenshot") {
        receiptInput = await extractFromScreenshot();
        setMessageOrLink(receiptInput);
      }

      const data = await submitReceiptCheck(receiptInput);
      const roundedDownBirr = Number(data.roundedDownBirr || 0);

      setResult({
        type: "success",
        text: data.creditedCoins !== undefined
          ? t(roundedDownBirr > 0 ? "depositCoinsCreditedRounded" : "depositCoinsCredited", {
              amount: formatBirrValue(data.creditedBirrValue || coinsToBirr(data.creditedCoins)),
              birr: formatBirrValue(data.paidBirr),
              rounded: formatBirrValue(roundedDownBirr),
            })
          : data.message || t("receiptComplete", { status: data.receiptStatus }),
      });
      await refreshUser?.();
      setMessageOrLink("");
      setScreenshotFile(null);
      setScreenshotPreviewUrl("");
      setConfirmPaid(false);
    } catch (error) {
      setResult({ type: "error", text: error.message || t("backendFailed") });
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
      margin: "0 0 10px 0",
      color: colors.gold,
      fontSize: "1.5rem",
    },
    text: {
      margin: "0 0 10px 0",
      fontSize: "0.95rem",
      opacity: 0.92,
      color: colors.cream,
      lineHeight: 1.5,
    },
    payNumberList: {
      display: "flex",
      flexDirection: "column",
      gap: "8px",
      marginBottom: "16px",
    },
    payNumberItem: {
      ...ui.field,
      borderRadius: "8px",
      padding: "9px 11px",
      color: colors.gold,
      fontWeight: 800,
      letterSpacing: "0.2px",
      wordBreak: "break-word",
    },
    label: {
      display: "block",
      marginBottom: "8px",
      fontSize: "0.85rem",
      textTransform: "uppercase",
      letterSpacing: "0.8px",
      opacity: 0.9,
      color: colors.cream,
    },
    modeRow: {
      display: "flex",
      gap: "8px",
      marginBottom: "12px",
    },
    modeButton: {
      flex: 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      ...glassField,
      borderRadius: "8px",
      color: colors.cream,
      padding: "9px 10px",
      fontWeight: 600,
      cursor: "pointer",
    },
    modeButtonActive: {
      borderColor: colors.gold,
      background: "rgba(255,246,94,0.18)",
    },
    textarea: {
      width: "100%",
      minHeight: "110px",
      resize: "vertical",
      borderRadius: "10px",
      ...ui.textField,
      color: colors.text,
      padding: "12px",
      boxSizing: "border-box",
      outline: "none",
      fontSize: "0.95rem",
      marginBottom: "12px",
    },
    screenshotCard: {
      marginBottom: "12px",
      border: "1px dashed rgba(255, 255, 255, 0.28)",
      borderRadius: "12px",
      padding: "14px",
      background: "rgba(255,255,255,0.06)",
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2)",
    },
    fileInputHidden: {
      position: "absolute",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clip: "rect(0, 0, 0, 0)",
      whiteSpace: "nowrap",
      border: 0,
      padding: 0,
      margin: "-1px",
    },
    screenshotPickerButton: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      width: "100%",
      ...ui.secondaryButton,
      borderRadius: "10px",
      color: colors.cream,
      fontWeight: 700,
      fontSize: "0.92rem",
      cursor: "pointer",
      padding: "11px 12px",
      marginBottom: "10px",
    },
    screenshotHelper: {
      margin: "0 0 8px 0",
      fontSize: "0.82rem",
      opacity: 0.85,
      textAlign: "center",
      color: colors.cream,
    },
    fileName: {
      marginBottom: "10px",
      fontSize: "0.82rem",
      opacity: 0.9,
      textAlign: "center",
      wordBreak: "break-word",
    },
    screenshotPreviewWrap: {
      width: "100%",
      borderRadius: "10px",
      overflow: "hidden",
      border: "1px solid rgba(255,255,255,0.25)",
      background: "rgba(0,0,0,0.4)",
    },
    screenshotPreviewImage: {
      width: "100%",
      maxHeight: "260px",
      objectFit: "contain",
      display: "block",
      background: "rgba(0,0,0,0.6)",
    },
    checkboxRow: {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "14px",
      fontSize: "0.9rem",
      color: colors.cream,
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
    formFieldset: {
      border: "none",
      padding: 0,
      margin: 0,
      minWidth: 0,
    },
    loadingOverlay: {
      position: "absolute",
      inset: 0,
      borderRadius: "14px",
      background: "rgba(0, 0, 0, 0.7)",
      backdropFilter: "blur(2px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 10,
      pointerEvents: "all",
    },
    loadingContent: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "10px",
    },
    loadingSpinner: {
      width: "30px",
      height: "30px",
      borderRadius: "50%",
      border: "3px solid rgba(255,246,94,0.5)",
      borderTopColor: colors.gold,
      animation: "spin 0.9s linear infinite",
    },
    loadingText: {
      fontSize: "0.9rem",
      fontWeight: 700,
      color: colors.cream,
      letterSpacing: "0.3px",
    },
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}><Wallet size={22} style={{ verticalAlign: "-4px", marginRight: "8px" }} />{t("deposit")}</h2>
        <p style={styles.text}>
          {t("depositCoinRule", {
            birr: formatBirrValue(MIN_DEPOSIT_BIRR),
          })}{" "}
          <CoinAmount value={MIN_DEPOSIT_COINS} size={17} />
        </p>
        <p style={styles.text}>{payNumbers.length > 1 ? t("payToNumbers") : t("payToNumber")}</p>
        <div style={styles.payNumberList}>
          {payNumbers.map((number) => (
            <div style={styles.payNumberItem} key={number.id || number.phoneNumber}>
              {number.phoneNumber}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <fieldset style={styles.formFieldset} disabled={submitting}>
            <label style={styles.label}>{t("receiptInputType")}</label>
            <div style={styles.modeRow}>
              <button
                type="button"
                style={{
                  ...styles.modeButton,
                  ...(inputMode === "text" ? styles.modeButtonActive : {}),
                }}
                onClick={() => setInputMode("text")}
                disabled={submitting}
              >
                {t("pasteTextLink")}
              </button>
              <button
                type="button"
                style={{
                  ...styles.modeButton,
                  ...(inputMode === "screenshot" ? styles.modeButtonActive : {}),
                }}
                onClick={() => setInputMode("screenshot")}
                disabled={submitting}
              >
                {t("uploadScreenshot")}
              </button>
            </div>

            {inputMode === "text" ? (
              <>
                <label style={styles.label}>{t("pasteReceiptHere")}</label>
                <textarea
                  style={styles.textarea}
                  placeholder={t("receiptPlaceholder")}
                  value={messageOrLink}
                  onChange={(e) => setMessageOrLink(e.target.value)}
                />
              </>
            ) : (
              <>
                <label style={styles.label}>{t("uploadPaymentScreenshot")}</label>
                <div style={styles.screenshotCard}>
                  <input
                    id="screenshotUpload"
                    style={styles.fileInputHidden}
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotChange}
                    disabled={submitting}
                  />
                  <label htmlFor="screenshotUpload" style={styles.screenshotPickerButton}>
                    <ImagePlus size={16} />
                    {screenshotFile ? t("chooseDifferentScreenshot") : t("chooseScreenshotImage")}
                  </label>
                  <p style={styles.screenshotHelper}>{t("screenshotHelper")}</p>
                  {screenshotFile && (
                    <div style={styles.fileName}>
                      {t("selected")}: {screenshotFile.name}
                    </div>
                  )}
                  {screenshotPreviewUrl && (
                    <div style={styles.screenshotPreviewWrap}>
                      <img
                        src={screenshotPreviewUrl}
                        alt={t("screenshotPreviewAlt")}
                        style={styles.screenshotPreviewImage}
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={confirmPaid}
                onChange={(e) => setConfirmPaid(e.target.checked)}
              />
              {t("confirmPayment")}
            </label>

            <div style={styles.actions}>
              <button
                type="button"
                style={{ ...styles.button, ...styles.backButton }}
                onClick={() => navigate("/")}
              >
                {t("back")}
              </button>
              <button
                type="submit"
                style={{ ...styles.button, ...styles.submitButton }}
                disabled={submitting}
              >
                {submitting ? t("verifying") : t("checkReceipt")}
              </button>
            </div>
          </fieldset>
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
        {submitting && (
          <div style={styles.loadingOverlay}>
            <div style={styles.loadingContent}>
              <div style={styles.loadingSpinner} />
              <div style={styles.loadingText}>{t("verifyingPayment")}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default DepositPage;

