# VibeMantra Academic File App 🎓

[![Live Demo](https://img.shields.io/badge/Live%20Demo-academic--file--app.pages.dev-6366f1?style=for-the-badge&logo=cloudflare)](https://academic-file-app.pages.dev)
[![GitHub License](https://img.shields.io/badge/License-Institutional-emerald?style=for-the-badge)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Enabled-blue?style=for-the-badge&logo=pwa)](https://academic-file-app.pages.dev)

> **VibeMantra Academic File App** is a state-of-the-art Progressive Web Application (PWA) designed for college faculty members to automate course file compilation, syllabus declaration tracking, CO-PO mapping, sessional attainment reports, and accreditation documentation.

---

## 🌟 Key Features

### 📁 1. Automated Course File Compiler
- **One-Click Package Assembly**: Compiles complete NBA/NAAC accreditation course file packages into structured checklists.
- **Accreditation Ready**: Includes Syllabus Copies, Individual Faculty Workload Timetables, Syllabus Declaration Reports, Executed Teaching Plan Logs, and Reference Lists.

### 📊 2. Real-Time Syllabus & Teaching Plan Execution Tracker
- **Smart Attendance Auto-Sync**: Matches planned syllabus topics with actual lecture execution dates logged from the Smart Attendance system.
- **Gamified Progress Hero**: Interactive progress bar displaying completion percentages (`0%` to `100%`) relative to required lectures for accreditation.
- **Theory & Practical Batch Support**: Automatically detects subject type (Theory vs Practical) and classifies milestone rows by batch (`Batch A`, `Batch B`, etc.).
- **Relative-Time Date Engine**: Displays smart status tags (`Conducted`, `Scheduled`, `Due Today`, `Overdue`, `Late`).

### 📄 3. Built-In `.docx` Report Generator
- **Zero-Dependency OOXML Engine**: Generates print-ready Microsoft Word (`.docx`) Teaching Plan and Syllabus Completion reports directly in the browser.
- **Institutional Branding**: Embeds college management headers, academic year details, subject metadata, and faculty/in-charge signature blocks.

### 📅 4. Academic Calendars & Timetable Vault
- **Google Drive Integration**: Fetches and embeds institutional academic calendars, timetables, and date management files directly inside the workspace.
- **File Update Detection**: Visual blinking **`NEW UPDATE`** notifications whenever new files or updated timetable sheets are published to Drive.
- **In-App Modal Viewer**: Preview PDFs, spreadsheets, and documents directly without leaving the application.

### 🔐 5. Glassmorphic Session Lock
- **Lecture / Break Mode**: One-click screen lock (`#screen-lock`) that protects active faculty sessions with PIN code re-authentication while maintaining background data sync.

### 🚀 6. AppStart 2.0 Engine & Licensing
- **Multi-Phase Startup Sequence**: Verifies 10-digit institutional license keys, detects device environment, checks version updates via `version.json`, and loads dynamic branding animation assets.
- **Multi-Tier Config Sheet Integration**: Synchronizes faculty lists, workload subjects, and college metadata dynamically from Google Apps Script.

### 📱 7. Offline PWA & Push Notifications
- **Service Worker Architecture**: Cache-first app shell loading with offline data caching and automatic reconnect sync triggers.
- **Web Push Notifications**: Firebase Cloud Messaging (FCM) integration for real-time notification alerts with custom sound.

---

## 🛠️ Technology Stack

- **Frontend**: HTML5, Vanilla JavaScript (ES6+ Module Architecture), Modern Vanilla CSS
- **Styling & Aesthetics**: Frosted Glassmorphic Design Token Architecture, Neumorphic Grays, Specular Rim Lighting, Ambient Gradients
- **Backend Sync**: Google Apps Script (GAS) Central REST Endpoint, Google Sheets API, Google Drive API
- **Deployment & Hosting**: Cloudflare Pages (Primary CDN), GitHub Pages (Failover)
- **Icons**: Phosphor Icons Vector Library

---

## 🚀 Live Access

| Environment | Web Address |
|-------------|-------------|
| ⚡ **Primary CDN (Cloudflare Pages)** | [https://academic-file-app.pages.dev](https://academic-file-app.pages.dev) |
| 🐙 **Failover (GitHub Pages)** | [https://pranavparekhcontent.github.io/academic-file-app/](https://pranavparekhcontent.github.io/academic-file-app/) |

---

## 💻 Getting Started (Local Development)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/pranavparekhcontent/academic-file-app.git
   cd academic-file-app
   ```

2. **Serve locally**:
   Use any static web server (e.g. VS Code Live Server or Python HTTP server):
   ```bash
   python -m http.server 8000
   ```
   Open `http://localhost:8000` in your browser.

---

## 📄 License & Credits

- **Developer**: Pranav Parekh (VibeMantra Studio)
- **Copyright**: © 2026 VibeMantra Academic Systems. All Rights Reserved.
