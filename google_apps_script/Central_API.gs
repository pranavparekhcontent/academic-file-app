/**
 * ═══════════════════════════════════════════════════════════════
 *  CENTRAL API — Google Apps Script Web App (v3.6)
 *  Backend for Academic File PWA & Academic Incharge Dashboard.
 *  Proxies access to college sheets via the sheetId parameter.
 * ═══════════════════════════════════════════════════════════════
 */

// Diagnostic self-test function for 1-click execution in Google Apps Script editor
function testDiagnostics() {
  Logger.log("=== RUNNING CENTRAL API DIAGNOSTICS ===");
  try {
    var userEmail = "";
    try { userEmail = Session.getEffectiveUser().getEmail(); } catch(e) {}
    Logger.log("[OK] Effective User: " + (userEmail || "Anonymous / Active Deployment"));
    
    // Test Drive permissions
    var root = DriveApp.getRootFolder();
    Logger.log("[OK] Google Drive access is authorized. Root folder: " + root.getName());
    
    // Test Academic Schedule discovery
    var scheduleRes = getAcademicSchedule("", "");
    Logger.log("[OK] getAcademicSchedule test response: " + JSON.stringify(scheduleRes));
    
    Logger.log("=== ALL DIAGNOSTICS PASSED SUCCESSFULLY! ===");
    return { status: "SUCCESS", email: userEmail, driveAccessible: true };
  } catch (err) {
    Logger.log("[ERROR] Diagnostics failed: " + err.message);
    return { status: "ERROR", error: err.message };
  }
}

// Fallback alias for test executions
function testRun() {
  return testDiagnostics();
}

var _ssCache = {};
function _getSpreadsheet(sheetId) {
  if (!sheetId) {
    throw new Error("Missing sheetId parameter");
  }
  if (!_ssCache[sheetId]) {
    _ssCache[sheetId] = SpreadsheetApp.openById(sheetId);
  }
  return _ssCache[sheetId];
}

/**
 * Main GET entry point - merges routes for Attendance and Academic PWAs
 */
function doGet(e) {
  try {
    // Gracefully handle manual executions in Google Apps Script Editor or empty requests
    if (!e || !e.parameter) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "API is online and operational",
        version: "3.5",
        timestamp: new Date().toISOString(),
        message: "Send HTTP GET with action and sheetId parameters to query data."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var action = e.parameter.action;
    var sheetId = e.parameter.sheetId; // Master config sheet ID
    var result;

    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "API is online and operational",
        version: "3.5",
        message: "No action specified."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    switch (action) {
      // ── Common & Shared Routes ──
      case 'getTeachers': 
        result = getTeachers(sheetId); 
        break;
      case 'getSubjects': 
        result = getSubjects(e.parameter.teacher, sheetId); 
        break;
      case 'getStudents': 
        result = getStudents(e.parameter.sheet, e.parameter.batch, sheetId); 
        break;
      case 'getAttendanceLimit': 
        result = getAttendanceLimit(sheetId); 
        break;
      case 'getAttendance': 
        result = getAttendance(e.parameter.code, e.parameter.year, e.parameter.date, e.parameter.outputSheetId, sheetId); 
        break;
      case 'getTaughtTopics':
        result = getTaughtTopics(e.parameter.code, e.parameter.outputSheetId, sheetId);
        break;
      case 'getSyllabus':
        result = getSyllabus(e.parameter.link, e.parameter.code, sheetId);
        break;
      case 'getConfig':
      case 'getAllData': 
        result = getAllData(sheetId); 
        break;

      // ── Academic File Routes ──
      case 'getTeachingPlan':
        var tpCode = e.parameter.batch && String(e.parameter.code || '').indexOf('(') === -1 ? (e.parameter.code + ' (' + e.parameter.batch + ')') : e.parameter.code;
        result = getTeachingPlan(tpCode, e.parameter.teacher, sheetId, e.parameter.batch);
        break;
      case 'syncTeachingPlan':
        var stpCode = e.parameter.batch && String(e.parameter.code || '').indexOf('(') === -1 ? (e.parameter.code + ' (' + e.parameter.batch + ')') : e.parameter.code;
        result = syncTeachingPlan(stpCode, e.parameter.teacher, sheetId, e.parameter.batch);
        break;
      case 'getAcademicSchedule':
        result = getAcademicSchedule(sheetId, e.parameter.teachingPlanLink);
        break;
      case 'getAcademicIncharges':
        result = getAcademicIncharges(sheetId);
        break;
      case 'academicInchargeLogin':
        result = academicInchargeLogin(e.parameter.name, e.parameter.pin, sheetId);
        break;
      case 'getInchargeDashboard':
        result = getInchargeDashboard(sheetId);
        break;

      // ── Session Cache Bulk Download ──
      case 'getBulkSessionData':
        result = getBulkSessionData(sheetId);
        break;
      case 'debugAttendance':
        result = debugAttendanceData(sheetId);
        break;

      default: 
        result = { error: 'Unknown GET action: ' + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Main POST entry point - routes for Academic File PWA
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || (e.parameter && e.parameter.action);
    var sheetId = data.sheetId || (e.parameter && e.parameter.sheetId);
    var result;

    switch (action) {
      // ── Academic File POSTs ──
      case 'saveRemark':
        result = saveRemark(data.code, data.rowIndex, data.remark, sheetId);
        break;
      case 'addCustomSyllabusTopic':
        result = addCustomSyllabusTopic(data, sheetId);
        break;
      case 'uploadAcademicDocument':
        result = uploadAcademicDocument(data, sheetId);
        break;

      default:
        result = { error: 'Unknown POST action: ' + action };
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

/* ═══════════════════════════════════════════════════════════════
   COMMON / UTILS FUNCTIONS
   ═══════════════════════════════════════════════════════════════ */

function _mapSubjectCols(headers) {
  var H = headers.map(function(h) { return String(h).toLowerCase().trim(); });
  var used = {};
  function find(keywords, fallback) {
    for (var k = 0; k < keywords.length; k++) {
      for (var c = 0; c < H.length; c++) {
        if (!used[c] && H[c] === keywords[k]) { used[c] = true; return c; }
      }
    }
    for (var k = 0; k < keywords.length; k++) {
      for (var c = 0; c < H.length; c++) {
        if (!used[c] && H[c] && H[c].indexOf(keywords[k]) !== -1) { used[c] = true; return c; }
      }
    }
    used[fallback] = true;
    return fallback;
  }
  return {
    code: find(['subject code', 'code'], 0),
    faculty: find(['faculty', 'teacher'], 6),
    pin: find(['pin', 'password'], 7),
    batches: find(['batches', 'batch'], 8),
    semester: find(['semester', 'sem'], 4),
    year: find(['year', 'class'], 2),
    program: find(['program', 'course'], 3),
    type: find(['type'], 5),
    name: find(['subject name', 'subject', 'name'], 1)
  };
}

function _parseFacultyBatches(batchesStr, facultyName) {
  var str = String(batchesStr || '').trim();
  if (!str || str === 'undefined') return '';
  var targetFac = String(facultyName || '').trim().toLowerCase();

  // If contains '/', faculties are separated by '/' (e.g. ppp=A,B,C/abc=C,D)
  if (str.indexOf('/') !== -1 || str.indexOf('=') !== -1) {
    var parts = str.split('/');
    for (var p = 0; p < parts.length; p++) {
      var item = parts[p].trim();
      if (!item) continue;
      if (item.indexOf('=') !== -1) {
        var kv = item.split('=');
        var fKey = kv[0].trim().toLowerCase();
        var bVal = kv[1] ? kv[1].trim() : '';
        if (targetFac && (fKey === targetFac || fKey.indexOf(targetFac) !== -1 || targetFac.indexOf(fKey) !== -1)) {
          return _formatBatchString(bVal);
        }
      }
    }
  }

  // Fallback: if single faculty string or direct batch notation
  return _formatBatchString(str);
}

function _formatBatchString(bStr) {
  var raw = String(bStr || '').trim();
  if (!raw) return '';
  if (/^batch/i.test(raw)) return raw;
  var parts = raw.split(',').map(function(x) { return x.trim(); }).filter(Boolean);
  if (parts.length > 0) {
    return 'Batch ' + parts.join(', ');
  }
  return raw;
}

function _parseSubjectCode(code, typeHint, nameHint) {
  var raw = String(code || '').trim();
  if (!raw) {
    return { raw: '', baseCode: '', cleanBaseCode: '', cleanFullCode: '', batch: '', isPractical: false };
  }

  var batch = '';
  var bracketMatch = raw.match(/\((?:batch\s*)?([a-zA-Z0-9]+)\)/i);
  if (bracketMatch && bracketMatch[1]) {
    batch = bracketMatch[1].trim();
  } else {
    var trailingMatch = raw.match(/(?:[\s\-_]+(?:batch[\s\-_]*)?|[[\s\-_]+)([a-zA-Z0-9]{1,3})$/i);
    if (trailingMatch && trailingMatch[1]) {
      var candidate = trailingMatch[1].trim();
      if (!/^\d+[PT]$/i.test(candidate)) {
        batch = candidate;
      }
    }
  }

  var baseCode = raw;
  if (batch) {
    baseCode = raw.replace(/\s*\([^)]*\)/gi, '')
                  .replace(new RegExp('(?:[\\s\\-_]+(?:batch[\\s\\-_]*)?|[\\s\\-_]+)' + batch + '$', 'i'), '')
                  .trim();
  } else {
    baseCode = raw.replace(/\s*\([^)]*\)/gi, '').trim();
  }

  var cleanBaseCode = baseCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  var cleanBatch = batch.toUpperCase();
  var cleanFullCode = cleanBaseCode + (cleanBatch ? cleanBatch : '');

  var typeStr = String(typeHint || '').toLowerCase();
  var nameStr = String(nameHint || '').toLowerCase();
  var codeUpper = cleanBaseCode;

  var isPractical = false;
  if (typeStr.indexOf('practical') !== -1 || typeStr.indexOf('lab') !== -1 || typeStr === 'pr' || typeStr === 'p') {
    isPractical = true;
  } else if (nameStr.indexOf('practical') !== -1 || nameStr.indexOf('lab') !== -1) {
    isPractical = true;
  } else if (raw.toLowerCase().indexOf('practical') !== -1 || raw.toLowerCase().indexOf('lab') !== -1 || cleanBatch !== '') {
    isPractical = true;
  } else {
    if (/.*?\d+P$/i.test(codeUpper) || codeUpper.endsWith('P')) {
      isPractical = true;
    }
  }

  return {
    raw: raw,
    baseCode: baseCode,
    cleanBaseCode: cleanBaseCode,
    cleanFullCode: cleanFullCode,
    batch: cleanBatch,
    isPractical: isPractical
  };
}

function isDateOrNumberVal(val) {
  if (val === undefined || val === null || val === '') return false;
  if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') return true;
  var s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return true;
  if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(s)) return true;
  if (/^\d{1,2}-[A-Za-z]{3}-\d{2,4}/.test(s)) return true;
  if (/^(sun|mon|tue|wed|thu|fri|sat)\s+[a-z]{3}\s+\d{1,2}\s+\d{4}/i.test(s)) return true;
  if (/^\d+$/.test(s)) return true;
  return false;
}

function _findSheetByCode(ss, inputCode, nameHint, batchHint) {
  if (!ss || !inputCode) return null;
  var effectiveInput = inputCode;
  if (batchHint && inputCode.indexOf('(') === -1 && !/batch/i.test(inputCode)) {
    effectiveInput = inputCode + ' (' + batchHint + ')';
  }
  var parsedInput = _parseSubjectCode(effectiveInput, '', nameHint);
  var sheets = ss.getSheets();
  if (!sheets || sheets.length === 0) return null;

  var bestSheet = null;
  var maxScore = -1;
  var cleanHint = String(nameHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var sheetName = sheet.getName().trim();
    var sheetNameLower = sheetName.toLowerCase();
    var cleanSheetName = sheetName.toUpperCase().replace(/[^A-Z0-9]/g, '');
    var parsedSheet = _parseSubjectCode(sheetName);
    var score = 0;

    var sameBase = (parsedSheet.cleanBaseCode && parsedSheet.cleanBaseCode === parsedInput.cleanBaseCode) ||
                   (parsedInput.cleanBaseCode && cleanSheetName.indexOf(parsedInput.cleanBaseCode) !== -1);

    if (sheetNameLower === parsedInput.raw.toLowerCase()) {
      score = 100;
    } else if (sameBase) {
      if (parsedInput.batch && parsedSheet.batch) {
        if (parsedInput.batch === parsedSheet.batch) {
          score = 98; // Exact base code & exact batch
        } else {
          score = 10; // Mismatching batch
        }
      } else if (parsedInput.batch && !parsedSheet.batch) {
        score = cleanSheetName.indexOf(parsedInput.batch) !== -1 ? 92 : 40;
      } else if (!parsedInput.batch && parsedSheet.batch) {
        score = 80;
      } else {
        score = 88;
      }
    } else if (cleanHint && cleanSheetName.indexOf(cleanHint) !== -1) {
      score = 75;
    } else if (parsedInput.cleanBaseCode && (parsedSheet.cleanBaseCode.indexOf(parsedInput.cleanBaseCode) !== -1 || parsedInput.cleanBaseCode.indexOf(parsedSheet.cleanBaseCode) !== -1)) {
      score = 65;
    }

    if (score > maxScore) {
      maxScore = score;
      bestSheet = sheet;
    }
  }

  if (bestSheet && maxScore >= 50) {
    return bestSheet;
  }

  for (var i = 0; i < sheets.length; i++) {
    var nameLower = sheets[i].getName().trim().toLowerCase();
    if (looksLikeSubjectCode(nameLower) && _parseSubjectCode(nameLower).cleanBaseCode !== parsedInput.cleanBaseCode) {
      continue;
    }
    if (nameLower.indexOf("syllabus") !== -1 || nameLower.indexOf("teaching plan") !== -1 || nameLower.indexOf("plan") !== -1) {
      return sheets[i];
    }
  }

  if (sheets[0]) {
    var firstName = sheets[0].getName().trim();
    if (looksLikeSubjectCode(firstName) && _parseSubjectCode(firstName).cleanBaseCode !== parsedInput.cleanBaseCode) {
      return null;
    }
    return sheets[0];
  }

  return null;
}

function getTeachers(sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName('subjects');
  if (!ws) return { success: false, error: 'Sheet "subjects" not found' };
  var data = ws.getDataRange().getValues(), map = {};
  var cols = _mapSubjectCols(data[0] || []);
  for (var i = 1; i < data.length; i++) {
    var fStr = String(data[i][cols.faculty]).trim(), pStr = String(data[i][cols.pin]).trim();
    if (fStr && fStr !== 'undefined') {
      var fs = fStr.split(','), ps = pStr.split(',');
      for (var f = 0; f < fs.length; f++) {
        var n = fs[f].trim(), p = (ps[f] && ps[f].trim()) || ps[0].trim();
        if (n) {
          if (!map[n]) map[n] = p;
          else if (map[n].split(',').indexOf(p) === -1) map[n] += ',' + p;
        }
      }
    }
  }
  var res = []; for (var k in map) res.push({ name: k, pin: map[k] });
  return { success: true, teachers: res };
}

function getSubjects(teacher, sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName('subjects');
  if (!ws) return { success: false };
  var data = ws.getDataRange().getValues(), res = [];
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  var cols = _mapSubjectCols(data[0] || []);
  var collegeIds = _getCollegeSheetIds(sheetId);
  var defaultOutId = collegeIds.outputSheetId || getOutputSheetId(sheetId);

  var teachingPlanIdx = -1;
  var outputSheetIdx = -1;
  for (var c = 0; c < headers.length; c++) {
    var h = headers[c];
    if (h.indexOf('teaching plan') !== -1 || h.indexOf('syllabus') !== -1) {
      teachingPlanIdx = c;
    }
    if (h.indexOf('output excel') !== -1 || h.indexOf('output sheet') !== -1 || h.indexOf('output link') !== -1) {
      outputSheetIdx = c;
    }
  }

  for (var i = 1; i < data.length; i++) {
    var rawFac = String(data[i][cols.faculty] || '');
    var fs = rawFac.toLowerCase().split(',').map(function(x){return x.trim()});
    var rawBatches = cols.batches !== -1 && data[i][cols.batches] !== undefined ? String(data[i][cols.batches]).trim() : '';
    if (!teacher || fs.indexOf(teacher.toLowerCase()) !== -1) {
      var sCode = String(data[i][cols.code]).trim();
      var sName = String(data[i][cols.name]).trim();
      var sType = String(data[i][cols.type]).trim();
      var parsedCode = _parseSubjectCode(sCode, sType, sName);
      if (parsedCode.isPractical && (!sType || sType.toLowerCase() === 'theory' || sType === '')) {
        sType = 'Practical';
      }
      var explicitBatch = _parseFacultyBatches(rawBatches, teacher || (fs[0] || ''));
      if (!explicitBatch) {
        explicitBatch = parsedCode.batch;
      }
      if (!explicitBatch && parsedCode.isPractical && fs.length > 1 && teacher) {
        var tIdx = fs.indexOf(teacher.toLowerCase());
        if (tIdx !== -1) {
          explicitBatch = 'Batch ' + String.fromCharCode(65 + tIdx);
        }
      }
      var subObj = {
        code: sCode,
        name: sName,
        year: String(data[i][cols.year]).trim(),
        program: String(data[i][cols.program]).trim(),
        semester: String(data[i][cols.semester]).trim(),
        faculty: rawFac,
        batches: rawBatches,
        type: sType,
        batch: explicitBatch || ''
      };
      subObj.teachingPlanLink = (teachingPlanIdx !== -1) ? String(data[i][teachingPlanIdx]).trim() : '';
      
      var rowOutId = (outputSheetIdx !== -1) ? String(data[i][outputSheetIdx]).trim() : '';
      if (rowOutId) {
        var extracted = extractSpreadsheetId(rowOutId);
        if (extracted) rowOutId = extracted;
      }
      subObj.outputSheetId = rowOutId || defaultOutId;
      
      res.push(subObj);
    }
  }
  var globalLink = '';
  for (var i = 0; i < res.length; i++) {
    if (!res[i].teachingPlanLink) {
      if (!globalLink) globalLink = getGlobalTeachingPlanLink(sheetId);
      if (globalLink) res[i].teachingPlanLink = globalLink;
    }
  }
  return { success: true, subjects: res };
}

function getStudents(sheet, batch, sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName(sheet);
  if (!ws) return { success: false };
  var data = ws.getDataRange().getValues(), res = [];
  var H = (data[0] || []).map(function(h) { return String(h).toLowerCase().trim(); });
  var rollCol = 0, nameCol = 1, batchCol = 2;
  for (var c = 0; c < H.length; c++) {
    if (H[c].indexOf('roll') !== -1) rollCol = c;
    else if (H[c].indexOf('name') !== -1) nameCol = c;
    else if (H[c].indexOf('batch') !== -1) batchCol = c;
  }
  for (var i = 1; i < data.length; i++) {
    var r = data[i][rollCol], n = String(data[i][nameCol]).trim(), b = String(data[i][batchCol] || '').trim();
    if (!r && !n) continue;
    if (batch && b !== batch) continue;
    res.push({ rollNo: r, name: n, batch: b });
  }
  return { success: true, students: res, sheet: sheet };
}

function getAttendanceLimit(sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName('subjects');
  var data = ws ? ws.getDataRange().getValues() : [], limit = 75;
  for (var i = 0; i < data.length; i++) {
    for (var j = 0; j < data[i].length; j++) {
      if (String(data[i][j]).toLowerCase().indexOf('attendance limit') !== -1 && j + 1 < data[i].length) {
        var v = Number(data[i][j + 1]); if (!isNaN(v) && v > 0) limit = v; break;
      }
    }
  }
  return { success: true, limit: limit };
}

function getAllData(sheetId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'allData_v5_' + (sheetId || '');
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }

  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName('subjects'), subs = [], config = { collegeName: '', managementName: '' };
  var teachers = [], limit = 75;
  if (ws) {
    var data = ws.getDataRange().getValues();
    var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
    var cols = _mapSubjectCols(data[0] || []);

    var teachingPlanIdx = -1;
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (h.indexOf('teaching plan') !== -1 || h.indexOf('syllabus') !== -1) {
        teachingPlanIdx = c;
        break;
      }
    }

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][cols.code]).trim()) {
        var sCode = String(data[i][cols.code]).trim();
        var sName = String(data[i][cols.name]).trim();
        var sType = String(data[i][cols.type]).trim();
        var parsedCode = _parseSubjectCode(sCode, sType, sName);
        if (parsedCode.isPractical && (!sType || sType.toLowerCase() === 'theory' || sType === '')) {
          sType = 'Practical';
        }
        var rawBatches = (cols.batches !== -1 && data[i][cols.batches] !== undefined) ? String(data[i][cols.batches]).trim() : '';
        var subObj = {
          code: sCode,
          name: sName,
          year: String(data[i][cols.year]).trim(),
          program: String(data[i][cols.program]).trim(),
          semester: String(data[i][cols.semester]).trim(),
          type: sType,
          faculty: String(data[i][cols.faculty]).trim(),
          batches: rawBatches,
          batch: _parseFacultyBatches(rawBatches, String(data[i][cols.faculty]).trim())
        };
        subObj.teachingPlanLink = (teachingPlanIdx !== -1) ? String(data[i][teachingPlanIdx]).trim() : '';
        subs.push(subObj);
      }
    }
    var globalLink = '';
    for (var i = 0; i < subs.length; i++) {
      if (!subs[i].teachingPlanLink) {
        if (!globalLink) globalLink = getGlobalTeachingPlanLink(sheetId);
        if (globalLink) subs[i].teachingPlanLink = globalLink;
      }
    }
    var cs = ss.getSheetByName('client sheet') || ss.getSheetByName('subjects');
    if (cs) {
      var cd = cs.getDataRange().getValues(), keys = ['college name', 'management name'];
      for (var r = 0; r < cd.length; r++) {
        for (var c = 0; c < cd[r].length; c++) {
          var v = String(cd[r][c]).trim().toLowerCase();
          for (var k = 0; k < keys.length; k++) {
            if (v.indexOf(keys[k]) !== -1) {
              var f = '';
              for (var n = c + 1; n < cd[r].length; n++) { var nv = String(cd[r][n]).trim(); if (nv !== '' && ['link','name','text'].indexOf(nv.toLowerCase()) === -1) { f = nv; break; } }
              if (f === '' && r + 1 < cd.length) f = String(cd[r+1][c]).trim();
              if (f) { if (keys[k] === 'college name') config.collegeName = f; else config.managementName = f; }
            }
          }
        }
      }
    }
    // --- Inline teachers extraction (reuse already-read data, avoid re-reading subjects) ---
    var tMap = {};
    for (var i = 1; i < data.length; i++) {
      var fStr = String(data[i][cols.faculty]).trim(), pStr = String(data[i][cols.pin]).trim();
      if (fStr && fStr !== 'undefined') {
        var fs = fStr.split(','), ps = pStr.split(',');
        for (var f = 0; f < fs.length; f++) {
          var n = fs[f].trim(), p = (ps[f] && ps[f].trim()) || ps[0].trim();
          if (n) {
            if (!tMap[n]) tMap[n] = p;
            else if (tMap[n].split(',').indexOf(p) === -1) tMap[n] += ',' + p;
          }
        }
      }
    }
    for (var k in tMap) teachers.push({ name: k, pin: tMap[k] });
    // --- Inline attendance limit extraction (reuse already-read data) ---
    for (var i = 0; i < data.length; i++) {
      for (var j = 0; j < data[i].length; j++) {
        if (String(data[i][j]).toLowerCase().indexOf('attendance limit') !== -1 && j + 1 < data[i].length) {
          var v = Number(data[i][j + 1]); if (!isNaN(v) && v > 0) limit = v; break;
        }
      }
    }
  }

  var dashData = null;
  try {
    dashData = getInchargeDashboard(sheetId);
  } catch(e) {}

  var result = { 
    success: !!ws, 
    teachers: teachers, 
    subjects: subs, 
    attendanceLimit: limit, 
    config: config,
    dashboard: dashData || { success: false },
    faculties: (dashData && dashData.faculties) || []
  };
  if (ws && (teachers.length > 0 || subs.length > 0)) {
    try { cache.put(cacheKey, JSON.stringify(result), 3600); } catch(ce) {}
  }
  return result;
}

