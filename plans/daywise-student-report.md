# Plan: Daywise Student Attendance Report

## Problem Statement

Colleges need a "Daywise Student Report" — a single-day attendance snapshot showing **Roll No | Student Name | Lectures Conducted that Day | Present/Absent per Lecture | Totals** — for Academic Incharge use.

---

## Requirements (Confirmed with User)

| Item | Detail |
|------|--------|
| **Report Type** | Single date selection (one specific day) |
| **Table Columns** | Roll No · Student Name · Each lecture column (e.g. 9:00–10:00 SubjectX, 10:00–11:00 SubjectY) · Present Count · Absent Count |
| **Class Selector** | Same pill-button cards as Student-Wise Report (FY/ SY/ TY/ Final Year, etc.) |
| **Placement** | 3rd report card in Academic Reports page (`view-incharge-reports`) |
| **Export** | `.docx` only — with college letterhead, management name, academic year, incharge/principal signature blocks |
| **Access** | Academic Incharge only (already PIN-protected section) |

---

## Architecture

```mermaid
flowchart TD
    subgraph FRONTEND["PWA Frontend (app.js)"]
        R3["Daywise Report Card\nclick → generateReportType('daywise')"]
        CS["Class selector pills\nstate.activeDaywiseYear"]
        DP["Date picker input\n# reports-daywise-date"]
        
        R3 --> DTR["generateReportType('daywise')\nselects daywise branch"]
        DTR --> DYR["renderDaywiseReport()\ngathers data & builds UI"]
        DYR --> DYC["Fetches: students + attendance\nfor selected class + date"]
        DYC --> DYT["Renders HTML table in\n# reports-output-area"]
        DYT --> DYB["Download .docx button\n→ downloadDaywiseReportDoc()"]
        
        DYB --> BDR["buildDaywiseReportDocx(model)\nOOXML document builder"]
    end

    subgraph BACKEND["Google Apps Script (Central_API.gs)"]
        GA["getAttendance(code, year, date,\n  outputSheetId, sheetId)"]
        DAV["→ _getAttendanceUncached()"]
        DAV --> DSS["Scans attendance output sheet\nfor date match on each tab"]
        DSS --> DR["Returns: { success, lectures: [{time,\n  code, name, faculty, batch}] }"]
    end

    subgraph API_CLIENT["js/api.js"]
        API["API.getAttendance(code, year, date, outputSheetId)"]
    end

    FRONTEND -->|"API.getAttendance()"| API_CLIENT
    API_CLIENT -->|"_get()"| BACKEND
    BACKEND -->|"attendance data"| FRONTEND

    style R3 fill:#c7d2fe,color:#312e81
    style GA fill:#d1fae5,color:#065f46
    style BDR fill:#fef3c7,color:#92400e
```

---

## Data Flow

```mermaid
sequenceDiagram
    participant U as User (Incharge)
    participant F as app.js
    participant A as api.js
    participant G as GAS Backend
    
    U->>F: Click "Daywise Report" card
    F->>F: generateReportType('daywise')
    F->>F: renderDaywiseReport() — show class pills + date picker
    U->>F: Select class + pick date → click "View Report"
    F->>A: API.getAttendance(code, '', '2026-01-15', outputSheetId)
    A->>G: GET getAttendance?code=&date=2026-01-15&...
    G->>G: _getAttendanceUncached()
    G->>G: Find all subject tabs in output spreadsheet
    G->>G: For each tab, scan date column for matching date
    G->>G: Build lecture list for that date
    G-->>A: { success, lectures: [{time, code, name, faculty, batch}] }
    A-->>F: attendanceData
    F->>F: API.getStudents(className) — fetch student roster
    F->>F: Merge: for each lecture, get P/A per student
    F->>F: Render table: Roll | Name | Lecture1 | Lecture2 | ... | P | A
    U->>F: Click "Download Report (.docx)"
    F->>F: buildDaywiseReportDocx(model) → zipStore → saveAs
```

---

## File Changes (by file)

### 1. `app.html`
- Add a 3rd report card in `#reports-cards-container` (lines ~559) after Student card:
  ```html
  <div class="glass-folder-card accent-green report-card-option"
       id="card-report-daywise" onclick="App.generateReportType('daywise')">
    <!-- icon, badge, description -->
  </div>
  ```
