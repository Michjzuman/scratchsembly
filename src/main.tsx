import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyColorMode, loadColorMode } from "./appearance";
import "./styles.css";

applyColorMode(loadColorMode());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