function getOutputSheetId(sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName('subjects');
  var data = ws ? ws.getDataRange().getValues() : [];
  for (var i = 0; i < data.length; i++) {
    for (var j = 0; j < data[i].length; j++) {
      var cellVal = String(data[i][j]).trim().toLowerCase();
      if (cellVal === 'output excel link' || cellVal.indexOf('output sheet') !== -1 || cellVal.indexOf('output excel') !== -1 || cellVal.indexOf('output link') !== -1) {
         var f = '';
         for (var n = j + 1; n < data[i].length; n++) { var nv = String(data[i][n]).trim(); if (nv !== '' && ['link','name','text'].indexOf(nv.toLowerCase()) === -1) { f = nv; break; } }
         if (f === '' && i + 1 < data.length) f = String(data[i+1][j]).trim();
         if (f) { var m = f.match(/\/d\/(.*?)(\/|$)/); if (m && m[1]) return m[1]; }
      }
    }
  }
  return '';
}

function _getCollegeSheetIds(sheetId) {
  var teachingPlanId = '';
  var outputSheetId = '';
  
  if (!sheetId) return { outputSheetId: '', teachingPlanId: '' };
  
  var cache = CacheService.getScriptCache();
  var cacheKeyOut = 'outLink_' + sheetId;
  var cacheKeyTp = 'tpLink_' + sheetId;
  var cachedOut = cache.get(cacheKeyOut);
  var cachedTp = cache.get(cacheKeyTp);
  
  if (cachedOut !== null && cachedTp !== null) {
    return {
      outputSheetId: cachedOut === 'NONE' ? '' : cachedOut,
      teachingPlanId: cachedTp === 'NONE' ? '' : cachedTp
    };
  }

  try {
    var MASTER_CONFIG_SHEET_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
    var masterSs = _getSpreadsheet(MASTER_CONFIG_SHEET_ID);
    var masterWs = masterSs.getSheetByName("smart attendance client sheet") || masterSs.getSheets()[0];
    if (masterWs) {
      var data = masterWs.getDataRange().getValues();
      var headers = data[2] || data[0];
      var inputCol = -1, outputCol = -1, tpCol = -1;
      
      for (var c = 0; c < headers.length; c++) {
        var h = String(headers[c]).toLowerCase().trim();
        if (h.indexOf('input sheet id') !== -1 || h.indexOf('input link') !== -1 || h.indexOf('sheet id') !== -1 || h.indexOf('master sheet') !== -1 || h.indexOf('input sheet') !== -1) inputCol = c;
        if (h.indexOf('output link') !== -1 || h.indexOf('output sheet') !== -1 || h.indexOf('output excel') !== -1) outputCol = c;
        if (h.indexOf('teaching plan link') !== -1 || h.indexOf('teaching plan') !== -1 || h.indexOf('syllabus') !== -1 || h.indexOf('tp link') !== -1) tpCol = c;
      }
      
      if (inputCol === -1) inputCol = 4;
      if (outputCol === -1) outputCol = 5;
      if (tpCol === -1) tpCol = 6;
      
      for (var r = 3; r < data.length; r++) {
        var row = data[r];
        var rowInputId = String(row[inputCol] || '').trim();
        if (rowInputId === sheetId || (sheetId && rowInputId.indexOf(sheetId) !== -1) || (rowInputId && sheetId.indexOf(rowInputId) !== -1)) {
          var outVal = (outputCol !== -1 && outputCol < row.length) ? String(row[outputCol] || '').trim() : '';
          if (outVal) {
            var m = outVal.match(/\/d\/(.*?)(\/|$)/);
            outputSheetId = m ? m[1] : outVal;
          }
          
          var tpVal = (tpCol !== -1 && tpCol < row.length) ? String(row[tpCol] || '').trim() : '';
          if (tpVal) {
            var m = tpVal.match(/\/d\/(.*?)(\/|$)/);
            teachingPlanId = m ? m[1] : tpVal;
          }
          break;
        }
      }
    }
  } catch(err) {
    Logger.log("_getCollegeSheetIds: Error looking up from master config sheet: " + err.message);
  }
  
  cache.put(cacheKeyOut, outputSheetId || 'NONE', 21600);
  cache.put(cacheKeyTp, teachingPlanId || 'NONE', 21600);

  return { outputSheetId: outputSheetId, teachingPlanId: teachingPlanId };
}

function getTargetSheetIds(code, sheetId) {
  var collegeIds = _getCollegeSheetIds(sheetId);
  var teachingPlanId = collegeIds.teachingPlanId;
  var outputSheetId = collegeIds.outputSheetId;

  if (!teachingPlanId || !outputSheetId) {
    try {
      var ss = _getSpreadsheet(sheetId);
      var ws = ss.getSheetByName('subjects');
      if (ws) {
        var data = ws.getDataRange().getValues();
        var tpColIdx = -1;
        var outColIdx = -1;
        var codeColIdx = 0;

        var headers = data[0] || [];
        for (var c = 0; c < headers.length; c++) {
          var val = String(headers[c]).toLowerCase().trim();
          if (val.indexOf('teaching plan') !== -1 || val.indexOf('syllabus') !== -1) tpColIdx = c;
          if (val.indexOf('output excel') !== -1 || val.indexOf('output sheet') !== -1 || val.indexOf('output link') !== -1) outColIdx = c;
        }

        var inputParsed = _parseSubjectCode(code);
        for (var i = 1; i < data.length; i++) {
          var rowCode = String(data[i][codeColIdx]).trim();
          var rowParsed = _parseSubjectCode(rowCode);
          if (rowParsed.cleanBaseCode === inputParsed.cleanBaseCode || rowCode.toLowerCase() === code.trim().toLowerCase()) {
            if (!teachingPlanId && tpColIdx !== -1 && data[i][tpColIdx]) {
              var m = String(data[i][tpColIdx]).match(/\/d\/(.*?)(\/|$)/);
              teachingPlanId = m ? m[1] : String(data[i][tpColIdx]).trim();
            }
            if (!outputSheetId && outColIdx !== -1 && data[i][outColIdx]) {
              var m = String(data[i][outColIdx]).match(/\/d\/(.*?)(\/|$)/);
              outputSheetId = m ? m[1] : String(data[i][outColIdx]).trim();
            }
            break;
          }
        }
      }
    } catch(err) {
      Logger.log("Error looking up from subjects sheet tab: " + err.message);
    }
  }

  if (!teachingPlanId) teachingPlanId = sheetId;
  if (!outputSheetId) outputSheetId = getOutputSheetId(sheetId);

  return { teachingPlanId: teachingPlanId, outputSheetId: outputSheetId };
}

