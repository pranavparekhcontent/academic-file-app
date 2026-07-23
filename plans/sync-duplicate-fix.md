STRICT ORDERS — READ FULLY BEFORE TOUCHING CODE. DO NOT DEVIATE.

## Context
- App loads correctly on first render: shows lectures 1 to 45, no duplicates.
- Bug appears ONLY after clicking the Sync button once — duplicate rows / duplicate dates appear.
- The user has NO BACKUP. You are fully responsible if you break the working app.
- Bug is in `syncTeachingPlan()` function in `Central_API.gs`.

## Confirmed Root Cause (do NOT re-diagnose, do NOT invent new theories)

The duplicate-detection line fails:
    if (t.executedDate && String(t.executedDate).indexOf(dateStr) !== -1) {

Why it fails: `dateStr` (from attendance sheet header) and `t.executedDate` (from teaching plan cell) are in different formats (e.g. Date object stringified vs "21/07/2026" vs "2026-07-21"). The substring check returns false → code thinks date is new → appends it every sync click.

Secondary contributors:
1. Bidirectional fuzzy topic match matches multiple rows for short topics.
2. `attendanceLogs` array is not deduplicated.
3. In-place mutation of `topics` objects causes second iteration to append instead of skip.

## What is NOT the bug (do not "fix" these)
- Lock race condition — GAS serializes per-user, bug happens on single click.
- Lock timeout — irrelevant.
- getTeachingPlan() position relative to lock — irrelevant.
- Client-side debounce — irrelevant to this bug.

## STRICT RULES
1. Only modify the `syncTeachingPlan()` function. Do not touch any other function, file, or line.
2. Do not change function signature, return shape, or any variable names used elsewhere.
3. Do not remove the lock, do not remove `SpreadsheetApp.flush()`, do not remove the final `getTeachingPlan()` re-read.
4. Do not "refactor" or "improve" unrelated code.
5. Do not add new dependencies, new functions, or new helper files.
6. Preserve every existing return statement's shape (`{ success, topics, metadata, warning, updated, error }`).

## REQUIRED CHANGES (exactly these, nothing more)

### Change A — Add a date normalizer helper INSIDE syncTeachingPlan (top of function body, right after the initial `if (!code)` check)

    function _normDate(d) {
      if (d === null || d === undefined || d === '') return '';
      var dt = (d instanceof Date) ? d : new Date(d);
      if (!isNaN(dt.getTime())) {
        return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      }
      return String(d).trim();
    }

### Change B — When building `attendanceLogs`, normalize the date AND dedupe

Replace the existing block that pushes into `attendanceLogs` with:

    var seenLogKeys = {};
    for (var c = firstDateColIdx; c < totalPColIdx; c++) {
      var val = String(dateRow[c]).trim().toLowerCase();
      if (val.indexOf('total p') !== -1 || val.indexOf('% att') !== -1 || val === '') break;
      
      var dateHeader = dateRow[c];
      var topicConducted = String(topicRow[c] || '').trim();
      var dateIso = _normDate(dateHeader);

      if (topicConducted && dateIso) {
        var key = dateIso + '||' + topicConducted.toLowerCase();
        if (!seenLogKeys[key]) {
          seenLogKeys[key] = true;
          attendanceLogs.push({ date: dateIso, topic: topicConducted });
        }
      }
    }

### Change C — Fix the duplicate-detection comparison inside the main `for (var j...)` loop

Replace this block:
    if (t.executedDate && String(t.executedDate).indexOf(dateStr) !== -1) {
      emptyMatch = null;
      appendMatch = null;
      break;
    }

With:
    var existingDates = String(t.executedDate || '')
      .split(',')
      .map(function(s) { return _normDate(s.trim()); })
      .filter(function(s) { return s !== ''; });
    if (existingDates.indexOf(dateStr) !== -1) {
      emptyMatch = null;
      appendMatch = null;
      break;
    }

### Change D — Require minimum topic length before fuzzy match (prevents short-string false matches)

Replace this line:
    if (cleanSyllabus.indexOf(cleanLogTopic) !== -1 || cleanLogTopic.indexOf(cleanSyllabus) !== -1) {

With:
    var minLen = Math.min(cleanSyllabus.length, cleanLogTopic.length);
    if (minLen >= 4 && (cleanSyllabus.indexOf(cleanLogTopic) !== -1 || cleanLogTopic.indexOf(cleanSyllabus) !== -1)) {

### Change E — When writing a new date, normalize before comparing existing cell content (defensive final check)

Replace this block:
    if (!target.executedDate) {
      target.executedDate = dateStr;
      ws.getRange(target.rowIndex, executedCol).setValue(dateStr);
    } else {
      target.executedDate = String(target.executedDate).trim() + ", " + dateStr;
      ws.getRange(target.rowIndex, executedCol).setValue(target.executedDate);
    }
    updated++;

With:
    var currentCellVal = ws.getRange(target.rowIndex, executedCol).getValue();
    var currentDates = String(currentCellVal || '')
      .split(',')
      .map(function(s) { return _normDate(s.trim()); })
      .filter(function(s) { return s !== ''; });

    if (currentDates.indexOf(dateStr) !== -1) {
      target.executedDate = String(currentCellVal || '');
      continue;
    }

    if (!currentCellVal || String(currentCellVal).trim() === '') {
      target.executedDate = dateStr;
      ws.getRange(target.rowIndex, executedCol).setValue(dateStr);
    } else {
      var newVal = String(currentCellVal).trim() + ", " + dateStr;
      target.executedDate = newVal;
      ws.getRange(target.rowIndex, executedCol).setValue(newVal);
    }
    updated++;

## VERIFICATION CHECKLIST (do this before saying "done")
- Only `syncTeachingPlan()` function body was modified.
- Function signature unchanged: `function syncTeachingPlan(code, teacher, sheetId)`.
- All return statements still return objects with the original keys.
- LockService block is intact and unchanged.
- Final `getTeachingPlan()` re-read at the end is intact.
- No other function in the file was touched.
- No frontend files touched.
- `_normDate` is defined INSIDE `syncTeachingPlan`, not globally.

## Output Format
Reply with ONLY the complete, final `syncTeachingPlan()` function — full source, ready to paste-replace. No commentary, no diff, no "here's what I changed" — just the full function block from `function syncTeachingPlan(...)` to its closing `}`.

End of orders. Execute exactly.