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
  // The dedicated standalone GAS script URL for Academic File.
  CENTRAL_API_URL: "https://script.google.com/macros/s/AKfycbwNcrCqowXpJ9oYZSRcvWNuHD42TR_fVXljpnaC5I314Dr1Oj77-P-d-frXxdK7cT3u0A/exec",


  // ── Config Sheet ──────────────────────────────────────────
  // MASTER CONFIG SHEET (Common for all apps)
  CONFIG_SHEET_URL:
    "https://docs.google.com/spreadsheets/d/1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk/gviz/tq?tqx=out:json",

  dataFetcher: async (serverUrl, sheetId = "") => {
    const cleanUrl = (serverUrl || "").replace(/\/+$/, "").replace(/\?.*$/, "");
    let sId = sheetId;
    if (!sId && window.ACAD_CONFIG && window.ACAD_CONFIG.SHEET_ID) {
      sId = window.ACAD_CONFIG.SHEET_ID;
    }
    
    let targetUrl = cleanUrl + '?action=getAllData';
    if (sId) {
      targetUrl += '&sheetId=' + encodeURIComponent(sId);
    }
    
    console.log("AppStart fetching Academic File initial data from:", targetUrl);
    
    return {
      allData: fetch(targetUrl)
        .then(r => {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.json();
        })
        .then(data => {
          if (data && (data.success || data.teachers)) {
            try {
              localStorage.setItem('acad_cache_allData', JSON.stringify({ ts: Date.now(), data }));
            } catch (e) {}
          }
          return data;
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
