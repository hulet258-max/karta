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
      <img
        src="/coin.png"
        alt=""
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          flexShrink: 0,
        }}
      />
      <span style={textStyle}>{formatCoins(value)}</span>
    </span>
  );
}

export default CoinAmount;
