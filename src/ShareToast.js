import React, { useEffect } from "react";
import { CheckCircle2, Info, XCircle } from "lucide-react";
import { useSettings } from "./contexts/SettingsContext";

function ShareToast({ toast, onClose }) {
  const { ui } = useSettings();

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => onClose?.(), 3600);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  if (!toast) return null;

  const isError = toast.type === "error";
  const isSuccess = toast.type === "success";
  const Icon = isError ? XCircle : isSuccess ? CheckCircle2 : Info;
  const accent = isError ? "#ffb4ab" : isSuccess ? "#8df5b5" : ui.colors.gold;

  const styles = {
    wrap: {
      position: "fixed",
      top: "14px",
      left: "14px",
      right: "14px",
      zIndex: 1000,
      display: "flex",
      justifyContent: "center",
      pointerEvents: "none",
    },
    panel: {
      width: "100%",
      maxWidth: "390px",
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      ...ui.glassPanel,
      border: `1px solid color-mix(in srgb, ${accent} 54%, transparent)`,
      borderRadius: "12px",
      padding: "11px 13px",
      color: ui.colors.cream,
      boxSizing: "border-box",
      pointerEvents: "auto",
    },
    icon: {
      color: accent,
      flexShrink: 0,
      marginTop: "1px",
    },
    title: {
      margin: 0,
      color: accent,
      fontSize: "0.82rem",
      fontWeight: 900,
      lineHeight: 1.15,
    },
    text: {
      margin: "3px 0 0",
      fontSize: "0.76rem",
      lineHeight: 1.28,
      color: `color-mix(in srgb, ${ui.colors.cream} 78%, transparent)`,
    },
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.panel} role="status" aria-live="polite" onClick={(event) => event.stopPropagation()}>
        <Icon size={18} style={styles.icon} />
        <div>
          <p style={styles.title}>{toast.title}</p>
          {toast.text ? <p style={styles.text}>{toast.text}</p> : null}
        </div>
      </div>
    </div>
  );
}

export default ShareToast;
