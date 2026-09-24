import React from "react";
import ReactDOM from "react-dom/client";
import Root from "./App";
import "./index.css";
import { registerServiceWorker } from "./lib/push";

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><Root /></React.StrictMode>
);
