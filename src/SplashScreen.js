import React from "react";
import "./SplashScreen.css";
import logo from "./logo.png";

function SplashScreen() {
  return (
    <div className="karta-splash" role="status" aria-live="polite" aria-label="Loading Carta">
      <div className="karta-splash__center">
        <img src={logo} alt="Carta" className="karta-splash__logo" />
        <div className="karta-splash__bar" aria-hidden="true">
          <div className="karta-splash__bar-fill" />
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
