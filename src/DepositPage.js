import React, { useEffect, useState } from "react";
import { CheckCircle2, Home, ImagePlus, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "./contexts/SettingsContext";
import { useUser } from "./contexts/UserContext";
import { socket } from "./socket";
import { formatBirrValue } from "./utils/money";

const FALLBACK_PAY_NUMBERS = [{ id: "fallback", phoneNumber: "+251-900-000-000" }];
const PAYMENT_METHOD_IMAGES = ["/payment1-telebirr.png"];

const getPaymentMethodName = (imagePath) => {
  const fileName = String(imagePath || "").split("/").pop() || "";
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const methodSlug = withoutExtension.replace(/^payment\d+-?/i, "") || withoutExtension;
  return methodSlug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
};

const PAYMENT_METHODS = PAYMENT_METHOD_IMAGES.map((image) => ({
  id: image.replace(/^\//, "").replace(/\.[^.]+$/, ""),
  name: getPaymentMethodName(image),
  image,
}));

function DepositPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useUser();
  const { t, ui } = useSettings();
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(PAYMENT_METHODS[0]?.id || "");
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

    if (!selectedPaymentMethod) {
      setResult({ type: "error", text: t("paymentMethodRequired") });
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
      const creditedBirr = Number(data.creditedBirr ?? data.creditedAmount ?? 0);

      setResult({
        type: "success",
        text: creditedBirr > 0
          ? t("depositBirrCredited", {
              amount: formatBirrValue(creditedBirr),
              birr: formatBirrValue(data.paidBirr),
            })
          : data.message || t("receiptComplete", { status: data.receiptStatus }),
      });
      await refreshUser?.();
      setMessageOrLink("");
      setScreenshotFile(null);
      setScreenshotPreviewUrl("");
      setConfirmPaid(false);
      setSelectedPaymentMethod(PAYMENT_METHODS[0]?.id || "");
    } catch (error) {
      setResult({ type: "error", text: error.message || t("backendFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  const { colors, glassPanel, field: glassField, goldButton } = ui;

  const styles = {
    page: {
      height: "100dvh",
      minHeight: 0,
      width: "100%",
      display: "flex",
      justifyContent: "center",
      alignItems: "flex-start",
      background:
        "var(--karta-bg)",
      backgroundSize: "auto, 42px 42px, 42px 42px, auto",
      padding: "96px 18px 18px",
      boxSizing: "border-box",
      overflow: "hidden",
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
      maxHeight: "calc(100dvh - 114px)",
      overflow: "hidden",
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
    paymentMethodCard: {
      ...glassField,
      borderRadius: "12px",
      padding: "12px",
      marginBottom: "14px",
    },
    depositSteps: {
      margin: "0 0 16px",
      padding: "12px 12px 12px 30px",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.07)",
      border: "1px solid rgba(255,255,255,0.16)",
      color: colors.cream,
      fontSize: "0.9rem",
      lineHeight: 1.5,
    },
    paymentMethodTitle: {
      margin: "0 0 10px 0",
      fontSize: "0.85rem",
      fontWeight: 800,
      letterSpacing: "0.8px",
      textTransform: "uppercase",
      color: colors.cream,
      opacity: 0.92,
    },
    paymentMethodList: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
      gap: "10px",
      paddingBottom: "2px",
    },
    paymentMethodButton: {
      minWidth: 0,
      borderRadius: "10px",
      border: "1px solid rgba(255,255,255,0.18)",
      background: "rgba(255,255,255,0.08)",
      color: colors.cream,
      padding: "10px",
      cursor: "pointer",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: "7px",
      fontWeight: 800,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
    },
    paymentMethodButtonActive: {
      borderColor: colors.gold,
      background: "rgba(241,196,15,0.2)",
      color: colors.gold,
      boxShadow: "0 0 0 2px rgba(241,196,15,0.2), inset 0 1px 0 rgba(255,255,255,0.28)",
    },
    paymentLogo: {
      width: "44px",
      height: "44px",
      objectFit: "contain",
      borderRadius: "12px",
      background: "#fff",
      padding: "5px",
      boxSizing: "border-box",
      overflowX: "hidden",
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
      color: colors.gold,
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
      minHeight: "76px",
      resize: "none",
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
      color: colors.gold,
      fontWeight: 700,
      fontSize: "0.92rem",
      cursor: "pointer",
      padding: "11px 12px",
      marginBottom: "10px",
    },
    screenshotHelper: {
      margin: "0 0 8px 0",
      fontSize: "0.82rem",
      opacity: 1,
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
      fontWeight: 600,
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
    successView: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      textAlign: "center",
      gap: "14px",
      padding: "24px 6px 6px",
    },
    successIcon: {
      color: "#7CFF8A",
      filter: "drop-shadow(0 8px 24px rgba(124,255,138,0.32))",
    },
    successTitle: {
      margin: 0,
      color: colors.gold,
      fontSize: "1.25rem",
    },
    successText: {
      margin: 0,
      color: colors.cream,
      lineHeight: 1.45,
      fontSize: "0.95rem",
    },
    homeButton: {
      width: "100%",
      ...goldButton,
      color: colors.textDark,
      border: "none",
      borderRadius: "12px",
      padding: "12px 14px",
      fontWeight: 900,
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
    },
  };

  const selectedPayment = PAYMENT_METHODS.find((method) => method.id === selectedPaymentMethod);
  const isDepositSuccess = result?.type === "success";

  return (
    <div className="money-page deposit-page" style={styles.page}>
      <div className="money-card deposit-card" style={styles.card}>
        <h2 className="deposit-title" style={styles.title}><Wallet size={22} style={{ verticalAlign: "-4px", marginRight: "8px" }} />{t("deposit")}</h2>

        {isDepositSuccess ? (
          <div style={styles.successView}>
            <CheckCircle2 size={86} strokeWidth={2.4} style={styles.successIcon} />
            <h3 style={styles.successTitle}>{t("depositSuccessTitle")}</h3>
            <p style={styles.successText}>{result.text}</p>
            <button type="button" style={styles.homeButton} onClick={() => navigate("/")}>
              <Home size={18} />
              {t("goHome")}
            </button>
          </div>
        ) : (
          <>
            <ol className="deposit-steps" style={styles.depositSteps}>
              <li>{t("depositStepPay")}</li>
              <li>{t("depositStepReceipt")}</li>
              <li>{t("depositStepConfirm")}</li>
            </ol>
            <div className="deposit-payment-card" style={styles.paymentMethodCard}>
              <p className="deposit-method-title" style={styles.paymentMethodTitle}>{t("selectPaymentMethod")}</p>
              <div style={styles.paymentMethodList}>
                {PAYMENT_METHODS.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    className="deposit-method-button"
                    style={{
                      ...styles.paymentMethodButton,
                      ...(selectedPaymentMethod === method.id ? styles.paymentMethodButtonActive : {}),
                    }}
                    onClick={() => setSelectedPaymentMethod(method.id)}
                    aria-pressed={selectedPaymentMethod === method.id}
                    disabled={submitting}
                  >
                    <img
                      src={method.image}
                      alt={method.name}
                      className="deposit-payment-logo"
                      style={styles.paymentLogo}
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    <span>{method.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {selectedPayment && (
              <>
                <p className="deposit-pay-copy" style={styles.text}>{t("payAmountWithFollowingNumber", { method: selectedPayment.name })}</p>
                <div className="deposit-number-list" style={styles.payNumberList}>
                  {payNumbers.map((number) => (
                    <div className="deposit-number" style={styles.payNumberItem} key={number.id || number.phoneNumber}>
                      {number.phoneNumber}
                    </div>
                  ))}
                </div>
              </>
            )}

        <form className="deposit-form" onSubmit={handleSubmit}>
          <fieldset style={styles.formFieldset} disabled={submitting}>
            <label style={styles.label}>{t("receiptInputType")}</label>
            <div className="deposit-mode-row" style={styles.modeRow}>
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
                className="deposit-textarea"
                style={styles.textarea}
                  placeholder={t("receiptPlaceholder")}
                  value={messageOrLink}
                  onChange={(e) => setMessageOrLink(e.target.value)}
                />
              </>
            ) : (
              <>
                <label style={styles.label}>{t("uploadPaymentScreenshot")}</label>
                <div className="deposit-screenshot-card" style={styles.screenshotCard}>
                  <input
                    id="screenshotUpload"
                    style={styles.fileInputHidden}
                    type="file"
                    accept="image/*"
                    onChange={handleScreenshotChange}
                    disabled={submitting}
                  />
                  <label className="deposit-screenshot-picker" htmlFor="screenshotUpload" style={styles.screenshotPickerButton}>
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
                    <div className="deposit-preview" style={styles.screenshotPreviewWrap}>
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

            <label className="deposit-checkbox" style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={confirmPaid}
                onChange={(e) => setConfirmPaid(e.target.checked)}
              />
              {t("confirmPayment")}
            </label>

            <div className="money-actions" style={styles.actions}>
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
            className="deposit-result"
            style={{
              ...styles.result,
              background: result.type === "success" ? "rgba(46, 125, 50, 0.3)" : "rgba(198, 40, 40, 0.3)",
              borderColor: result.type === "success" ? "rgba(129, 199, 132, 0.6)" : "rgba(239, 154, 154, 0.6)",
            }}
          >
            {result.text}
          </div>
        )}
          </>
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