function getGlobalTeachingPlanLink(sheetId) {
  if (!sheetId) return '';
  var cache = CacheService.getScriptCache();
  var cacheKey = 'tpLink_' + sheetId;
  var cachedLink = cache.get(cacheKey);
  if (cachedLink !== null) return cachedLink === 'NONE' ? '' : cachedLink;

  try {
    var MASTER_CONFIG_SHEET_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
    var masterSs = _getSpreadsheet(MASTER_CONFIG_SHEET_ID);
    var masterWs = masterSs.getSheetByName("smart attendance client sheet") || masterSs.getSheets()[0];
    if (!masterWs) return '';

    var data = masterWs.getDataRange().getValues();
    var headers = data[2] || data[0];
    var inputCol = -1, tpCol = -1;

    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).toLowerCase().trim();
      if (h.indexOf('input sheet id') !== -1 || h.indexOf('input link') !== -1) inputCol = c;
      if (h.indexOf('teaching plan link') !== -1 || h.indexOf('teaching plan') !== -1) tpCol = c;
    }

    if (inputCol === -1) inputCol = 4;
    if (tpCol === -1) tpCol = 6;

    for (var r = 3; r < data.length; r++) {
      var rowInputId = String(data[r][inputCol] || '').trim();
      if (rowInputId === sheetId || (sheetId && rowInputId.indexOf(sheetId) !== -1) || (rowInputId && sheetId.indexOf(rowInputId) !== -1)) {
        var tpVal = (tpCol !== -1 && tpCol < data[r].length) ? String(data[r][tpCol] || '').trim() : '';
        if (tpVal) {
          var m = tpVal.match(/\/d\/(.*?)(\/|$)/);
          var finalLink = m ? m[1] : tpVal;
          cache.put(cacheKey, finalLink, 21600);
          return finalLink;
        }
        break;
      }
    }
  } catch(e) {
    Logger.log("Error getting global teaching plan link: " + e.message);
  }
  cache.put(cacheKey, 'NONE', 21600);
  return '';
}

/* ═══════════════════════════════════════════════════════════════
   ACADEMIC INCHARGE DASHBOARD & AUTHENTICATION
   ═══════════════════════════════════════════════════════════════ */

function _getAcademicInchargeList(sheetId) {
  var list = [];
  if (!sheetId) return list;
  try {
    var ss = _getSpreadsheet(sheetId);
    if (!ss) return list;

    var sheets = ss.getSheets();
    if (!sheets || sheets.length === 0) return list;

    var priorityKeywords = ['subjects', 'client', 'config', 'faculty', 'academic', 'incharge', 'coordinator'];
    var prioritizedSheets = [];
    var remainingSheets = [];

    for (var s = 0; s < sheets.length; s++) {
      var sName = sheets[s].getName().toLowerCase();
      var isPriority = priorityKeywords.some(function(k) { return sName.indexOf(k) !== -1; });
      if (isPriority) prioritizedSheets.push(sheets[s]);
      else remainingSheets.push(sheets[s]);
    }

    var sortedSheets = prioritizedSheets.concat(remainingSheets);

    for (var sIdx = 0; sIdx < sortedSheets.length; sIdx++) {
      var sheet = sortedSheets[sIdx];
      var data = sheet.getDataRange().getValues();
      if (!data || data.length === 0) continue;

      // ── 1. Direct Label/Key-Value Search (e.g. Cell I11 = "Academic Incharge", Cell J11 = 4321) ──
      for (var r = 0; r < data.length; r++) {
        for (var c = 0; c < data[r].length; c++) {
          var cellVal = String(data[r][c] || '').toLowerCase().trim();
          if (cellVal === 'academic incharge' || cellVal === 'incharge pin' || cellVal === 'academic coordinator' || cellVal === 'incharge' || cellVal === 'academic incharge pin') {
            var valRight = (c + 1 < data[r].length) ? String(data[r][c + 1] || '').trim() : '';
            var valBelow = (r + 1 < data.length) ? String(data[r + 1][c] || '').trim() : '';
            var pinCandidate = valRight || valBelow;
            if (pinCandidate && pinCandidate.toLowerCase() !== 'link' && pinCandidate.toLowerCase() !== 'text') {
              list.push({ name: "Academic Incharge", pin: pinCandidate });
            }
          }
        }
      }

      // ── 2. Column Headers Search (e.g. Header "Academic Incharge Name", "PIN") ──
      var inchargeCol = -1;
      var pinCol = -1;
      var headerRowIdx = -1;

      for (var r = 0; r < Math.min(data.length, 15); r++) {
        var row = data[r];
        var foundIncharge = -1;
        var foundPin = -1;
        for (var c = 0; c < row.length; c++) {
          var val = String(row[c] || '').toLowerCase().trim();
          if (val.indexOf('academic incharge') !== -1 || val.indexOf('academic coordinator') !== -1 || (val.indexOf('incharge') !== -1 && val.indexOf('name') !== -1) || val.indexOf('coordinator') !== -1) {
            foundIncharge = c;
          }
          if (val.indexOf('pin') !== -1 || val.indexOf('password') !== -1 || val.indexOf('passcode') !== -1) {
            foundPin = c;
          }
        }
        if (foundIncharge !== -1 && foundPin !== -1) {
          inchargeCol = foundIncharge;
          pinCol = foundPin;
          headerRowIdx = r;
          break;
        }
      }

      if (inchargeCol !== -1 && pinCol !== -1 && headerRowIdx !== -1) {
        for (var i = headerRowIdx + 1; i < data.length; i++) {
          var nameVal = String(data[i][inchargeCol] || '').trim();
          var pinVal = String(data[i][pinCol] || '').trim();
          if (nameVal && pinVal) {
            list.push({ name: nameVal, pin: pinVal });
          }
        }
      }

      // ── 3. Proximity Fallback Search ──
      if (list.length === 0) {
        for (var r2 = 0; r2 < data.length; r2++) {
          for (var c2 = 0; c2 < data[r2].length; c2++) {
            var cellVal = String(data[r2][c2] || '').toLowerCase().trim();
            if (cellVal.indexOf('incharge') !== -1 || cellVal.indexOf('coordinator') !== -1) {
              var candName = (c2 + 1 < data[r2].length && String(data[r2][c2 + 1] || '').trim()) ? String(data[r2][c2 + 1]).trim() : '';
              var candPin = '';
              var minR = Math.max(0, r2 - 2), maxR = Math.min(data.length - 1, r2 + 2);
              var minC = Math.max(0, c2 - 2), maxC = Math.min(data[r2].length - 1, c2 + 3);

              for (var pr = minR; pr <= maxR; pr++) {
                for (var pc = minC; pc <= maxC; pc++) {
                  var pVal = String(data[pr][pc] || '').toLowerCase().trim();
                  if (pVal.indexOf('pin') !== -1 || pVal.indexOf('password') !== -1) {
                    if (pc + 1 < data[pr].length && String(data[pr][pc + 1] || '').trim()) candPin = String(data[pr][pc + 1]).trim();
                    else if (pr + 1 < data.length && String(data[pr + 1][pc] || '').trim()) candPin = String(data[pr + 1][pc]).trim();
                  }
                  if (candPin) break;
                }
                if (candPin) break;
              }

              if (candName && candPin) {
                list.push({ name: candName, pin: candPin });
              } else if (candName && !isNaN(parseInt(candName))) {
                list.push({ name: "Academic Incharge", pin: candName });
              }
            }
          }
        }
      }

      if (list.length > 0) return list;
    }
  } catch(e) {
    Logger.log("_getAcademicInchargeList error: " + e.message);
  }
  return list;
}

function getAcademicIncharges(sheetId) {
  try {
    var rawList = _getAcademicInchargeList(sheetId);
    var incharges = [];
    var seen = {};
    for (var i = 0; i < rawList.length; i++) {
      var item = rawList[i];
      if (item && item.name && !seen[item.name]) {
        seen[item.name] = true;
        incharges.push({ name: item.name });
      }
    }
    return { success: true, incharges: incharges };
  } catch(e) {
    return { success: false, error: e.message, incharges: [] };
  }
}

