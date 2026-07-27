# Diagnosis & Implementation Plan: Academic Timetable & Calendar Fetch Failure

## 1. Architecture Overview

The data flow for fetching academic schedules/timetables/calendars:

```
[User clicks "Academic Calendars & Timetable"]
    │
    ▼
App.loadAcademicSchedule()          [js/app.js:1197]
    │
    ▼
API.getAcademicSchedule()           [js/api.js:181]
    │   └─ calls _get('getAcademicSchedule')
    │       └─ builds URL: <API_URL>?action=getAcademicSchedule&sheetId=<SHEET_ID>
    ▼
Google Apps Script Web App          [Central_API.gs:23]
    │   └─ doGet() routes to getAcademicSchedule(sheetId) at line 61-62
    ▼
getAcademicSchedule(sheetId)        [Central_API.gs:1516-1633]
    │   └─ Uses DriveApp to find spreadsheet parent folder & search for files
    ▼
Returns { success: true, files: [...] } to frontend for rendering
```

## 2. Root Cause Analysis

### PRIMARY ISSUE: Drive Permission Context Mismatch

The Google Apps Script Web App at [`google_apps_script/Central_API.gs`](google_apps_script/Central_API.gs) is deployed as **"Execute as: Me"** (script developer's identity). This means **ALL `DriveApp` operations run under the script developer's Google Drive context**, NOT the end user's Drive.

The function [`getAcademicSchedule(sheetId)`](google_apps_script/Central_API.gs:1516) does:

1. **Line 1524**: `DriveApp.getFileById(realId).getParents()` — Tries to find the spreadsheet's parent folder in the **script developer's Drive**. Since the user's spreadsheet is typically only *shared* with the developer (appears in "Shared with me"), `getParents()` usually returns **0 results** because only the file is shared, not its parent folder.

2. **Line 1529**: Fallback to `DriveApp.getRootFolder()` — Returns the **script developer's personal My Drive root**, which has nothing to do with the user's Drive.

3. **Lines 1579, 1587**: Global searches `DriveApp.getFoldersByName("Academic Calendars & Timetable")` and `DriveApp.searchFolders(...)` — These search the **script developer's Drive**, not the user's Drive. If the user has an "Academic Calendars & Timetable" folder in their own Drive and hasn't shared it with the developer, these searches will NOT find it.

**Result**: The function either returns `{ success: true, files: [] }` (empty — perceived as "can't fetch") or, if an error occurs, `{ success: false, error: "..." }`.

### SECONDARY ISSUES

| Issue | Location | Impact |
|-------|----------|--------|
| **Silent error swallowing** | [`Central_API.gs:1526,1544,1546,1560,1574,1583,1591,1604,1618`](google_apps_script/Central_API.gs:1526) | All `DriveApp` errors are caught with empty `catch(e) {}` — impossible to diagnose failures |
| **No user-facing guidance** | The empty-state UI says "Upload to your Google Drive folder" but the app searches the *developer's* Drive | Creates misleading expectations |
| **Hardcoded CENTRAL_API_URL** | [`config.js:33`](appstart/config.js:33) overrides any `server_url` from the config sheet | No flexibility to point to a different deployment |
| **Cache masking failures** | [`api.js:108-110`](js/api.js:108) | If cached data exists, stale empty results are served silently |

### Why It Works in Some Cases

The system ONLY works if the user's spreadsheet AND its parent folder hierarchy are both **fully shared with the script developer**, AND the timetable/calendar files are within that same shared folder structure. This is rarely the case in practice — most users share only the individual spreadsheet file.

## 3. Minimal Repair Plan

**Constraint**: No changes to app logic, workflows, functions, or UI. Only backend GAS changes + possibly config.

### Step 1: Add a `searchFiles()` fallback to `getAcademicSchedule`

**File**: [`google_apps_script/Central_API.gs`](google_apps_script/Central_API.gs:1516)

After the existing search strategies (parent folder, global folders, parent loose files), add a final fallback using `DriveApp.searchFiles()` which searches for timetable/calendar **files directly by name pattern** across all Drive items accessible to the script (including "Shared with me").

This supplements the existing logic without modifying it. It's placed at the end of the function, before the `return` statement, and only runs if no files were found yet OR as an additional collection pass.

```javascript
// 5. Final fallback: search for files directly by name across all accessible Drives
try {
  var fileSearch = DriveApp.searchFiles(
    "title contains 'timetable' or title contains 'time table' or " +
    "title contains 'calendar' or title contains 'calender' or " +
    "title contains 'schedule' or title contains 'academic'"
  );
  while (fileSearch.hasNext()) {
    var sf = fileSearch.next();
    if (!seenIds[sf.getId()]) {
      seenIds[sf.getId()] = true;
      // ... collect file ...
    }
  }
} catch(e) {
  console.error('File search fallback failed: ' + e.message);
}
```

### Step 2: Add Logging for Existing Search Blocks

**File**: [`google_apps_script/Central_API.gs`](google_apps_script/Central_API.gs:1522-1618)

Replace empty `catch(e) {}` blocks with `catch(e) { console.error('context: ' + e.message); }` in the key Drive operations so that error causes are visible in Stackdriver logs.

### Step 3: Deploy the Updated Script

After modifying the GAS code, the script must be re-deployed as a new version of the Web App. The deployment URL will remain the same (previous version IDs remain active), so no frontend changes needed.

## 4. Files That Require Changes

| File | Change | Type |
|------|--------|------|
| [`google_apps_script/Central_API.gs`](google_apps_script/Central_API.gs:1516) | Add `searchFiles()` fallback + logging | **Required** |
| [`appstart/config.js`](appstart/config.js:33) | Verify `CENTRAL_API_URL` is current deployment URL | **Verify only** |

## 5. No-Change Guarantee

The following remain **strictly untouched**:
- All frontend JS files (`js/app.js`, `js/api.js`)
- All HTML files (`app.html`, `index.html`)
- All CSS files (`css/app.css`, `appstart/appstart.css`)
- AppStart engine files (`appstart/appstart.js`, `appstart/schema.js`)
- Service worker (`sw.js`)
- Any UI rendering, layout, or user-facing text
