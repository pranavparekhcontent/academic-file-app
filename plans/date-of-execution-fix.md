# Date of Execution Fix — Corrected Root Cause Analysis

## Re-Audit Summary

**Original assumption (incorrect):** `_normDate()` failing to parse DD-MMM format was the primary (P0) blocker.

**Corrected finding:** Topic matching algorithm **is the real gatekeeper**. When matching succeeds, the date DOES get written regardless of format issues. When matching fails (most cases), no date is written.

---

## Root Causes (Priority Order)

### 🔴 P0 — Topic matching doesn't handle multi-select topics
**File:** `google_apps_script/Central_API.gs:1272-1331`

**Problem:** When a teacher selects **multiple syllabus topics** from the picker, they are joined with `", "` into a single string. The matching algorithm runs Pass 1 (exact match after `cleanStr`) and Pass 2 (partial containment with ≥55% ratio) on this **concatenated string**. Result:
- Pass 1 fails (concatenated string ≠ any single syllabus)
- Pass 2 matches only **1 topic** (the longest one whose length ≥55% of concatenated string)
- Other topics in multi-select are **silently skipped**

**Example:** Topics selected = `"Introduction to Arrays, Arrays in C"` → only `"Introduction to Arrays"` gets a date.

**Also:** When teacher types a **custom topic** (via the "Custom Topic" option in picker OR when subject has no `teachingPlanLink`), no match is possible → no date written.

### 🟠 P1 — `_normDate()` fragile for DD-MMM format
**File:** `google_apps_script/Central_API.gs:1150-1157`

**Problem:** Output sheet column headers are `"24-Jul"` (DD-MMM, no year). When `syncTeachingPlan()` reads these:
- If Google Sheets auto-converts `"24-Jul"` to a Date object (depends on spreadsheet locale) → `_normDate()` works → returns `"24/07/2024"`
- If Sheets stores as plain string → `new Date("24-Jul")` → Invalid Date → returns raw `"24-Jul"`

**Impact:** Doesn't block writes but writes format-inconsistent dates to execution column.

### 🟡 P2 — No logging for unmatched topics
**File:** `google_apps_script/Central_API.gs:1272-1331`

**Problem:** When topic matching fails, there is zero feedback. No log, no error. Teachers can't diagnose why dates aren't being written.

---

## Why Some Lectures ARE Recorded

| Scenario | Matching Result | Date Written? |
|----------|----------------|---------------|
| Selects **1 topic** from picker | Pass 1 exact match ✅ | **YES** |
| Selects **multiple topics** from picker | Only 1 of N matched via Pass 2 | **Partial (1/N)** |
| Types **custom topic** in picker | No match ✗ | **NO** |
| No teachingPlanLink → free-form topic | No match ✗ | **NO** |
| Types topic **identical to syllabus text** | Pass 1 exact match ✅ | **YES** |

---

## Fix Plan

### Fix 1 (P0) — Multi-topic matching in `syncTeachingPlan()`
**Lines:** 1260-1331

**Strategy:**
1. Split `log.topic` by `, ` or `,` to get individual topic parts
2. For each part, run the existing Pass 1 + Pass 2 matching independently
3. Write execution date for EVERY matched sub-topic
4. Add a simple Levenshtein or word-overlap fuzzy match as Pass 3 fallback

**Implementation sketch:**
```javascript
var topicParts = log.topic.split(/\s*,\s*/);
for (var p = 0; p < topicParts.length; p++) {
    var partTopic = topicParts[p].trim();
    if (!partTopic) continue;
    var cleanPartTopic = cleanStr(partTopic);
    // Run Pass 1 + Pass 2 + Pass 3 matching for this part
    // ...
}
```

### Fix 2 (P1) — Robust `_normDate()` with DD-MMM parsing
**Lines:** 1150-1157

**Strategy:**
1. Before falling through to `new Date(d)`, check if `d` matches `DD-MMM` pattern
2. If yes, prepend current year and create Date properly
3. Handle `DD-MMM (suffix)` format for duplicate sessions

```javascript
function _normDate(d) {
    if (d === null || d === undefined || d === '') return '';
    var dt = (d instanceof Date) ? d : new Date(d);
    if (!isNaN(dt.getTime())) {
        return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    }
    // NEW: Try parsing DD-MMM format
    var str = String(d).trim();
    var ddmMatch = str.match(/^(\d{1,2})-([A-Za-z]{3})(.*)$/);
    if (ddmMatch) {
        var parsed = new Date(ddmMatch[1] + ' ' + ddmMatch[2] + ' ' + new Date().getFullYear());
        if (!isNaN(parsed.getTime())) {
            return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'dd/MM/yyyy') + ddmMatch[3];
        }
    }
    return str;
}
```

### Fix 3 (P2) — Better logging for unmatched topics
**Lines:** 1276, after 1331

**Strategy:** Log unmatched topics to a dedicated sheet or at minimum use `Logger.log()` with full context.

---

## Files to Modify
- `google_apps_script/Central_API.gs` — All fixes in `syncTeachingPlan()` and `_normDate()`