function academicInchargeLogin(name, pin, sheetId) {
  try {
    if (!pin) {
      return { success: false, error: "Security PIN is required." };
    }
    var list = _getAcademicInchargeList(sheetId);
    var targetPin = String(pin).trim();
    var targetName = name ? String(name).trim().toLowerCase() : '';

    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      var itemName = String(item.name || '').trim();
      var itemPin = String(item.pin || '').trim();

      if (targetName) {
        if (itemName.toLowerCase() === targetName && itemPin === targetPin) {
          return { success: true, name: itemName };
        }
      } else {
        if (itemPin === targetPin) {
          return { success: true, name: itemName || "Academic Incharge" };
        }
      }
    }
    return { success: false, error: "Invalid PIN or Incharge not found." };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function getInchargeDashboard(sheetId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'dash_v48_' + sheetId;
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }

  try {
    var ss = _getSpreadsheet(sheetId);
    var ws = ss.getSheetByName('subjects');
    if (!ws) {
      return { success: false, error: "Subjects sheet not found." };
    }

    var data = ws.getDataRange().getValues();
    if (!data || data.length <= 1) {
      return { success: false, error: "No subjects data available." };
    }

    var cols = _mapSubjectCols(data[0] || []);
    var facultyMap = {};
    var subjectCodeSet = {};
    var subjectRefMap = {};
    var distinctCodes = [];
    var collegeName = "";
    var managementName = "";

    for (var i = 1; i < data.length; i++) {
      var rawFaculty = String(data[i][cols.faculty] || '').trim();
      var sCode = String(data[i][cols.code] || '').trim();
      var sName = String(data[i][cols.name] || '').trim();
      var sYear = String(data[i][cols.year] || '').trim();
      var sSem = String(data[i][cols.semester] || '').trim();
      var rawBatches = cols.batches !== -1 && data[i][cols.batches] !== undefined ? String(data[i][cols.batches]).trim() : '';

      if (!sCode) continue;

      if (!subjectCodeSet[sCode]) {
        subjectCodeSet[sCode] = true;
        distinctCodes.push(sCode);
        subjectRefMap[sCode] = {
          code: sCode,
          name: sName,
          cleanCode: _parseSubjectCode(sCode, '', sName).cleanBaseCode,
          cleanName: String(sName || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
        };
      }

      var facList = rawFaculty ? rawFaculty.split(',').map(function(x) { return x.trim(); }) : ['Unassigned'];
      // Filter out duplicate faculty names in the same row
      var uniqueFacList = [];
      for (var f = 0; f < facList.length; f++) {
        var fn = facList[f];
        if (fn && uniqueFacList.indexOf(fn) === -1) {
          uniqueFacList.push(fn);
        }
      }
      var isPracSub = (_parseSubjectCode(sCode, '', sName).isPractical);

      for (var f = 0; f < uniqueFacList.length; f++) {
        var facName = uniqueFacList[f];
        if (!facName) continue;
        if (!facultyMap[facName]) facultyMap[facName] = [];

        var explicitBatch = _parseFacultyBatches(rawBatches, facName);
        if (!explicitBatch) {
          explicitBatch = _parseSubjectCode(sCode, '', sName).batch;
        }
        if (!explicitBatch && isPracSub && uniqueFacList.length > 1) {
          explicitBatch = 'Batch ' + String.fromCharCode(65 + f);
        } else if (explicitBatch && !/^batch/i.test(explicitBatch)) {
          explicitBatch = 'Batch ' + explicitBatch;
        }

        // Only practical subjects split into multi-batch cards
        var batchList = [];
        if (isPracSub && explicitBatch && /^Batch\s+/i.test(explicitBatch)) {
          var afterBatch = explicitBatch.replace(/^Batch\s+/i, '');
          var bParts = afterBatch.split(',').map(function(x){ return x.trim(); }).filter(Boolean);
          if (bParts.length > 1) {
            batchList = bParts.map(function(b){ return 'Batch ' + b; });
          }
        }

        function addFacultySubject(item) {
          var isDuplicate = facultyMap[facName].some(function(existing) {
            if (existing.code !== item.code) return false;
            if (isPracSub) {
              return (existing.batch || '') === (item.batch || '');
            }
            return true; // For theory subjects, same faculty + same code = duplicate
          });
          if (!isDuplicate) {
            facultyMap[facName].push(item);
          }
        }

        if (batchList.length > 1) {
          for (var bi = 0; bi < batchList.length; bi++) {
            addFacultySubject({
              code: sCode,
              name: sName,
              year: sYear,
              semester: sSem,
              faculty: facName,
              batches: batchList[bi],
              batch: batchList[bi]
            });
          }
        } else {
          addFacultySubject({
            code: sCode,
            name: sName,
            year: sYear,
            semester: sSem,
            faculty: facName,
            batches: rawBatches,
            batch: (isPracSub ? explicitBatch : '') || ''
          });
        }
      }
    }

    var collegeIds = _getCollegeSheetIds(sheetId);
    var subjectPlanMap = {};

    // ── 1. Scan Teaching Plan Spreadsheet (planned topics + executed dates) ──
    try {
      var tpId = collegeIds.teachingPlanId;
      if (tpId) {
        var cleanTpId = extractSpreadsheetId(tpId);
        if (cleanTpId) {
          var tpSs = _getSpreadsheet(cleanTpId);
          if (tpSs) {
            var tpSheets = tpSs.getSheets();
            for (var s = 0; s < tpSheets.length; s++) {
              var sheet = tpSheets[s];
              var sheetName = sheet.getName().trim();
              var parsedSheet = _parseSubjectCode(sheetName);
              var cleanSheetName = sheetName.toUpperCase().replace(/[^A-Z0-9]/g, '');
              var sheetData = sheet.getDataRange().getValues();
              if (!sheetData || sheetData.length <= 1) continue;

              var headerRowIdx = -1;
              for (var r = 0; r < Math.min(sheetData.length, 25); r++) {
                var rowStr = sheetData[r].join(' ').toLowerCase();
                if (rowStr.indexOf('lecture no') !== -1 || rowStr.indexOf('sr. no') !== -1 || rowStr.indexOf('sr no') !== -1 || rowStr.indexOf('practical no') !== -1 || rowStr.indexOf('experiment') !== -1 || rowStr.indexOf('unit') !== -1 || rowStr.indexOf('details of topic') !== -1 || rowStr.indexOf('syllabus') !== -1) {
                  headerRowIdx = r;
                  break;
                }
              }
              if (headerRowIdx === -1) headerRowIdx = 14;

              // Dynamically locate column indices
              var colIdxSyllabus = -1;
              var colIdxPlanned = -1;
              var colIdxExecuted = -1;
              var headerRow = sheetData[headerRowIdx] || [];
              for (var c = 0; c < headerRow.length; c++) {
                var h = String(headerRow[c] || '').toLowerCase().trim();
                if (h.indexOf('syllabus') !== -1 || h.indexOf('topic') !== -1 || h.indexOf('details') !== -1 || h.indexOf('content') !== -1) {
                  if (colIdxSyllabus === -1) colIdxSyllabus = c;
                }
                if (h.indexOf('planned') !== -1 || h.indexOf('proposed') !== -1 || h.indexOf('tentative') !== -1) {
                  if (colIdxPlanned === -1) colIdxPlanned = c;
                }
                if (h.indexOf('executed') !== -1 || h.indexOf('actual') !== -1 || h.indexOf('conducted') !== -1 || h.indexOf('completed') !== -1 || h.indexOf('date of completion') !== -1) {
                  if (colIdxExecuted === -1) colIdxExecuted = c;
                }
              }
              if (colIdxSyllabus === -1) colIdxSyllabus = 2;
              if (colIdxExecuted === -1) colIdxExecuted = (colIdxPlanned !== -1 ? colIdxPlanned + 1 : 4);

              // Check top rows for explicit Total Lectures / Practical cell written by teacher
              var headerTotalPlanned = 0;
              try {
                for (var hr = 0; hr < Math.min(sheetData.length, 20); hr++) {
                  for (var hc = 0; hc < sheetData[hr].length; hc++) {
                    var cellVal = String(sheetData[hr][hc] || '').toLowerCase().trim();
                    if (cellVal.indexOf('total lectures/practical') !== -1 || cellVal.indexOf('total lectures') !== -1 || cellVal.indexOf('total practicals') !== -1 || cellVal.indexOf('total planned') !== -1) {
                      for (var hc2 = hc + 1; hc2 < sheetData[hr].length; hc2++) {
                        var val = parseInt(sheetData[hr][hc2]);
                        if (!isNaN(val) && val > 0) {
                          headerTotalPlanned = val;
                          break;
                        }
                      }
                    }
                    if (headerTotalPlanned > 0) break;
                  }
                  if (headerTotalPlanned > 0) break;
                }
              } catch(e) {}

              var topicsCount = 0;
              var conductedCount = 0;

              for (var r = headerRowIdx + 1; r < sheetData.length; r++) {
                var row = sheetData[r];
                var rawSyl = row[colIdxSyllabus];
                var syllabus = '';
                if (rawSyl && !isDateOrNumberVal(rawSyl)) {
                  syllabus = String(rawSyl).trim();
                }
                if (!syllabus) {
                  for (var c = 0; c < row.length; c++) {
                    var strCell = String(row[c] || '').trim();
                    if (strCell.length > 0 && !isDateOrNumberVal(row[c]) && strCell.indexOf('Total') === -1 && strCell.indexOf('Signature') === -1) {
                      syllabus = strCell;
                      break;
                    }
                  }
                }
                if (syllabus && syllabus.indexOf('Total') === -1 && syllabus.indexOf('Signature') === -1) {
                  topicsCount++;
                  var executedVal = row[colIdxExecuted];
                  if (executedVal !== undefined && executedVal !== null && String(executedVal).trim() !== '' && String(executedVal).trim() !== '-') {
                    conductedCount++;
                  }
                }
              }

              var finalPlannedTopics = (headerTotalPlanned > 0) ? headerTotalPlanned : topicsCount;
              var statsObj = { totalLectures: finalPlannedTopics, totalConducted: conductedCount };

              // Match this tab stats to any subject code or name
              for (var c = 0; c < distinctCodes.length; c++) {
                var code = distinctCodes[c];
                var subRef = subjectRefMap[code] || {};
                var parsedCode = _parseSubjectCode(code, '', subRef.name);
                var isMatch = false;

                if (parsedSheet.cleanBaseCode === parsedCode.cleanBaseCode ||
                    cleanSheetName.indexOf(parsedCode.cleanBaseCode) !== -1 ||
                    sheetName.toLowerCase().indexOf(code.toLowerCase()) !== -1) {
                  isMatch = true;
                } else if (subRef.cleanName && (cleanSheetName.indexOf(subRef.cleanName) !== -1 || subRef.cleanName.indexOf(cleanSheetName) !== -1)) {
                  isMatch = true;
                } else if (subRef.name && sheetName.toLowerCase().indexOf(subRef.name.toLowerCase()) !== -1) {
                  isMatch = true;
                }

                if (isMatch) {
                  var tpBatch = parsedSheet.batch ? parsedSheet.batch.replace(/\s+/g, '').toUpperCase() : '';
                  if (tpBatch) {
                    subjectPlanMap[code + '|' + tpBatch] = statsObj;
                  }
                  if (!subjectPlanMap[code] || subjectPlanMap[code].totalLectures < statsObj.totalLectures) {
                    subjectPlanMap[code] = statsObj;
                  }
                }
              }
            }
          }
        }
      }
    } catch(tpErr) {
      Logger.log("Batch teaching plan scan error: " + tpErr.message);
    }

    // ── 2. Scan Attendance Output Spreadsheet (actual conducted attendance lectures & average attendance) ──
    var attendanceConductedMap = {};
    var attendanceAvgMap = {};
    var facultyBatchMap = {};
    var totalCollegeP = 0;
    var totalCollegeAttMarks = 0;

    try {
      var outId = collegeIds.outputSheetId || getOutputSheetId(sheetId);
      if (outId) {
        var cleanOutId = extractSpreadsheetId(outId);
        if (cleanOutId) {
          var outSs = _getSpreadsheet(cleanOutId);
          if (outSs) {
            var outSheets = outSs.getSheets();
            for (var s = 0; s < outSheets.length; s++) {
              var oSheet = outSheets[s];
              var oName = oSheet.getName().trim();
              var parsedOSheet = _parseSubjectCode(oName);
              var cleanOName = oName.toUpperCase().replace(/[^A-Z0-9]/g, '');
              
              var lc = oSheet.getLastColumn();
              var lr = oSheet.getLastRow();
              if (lc < 4 || lr < 3) continue;

              var sampleData = oSheet.getRange(1, 1, Math.min(15, lr), lc).getValues();
              var hdrIdx = -1;
              for (var r = 0; r < sampleData.length; r++) {
                var rowStr = sampleData[r].map(function(c) { return String(c || '').toLowerCase().trim(); }).join('|');
                if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
                  hdrIdx = r;
                  break;
                }
              }
              if (hdrIdx === -1) hdrIdx = 5;

              var rawHeaders = sampleData[hdrIdx] || [];
              var nameCol = -1;
              var totalPCol = -1;
              for (var c = 0; c < rawHeaders.length; c++) {
                var v = String(rawHeaders[c] || '').toLowerCase().trim();
                if (v.indexOf('name') !== -1 && nameCol === -1) nameCol = c;
                if (v.indexOf('total p') !== -1 || v.indexOf('total') !== -1 || v.indexOf('% att') !== -1) {
                  totalPCol = c;
                  break;
                }
              }
              if (nameCol === -1) nameCol = 1;
              if (totalPCol === -1) totalPCol = rawHeaders.length;

              var conductedLecturesInSheet = 0;
              for (var c = nameCol + 1; c < totalPCol; c++) {
                var cellV = rawHeaders[c];
                if (cellV !== undefined && cellV !== null && String(cellV).trim() !== '') {
                  conductedLecturesInSheet++;
                }
              }

              // Extract verified faculty and batch from attendance output sheet headers
              var sheetBatch = parsedOSheet.batch || '';
              var sheetFaculty = '';
              for (var sr = 0; sr < Math.min(sampleData.length, 6); sr++) {
                for (var sc = 0; sc < sampleData[sr].length; sc++) {
                  var cStr = String(sampleData[sr][sc] || '').toLowerCase().trim();
                  if (cStr.indexOf('batch') !== -1 && !sheetBatch) {
                    var bVal = String(sampleData[sr][sc + 1] || '').trim();
                    if (bVal && bVal.toLowerCase() !== 'batch') sheetBatch = bVal;
                  }
                  if ((cStr.indexOf('faculty') !== -1 || cStr.indexOf('teacher') !== -1 || cStr.indexOf('staff') !== -1) && !sheetFaculty) {
                    var fVal = String(sampleData[sr][sc + 1] || '').trim();
                    if (fVal) sheetFaculty = fVal;
                  }
                }
              }
              if (sheetBatch && !/^batch/i.test(sheetBatch)) {
                sheetBatch = 'Batch ' + sheetBatch;
              }
              if (sheetBatch && sheetFaculty) {
                facultyBatchMap[sheetFaculty.toLowerCase() + '_' + parsedOSheet.cleanBaseCode] = sheetBatch;
              }

              // Compute average student attendance % for this sheet tab
              var subP = 0;
              var subMarks = 0;
              if (conductedLecturesInSheet > 0 && lr > hdrIdx + 1) {
                var numRows = Math.min(150, lr - hdrIdx - 1);
                var attGrid = oSheet.getRange(hdrIdx + 2, nameCol + 2, numRows, conductedLecturesInSheet).getValues();
                for (var gr = 0; gr < attGrid.length; gr++) {
                  for (var gc = 0; gc < attGrid[gr].length; gc++) {
                    var mVal = String(attGrid[gr][gc] || '').toUpperCase().trim();
                    if (mVal === 'P' || mVal === '1') {
                      subP++;
                      subMarks++;
                    } else if (mVal === 'A' || mVal === '0') {
                      subMarks++;
                    }
                  }
                }
              }
              var sheetAvgAtt = subMarks > 0 ? Math.round((subP / subMarks) * 100) : 0;
              totalCollegeP += subP;
              totalCollegeAttMarks += subMarks;

              // Map to matching subject codes
              for (var c = 0; c < distinctCodes.length; c++) {
                var dCode = distinctCodes[c];
                var subRef = subjectRefMap[dCode] || {};
                var parsedDCode = _parseSubjectCode(dCode, '', subRef.name);
                var isMatch = false;

                if (parsedOSheet.cleanBaseCode === parsedDCode.cleanBaseCode ||
                    cleanOName.indexOf(parsedDCode.cleanBaseCode) !== -1 ||
                    oName.toLowerCase().indexOf(dCode.toLowerCase()) !== -1) {
                  isMatch = true;
                } else if (subRef.cleanName && (cleanOName.indexOf(subRef.cleanName) !== -1 || subRef.cleanName.indexOf(cleanOName) !== -1)) {
                  isMatch = true;
                } else if (subRef.name && oName.toLowerCase().indexOf(subRef.name.toLowerCase()) !== -1) {
                  isMatch = true;
                }

                if (isMatch) {
                  if (sheetBatch) {
                    var batchAttKey = dCode + '|' + sheetBatch.replace(/\s+/g, '').toUpperCase();
                    attendanceConductedMap[batchAttKey] = conductedLecturesInSheet;
                    if (sheetAvgAtt > 0) {
                      attendanceAvgMap[batchAttKey] = sheetAvgAtt;
                    }
                  } else {
                    attendanceConductedMap[dCode] = Math.max(attendanceConductedMap[dCode] || 0, conductedLecturesInSheet);
                    if (sheetAvgAtt > 0) {
                      attendanceAvgMap[dCode] = sheetAvgAtt;
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch (outErr) {
      Logger.log("Batch attendance output scan error: " + outErr.message);
    }

    // ── 3. Assemble Final Stats for Each Faculty ──
    var faculties = [];
    var grandTotalLectures = 0;
    var grandTotalConducted = 0;
    var grandTotalSubjects = 0;

    var facKeys = Object.keys(facultyMap);
    for (var k = 0; k < facKeys.length; k++) {
      var fac = facKeys[k];
      var subs = facultyMap[fac];
      var facLectures = 0;
      var facConducted = 0;
      var facAttSum = 0;
      var facAttCount = 0;

      for (var s = 0; s < subs.length; s++) {
        var sCode = subs[s].code;
        var sBatch = subs[s].batch ? subs[s].batch.replace(/\s+/g, '').toUpperCase() : '';
        var batchKey = sBatch ? sCode + '|' + sBatch : '';

        // 1. Plan lookup: batch-specific plan first, then subject code plan
        var planInfo = (batchKey && subjectPlanMap[batchKey]) || subjectPlanMap[sCode] || null;
        var hasPlan = !!(planInfo && planInfo.totalLectures > 0);
        var plannedTotal = hasPlan ? planInfo.totalLectures : 0;
        var planConducted = hasPlan ? (planInfo.totalConducted || 0) : 0;

        // 2. Attendance conducted lookup: batch-specific attendance first, then subject code attendance
        var attConducted = (batchKey && attendanceConductedMap[batchKey] !== undefined)
          ? attendanceConductedMap[batchKey]
          : (attendanceConductedMap[sCode] || 0);

        // 3. Final conducted: prefer teaching plan executed count, fallback to attendance conducted count
        var finalConducted = planConducted > 0 ? planConducted : attConducted;

        // 4. Calculate Total & Percent (Never fabricate planned total from conducted count!)
        var finalTotal = plannedTotal;
        var finalPct = 0;
        if (hasPlan && finalTotal > 0) {
          finalPct = Math.round((Math.min(finalConducted, finalTotal) / finalTotal) * 100);
        }

        var subAvgAtt = (batchKey && attendanceAvgMap[batchKey]) || attendanceAvgMap[sCode] || 0;

        subs[s].totalLectures = finalTotal;
        subs[s].totalConducted = finalConducted;
        subs[s].percent = finalPct;
        subs[s].avgAttendance = subAvgAtt;
        subs[s].hasTeachingPlan = hasPlan;

        // Apply verified batch from attendance output if available and batch not already assigned
        var cleanCode = _parseSubjectCode(sCode).cleanBaseCode;
        var verifiedBatch = facultyBatchMap[fac.toLowerCase() + '_' + cleanCode];
        if (verifiedBatch && !subs[s].batch) {
          subs[s].batch = verifiedBatch;
        }

        if (hasPlan) {
          facLectures += finalTotal;
          facConducted += Math.min(finalConducted, finalTotal);
        }
        if (subAvgAtt > 0) {
          facAttSum += subAvgAtt;
          facAttCount++;
        }
      }

      var facPct = facLectures > 0 ? Math.round((facConducted / facLectures) * 100) : 0;
      var facAvgAtt = facAttCount > 0 ? Math.round(facAttSum / facAttCount) : 0;

      grandTotalLectures += facLectures;
      grandTotalConducted += facConducted;
      grandTotalSubjects += subs.length;

      faculties.push({
        faculty: fac,
        totalSubjects: subs.length,
        totalLectures: facLectures,
        totalConducted: facConducted,
        overallPercent: facPct,
        avgAttendance: facAvgAtt,
        subjects: subs
      });
    }

    var avgCoverage = grandTotalLectures > 0 ? Math.round((grandTotalConducted / grandTotalLectures) * 100) : 0;
    var overallCollegeAvgAtt = totalCollegeAttMarks > 0 ? Math.round((totalCollegeP / totalCollegeAttMarks) * 100) : 0;

    var result = {
      success: true,
      collegeName: collegeName || "Institutional Workspace",
      managementName: managementName || "Academic Management",
      overallStats: {
        totalFaculties: faculties.length,
        totalSubjects: grandTotalSubjects,
        totalLectures: grandTotalLectures,
        totalConducted: grandTotalConducted,
        avgCoveragePercent: avgCoverage,
        overallAvgAttendance: overallCollegeAvgAtt
      },
      faculties: faculties
    };

    try { cache.put(cacheKey, JSON.stringify(result), 300); } catch(ce) {}
    return result;
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════
   BULK SESSION DATA — Single endpoint for all session data
   Replaces multiple API calls (getAllData, getInchargeDashboard,
   getStudents, getAttendance, getAcademicIncharges) with one.
   ═══════════════════════════════════════════════════════════════ */

function getBulkSessionData(sheetId) {
  try {
    // ── 1. Core data (subjects, teachers, config, attendanceLimit) ──
    var allData = getAllData(sheetId);

    // ── 2. Incharges ──
    var inchargesData = getAcademicIncharges(sheetId);

    // ── 3. Dashboard (faculties with syllabus/attendance stats) ──
    var dashboardData = getInchargeDashboard(sheetId);

    // ── 4. Students per class year ──
    var studentsMap = {};
    var classYears = {};
    var subjects = allData.subjects || [];
    for (var i = 0; i < subjects.length; i++) {
      var yr = String(subjects[i].year || '').trim();
      if (yr && !classYears[yr]) classYears[yr] = true;
    }
    // Also scan dashboard faculties for class years
    if (dashboardData && dashboardData.faculties) {
      for (var f = 0; f < dashboardData.faculties.length; f++) {
        var facSubs = dashboardData.faculties[f].subjects || [];
        for (var s = 0; s < facSubs.length; s++) {
          var sy = String(facSubs[s].year || '').trim();
          if (sy && !classYears[sy]) classYears[sy] = true;
        }
      }
    }
    var classNames = Object.keys(classYears);
    for (var c = 0; c < classNames.length; c++) {
      var className = classNames[c];
      try {
        var studRes = getStudents(className, '', sheetId);
        if (studRes && studRes.success && studRes.students) {
          studentsMap[className] = studRes.students;
        }
      } catch (e) {
        Logger.log('getBulkSessionData: getStudents(' + className + ') error: ' + e.message);
      }
    }

    // ── 5. Subjects with outputSheetId (enriched) ──
    var enrichedSubjects = [];
    var uniqueOutIds = {};
    try {
      var subjRes = getSubjects('', sheetId);
      if (subjRes && subjRes.success && subjRes.subjects) {
        enrichedSubjects = subjRes.subjects;
        for (var s = 0; s < enrichedSubjects.length; s++) {
          if (enrichedSubjects[s].outputSheetId) {
            uniqueOutIds[enrichedSubjects[s].outputSheetId] = true;
          }
        }
      }
    } catch (e) {
      Logger.log('getBulkSessionData: getSubjects error: ' + e.message);
    }
    
    // Fallback if no subjects found
    if (Object.keys(uniqueOutIds).length === 0) {
      var defId = getOutputSheetId(sheetId);
      if (defId) uniqueOutIds[defId] = true;
    }

    // ── 6. ALL attendance records from all output spreadsheets ──
    var attendanceData = { success: false, records: [] };
    var allRecords = [];
    var attSuccess = false;
    for (var outId in uniqueOutIds) {
      try {
        var attRes = _getAttendanceUncached('', '', '', outId, sheetId);
        if (attRes && attRes.success && attRes.records) {
          allRecords = allRecords.concat(attRes.records);
          attSuccess = true;
        }
      } catch (e) {
        Logger.log('getBulkSessionData: attendance fetch error for ' + outId + ': ' + e.message);
      }
    }
    attendanceData = { success: attSuccess, records: allRecords };

    // ── Assemble final response ──
    return {
      success: true,
      _bulkSession: true,
      // Core data
      teachers: allData.teachers || [],
      subjects: allData.subjects || [],
      enrichedSubjects: enrichedSubjects,
      attendanceLimit: allData.attendanceLimit || 75,
      config: allData.config || {},
      // Incharges
      incharges: (inchargesData && inchargesData.incharges) || [],
      // Dashboard
      dashboard: dashboardData || { success: false },
      // Students keyed by class year
      students: studentsMap,
      // All attendance records
      attendance: {
        success: !!(attendanceData && attendanceData.success),
        records: (attendanceData && attendanceData.records) || []
      }
    };
  } catch (err) {
    return { success: false, error: 'getBulkSessionData failed: ' + err.message };
  }
}


function dbToDisplay(db) {
  if (!db) return '';
  var m = String(db), s = ""; if (m.indexOf(' (') !== -1) { s = m.substring(m.indexOf(' (')); m = m.substring(0, m.indexOf(' (')); }
  var p = m.split('_')[0].split('-'); if (p.length < 3) return m + s;
  var mos = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var dd = parseInt(p[2]); var dStr = dd < 10 ? '0' + dd : String(dd);
  return dStr + '-' + mos[parseInt(p[1])-1] + s;
}

function displayToDb(disp) {
  var m = String(disp), s = ""; if (m.indexOf(' (') !== -1) { s = m.substring(m.indexOf(' (')); m = m.substring(0, m.indexOf(' (')); }
  var p = m.split('-'); if (p.length !== 2) return disp;
  var mos = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mi = mos.indexOf(p[1]) + 1;
  var mm = mi < 10 ? '0' + mi : String(mi);
  var dd = parseInt(p[0]); var dStr = dd < 10 ? '0' + dd : String(dd);
  return new Date().getFullYear() + '-' + mm + '-' + dStr + s;
}



function getAttendance(code, year, date, outputSheetId, sheetId) {
  var cleanOutId = extractSpreadsheetId(outputSheetId || getOutputSheetId(sheetId));
  var cacheKey = 'attrep_v2_' + (code || '') + '_' + (year || '') + '_' + (date || '') + '_' + (cleanOutId || '');
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }
  var result = _getAttendanceUncached(code, year, date, outputSheetId, sheetId);
  if (result && result.success) {
    try {
      var jsonStr = JSON.stringify(result);
      if (jsonStr.length < 95000) {
        cache.put(cacheKey, jsonStr, 300);
      }
    } catch(ce) {}
  }
  return result;
}

function _getAttendanceUncached(code, year, date, outputSheetId, sheetId) {
  if (!outputSheetId) outputSheetId = getOutputSheetId(sheetId);
  var cleanOutId = extractSpreadsheetId(outputSheetId);
  if (!cleanOutId) return { error: 'Invalid Output Sheet Link' };
  var outSs; try { outSs = SpreadsheetApp.openById(cleanOutId); } catch(e) { return { error: 'Scan Fail: ' + e.message }; }
  var res = [], sheets = outSs.getSheets();
  var parsedInput = code ? _parseSubjectCode(code) : { cleanBaseCode: '' };
  
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i], name = s.getName();
    var parsedSheetCode = _parseSubjectCode(name);
    var cleanSheetName = name.toUpperCase().replace(/[^A-Z0-9]/g, '');

    var isMatch = (!code || code === '*' || code === 'all');
    if (!isMatch) {
      if (parsedSheetCode.cleanBaseCode === parsedInput.cleanBaseCode ||
          cleanSheetName.indexOf(parsedInput.cleanBaseCode) !== -1 ||
          (parsedSheetCode.cleanBaseCode && parsedInput.cleanBaseCode && parsedSheetCode.cleanBaseCode.indexOf(parsedInput.cleanBaseCode) !== -1)) {
        isMatch = true;
      }
    }
    if (!isMatch) continue;

    var batch = name.indexOf(" - Batch ") !== -1 ? name.substring(name.indexOf(" - Batch ") + 9).trim() : "";
    var lc = s.getLastColumn(), lr = s.getLastRow();
    if (lc < 4 || lr < 3) continue;
    
    var attData = s.getDataRange().getValues();
    if (!attData || attData.length < 3) continue;

    var hdrRowIdx = -1;
    for (var r = 0; r < Math.min(attData.length, 30); r++) {
      var rowStr = attData[r].map(function(cell) { return String(cell || '').toLowerCase().trim(); }).join('|');
      if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
        hdrRowIdx = r;
        break;
      }
    }
    if (hdrRowIdx === -1) {
      hdrRowIdx = 5;
    }
    if (attData.length <= hdrRowIdx + 2) continue;

    var rawHeaders = attData[hdrRowIdx] || [];
    var nextHeaders = attData[hdrRowIdx + 1] || [];
    
    var hdrs = rawHeaders.map(function(cell, idx) {
      var val = cell;
      if (!val && nextHeaders[idx]) {
        val = nextHeaders[idx]; // Fallback to next row if current is empty (e.g. dates in row 6)
      }
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, outSs.getSpreadsheetTimeZone(), 'yyyy-MM-dd'); } catch(e) {}
      }
      return String(val || '').trim();
    });
    
    var rollColIdx = -1;
    var nameColIdx = -1;
    var totalPColIdx = -1;
    for (var c = 0; c < hdrs.length; c++) {
      var val = hdrs[c].toLowerCase().trim();
      if (val.indexOf('roll') !== -1 && rollColIdx === -1) {
        rollColIdx = c;
      }
      if (val.indexOf('name') !== -1 && nameColIdx === -1) {
        nameColIdx = c;
      }
      if (val.indexOf('total p') !== -1 || val.indexOf('% att') !== -1) {
        if (totalPColIdx === -1) totalPColIdx = c;
      }
    }
    if (rollColIdx === -1) rollColIdx = 0;
    if (nameColIdx === -1) nameColIdx = 1;
    if (totalPColIdx === -1) {
      for (var c = 0; c < hdrs.length; c++) {
        var val = hdrs[c].toLowerCase().trim();
        if (val.indexOf('total') !== -1 || val.indexOf('% att') !== -1) {
           totalPColIdx = c;
           break;
        }
      }
    }
    if (totalPColIdx === -1) totalPColIdx = hdrs.length;

    var dates = [];
    var firstDateColIdx = Math.max(rollColIdx, nameColIdx) + 1;
    for (var c = firstDateColIdx; c < totalPColIdx; c++) {
       if (hdrs[c]) dates.push({ index: c, disp: hdrs[c] });
    }
    if (dates.length === 0) continue;

    var effectiveCode = (code && code !== '*' && code !== 'all') ? code : (parsedSheetCode.cleanBaseCode || name);
    var topicRow = attData[hdrRowIdx + 1] || [];
    for (var r = hdrRowIdx + 2; r < attData.length; r++) {
       var rowData = attData[r];
       if (!rowData || rowData.length === 0) continue;
       var rNo = rowData[rollColIdx];
       var rName = rowData[nameColIdx];
       if (!rNo && !rName) continue;

       for (var d = 0; d < dates.length; d++) {
          var colIdx = dates[d].index;
          if (colIdx >= rowData.length) continue;
          var st = String(rowData[colIdx] || '').trim();
          if (st === 'P' || st === 'A') {
             var dbD = displayToDb(dates[d].disp);
             if (date && dbD.indexOf(date) === -1) continue;
             var topicVal = colIdx < topicRow.length ? String(topicRow[colIdx] || '') : '';
             res.push({
               date: dbD,
               code: effectiveCode,
               year: year,
               batch: batch,
               faculty: "Assigned",
               rollNo: rNo,
               name: rName,
               status: st,
               topic: topicVal
             });
          }
       }
    }
  }
  return { success: true, records: res };
}

function debugAttendanceData(sheetId) {
  try {
    var collegeIds = _getCollegeSheetIds(sheetId);
    var outputSheetId = collegeIds.outputSheetId || getOutputSheetId(sheetId);
    var cleanOutId = extractSpreadsheetId(outputSheetId);
    
    // Also try subjects sheet enriched IDs
    var enrichedOutIds = [];
    try {
      var subjRes = getSubjects('', sheetId);
      if (subjRes && subjRes.success && subjRes.subjects) {
        var seen = {};
        subjRes.subjects.forEach(function(s) {
          if (s.outputSheetId && !seen[s.outputSheetId]) {
            seen[s.outputSheetId] = true;
            enrichedOutIds.push(s.outputSheetId);
          }
        });
      }
    } catch(e) {}
    
    if (!cleanOutId && enrichedOutIds.length > 0) {
      cleanOutId = extractSpreadsheetId(enrichedOutIds[0]);
    }
    
    if (!cleanOutId) return { 
      error: 'No output sheet ID found', 
      collegeIds: collegeIds,
      getOutputSheetIdResult: getOutputSheetId(sheetId),
      enrichedOutIds: enrichedOutIds,
      sheetId: sheetId
    };

    var outSs;
    try { outSs = SpreadsheetApp.openById(cleanOutId); } catch(e) { return { error: 'Cannot open: ' + e.message, id: cleanOutId }; }

    var sheets = outSs.getSheets();
    var debugInfo = {
      outputSheetId: cleanOutId,
      sheetCount: sheets.length,
      sheets: []
    };

    for (var i = 0; i < Math.min(sheets.length, 5); i++) {
      var s = sheets[i], name = s.getName();
      var lr = s.getLastRow(), lc = s.getLastColumn();
      var sheetDebug = { name: name, lastRow: lr, lastCol: lc };

      if (lr < 3 || lc < 3) { sheetDebug.skip = 'too small'; debugInfo.sheets.push(sheetDebug); continue; }

      var data = s.getRange(1, 1, Math.min(lr, 15), lc).getValues();

      // Find header row
      var hdrRowIdx = -1;
      for (var r = 0; r < Math.min(data.length, 15); r++) {
        var rowStr = data[r].map(function(c) { return String(c || '').toLowerCase().trim(); }).join('|');
        if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
          hdrRowIdx = r;
          break;
        }
      }
      sheetDebug.hdrRowIdx = hdrRowIdx;
      if (hdrRowIdx === -1) hdrRowIdx = 5;

      // Show raw header row content (first 10 cells)
      var hdrRow = data[hdrRowIdx] || [];
      sheetDebug.hdrRowRaw = hdrRow.slice(0, 10).map(function(c) {
        if (c instanceof Date) return 'DATE:' + c.toISOString();
        return String(c === null || c === undefined ? 'NULL' : c);
      });

      // Show next row content (first 10 cells)
      if (hdrRowIdx + 1 < data.length) {
        var nextRow = data[hdrRowIdx + 1] || [];
        sheetDebug.nextRowRaw = nextRow.slice(0, 10).map(function(c) {
          if (c instanceof Date) return 'DATE:' + c.toISOString();
          return String(c === null || c === undefined ? 'NULL' : c);
        });
      }

      // Show first student row (first 10 cells)
      if (hdrRowIdx + 2 < data.length) {
        var stuRow = data[hdrRowIdx + 2] || [];
        sheetDebug.firstStudentRow = stuRow.slice(0, 10).map(function(c) {
          return String(c === null || c === undefined ? 'NULL' : c);
        });
      }

      // Count dates and P/A values
      var rawH = data[hdrRowIdx] || [];
      var nextH = data[hdrRowIdx + 1] || [];
      var dateCount = 0;
      var paCount = 0;
      for (var c = 2; c < rawH.length; c++) {
        var v = rawH[c];
        var nv = nextH[c];
        if (v instanceof Date || (nv instanceof Date)) dateCount++;
        var vStr = String(v || '').trim();
        var nvStr = String(nv || '').trim();
        if (/^\d{1,2}[-\/]/.test(vStr) || /^\d{4}-\d{2}/.test(vStr)) dateCount++;
        if (/^\d{1,2}[-\/]/.test(nvStr) || /^\d{4}-\d{2}/.test(nvStr)) dateCount++;
      }
      // Check P/A in data rows
      for (var r = hdrRowIdx + 2; r < Math.min(data.length, hdrRowIdx + 5); r++) {
        for (var c = 2; c < data[r].length; c++) {
          var st = String(data[r][c] || '').trim();
          if (st === 'P' || st === 'A') paCount++;
        }
      }
      sheetDebug.dateColumnsFound = dateCount;
      sheetDebug.paCellsInFirst3Rows = paCount;

      debugInfo.sheets.push(sheetDebug);
    }

    // Also run the actual function and report record count
    try {
      var attResult = _getAttendanceUncached('', '', '', cleanOutId, sheetId);
      debugInfo.attendanceResult = {
        success: attResult && attResult.success,
        recordCount: (attResult && attResult.records) ? attResult.records.length : 0,
        error: attResult && attResult.error
      };
      if (attResult && attResult.records && attResult.records.length > 0) {
        debugInfo.attendanceResult.sampleRecord = attResult.records[0];
      }
    } catch(e) {
      debugInfo.attendanceResult = { error: e.message };
    }

    return debugInfo;
  } catch(e) {
    return { error: 'debugAttendanceData failed: ' + e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════
   ACADEMIC FILE LOGIC — SYLLABUS & TEACHING PLAN
   ═══════════════════════════════════════════════════════════════ */

function getTeachingPlan(code, teacher, sheetId, batchHint) {
  if (!code) return { success: false, error: 'Missing subject code' };
  
  function parseAndFormatDate(val, timeZone) {
    if (!val) return '';
    if (val instanceof Date || Object.prototype.toString.call(val) === '[object Date]') {
      try {
        return Utilities.formatDate(val, timeZone, 'yyyy-MM-dd');
      } catch(e) {}
    }
    var str = String(val).trim();
    var ymdRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (ymdRegex.test(str)) {
      return str;
    }
    var slashRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
    var match = str.match(slashRegex);
    if (match) {
      var d = parseInt(match[1], 10);
      var m = parseInt(match[2], 10);
      var y = parseInt(match[3], 10);
      if (y < 100) {
        y += 2000;
      }
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        try {
          var dateObj = new Date(y, m - 1, d);
          return Utilities.formatDate(dateObj, timeZone, 'yyyy-MM-dd');
        } catch(e) {}
      }
    }
    var dmyRegex = /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/;
    if (dmyRegex.test(str)) {
      return str;
    }
    try {
      var parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return Utilities.formatDate(parsed, timeZone, 'yyyy-MM-dd');
      }
    } catch(e) {}
    return str;
  }

  try {
    var targetIds = getTargetSheetIds(code, sheetId);
    if (!targetIds.teachingPlanId) {
      return { success: false, error: 'Teaching plan spreadsheet ID not found for ' + code };
    }

    var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
    var ws = _findSheetByCode(tpSs, code, '', batchHint);
    
    if (!ws) {
      return { success: false, error: 'No sheet found for subject code: ' + code + ' in Teaching Plan spreadsheet' };
    }

    var data = ws.getDataRange().getValues();
    if (!data || data.length === 0) {
      return { success: false, error: 'Teaching plan sheet is empty for ' + code };
    }

    var headerRowIdx = -1;
    for (var r = 0; r < Math.min(data.length, 25); r++) {
      var rowStr = data[r].join(' ').toLowerCase();
      if (rowStr.indexOf('lecture no') !== -1 || rowStr.indexOf('sr. no') !== -1 || rowStr.indexOf('sr no') !== -1 || rowStr.indexOf('practical no') !== -1 || rowStr.indexOf('experiment') !== -1 || rowStr.indexOf('unit') !== -1 || rowStr.indexOf('details of topic') !== -1 || rowStr.indexOf('syllabus') !== -1) {
        headerRowIdx = r;
        break;
      }
    }
    if (headerRowIdx === -1) headerRowIdx = 14;

    function findMetadataValue(keys, defaultRow, defaultCol) {
      try {
        for (var r = 0; r < Math.min(headerRowIdx, data.length); r++) {
          for (var c = 0; c < data[r].length; c++) {
            var cellVal = String(data[r][c]).toLowerCase().trim();
            for (var k = 0; k < keys.length; k++) {
              if (cellVal.indexOf(keys[k]) !== -1) {
                for (var c2 = c + 1; c2 < data[r].length; c2++) {
                  var val = String(data[r][c2]).trim();
                  if (val && val !== ':' && val !== '-') return val;
                }
                if (r + 1 < data.length) {
                  var valBelow = String(data[r+1][c]).trim();
                  if (valBelow && valBelow !== ':' && valBelow !== '-') return valBelow;
                }
              }
            }
          }
        }
        if (data[defaultRow] && data[defaultRow][defaultCol] !== undefined) {
          return String(data[defaultRow][defaultCol]).trim();
        }
      } catch(e) {}
      return '';
    }

    var managementName = findMetadataValue(["management name", "management", "society", "sinhgad"], 5, 3);
    var collegeName = findMetadataValue(["college name", "college", "institute", "rmd"], 6, 3);
    var academicYear = findMetadataValue(["academic year", "year", "ay"], 7, 3);
    var course = findMetadataValue(["course"], 8, 2);
    var classCourse = findMetadataValue(["class"], 8, 3);
    var faculty = findMetadataValue(["faculty", "teacher", "instructor"], 8, 4);
    var subject = findMetadataValue(["subject"], 8, 5);
    
    var totalLectures = 0;
    var totalTutorials = 0;
    
    try {
      var foundLectures = false;
      for (var r = 0; r < data.length; r++) {
        for (var c = 0; c < data[r].length; c++) {
          var cellVal = String(data[r][c]).toLowerCase().trim();
          if (cellVal.indexOf('total lectures/practical') !== -1 || cellVal.indexOf('total lectures') !== -1 || cellVal.indexOf('total practicals') !== -1) {
            for (var c2 = c + 1; c2 < data[r].length; c2++) {
              var val = parseInt(data[r][c2]);
              if (!isNaN(val) && val > 0) {
                totalLectures = val;
                foundLectures = true;
                break;
              }
            }
          }
          if (foundLectures) break;
        }
        if (foundLectures) break;
      }
      
      if (!foundLectures) {
        if (data[12] && data[12].length > 8) totalLectures = parseInt(data[12][8]) || 0;
        if (data[13] && data[13].length > 8) totalTutorials = parseInt(data[13][8]) || 0;
      }
    } catch(e) {}

    var headerRow = data[headerRowIdx] || [];
    var colIdxSyllabus = -1;
    var colIdxLectureNo = -1;
    var colIdxPlanned = -1;
    var colIdxExecuted = -1;
    var colIdxRemark = -1;

    for (var c = 0; c < headerRow.length; c++) {
      var h = String(headerRow[c] || '').toLowerCase().trim();
      if (!h) continue;
      if (h.indexOf('syllabus') !== -1 || h.indexOf('topic') !== -1 || h.indexOf('particular') !== -1 || h.indexOf('content') !== -1 || h.indexOf('description') !== -1 || h.indexOf('experiment') !== -1 || h.indexOf('aim of') !== -1 || h.indexOf('details of') !== -1) {
        if (colIdxSyllabus === -1) colIdxSyllabus = c;
      } else if (h.indexOf('lecture no') !== -1 || h.indexOf('lec no') !== -1 || h.indexOf('sr. no') !== -1 || h.indexOf('sr no') !== -1 || h.indexOf('practical no') !== -1) {
        if (colIdxLectureNo === -1) colIdxLectureNo = c;
      } else if (h.indexOf('planned') !== -1 || h.indexOf('proposed') !== -1 || h.indexOf('target date') !== -1 || h.indexOf('schedule') !== -1) {
        if (colIdxPlanned === -1) colIdxPlanned = c;
      } else if (h.indexOf('executed') !== -1 || h.indexOf('conducted') !== -1 || h.indexOf('actual date') !== -1 || h.indexOf('date of execution') !== -1 || h.indexOf('completed') !== -1) {
        if (colIdxExecuted === -1) colIdxExecuted = c;
      } else if (h.indexOf('remark') !== -1 || h.indexOf('pedagogy') !== -1 || h.indexOf('aid') !== -1 || h.indexOf('sign') !== -1) {
        if (colIdxRemark === -1) colIdxRemark = c;
      }
    }

    var topics = [];
    var startRow = headerRowIdx + 1;

    if (colIdxSyllabus === -1 || (data[startRow] && isDateOrNumberVal(data[startRow][colIdxSyllabus]))) {
      var bestCol = -1, maxLen = 0;
      for (var r = startRow; r < Math.min(startRow + 5, data.length); r++) {
        for (var c = 0; c < data[r].length; c++) {
          var val = data[r][c];
          if (!isDateOrNumberVal(val)) {
            var strLen = String(val || '').trim().length;
            if (strLen > maxLen && strLen > 5) {
              maxLen = strLen;
              bestCol = c;
            }
          }
        }
      }
      if (bestCol !== -1) colIdxSyllabus = bestCol;
      else if (colIdxSyllabus === -1) colIdxSyllabus = 2;
    }

    if (colIdxLectureNo === -1) colIdxLectureNo = 1;
    if (colIdxPlanned === -1) colIdxPlanned = colIdxSyllabus === 2 ? 3 : 2;
    if (colIdxExecuted === -1) colIdxExecuted = colIdxPlanned + 1;
    if (colIdxRemark === -1) colIdxRemark = 5;

    var tz = tpSs.getSpreadsheetTimeZone();

    for (var i = startRow; i < data.length; i++) {
      var row = data[i];
      var rawSyl = row[colIdxSyllabus];
      var syllabus = '';
      if (rawSyl && !isDateOrNumberVal(rawSyl)) {
        syllabus = String(rawSyl).trim();
      }
      if (!syllabus) {
        var altSyllabus = '';
        for (var c = 0; c < row.length; c++) {
          var strCell = String(row[c] || '').trim();
          if (strCell.length > 5 && !isDateOrNumberVal(row[c]) && strCell.indexOf('Total') === -1 && strCell.indexOf('Signature') === -1) {
            altSyllabus = strCell;
            break;
          }
        }
        syllabus = altSyllabus;
      }

      if (syllabus && syllabus.indexOf('Total') === -1 && syllabus.indexOf('Signature') === -1) {
        var lectNoRaw = row[colIdxLectureNo] !== undefined ? String(row[colIdxLectureNo]).trim() : String(topics.length + 1);
        var lectNo = parseInt(lectNoRaw);
        if (isNaN(lectNo)) lectNo = topics.length + 1;

        var plannedDate = parseAndFormatDate(row[colIdxPlanned], tz);
        var executedDate = parseAndFormatDate(row[colIdxExecuted], tz);
        var remark = row[colIdxRemark] !== undefined ? String(row[colIdxRemark]).trim() : '';

        topics.push({
          rowIndex: i + 1,
          lectureNo: lectNo,
          syllabus: syllabus,
          plannedDate: plannedDate,
          executedDate: executedDate,
          remark: remark
        });
      }
    }

    var uniqueTopics = [];
    var seenMap = {};
    for (var t = 0; t < topics.length; t++) {
      var topItem = topics[t];
      var key = topItem.lectureNo + '|' + topItem.syllabus;
      if (!seenMap[key]) {
        seenMap[key] = true;
        uniqueTopics.push(topItem);
      }
    }
    topics = uniqueTopics;

    // ── Auto-Detect Conducted Dates from Attendance Output Sheet if Column E is empty ──
    var conductedInPlan = topics.filter(function(t) { return t.executedDate !== ''; }).length;
    if (conductedInPlan === 0 && targetIds.outputSheetId) {
      try {
        var outSs = _getSpreadsheet(targetIds.outputSheetId);
        var outWs = _findSheetByCode(outSs, code, '', batchHint);
        if (outWs) {
          var outData = outWs.getDataRange().getValues();
          var hdrIdx = -1;
          for (var r = 0; r < Math.min(outData.length, 25); r++) {
            var rowStr = outData[r].map(function(c) { return String(c || '').toLowerCase().trim(); }).join('|');
            if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
              hdrIdx = r;
              break;
            }
          }
          if (hdrIdx === -1) hdrIdx = 5;

          var rawHeaders = outData[hdrIdx] || [];
          var nameCol = -1;
          var totalPCol = -1;
          for (var c = 0; c < rawHeaders.length; c++) {
            var v = String(rawHeaders[c] || '').toLowerCase().trim();
            if (v.indexOf('name') !== -1 && nameCol === -1) nameCol = c;
            if (v.indexOf('total p') !== -1 || v.indexOf('total') !== -1 || v.indexOf('% att') !== -1) {
              totalPCol = c;
              break;
            }
          }
          if (nameCol === -1) nameCol = 1;
          if (totalPCol === -1) totalPCol = rawHeaders.length;

          var topicRow = hdrIdx + 1 < outData.length ? outData[hdrIdx + 1] : [];
          var conductedCols = [];
          for (var c = nameCol + 1; c < totalPCol; c++) {
            var dateCell = rawHeaders[c];
            if (dateCell !== undefined && dateCell !== null && String(dateCell).trim() !== '') {
              var dYmd = parseAndFormatDate(dateCell, tz);
              var tVal = c < topicRow.length ? String(topicRow[c] || '').trim() : '';
              conductedCols.push({ dateYmd: dYmd, topic: tVal });
            }
          }

          var assignedMap = {};
          for (var ci = 0; ci < conductedCols.length; ci++) {
            var cCol = conductedCols[ci];
            var matchedTopic = -1;
            // Topic match
            if (cCol.topic && cCol.topic.length > 3) {
              var cClean = cCol.topic.toLowerCase().replace(/[^a-z0-9]/g, '');
              for (var ti = 0; ti < topics.length; ti++) {
                if (assignedMap[ti]) continue;
                var sClean = topics[ti].syllabus.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (sClean.indexOf(cClean) !== -1 || cClean.indexOf(sClean) !== -1) {
                  matchedTopic = ti;
                  break;
                }
              }
            }
            // Planned date match
            if (matchedTopic === -1 && cCol.dateYmd) {
              for (var ti = 0; ti < topics.length; ti++) {
                if (assignedMap[ti]) continue;
                if (topics[ti].plannedDate === cCol.dateYmd) {
                  matchedTopic = ti;
                  break;
                }
              }
            }
            // Sequential fallback
            if (matchedTopic === -1) {
              for (var ti = 0; ti < topics.length; ti++) {
                if (!assignedMap[ti]) {
                  matchedTopic = ti;
                  break;
                }
              }
            }
            if (matchedTopic !== -1 && cCol.dateYmd) {
              assignedMap[matchedTopic] = true;
              topics[matchedTopic].executedDate = cCol.dateYmd;
            }
          }
        }
      } catch(autoErr) {
        Logger.log("Auto-detect conducted dates error: " + autoErr.message);
      }
    }

    var conductedCount = topics.filter(function(t) { return t.executedDate !== ''; }).length;
    var percent = topics.length > 0 ? Math.round((conductedCount / topics.length) * 100) : 0;
    var parsedSubjectCodeInfo = _parseSubjectCode(code, '', subject);

    return {
      success: true,
      metadata: {
        managementName: managementName || 'Sinhgad Technical Education Society',
        collegeName: collegeName || 'RMDIPER',
        academicYear: academicYear || '2024-25',
        course: course,
        classCourse: classCourse,
        faculty: faculty,
        subject: subject,
        isPractical: parsedSubjectCodeInfo.isPractical,
        totalLectures: totalLectures,
        totalTutorials: totalTutorials,
        percent: percent,
        conductedCount: conductedCount,
        totalTopics: topics.length,
        colIdxSyllabus: colIdxSyllabus,
        colIdxLectureNo: colIdxLectureNo,
        colIdxPlanned: colIdxPlanned,
        colIdxExecuted: colIdxExecuted,
        colIdxRemark: colIdxRemark
      },
      topics: topics
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function syncTeachingPlan(code, teacher, sheetId, batchHint) {
  if (!code) return { success: false, error: 'Missing subject code' };

  try {
    var targetIds = getTargetSheetIds(code, sheetId);
    if (!targetIds.teachingPlanId || !targetIds.outputSheetId) {
      return { success: false, error: 'Spreadsheet IDs not resolved for sync' };
    }

    var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
    var tpWs = _findSheetByCode(tpSs, code, '', batchHint);
    if (!tpWs) {
      return { success: false, error: 'Teaching plan sheet not found for subject code: ' + code };
    }

    var planResult = getTeachingPlan(code, teacher, sheetId, batchHint);
    if (!planResult.success || !planResult.topics || planResult.topics.length === 0) {
      return { success: false, error: 'No teaching plan topics available to sync: ' + (planResult.error || '') };
    }

    var outSs = _getSpreadsheet(targetIds.outputSheetId);
    var outWs = _findSheetByCode(outSs, code, '', batchHint);
    if (!outWs) {
      return { success: false, error: 'Attendance matrix sheet not found for subject code: ' + code };
    }

    var outData = outWs.getDataRange().getValues();
    if (!outData || outData.length < 3) {
      return { success: false, error: 'Attendance matrix sheet contains insufficient rows' };
    }

    var hdrIdx = -1;
    for (var r = 0; r < Math.min(outData.length, 25); r++) {
      var rowStr = outData[r].map(function(c) { return String(c || '').toLowerCase().trim(); }).join('|');
      if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
        hdrIdx = r;
        break;
      }
    }
    if (hdrIdx === -1) hdrIdx = 5;

    var rawHeaders = outData[hdrIdx] || [];
    var nameCol = -1;
    var totalPCol = -1;
    for (var c = 0; c < rawHeaders.length; c++) {
      var v = String(rawHeaders[c] || '').toLowerCase().trim();
      if (v.indexOf('name') !== -1 && nameCol === -1) nameCol = c;
      if (v.indexOf('total p') !== -1 || v.indexOf('total') !== -1 || v.indexOf('% att') !== -1) {
        totalPCol = c;
        break;
      }
    }
    if (nameCol === -1) nameCol = 1;
    if (totalPCol === -1) totalPCol = rawHeaders.length;

    var tz = tpSs.getSpreadsheetTimeZone();
    var topicRow = hdrIdx + 1 < outData.length ? outData[hdrIdx + 1] : [];
    var conductedColumns = [];

    for (var c = nameCol + 1; c < totalPCol; c++) {
      var dateCell = rawHeaders[c];
      if (dateCell !== undefined && dateCell !== null && String(dateCell).trim() !== '') {
        var dateYmd = '';
        if (dateCell instanceof Date || Object.prototype.toString.call(dateCell) === '[object Date]') {
          try { dateYmd = Utilities.formatDate(dateCell, tz, 'yyyy-MM-dd'); } catch(e) {}
        }
        if (!dateYmd) {
          var str = String(dateCell).trim();
          var ymdRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (ymdRegex.test(str)) {
            dateYmd = str;
          } else {
            var slashRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
            var match = str.match(slashRegex);
            if (match) {
              var d = parseInt(match[1], 10), m = parseInt(match[2], 10), y = parseInt(match[3], 10);
              if (y < 100) y += 2000;
              if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                try { dateYmd = Utilities.formatDate(new Date(y, m - 1, d), tz, 'yyyy-MM-dd'); } catch(e) {}
              }
            }
          }
        }
        var dateDisplay = '';
        if (dateCell instanceof Date) {
          try { dateDisplay = Utilities.formatDate(dateCell, tz, 'dd/MM/yyyy'); } catch(e) {}
        } else if (dateYmd) {
          var dp = dateYmd.split('-');
          if (dp.length === 3) dateDisplay = dp[2] + '/' + dp[1] + '/' + dp[0];
        }
        if (!dateDisplay) dateDisplay = String(dateCell).trim();

        var topVal = c < topicRow.length ? String(topicRow[c] || '').trim() : '';
        conductedColumns.push({
          colIndex: c,
          dateYmd: dateYmd,
          dateDisplay: dateDisplay,
          topic: topVal
        });
      }
    }

    var colExecuted = planResult.metadata.colIdxExecuted + 1;
    var updatedCount = 0;
    var matchedTopicIndices = {};

    // 1st Pass: Match by topic text
    for (var i = 0; i < conductedColumns.length; i++) {
      var col = conductedColumns[i];
      if (col.topic && col.topic.length > 3) {
        var cleanColTopic = col.topic.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (var t = 0; t < planResult.topics.length; t++) {
          if (matchedTopicIndices[t]) continue;
          var cleanSyl = planResult.topics[t].syllabus.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (cleanSyl.indexOf(cleanColTopic) !== -1 || cleanColTopic.indexOf(cleanSyl) !== -1) {
            matchedTopicIndices[t] = col;
            col.matched = true;
            break;
          }
        }
      }
    }

    // 2nd Pass: Match by planned date
    for (var i = 0; i < conductedColumns.length; i++) {
      var col = conductedColumns[i];
      if (col.matched || !col.dateYmd) continue;
      for (var t = 0; t < planResult.topics.length; t++) {
        if (matchedTopicIndices[t]) continue;
        if (planResult.topics[t].plannedDate === col.dateYmd) {
          matchedTopicIndices[t] = col;
          col.matched = true;
          break;
        }
      }
    }

    // 3rd Pass: Sequential fallback
    var nextUnmatchedIdx = 0;
    for (var i = 0; i < conductedColumns.length; i++) {
      var col = conductedColumns[i];
      if (col.matched) continue;
      while (nextUnmatchedIdx < planResult.topics.length && matchedTopicIndices[nextUnmatchedIdx]) {
        nextUnmatchedIdx++;
      }
      if (nextUnmatchedIdx < planResult.topics.length) {
        matchedTopicIndices[nextUnmatchedIdx] = col;
        col.matched = true;
        nextUnmatchedIdx++;
      }
    }

    // Write back to Google Sheet Column E
    for (var tIdxStr in matchedTopicIndices) {
      var tIdx = parseInt(tIdxStr);
      var topicObj = planResult.topics[tIdx];
      var colObj = matchedTopicIndices[tIdx];
      if (topicObj && topicObj.rowIndex > 0 && colObj && colObj.dateDisplay) {
        tpWs.getRange(topicObj.rowIndex, colExecuted).setValue(colObj.dateDisplay);
        updatedCount++;
      }
    }

    var freshPlan = getTeachingPlan(code, teacher, sheetId, batchHint);
    return {
      success: true,
      syncedCount: updatedCount,
      percent: freshPlan.metadata.percent,
      topics: freshPlan.topics,
      metadata: freshPlan.metadata
    };
  } catch (err) {
    return { success: false, error: 'Sync failed: ' + err.message };
  }
}

function saveRemark(code, rowIndex, remark, sheetId) {
  if (!code || !rowIndex) return { success: false, error: 'Missing code or rowIndex' };

  try {
    var targetIds = getTargetSheetIds(code, sheetId);
    if (!targetIds.teachingPlanId) return { success: false, error: 'Teaching Plan ID missing' };

    var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
    var ws = _findSheetByCode(tpSs, code);
    if (!ws) return { success: false, error: 'Teaching plan tab not found' };

    var colRemark = 6;
    ws.getRange(rowIndex, colRemark).setValue(remark);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function addCustomSyllabusTopic(data, sheetId) {
  if (!data || !data.code || !data.topic) {
    return { success: false, error: 'Missing topic or subject code' };
  }
  var code = data.code;
  var targetIds = getTargetSheetIds(code, sheetId);
  var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
  var ws = _findSheetByCode(tpSs, code);
  if (!ws) return { success: false, error: 'Teaching plan tab not found for ' + code };

  var plan = getTeachingPlan(code, null, sheetId);
  var lastRow = ws.getLastRow();
  var nextLectNo = (plan.topics && plan.topics.length > 0) ? plan.topics.length + 1 : 1;

  var colSyllabus = plan.metadata.colIdxSyllabus + 1;
  var colLectNo = plan.metadata.colIdxLectureNo + 1;
  var colPlanned = plan.metadata.colIdxPlanned + 1;
  var colExecuted = plan.metadata.colIdxExecuted + 1;
  var colRemark = plan.metadata.colIdxRemark + 1;

  var maxCol = Math.max(colSyllabus, colLectNo, colPlanned, colExecuted, colRemark);
  var row = new Array(maxCol);
  for (var i = 0; i < maxCol; i++) row[i] = '';

  var dateStr = data.date || Utilities.formatDate(new Date(), tpSs.getSpreadsheetTimeZone(), 'yyyy-MM-dd');

  row[colLectNo - 1] = nextLectNo;
  row[colSyllabus - 1] = data.topic;
  row[colPlanned - 1] = dateStr;
  row[colExecuted - 1] = dateStr;
  row[colRemark - 1] = data.remark || 'Extra lecture conducted';

  ws.appendRow(row);
  return { success: true };
}

function _isAcademicCalendarsFolder(name) {
  if (!name) return false;
  var n = String(name).toLowerCase().trim();
  return /(academic\s*calendar|timetable|time\s*table|schedule|calendar)/i.test(n);
}

function _findAcademicFolder(parentFolder, autoCreate) {
  // Check inside parentFolder if provided
  if (parentFolder) {
    try {
      var folders = parentFolder.getFolders();
      while (folders.hasNext()) {
        var f = folders.next();
        if (_isAcademicCalendarsFolder(f.getName())) {
          return f;
        }
      }
      var searched = parentFolder.searchFolders("title contains 'Academic' or title contains 'Calendar' or title contains 'Timetable'");
      while (searched.hasNext()) {
        var sf = searched.next();
        if (_isAcademicCalendarsFolder(sf.getName())) {
          return sf;
        }
      }
    } catch(e) {
      Logger.log("_findAcademicFolder parent search warning: " + e.message);
    }
  }

  // Fallback 1: Search globally in accessible Drive folders
  var searchNames = [
    "Academic Calendars & Timetable",
    "Academic Calendars and Timetable",
    "Academic Calendar & Timetable",
    "Academic Calendar",
    "Academic Calendars",
    "Timetable & Academic Calendar",
    "Timetable"
  ];

  for (var i = 0; i < searchNames.length; i++) {
    try {
      var globalFolders = DriveApp.getFoldersByName(searchNames[i]);
      if (globalFolders.hasNext()) {
        return globalFolders.next();
      }
    } catch(e) {}
  }

  // Fallback 2: Search Drive with broad query
  try {
    var broadSearch = DriveApp.searchFolders("title contains 'Academic' or title contains 'Timetable'");
    while (broadSearch.hasNext()) {
      var bf = broadSearch.next();
      if (_isAcademicCalendarsFolder(bf.getName())) {
        return bf;
      }
    }
  } catch(e) {}

  // Fallback 3: Auto-create folder if requested
  if (autoCreate) {
    try {
      var targetParent = parentFolder || DriveApp.getRootFolder();
      var newFolder = targetParent.createFolder("Academic Calendars & Timetable");
      try {
        newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch(e) {}
      return newFolder;
    } catch(e) {
      Logger.log("Failed to auto-create Academic Calendars & Timetable folder: " + e.message);
    }
  }

  return null;
}

function _resolveCollegeTeachingPlanId(sheetId, teachingPlanLink) {
  var MASTER_CONFIG_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
  
  if (teachingPlanLink) {
    var id = extractSpreadsheetId(teachingPlanLink);
    if (id && id !== MASTER_CONFIG_ID) return id;
  }

  var cleanSheetId = extractSpreadsheetId(sheetId) || sheetId;

  try {
    var globalTpLink = getGlobalTeachingPlanLink(cleanSheetId);
    if (globalTpLink) {
      var gId = extractSpreadsheetId(globalTpLink);
      if (gId && gId !== MASTER_CONFIG_ID) return gId;
    }
  } catch(e) {}

  if (cleanSheetId && cleanSheetId !== MASTER_CONFIG_ID) {
    try {
      var ss = _getSpreadsheet(cleanSheetId);
      if (ss) {
        var ws = ss.getSheetByName('subjects');
        if (ws) {
          var data = ws.getDataRange().getValues();
          var headers = (data[0] || []).map(function(h) { return String(h).toLowerCase().trim(); });
          var tpCol = -1;
          for (var c = 0; c < headers.length; c++) {
            if (headers[c].indexOf('teaching plan') !== -1 || headers[c].indexOf('syllabus') !== -1 || headers[c].indexOf('tp link') !== -1) {
              tpCol = c;
              break;
            }
          }
          if (tpCol !== -1) {
            for (var r = 1; r < data.length; r++) {
              var val = String(data[r][tpCol] || '').trim();
              if (val) {
                var foundId = extractSpreadsheetId(val);
                if (foundId && foundId !== MASTER_CONFIG_ID) return foundId;
              }
            }
          }
        }
      }
    } catch(e) {
      Logger.log("_resolveCollegeTeachingPlanId college subjects scan error: " + e.message);
    }
  }

  if (cleanSheetId && cleanSheetId !== MASTER_CONFIG_ID) {
    return cleanSheetId;
  }

  return '';
}

function getAcademicSchedule(sheetId, teachingPlanLink) {
  var MASTER_CONFIG_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
  try {
    var targetSpreadsheetId = _resolveCollegeTeachingPlanId(sheetId, teachingPlanLink);
    
    var effectiveEmail = "";
    try { effectiveEmail = Session.getEffectiveUser().getEmail(); } catch(e) {}
    var activeEmail = "";
    try { activeEmail = Session.getActiveUser().getEmail(); } catch(e) {}

    var parentFolder = null;
    var scannedFolderName = "";
    var scannedFolderId = "";
    var folderOwnerEmail = "";
    var targetFile = null;

    if (targetSpreadsheetId && targetSpreadsheetId !== MASTER_CONFIG_ID) {
      try {
        targetFile = DriveApp.getFileById(targetSpreadsheetId);
        if (targetFile) {
          try {
            var fileOwner = targetFile.getOwner();
            if (fileOwner) folderOwnerEmail = fileOwner.getEmail();
          } catch(e) {}
          
          var parents = targetFile.getParents();
          if (parents.hasNext()) {
            parentFolder = parents.next();
            scannedFolderName = parentFolder.getName();
            scannedFolderId = parentFolder.getId();
            try {
              var folderOwner = parentFolder.getOwner();
              if (folderOwner && !folderOwnerEmail) folderOwnerEmail = folderOwner.getEmail();
            } catch(e) {}
          }
        }
      } catch(e) {
        Logger.log("Drive getFileById warning: " + e.message);
      }
    }

    // Smart resolution of Academic folder across Drive
    var academicFolder = _findAcademicFolder(parentFolder, false);

    var allFiles = [];
    var seenIds = {};

    function collectFilesFromFolder(folder) {
      if (!folder) return;
      try {
        var fileIterator = folder.getFiles();
        while (fileIterator.hasNext()) {
          var file = fileIterator.next();
          if (file.getId() === targetSpreadsheetId || file.getId() === MASTER_CONFIG_ID) continue;
          if (seenIds[file.getId()]) continue;
          seenIds[file.getId()] = true;
          var thumbLink = '';
          try { thumbLink = file.getThumbnail() ? 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400' : ''; } catch(e) { thumbLink = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w400'; }
          var updated = '';
          try { updated = file.getLastUpdated().toISOString(); } catch(e) {}
          allFiles.push({
            id: file.getId(),
            name: file.getName(),
            mimeType: file.getMimeType(),
            webViewLink: file.getUrl(),
            thumbnailLink: thumbLink,
            lastUpdated: updated
          });
        }
        var childFolders = folder.getFolders();
        while (childFolders.hasNext()) {
          collectFilesFromFolder(childFolders.next());
        }
      } catch(e) {}
    }

    if (academicFolder) {
      scannedFolderName = academicFolder.getName();
      scannedFolderId = academicFolder.getId();
      collectFilesFromFolder(academicFolder);
    } else if (parentFolder) {
      collectFilesFromFolder(parentFolder);
    }

    // If still no files found, perform broad search in Drive for calendar / timetable files
    if (allFiles.length === 0) {
      try {
        var broadFileSearch = DriveApp.searchFiles(
          "title contains 'timetable' or title contains 'time table' or " +
          "title contains 'calendar' or title contains 'calender' or " +
          "title contains 'schedule' or title contains 'academic'"
        );
        var count = 0;
        while (broadFileSearch.hasNext() && count < 30) {
          var sf = broadFileSearch.next();
          if (sf.getId() === targetSpreadsheetId || sf.getId() === MASTER_CONFIG_ID) continue;
          if (!seenIds[sf.getId()]) {
            seenIds[sf.getId()] = true;
            count++;
            var thumb = '';
            try { thumb = sf.getThumbnail() ? 'https://drive.google.com/thumbnail?id=' + sf.getId() + '&sz=w400' : ''; } catch(ex) { thumb = 'https://drive.google.com/thumbnail?id=' + sf.getId() + '&sz=w400'; }
            var upd = '';
            try { upd = sf.getLastUpdated().toISOString(); } catch(ex) {}
            allFiles.push({
              id: sf.getId(),
              name: sf.getName(),
              mimeType: sf.getMimeType(),
              webViewLink: sf.getUrl(),
              thumbnailLink: thumb,
              lastUpdated: upd
            });
          }
        }
      } catch(e) {
        Logger.log("Broad file search warning: " + e.message);
      }
    }

    allFiles.sort(function(a, b) { return (b.lastUpdated || '') > (a.lastUpdated || '') ? 1 : -1; });

    return {
      success: true,
      mode: "AUTO_DRIVE_DISCOVERY",
      effectiveEmail: effectiveEmail,
      activeEmail: activeEmail,
      folderOwnerEmail: folderOwnerEmail,
      scannedFolderName: scannedFolderName || (academicFolder ? academicFolder.getName() : "Google Drive"),
      scannedFolderId: scannedFolderId || (academicFolder ? academicFolder.getId() : ""),
      files: allFiles,
      timetable: allFiles.find(function(f) { return /(timetable|time\s*table|schedule)s?/i.test(f.name); }) || null,
      calendar: allFiles.find(function(f) { return /(calen[da]r|event|academic)s?/i.test(f.name); }) || null
    };
  } catch (err) {
    return {
      success: true,
      mode: "AUTO_DRIVE_EMPTY",
      files: [],
      error: null,
      message: "Drive search completed: " + err.message
    };
  }
}

function extractSpreadsheetId(url) {
  if (!url) return '';
  var m = String(url).match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (m && m[1]) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(url)) return url;
  return '';
}

function getSyllabus(link, code, sheetId) {
  var cacheKey = 'syl_' + (code || '') + '_' + (link ? extractSpreadsheetId(link) : '');
  var cache = CacheService.getScriptCache();
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }
  try {
    var points = [];

    // Tier 1: Try direct link if provided
    if (link) {
      try {
        var p = getSyllabusPointsFromLink(link, code);
        if (p && p.length > 0) points = p;
      } catch(e1) {
        Logger.log("getSyllabus Tier 1 error: " + e1.message);
      }
    }

    // Tier 2: If Tier 1 failed or no link, resolve Teaching Plan spreadsheet ID via getTargetSheetIds
    if ((!points || points.length === 0) && code) {
      try {
        var targetIds = getTargetSheetIds(code, sheetId);
        if (targetIds && targetIds.teachingPlanId && targetIds.teachingPlanId !== link) {
          var p2 = getSyllabusPointsFromLink(targetIds.teachingPlanId, code);
          if (p2 && p2.length > 0) points = p2;
        }
      } catch(e2) {
        Logger.log("getSyllabus Tier 2 error: " + e2.message);
      }
    }

    // Tier 3: Fallback to getTeachingPlan topic extraction
    if ((!points || points.length === 0) && code) {
      try {
        var tpRes = getTeachingPlan(code, null, sheetId);
        if (tpRes && tpRes.success && tpRes.topics && tpRes.topics.length > 0) {
          var seen = {};
          for (var i = 0; i < tpRes.topics.length; i++) {
            var syl = String(tpRes.topics[i].syllabus || '').trim();
            if (syl && syl.indexOf('Total') === -1 && syl.indexOf('Signature') === -1) {
              var lowerSyl = syl.toLowerCase();
              if (!seen[lowerSyl]) {
                seen[lowerSyl] = true;
                points.push(syl);
              }
            }
          }
        }
      } catch(e3) {
        Logger.log("getSyllabus Tier 3 error: " + e3.message);
      }
    }

    if (points && points.length > 0) {
      var res = { success: true, points: points };
      try { cache.put(cacheKey, JSON.stringify(res), 7200); } catch(ce) {}
      return res;
    }
    return { success: false, points: [], error: 'No syllabus points found for ' + (code || 'subject') };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function looksLikeSubjectCode(name) {
  if (!name) return false;
  var val = String(name).trim().toLowerCase().replace(/\s+/g, "");
  if (!val) return false;
  if (val.indexOf("sheet") === 0 || val.indexOf("lecture") === 0 || val.indexOf("unit") === 0 || val.indexOf("chap") === 0) return false;
  if (val.indexOf("syllabus") !== -1 || val.indexOf("plan") !== -1 || val.indexOf("attendance") !== -1 || val.indexOf("index") !== -1) return false;
  // Numeric subject codes: 4 to 8 digits (e.g. 22401, 314001)
  if (/^\d{4,8}$/.test(val)) return true;
  // Alphanumeric subject codes (e.g. CS101, 22401P, DME22401)
  var hasLetters = /[a-z]/.test(val);
  var hasNumbers = /[0-9]/.test(val);
  return hasLetters && hasNumbers && val.length >= 3;
}

function getSyllabusPointsFromLink(url, code) {
  var id = extractSpreadsheetId(url);
  if (!id) {
    throw new Error("Invalid Google Sheets link. Please check teaching plan link.");
  }
  var ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    throw new Error("Cannot access spreadsheet. Please make sure the link is correct and accessible.");
  }
  
  var sheet = _findSheetByCode(ss, code);
  
  if (!sheet) {
    return [];
  }
  
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return [];
  }
  
  var colIdx = -1;
  var headerRowIdx = -1;
  var keywords = ["syllabus points", "syllabus point", "syllabus", "topic name", "topics", "topic", "session topic", "particulars", "description", "content", "practical topic", "experiment name", "experiments", "experiment", "lab topic", "practical"];
  
  for (var r = 0; r < Math.min(data.length, 30); r++) {
    var row = data[r].map(function(h) { return String(h).trim().toLowerCase(); });
    
    for (var k = 0; k < keywords.length; k++) {
      var idx = row.indexOf(keywords[k]);
      if (idx !== -1) {
        colIdx = idx;
        headerRowIdx = r;
        break;
      }
    }
    if (colIdx !== -1) break;
    
    for (var j = 0; j < row.length; j++) {
      for (var k = 0; k < keywords.length; k++) {
        if (row[j].indexOf(keywords[k]) !== -1) {
          colIdx = j;
          headerRowIdx = r;
          break;
        }
      }
      if (colIdx !== -1) break;
    }
    if (colIdx !== -1) break;
  }
  
  if (colIdx === -1) {
    colIdx = 0;
  }
  if (headerRowIdx === -1) {
    headerRowIdx = 0;
  }
  
  function extractFromCol(targetCol) {
    var pts = [];
    var seen = {};
    var hVal = String(data[headerRowIdx][targetCol] || '').trim().toLowerCase();
    for (var r = headerRowIdx + 1; r < data.length; r++) {
      if (!data[r] || targetCol >= data[r].length) continue;
      var val = String(data[r][targetCol]).trim();
      var lowerVal = val.toLowerCase();
      if (val && lowerVal !== hVal && !seen[lowerVal]) {
        seen[lowerVal] = true;
        pts.push(val);
      }
    }
    return pts;
  }

  var points = extractFromCol(colIdx);

  var numberCount = points.filter(function(p) {
    return !isNaN(parseInt(p, 10)) && String(parseInt(p, 10)) === p.trim();
  }).length;

  if (points.length > 0 && numberCount > points.length * 0.5) {
    for (var nextC = colIdx + 1; nextC < Math.min(colIdx + 4, data[headerRowIdx].length); nextC++) {
      var altPoints = extractFromCol(nextC);
      var altNumCount = altPoints.filter(function(p) {
        return !isNaN(parseInt(p, 10)) && String(parseInt(p, 10)) === p.trim();
      }).length;
      if (altPoints.length > 0 && altNumCount <= altPoints.length * 0.5) {
        points = altPoints;
        break;
      }
    }
  }

  return points;
}



function uploadAcademicDocument(data, sheetId) {
  var MASTER_CONFIG_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
  try {
    if (!data || !data.fileData || !data.fileName) {
      return { success: false, error: "Invalid file data or file name." };
    }

    var targetSpreadsheetId = _resolveCollegeTeachingPlanId(sheetId, data.teachingPlanLink);
    var parentFolder = null;
    var targetFile = null;

    if (targetSpreadsheetId && targetSpreadsheetId !== MASTER_CONFIG_ID) {
      try {
        targetFile = DriveApp.getFileById(targetSpreadsheetId);
        if (targetFile) {
          var parents = targetFile.getParents();
          if (parents.hasNext()) {
            parentFolder = parents.next();
          }
        }
      } catch(e) {
        Logger.log("Drive getFileById warning: " + e.message);
      }
    }

    // Auto-resolve or create academic folder
    var academicFolder = _findAcademicFolder(parentFolder, true);
    if (!academicFolder) {
      try {
        academicFolder = (parentFolder || DriveApp.getRootFolder()).createFolder("Academic Calendars & Timetable");
        try {
          academicFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        } catch(e) {}
      } catch(e) {
        return { success: false, error: "Drive folder creation failed: " + e.message };
      }
    }

    var bytes = Utilities.base64Decode(data.fileData);
    var blob = Utilities.newBlob(bytes, data.mimeType || 'application/pdf', data.fileName);

    var uploadedFile = academicFolder.createFile(blob);
    try {
      uploadedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch(e) {}

    var thumb = '';
    try { thumb = uploadedFile.getThumbnail() ? 'https://drive.google.com/thumbnail?id=' + uploadedFile.getId() + '&sz=w400' : ''; } catch(e) { thumb = 'https://drive.google.com/thumbnail?id=' + uploadedFile.getId() + '&sz=w400'; }

    return {
      success: true,
      file: {
        id: uploadedFile.getId(),
        name: uploadedFile.getName(),
        mimeType: uploadedFile.getMimeType(),
        webViewLink: uploadedFile.getUrl(),
        thumbnailLink: thumb,
        lastUpdated: uploadedFile.getLastUpdated().toISOString()
      }
    };
  } catch (err) {
    return { success: false, error: "Drive Upload Failed: " + err.message };
  }
}

function getTaughtTopics(code, outputSheetId, sheetId) {
  try {
    if (outputSheetId === 'undefined' || outputSheetId === 'null') outputSheetId = '';
    if (!outputSheetId && sheetId) outputSheetId = getOutputSheetId(sheetId);
    var cleanOutId = extractSpreadsheetId(outputSheetId);
    if (!cleanOutId && sheetId) cleanOutId = extractSpreadsheetId(getOutputSheetId(sheetId));
    if (!cleanOutId) return { success: false, error: 'Invalid Output Sheet Link' };
    var outSs = SpreadsheetApp.openById(cleanOutId);
    var sheets = outSs.getSheets();
    var parsedInput = _parseSubjectCode(code);
    var found = {};
    for (var i = 0; i < sheets.length; i++) {
      var s = sheets[i];
      var parsedSheet = _parseSubjectCode(s.getName());
      var cleanName = s.getName().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (parsedSheet.cleanBaseCode !== parsedInput.cleanBaseCode && cleanName.indexOf(parsedInput.cleanBaseCode) === -1) continue;
      var lc = s.getLastColumn(), lr = s.getLastRow();
      if (lc < 6 || lr < 6) continue;
      var rows = s.getRange(1, 1, Math.min(15, lr), lc).getValues(); // only top rows, never full matrix
      var hdr = -1;
      for (var r = 0; r < rows.length; r++) {
        var rowStr = rows[r].map(function (c) { return String(c || '').toLowerCase().trim(); }).join('|');
        if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) { hdr = r; break; }
      }
      if (hdr === -1) hdr = 5;
      var dateHdr = rows[hdr] || [], topicRow = rows[hdr + 1] || [];
      var nameCol = -1;
      for (var c = 0; c < dateHdr.length; c++) if (String(dateHdr[c] || '').toLowerCase().indexOf('name') !== -1) { nameCol = c; break; }
      if (nameCol === -1) nameCol = 1;
      for (var c2 = nameCol + 1; c2 < dateHdr.length; c2++) {
        var dateVal = String(dateHdr[c2] || '').trim().toLowerCase();
        if (!dateVal || dateVal.indexOf('total') !== -1 || dateVal.indexOf('%') !== -1) continue; // topic exists only under real date columns
        var tv = String(topicRow[c2] || '').trim();
        if (tv && tv.toLowerCase() !== 'topic') found[tv] = true;
      }
    }
    return { success: true, topics: Object.keys(found) };
  } catch (e) { return { success: false, error: e.message }; }
}