- No new views needed — all content renders in `#reports-output-area`

### 2. `js/app.js`
- **`generateReportType(type)`** (~line 4036): Add `else if (type === 'daywise')` branch that calls `renderDaywiseReport()`
- **`renderDaywiseReport()`** (new function): Build class pill selector + date input + "View Report" button + container `<div id="daywise-report-container">`
- **`fetchDaywiseAttendanceData(className, date)`** (new function): Call `API.getAttendance()` for each subject code in the class (or loop over all tabs from dashboard), merge results into lecture list, call `API.getStudents(className)`, then for each lecture call `API.getAttendance(code, year, date)` to get per-student P/A matrix
- **`downloadDaywiseReportDoc()`** (new function): Build docMeta object with college/mgmt/ay/date/class, call `buildDaywiseReportDocx(model)`
- **`buildDaywiseReportDocx(model)`** (new function): OOXML document builder — matches the style of `buildStudentAttendanceDocx` and `buildDefaultersNoticeDocx` — produces a `.docx` with:
  - College header / Management / Academic Year
  - Metadata table: Class, Date, Total Lectures, Total Students
  - Attendance table: Roll No | Name | Lecture slots | P | A
  - Signature block: Academic Incharge, Principal (from `cfg.principalName`)
  - Landscape orientation if many lecture columns
- **Export `downloadDaywiseReportDoc` and `fetchDaywiseAttendanceData`** in the `return { ... }` block (~line 5027)

### 3. `js/api.js` (likely no changes needed)
- `API.getAttendance(code, year, date, outputSheetId)` already exists and is called with date
- Confirm it returns per-student attendance for a given date

---

## Step-by-Step Implementation Tasks

- [ ] **1. HTML**: Add "Daywise Report" card to `app.html` in `#reports-cards-container`
- [ ] **2. JS — UI scaffold**: Add `else if (type === 'daywise')` branch in `generateReportType()` in `app.js`
- [ ] **3. JS — date view**: Implement `renderDaywiseReport()` — renders class pills + date input + "View Report" button + empty container
- [ ] **4. JS — data fetch**: Implement `fetchDaywiseAttendanceData(className, date)` — loops subject codes, calls `API.getAttendance` per subject/date, merges into lecture array, fetches students, builds combined model
- [ ] **5. JS — on-screen table**: Render merged data as HTML table in `#daywise-report-container` with Roll | Name | Lecture columns | P | A, with color coding (green P, red A)
- [ ] **6. JS — docx builder**: Implement `buildDaywiseReportDocx(model)` with college header, metadata table, attendance table (landscape if > 5 lectures), signature block
- [ ] **7. JS — download trigger**: Implement `downloadDaywiseReportDoc()` that calls the builder and triggers download
- [ ] **8. JS — export**: Add `downloadDaywiseReportDoc` and `fetchDaywiseAttendanceData` to the `return { ... }` block
- [ ] **9. GAS — optional enhancement**: If `getAttendance` doesn't return per-student P/A for a date, add a new GAS endpoint `getDaywiseAttendance(date, className, outputSheetId)` that returns a flat matrix: `{ lectures: [...], students: [{rollNo, name, attendances: [P/A per lecture]}] }`
- [ ] **10. Testing**: Verify end-to-end — select class, pick date, see table, download .docx, open in Word

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Single date, not range | User confirmed single-day snapshot only |
| Landscape .docx if > 5 lectures | Prevents column overflow on narrow portrait |
| Fetch `API.getAttendance` per subject code for date | Aligns with existing `getAttendance(code, year, date)` pattern in GAS |
| Merge student roster + attendance in JS | Keeps GAS changes minimal; leverages existing API |
| 3rd card in existing reports grid | Consistent with Class-Wise and Student-Wise card layout |
| Reuse glassmorphic styling | Matches current design system, minimal CSS changes needed |

---

## Dependencies

- `state.inchargeDashboard` (already loaded on Reports page)
- `API.getAttendance()` — existing, takes `date` parameter
- `API.getStudents(className)` — existing, returns roll/name list
- `zipStore()` helper — existing, used for all .docx/.xlsx exports
- `state.activeDaywiseYear`, `state.activeDaywiseDate` (new state keys)