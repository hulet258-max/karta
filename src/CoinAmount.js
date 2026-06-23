import React from "react";
import { formatCoins } from "./utils/money";

function CoinAmount({ value, size = 16, style = {}, textStyle = {} }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "5px",
        whiteSpace: "nowrap",
        lineHeight: 1,
        ...style,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          minWidth: size + 8,
          height: size,
          padding: "0 4px",
          borderRadius: "999px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(180deg, #f1c40f, #d4af37)",
          color: "#061208",
          fontSize: Math.max(9, Math.round(size * 0.56)),
          fontWeight: 900,
          lineHeight: 1,
          flexShrink: 0,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 6px rgba(0,0,0,0.22)",
        }}
      >
        Br
      </span>
      <span style={textStyle}>{formatCoins(value)}</span>
    </span>
  );
}

export default CoinAmount;
