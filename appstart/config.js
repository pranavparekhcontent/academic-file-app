// ============================================================
//  APPSTART CONFIG — Edit this file for each new app.
//  All other appstart/ files remain untouched between projects.
// ============================================================

const APP_CONFIG = {

  // ── App Identity ──────────────────────────────────────────
  APP_NAME:    "VibeMantra Academic File App",
  APP_VERSION: "1.0.0",   // Fallback only. Auto-synced from version.json at runtime.

  // ── Layout ───────────────────────────────────────────────
  LAYOUT: "desktop-first",

  // ── Theme (Frosted Glass & Neumorphic Gray) ───────────────
  THEME: {
    primary:   "#6366f1",   // Indigo
    secondary: "#8b5cf6",   // Purple
    danger:    "#ef4444",   // Rose/Red
    bg:        "#dfe3ea",   // Clean light gray desk background
    surface:   "rgba(255, 255, 255, 0.42)",
    border:    "rgba(255, 255, 255, 0.65)",
    text:      "#1f2937",
    muted:     "#4b5563",
  },

  // ── License ───────────────────────────────────────────────
  LICENSE_STORAGE_KEY: "academic_file_license",

  // ── Central API Configuration ──────────────────────────────
  // The central GAS script URL for Academic File.
  // Note: Users can deploy Academic_API.gs and configure its URL here or dynamically.
  CENTRAL_API_URL: "https://script.google.com/macros/s/AKfycbwdEMH_36ryLox45JmzdI6v8z7J0AEgk5gtFHwmy87V5aJhlpxAovaz6UNHdrOp8pH-/exec",


  // ── Config Sheet ──────────────────────────────────────────
  // MASTER CONFIG SHEET (Common for all apps)
  CONFIG_SHEET_URL:
    "https://docs.google.com/spreadsheets/d/1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk/gviz/tq?tqx=out:json",

  dataFetcher: async (serverUrl, sheetId = "") => {
    // Sanitize: Remove trailing slashes and any query parameters
    const cleanUrl = serverUrl.replace(/\/+$/, "").replace(/\?.*$/, "");
    
    let targetUrl = cleanUrl + '?action=getAllData';
    if (sheetId) {
      targetUrl += '&sheetId=' + encodeURIComponent(sheetId);
    }
    
    console.log("AppStart fetching Academic File initial data from:", targetUrl);
    
    return {
      allData: fetch(targetUrl)
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .catch(err => {
          console.error("AppStart Data Fetcher Error:", err);
          return { success: false, error: err.message };
        }),
    };
  },

  /** CALLBACKS */
  onComplete: (context) => {
    console.log("AppStart completed for Academic File PWA:", context.collegeName);
  }
};
