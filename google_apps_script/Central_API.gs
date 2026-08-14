/**
 * ═══════════════════════════════════════════════════════════════
 *  ACADEMIC FILE PWA — CENTRAL API (v4.0 Optimized)
 *  Dedicated, high-performance Google Apps Script Backend.
 *  Handles Syllabus, Teaching Plans, In-charge Dashboard, 
 *  Attendance Reports, Timetables, and Academic Calendars.
 * ═══════════════════════════════════════════════════════════════
 */

// Diagnostic self-test function for 1-click execution in Google Apps Script editor
function testDiagnostics() {
  Logger.log("=== RUNNING ACADEMIC FILE API DIAGNOSTICS ===");
  try {
    var userEmail = "";
    try { userEmail = Session.getEffectiveUser().getEmail(); } catch(e) {}
    Logger.log("[OK] Effective User: " + (userEmail || "Active Deployment"));
    
    var root = DriveApp.getRootFolder();
    Logger.log("[OK] Drive authorized. Root: " + root.getName());
    
    Logger.log("=== ALL DIAGNOSTICS PASSED SUCCESSFULLY! ===");
    return { status: "SUCCESS", email: userEmail, driveAccessible: true };
  } catch (err) {
    Logger.log("[ERROR] Diagnostics failed: " + err.message);
    return { status: "ERROR", error: err.message };
  }
}

// In-memory Spreadsheet instance cache for current script execution
var _ssCache = {};
function _getSpreadsheet(sheetId) {
  if (!sheetId) {
    throw new Error("Missing sheetId parameter");
  }
  var cleanId = extractSpreadsheetId(sheetId) || sheetId;
  if (!_ssCache[cleanId]) {
    _ssCache[cleanId] = SpreadsheetApp.openById(cleanId);
  }
  return _ssCache[cleanId];
}

/**
 * Main GET entry point — routes all read actions
 */
function doGet(e) {
  try {
    if (!e || !e.parameter) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "API is online and operational",
        version: "4.0",
        timestamp: new Date().toISOString(),
        message: "Send HTTP GET with action and sheetId parameters to query data."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var action = e.parameter.action;
    var sheetId = e.parameter.sheetId;
    var result;

    if (!action) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "API is online and operational",
        version: "4.0",
        message: "No action specified."
      })).setMimeType(ContentService.MimeType.JSON);
    }

    switch (action) {
      // ── Core Config & User Directory ──
      case 'getConfig':
      case 'getAllData':
        result = getAllData(sheetId);
        break;
      case 'getTeachers':
        result = getTeachers(sheetId);
        break;
      case 'getSubjects':
        result = getSubjects(e.parameter.teacher, sheetId);
        break;
      case 'getStudents':
        result = getStudents(e.parameter.sheet, e.parameter.batch, sheetId);
        break;

      // ── Academic In-charge Portal ──
      case 'getAcademicIncharges':
        result = getAcademicIncharges(sheetId);
        break;
      case 'academicInchargeLogin':
        result = academicInchargeLogin(e.parameter.name, e.parameter.pin, sheetId);
        break;
      case 'getInchargeDashboard':
        result = getInchargeDashboard(sheetId);
        break;

      // ── Teaching Plan & Syllabus ──
      case 'getTeachingPlan':
        result = getTeachingPlan(e.parameter.code, e.parameter.teacher, sheetId);
        break;
      case 'syncTeachingPlan':
        result = syncTeachingPlan(e.parameter.code, e.parameter.teacher, sheetId);
        break;
      case 'getSyllabus':
        result = getSyllabus(e.parameter.link, e.parameter.code, sheetId);
        break;

      // ── Attendance Metrics & Taught Topics ──
      case 'getAttendance':
        result = getAttendance(e.parameter.code, e.parameter.year, e.parameter.date, e.parameter.outputSheetId, sheetId);
        break;
      case 'getTaughtTopics':
        result = getTaughtTopics(e.parameter.code, e.parameter.outputSheetId, sheetId);
        break;

      // ── Academic Schedule & Documents ──
      case 'getAcademicSchedule':
        result = getAcademicSchedule(sheetId, e.parameter.teachingPlanLink);
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
 * Main POST entry point — routes all write actions
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var action = data.action || (e.parameter && e.parameter.action);
    var sheetId = data.sheetId || (e.parameter && e.parameter.sheetId);
    var result;

    switch (action) {
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
   UTILITY HELPERS
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
    name: find(['subject name', 'subject', 'name'], 1),
    year: find(['year', 'class'], 2),
    program: find(['program', 'course'], 3),
    semester: find(['semester', 'sem'], 4),
    type: find(['type'], 5),
    faculty: find(['faculty', 'teacher'], 6),
    pin: find(['pin', 'password'], 7)
  };
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

  // Strict Theory vs Practical determination
  var isPractical = false;
  if (typeStr.indexOf('practical') !== -1 || typeStr.indexOf('lab') !== -1 || typeStr === 'pr' || typeStr === 'p') {
    isPractical = true;
  } else if (nameStr.indexOf('practical') !== -1 || nameStr.indexOf('lab') !== -1) {
    isPractical = true;
  } else if (raw.toLowerCase().indexOf('practical') !== -1 || raw.toLowerCase().indexOf('lab') !== -1 || cleanBatch !== '') {
    isPractical = true;
  } else if (codeUpper.endsWith('P') || /.*?\d+P$/i.test(codeUpper)) {
    isPractical = true;
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

function _findSheetByCode(ss, inputCode, nameHint) {
  if (!ss || !inputCode) return null;
  var parsedInput = _parseSubjectCode(inputCode, '', nameHint);
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

    // Practical sheet MUST NOT match Theory subject, and vice versa
    if (parsedSheet.isPractical !== parsedInput.isPractical) continue;

    var score = 0;
    if (sheetNameLower === parsedInput.raw.toLowerCase()) {
      score = 100;
    } else if (parsedSheet.cleanFullCode && parsedSheet.cleanFullCode === parsedInput.cleanFullCode && parsedSheet.batch === parsedInput.batch) {
      score = 95;
    } else if (parsedSheet.cleanFullCode && parsedSheet.cleanFullCode === parsedInput.cleanFullCode) {
      score = 90;
    } else if (parsedSheet.cleanBaseCode && parsedSheet.cleanBaseCode === parsedInput.cleanBaseCode && parsedInput.batch && parsedSheet.batch && parsedInput.batch === parsedSheet.batch) {
      score = 88;
    } else if (parsedSheet.cleanBaseCode && parsedSheet.cleanBaseCode === parsedInput.cleanBaseCode) {
      score = 85;
    } else if (cleanSheetName === parsedInput.cleanBaseCode) {
      score = 80;
    } else if (cleanHint && cleanSheetName.indexOf(cleanHint) !== -1) {
      score = 75;
    } else if (cleanSheetName.indexOf(parsedInput.cleanBaseCode) === 0) {
      score = 70;
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
    var sParsed = _parseSubjectCode(nameLower);
    if (sParsed.isPractical !== parsedInput.isPractical) continue;
    if (nameLower.indexOf("syllabus") !== -1 || nameLower.indexOf("teaching plan") !== -1 || nameLower.indexOf("plan") !== -1) {
      return sheets[i];
    }
  }

  if (sheets[0]) {
    var sParsed0 = _parseSubjectCode(sheets[0].getName());
    if (sParsed0.isPractical === parsedInput.isPractical) {
      return sheets[0];
    }
  }

  return null;
}

function extractSpreadsheetId(url) {
  if (!url) return '';
  var str = String(url).trim();
  if (str.length >= 25 && str.indexOf('/') === -1 && str.indexOf('.') === -1) {
    return str;
  }
  var match = str.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : '';
}

function looksLikeSubjectCode(name) {
  if (!name) return false;
  var clean = String(name).trim().toUpperCase();
  return /^[A-Z0-9_-]{3,15}$/.test(clean);
}

/* ═══════════════════════════════════════════════════════════════
   CORE CONFIG & DIRECTORY HANDLERS
   ═══════════════════════════════════════════════════════════════ */

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
        var t = fs[f].trim();
        if (t && !map[t]) map[t] = { name: t, pin: ps[f] ? ps[f].trim() : '' };
      }
    }
  }
  var res = []; for (var k in map) res.push(map[k]);
  return { success: true, teachers: res };
}

function getSubjects(teacher, sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName('subjects');
  if (!ws) return { success: false, error: 'Sheet "subjects" not found' };
  var data = ws.getDataRange().getValues(), res = [];
  var cols = _mapSubjectCols(data[0] || []);
  var targetTeacher = String(teacher || '').trim().toLowerCase();
  for (var i = 1; i < data.length; i++) {
    var facStr = String(data[i][cols.faculty]).trim();
    var match = !targetTeacher;
    if (targetTeacher) {
      var faculties = facStr.split(',').map(function(f) { return f.trim().toLowerCase(); });
      match = faculties.indexOf(targetTeacher) !== -1;
    }
    if (match) {
      var subCode = String(data[i][cols.code]).trim();
      var subType = String(data[i][cols.type]).trim();
      var subName = String(data[i][cols.name]).trim();
      var isPrac = (subType.toLowerCase().indexOf('prac') !== -1 || subCode.toUpperCase().endsWith('P') || subName.toLowerCase().indexOf('prac') !== -1);
      res.push({
        code: subCode,
        name: subName,
        year: String(data[i][cols.year]).trim(),
        program: String(data[i][cols.program]).trim(),
        semester: String(data[i][cols.semester]).trim(),
        type: subType,
        faculty: facStr,
        isPractical: isPrac
      });
    }
  }
  return { success: true, subjects: res };
}

function getStudents(sheet, batch, sheetId) {
  var ss = _getSpreadsheet(sheetId), ws = ss.getSheetByName(sheet);
  if (!ws) return { success: false, error: 'Sheet "' + sheet + '" not found' };
  var data = ws.getDataRange().getValues(), res = [];
  for (var i = 1; i < data.length; i++) {
    var r = String(data[i][0]).trim(), n = String(data[i][1]).trim(), b = data[i][2] ? String(data[i][2]).trim() : '';
    if (!r && !n) continue;
    if (batch && b !== batch) continue;
    res.push({ rollNo: r, name: n, batch: b });
  }
  return { success: true, students: res, sheet: sheet };
}

function getAllData(sheetId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'allData_v4_' + (sheetId || '');
  var cached = cache.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch(e) {}
  }

  var tRes = getTeachers(sheetId);
  var sRes = getSubjects('', sheetId);
  var inchRes = _getAcademicInchargeList(sheetId);
  var collegeSheetIds = _getCollegeSheetIds(sheetId);

  var result = {
    success: true,
    teachers: tRes.teachers || [],
    subjects: sRes.subjects || [],
    academicIncharges: inchRes.incharges || [],
    outputSheetId: collegeSheetIds.outputSheetId || '',
    teachingPlanId: collegeSheetIds.teachingPlanId || '',
    managementName: collegeSheetIds.managementName || '',
    collegeName: collegeSheetIds.collegeName || ''
  };

  try {
    cache.put(cacheKey, JSON.stringify(result), 300);
  } catch(e) {}

  return result;
}

function getOutputSheetId(sheetId) {
  return _getCollegeSheetIds(sheetId).outputSheetId || '';
}

function _getCollegeSheetIds(sheetId) {
  var MASTER_CONFIG_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
  var res = { outputSheetId: '', teachingPlanId: '', managementName: '', collegeName: '' };
  try {
    var ss = _getSpreadsheet(MASTER_CONFIG_ID);
    var ws = ss.getSheetByName('colleges') || ss.getSheets()[0];
    var data = ws.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rawLink = String(row[1] || '');
      var cId = extractSpreadsheetId(rawLink) || rawLink;
      if (cId === sheetId || (rawLink && rawLink.indexOf(sheetId) !== -1)) {
        if (row[2]) res.outputSheetId = String(row[2]).trim();
        if (row[3]) res.teachingPlanId = String(row[3]).trim();
        if (row[0]) res.collegeName = String(row[0]).trim();
        if (row[4]) res.managementName = String(row[4]).trim();
        break;
      }
    }
  } catch(e) {
    Logger.log("Error in _getCollegeSheetIds: " + e.message);
  }
  return res;
}

function getTargetSheetIds(code, sheetId) {
  var res = { teachingPlanId: '', outputSheetId: '' };
  try {
    var ss = _getSpreadsheet(sheetId);
    var ws = ss.getSheetByName('subjects');
    if (ws) {
      var data = ws.getDataRange().getValues();
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        var sCode = String(row[0] || '').trim();
        if (sCode === code) {
          for (var c = 0; c < row.length; c++) {
            var val = String(row[c] || '').trim();
            if (val.indexOf('docs.google.com/spreadsheets') !== -1) {
              var sId = extractSpreadsheetId(val);
              if (sId) {
                if (!res.teachingPlanId) res.teachingPlanId = sId;
                else if (!res.outputSheetId) res.outputSheetId = sId;
              }
            }
          }
          break;
        }
      }
    }
  } catch(e) {}

  if (!res.teachingPlanId || !res.outputSheetId) {
    var globalIds = _getCollegeSheetIds(sheetId);
    if (!res.teachingPlanId) res.teachingPlanId = globalIds.teachingPlanId;
    if (!res.outputSheetId) res.outputSheetId = globalIds.outputSheetId;
  }
  return res;
}

function getGlobalTeachingPlanLink(sheetId) {
  var globalIds = _getCollegeSheetIds(sheetId);
  return globalIds.teachingPlanId ? ("https://docs.google.com/spreadsheets/d/" + globalIds.teachingPlanId + "/edit") : "";
}

/* ═══════════════════════════════════════════════════════════════
   ACADEMIC IN-CHARGE PORTAL HANDLERS
   ═══════════════════════════════════════════════════════════════ */

function _getAcademicInchargeList(sheetId) {
  var inchList = [];
  try {
    var ss = _getSpreadsheet(sheetId);
    var ws = ss.getSheetByName('academic incharge') || ss.getSheetByName('academic incharges') || ss.getSheetByName('incharges') || ss.getSheetByName('incharge');
    if (ws) {
      var data = ws.getDataRange().getValues();
      var nameCol = 0, pinCol = 1, yearCol = 2;
      if (data.length > 0) {
        var hdr = data[0].map(function(h) { return String(h || '').toLowerCase().trim(); });
        for (var c = 0; c < hdr.length; c++) {
          if (hdr[c].indexOf('name') !== -1 || hdr[c].indexOf('incharge') !== -1 || hdr[c].indexOf('faculty') !== -1) nameCol = c;
          if (hdr[c].indexOf('pin') !== -1 || hdr[c].indexOf('pass') !== -1) pinCol = c;
          if (hdr[c].indexOf('year') !== -1 || hdr[c].indexOf('class') !== -1) yearCol = c;
        }
      }
      for (var r = 1; r < data.length; r++) {
        var name = String(data[r][nameCol] || '').trim();
        var pin = String(data[r][pinCol] || '').trim();
        var year = yearCol < data[r].length ? String(data[r][yearCol] || '').trim() : '';
        if (name) {
          inchList.push({ name: name, pin: pin, year: year });
        }
      }
    }
  } catch(e) {
    Logger.log("Error fetching academic incharge sheet: " + e.message);
  }
  return { success: true, incharges: inchList };
}

function getAcademicIncharges(sheetId) {
  var res = _getAcademicInchargeList(sheetId);
  var safeList = (res.incharges || []).map(function(item) {
    return { name: item.name, year: item.year };
  });
  return { success: true, incharges: safeList };
}

function academicInchargeLogin(name, pin, sheetId) {
  if (!name) return { success: false, error: 'Name is required' };
  var res = _getAcademicInchargeList(sheetId);
  var cleanName = String(name).trim().toLowerCase();
  var cleanPin = String(pin || '').trim();

  for (var i = 0; i < res.incharges.length; i++) {
    var inch = res.incharges[i];
    if (inch.name.toLowerCase() === cleanName) {
      if (!inch.pin || inch.pin === cleanPin) {
        return { success: true, incharge: { name: inch.name, year: inch.year } };
      } else {
        return { success: false, error: 'Incorrect PIN for Academic In-charge' };
      }
    }
  }
  return { success: false, error: 'Academic In-charge name not found' };
}

function getInchargeDashboard(sheetId) {
  var cache = CacheService.getScriptCache();
  var cacheKey = 'dash_v40_' + sheetId;
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
    var distinctCodes = [];

    for (var i = 1; i < data.length; i++) {
      var rawFaculty = String(data[i][cols.faculty] || '').trim();
      var sCode = String(data[i][cols.code] || '').trim();
      var sName = String(data[i][cols.name] || '').trim();
      var sYear = String(data[i][cols.year] || '').trim();
      var sSem = String(data[i][cols.semester] || '').trim();
      var sType = String(data[i][cols.type] || '').trim();

      if (!sCode) continue;

      if (!subjectCodeSet[sCode]) {
        subjectCodeSet[sCode] = true;
        distinctCodes.push(sCode);
      }

      var facList = rawFaculty ? rawFaculty.split(',').map(function(x) { return x.trim(); }) : ['Unassigned'];
      var isPrac = (sType.toLowerCase().indexOf('prac') !== -1 || sCode.toUpperCase().endsWith('P') || sName.toLowerCase().indexOf('prac') !== -1);

      for (var f = 0; f < facList.length; f++) {
        var facName = facList[f];
        if (!facName) continue;
        if (!facultyMap[facName]) facultyMap[facName] = [];

        facultyMap[facName].push({
          code: sCode,
          name: sName,
          year: sYear,
          semester: sSem,
          type: sType,
          isPractical: isPrac,
          faculty: facName
        });
      }
    }

    var collegeIds = _getCollegeSheetIds(sheetId);
    var subjectPlanMap = {};

    // ── 1. Scan Teaching Plan Spreadsheet (Exact topic rows & conducted dates) ──
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
                if (rowStr.indexOf('lecture no') !== -1 || rowStr.indexOf('sr. no.') !== -1 || rowStr.indexOf('unit') !== -1 || rowStr.indexOf('details of topic') !== -1 || rowStr.indexOf('syllabus') !== -1) {
                  headerRowIdx = r;
                  break;
                }
              }
              if (headerRowIdx === -1) headerRowIdx = 14;

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
                    if (strCell.length > 5 && !isDateOrNumberVal(row[c]) && strCell.indexOf('Total') === -1 && strCell.indexOf('Signature') === -1) {
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

              var isSheetPrac = parsedSheet.isPractical || cleanSheetName.endsWith('P') || cleanSheetName.indexOf('PRACT') !== -1;
              var statsObj = { totalLectures: topicsCount, totalConducted: conductedCount };

              // Strict Theory vs Practical tab matching
              for (var c = 0; c < distinctCodes.length; c++) {
                var code = distinctCodes[c];
                var parsedCode = _parseSubjectCode(code);
                var isCodePrac = parsedCode.isPractical || code.toUpperCase().endsWith('P');
                if (isSheetPrac === isCodePrac) {
                  var cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  if (cleanSheetName === cleanCode || parsedSheet.cleanBaseCode === parsedCode.cleanBaseCode || (cleanSheetName.indexOf(parsedCode.cleanBaseCode) === 0 && cleanSheetName.length <= parsedCode.cleanBaseCode.length + 3)) {
                    if (!subjectPlanMap[code] || subjectPlanMap[code].totalLectures < statsObj.totalLectures) {
                      subjectPlanMap[code] = statsObj;
                    }
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

    // ── 2. Scan Attendance Output Spreadsheet (Actual attendance averages) ──
    var attendanceConductedMap = {};
    var attendanceAvgMap = {};
    var totalCollegeP = 0;
    var totalCollegeAttMarks = 0;

    try {
      var outId = collegeIds.outputSheetId;
      if (outId) {
        var cleanOutId = extractSpreadsheetId(outId);
        if (cleanOutId) {
          var outSs = _getSpreadsheet(cleanOutId);
          if (outSs) {
            var outSheets = outSs.getSheets();
            for (var o = 0; o < outSheets.length; o++) {
              var oSheet = outSheets[o];
              var oName = oSheet.getName().trim();
              var parsedOSheet = _parseSubjectCode(oName);
              var cleanOName = oName.toUpperCase().replace(/[^A-Z0-9]/g, '');
              var lr = oSheet.getLastRow(), lc = oSheet.getLastColumn();
              if (lr < 5 || lc < 4) continue;

              var oRows = oSheet.getRange(1, 1, Math.min(10, lr), lc).getValues();
              var oHdr = -1;
              for (var r = 0; r < oRows.length; r++) {
                var rowStr = oRows[r].map(function (c) { return String(c || '').toLowerCase().trim(); }).join('|');
                if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
                  oHdr = r;
                  break;
                }
              }
              if (oHdr === -1) oHdr = 5;

              var dateHeaderRow = oRows[oHdr] || [];
              var conductedLecturesInSheet = 0;
              for (var c = 2; c < dateHeaderRow.length; c++) {
                var val = String(dateHeaderRow[c] || '').trim().toLowerCase();
                if (val.indexOf('total p') !== -1 || val.indexOf('total a') !== -1 || val.indexOf('total') !== -1 || val.indexOf('% att') !== -1) {
                  break;
                }
                if (val !== '' && val !== 'topic' && val !== 'roll no.' && val !== 'name' && val !== 'roll no') {
                  conductedLecturesInSheet++;
                }
              }

              var subP = 0, subMarks = 0;
              var dataStartRow = oHdr + 3;
              if (lr >= dataStartRow && conductedLecturesInSheet > 0) {
                var numStudents = lr - dataStartRow + 1;
                var attMatrix = oSheet.getRange(dataStartRow, 3, numStudents, conductedLecturesInSheet).getValues();
                for (var sr = 0; sr < attMatrix.length; sr++) {
                  for (var sc = 0; sc < attMatrix[sr].length; sc++) {
                    var mark = String(attMatrix[sr][sc] || '').trim().toUpperCase();
                    if (mark === 'P') {
                      subP++;
                      subMarks++;
                    } else if (mark === 'A') {
                      subMarks++;
                    }
                  }
                }
              }
              var sheetAvgAtt = subMarks > 0 ? Math.round((subP / subMarks) * 100) : 0;
              totalCollegeP += subP;
              totalCollegeAttMarks += subMarks;

              var isOSheetPrac = parsedOSheet.isPractical || cleanOName.endsWith('P') || cleanOName.indexOf('PRACT') !== -1;
              for (var c = 0; c < distinctCodes.length; c++) {
                var dCode = distinctCodes[c];
                var parsedDCode = _parseSubjectCode(dCode);
                var isDCodePrac = parsedDCode.isPractical || dCode.toUpperCase().endsWith('P');
                if (isOSheetPrac === isDCodePrac) {
                  var cleanDCode = dCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
                  if (cleanOName === cleanDCode || parsedOSheet.cleanBaseCode === parsedDCode.cleanBaseCode || (cleanOName.indexOf(parsedDCode.cleanBaseCode) === 0 && cleanOName.length <= parsedDCode.cleanBaseCode.length + 3)) {
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

    // ── 3. Assemble Final Metrics per Faculty ──
    var faculties = [];
    var grandTotalLectures = 0;
    var grandTotalConducted = 0;
    var grandTotalSubjects = 0;

    for (var fac in facultyMap) {
      var subs = facultyMap[fac];
      var facLectures = 0;
      var facConducted = 0;
      var facAttSum = 0;
      var facAttCount = 0;

      for (var s = 0; s < subs.length; s++) {
        var sCode = subs[s].code;
        var info = subjectPlanMap[sCode] || { totalLectures: 0, totalConducted: 0 };
        var attConducted = attendanceConductedMap[sCode] || 0;
        var subAvgAtt = attendanceAvgMap[sCode] || 0;

        var isPrac = subs[s].isPractical || (subs[s].type && String(subs[s].type).toLowerCase().indexOf('prac') !== -1) || _parseSubjectCode(sCode, subs[s].type, subs[s].name).isPractical;
        subs[s].isPractical = isPrac;
        var fallbackTotal = isPrac ? 15 : 45;

        // Strictly faithful to sheet: use actual topics entered, or fallback if sheet not yet created
        var planTotal = (info.totalLectures && info.totalLectures > 0) ? info.totalLectures : fallbackTotal;
        var finalConducted = Math.max(info.totalConducted || 0, attConducted);
        var finalTotal = Math.max(planTotal, finalConducted, 1);
        var finalPct = Math.min(100, Math.round((finalConducted / finalTotal) * 100));

        subs[s].totalLectures = finalTotal;
        subs[s].totalConducted = finalConducted;
        subs[s].percent = finalPct;
        subs[s].avgAttendance = subAvgAtt;

        facLectures += finalTotal;
        facConducted += finalConducted;
        if (subAvgAtt > 0) {
          facAttSum += subAvgAtt;
          facAttCount++;
        }
      }

      var facPct = facLectures > 0 ? Math.min(100, Math.round((facConducted / facLectures) * 100)) : 0;
      var facAvgAtt = facAttCount > 0 ? Math.round(facAttSum / facAttCount) : 0;

      grandTotalLectures += facLectures;
      grandTotalConducted += facConducted;
      grandTotalSubjects += subs.length;

      faculties.push({
        faculty: fac,
        totalSubjects: subs.length,
        totalLectures: facLectures,
        totalConducted: facConducted,
        avgSyllabusCompletion: facPct,
        avgAttendance: facAvgAtt,
        subjects: subs
      });
    }

    var overallSyllabusPercent = grandTotalLectures > 0 ? Math.min(100, Math.round((grandTotalConducted / grandTotalLectures) * 100)) : 0;
    var overallCollegeAvgAtt = totalCollegeAttMarks > 0 ? Math.round((totalCollegeP / totalCollegeAttMarks) * 100) : 0;

    var result = {
      success: true,
      collegeName: collegeIds.collegeName || "College",
      managementName: collegeIds.managementName || "Management",
      totalFaculties: faculties.length,
      totalSubjects: grandTotalSubjects,
      totalLecturesPlanned: grandTotalLectures,
      totalLecturesConducted: grandTotalConducted,
      overallSyllabusPercent: overallSyllabusPercent,
      overallAttendancePercent: overallCollegeAvgAtt,
      faculties: faculties
    };

    try { cache.put(cacheKey, JSON.stringify(result), 300); } catch(ce) {}
    return result;
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════
   ATTENDANCE & DEFAULTERS QUERY HANDLERS
   ═══════════════════════════════════════════════════════════════ */

function getAttendance(code, year, date, outputSheetId, sheetId) {
  var cleanOutId = extractSpreadsheetId(outputSheetId || getOutputSheetId(sheetId));
  var cacheKey = 'attrep_v4_' + (code || '') + '_' + (year || '') + '_' + (date || '') + '_' + (cleanOutId || '');
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
      var isInputPrac = parsedInput.isPractical || (code && code.toUpperCase().endsWith('P'));
      var isSheetPrac = parsedSheetCode.isPractical || cleanSheetName.endsWith('P') || cleanSheetName.indexOf('PRACT') !== -1;
      if (isInputPrac === isSheetPrac) {
        if (parsedSheetCode.cleanBaseCode === parsedInput.cleanBaseCode ||
            cleanSheetName === parsedInput.cleanBaseCode ||
            (cleanSheetName.indexOf(parsedInput.cleanBaseCode) === 0 && cleanSheetName.length <= parsedInput.cleanBaseCode.length + 3)) {
          isMatch = true;
        }
      }
    }
    if (!isMatch) continue;

    var batch = name.indexOf(" - Batch ") !== -1 ? name.substring(name.indexOf(" - Batch ") + 9).trim() : "";
    var lc = s.getLastColumn(), lr = s.getLastRow();
    if (lc < 4 || lr < 3) continue;
    
    var attData = s.getDataRange().getValues();
    var hdrRowIdx = -1;
    for (var r = 0; r < Math.min(attData.length, 30); r++) {
      var rowStr = attData[r].map(function (c) { return String(c || '').toLowerCase().trim(); }).join('|');
      if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) {
        hdrRowIdx = r;
        break;
      }
    }
    if (hdrRowIdx === -1) hdrRowIdx = 5;

    var dateHeader = attData[hdrRowIdx] || [];
    var topicRow = attData[hdrRowIdx + 1] || [];
    var dateIndices = [];
    var totalPCol = -1, totalACol = -1, totalClassesCol = -1, pctCol = -1;

    for (var c = 0; c < dateHeader.length; c++) {
      var hVal = String(dateHeader[c] || '').trim().toLowerCase();
      if (hVal.indexOf('total p') !== -1) totalPCol = c;
      else if (hVal.indexOf('total a') !== -1) totalACol = c;
      else if (hVal === 'total') totalClassesCol = c;
      else if (hVal.indexOf('% att') !== -1) pctCol = c;
      else if (c >= 2 && hVal !== '' && hVal !== 'topic' && hVal !== 'roll no.' && hVal !== 'name' && hVal !== 'roll no') {
        if (totalPCol === -1) {
          dateIndices.push({ colIndex: c, date: String(dateHeader[c]).trim(), topic: String(topicRow[c] || '').trim() });
        }
      }
    }

    var startStudentRow = hdrRowIdx + 2;
    for (var r = startStudentRow; r < attData.length; r++) {
      var row = attData[r];
      var rNo = row[0], stName = row[1];
      if (!rNo && !stName) continue;
      if (String(rNo).toLowerCase().indexOf('total') !== -1) continue;

      var datesObj = {};
      var pCount = 0, aCount = 0;

      for (var d = 0; d < dateIndices.length; d++) {
        var dInfo = dateIndices[d];
        var val = String(row[dInfo.colIndex] || '-').trim().toUpperCase();
        datesObj[dInfo.date] = val;
        if (val === 'P') pCount++;
        else if (val === 'A') aCount++;
      }

      var totClasses = (totalClassesCol !== -1 && !isNaN(Number(row[totalClassesCol]))) ? Number(row[totalClassesCol]) : (pCount + aCount);
      var totP = (totalPCol !== -1 && !isNaN(Number(row[totalPCol]))) ? Number(row[totalPCol]) : pCount;
      var totA = (totalACol !== -1 && !isNaN(Number(row[totalACol]))) ? Number(row[totalACol]) : aCount;
      var pct = totClasses > 0 ? Math.round((totP / totClasses) * 100) : 0;
      if (pctCol !== -1 && row[pctCol] !== undefined && row[pctCol] !== null && row[pctCol] !== '') {
        var rawPct = Number(row[pctCol]);
        if (!isNaN(rawPct)) {
          if (rawPct <= 1.0 && rawPct > 0) rawPct = rawPct * 100;
          pct = Math.round(rawPct);
        }
      }

      res.push({
        rollNo: String(rNo).trim(),
        name: String(stName).trim(),
        batch: batch,
        subject: name,
        dates: datesObj,
        totalP: totP,
        totalA: totA,
        total: totClasses,
        pct: pct
      });
    }
  }

  return { success: true, count: res.length, attendance: res };
}

function getTaughtTopics(code, outputSheetId, sheetId) {
  try {
    if (!outputSheetId && sheetId) outputSheetId = getOutputSheetId(sheetId);
    var cleanOutId = extractSpreadsheetId(outputSheetId);
    if (!cleanOutId) return { success: false, error: 'Invalid Output Sheet Link' };
    var outSs = SpreadsheetApp.openById(cleanOutId);
    var sheets = outSs.getSheets();
    var parsedInput = _parseSubjectCode(code);
    var found = {};
    for (var i = 0; i < sheets.length; i++) {
      var s = sheets[i];
      var parsedSheet = _parseSubjectCode(s.getName());
      var cleanName = s.getName().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (parsedSheet.isPractical !== parsedInput.isPractical) continue;
      if (parsedSheet.cleanBaseCode !== parsedInput.cleanBaseCode && cleanName.indexOf(parsedInput.cleanBaseCode) === -1) continue;
      var lc = s.getLastColumn(), lr = s.getLastRow();
      if (lc < 6 || lr < 6) continue;
      var rows = s.getRange(1, 1, Math.min(15, lr), lc).getValues();
      var hdr = -1;
      for (var r = 0; r < rows.length; r++) {
        var rowStr = rows[r].map(function (c) { return String(c || '').toLowerCase().trim(); }).join('|');
        if (rowStr.indexOf('roll no') !== -1 && rowStr.indexOf('name') !== -1 && (rowStr.indexOf('total p') !== -1 || rowStr.indexOf('% att') !== -1)) { hdr = r; break; }
      }
      if (hdr === -1) hdr = 5;
      var dateHdr = rows[hdr] || [], topicRow = rows[hdr + 1] || [];
      for (var c = 2; c < dateHdr.length; c++) {
        var dStr = String(dateHdr[c] || '').trim();
        var tStr = String(topicRow[c] || '').trim();
        if (dStr && tStr && tStr.toLowerCase() !== 'topic' && dStr.toLowerCase().indexOf('total') === -1) {
          found[dStr] = tStr;
        }
      }
    }
    return { success: true, count: Object.keys(found).length, taughtTopics: found };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════
   TEACHING PLAN & SYLLABUS HANDLERS
   ═══════════════════════════════════════════════════════════════ */

function getTeachingPlan(code, teacher, sheetId) {
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
    if (ymdRegex.test(str)) return str;
    var slashRegex = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/;
    var match = str.match(slashRegex);
    if (match) {
      var d = parseInt(match[1], 10), m = parseInt(match[2], 10), y = parseInt(match[3], 10);
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        try {
          return Utilities.formatDate(new Date(y, m - 1, d), timeZone, 'yyyy-MM-dd');
        } catch(e) {}
      }
    }
    var dmyRegex = /^\d{1,2}-[A-Za-z]{3}-\d{2,4}$/;
    if (dmyRegex.test(str)) return str;
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
    var ws = _findSheetByCode(tpSs, code);
    
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
      if (rowStr.indexOf('lecture no') !== -1 || rowStr.indexOf('sr. no.') !== -1 || rowStr.indexOf('unit') !== -1 || rowStr.indexOf('details of topic') !== -1 || rowStr.indexOf('syllabus') !== -1) {
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
          if ((cellVal.indexOf('total lectures/practical') !== -1 || cellVal.indexOf('total lectures') !== -1 || cellVal.indexOf('total practicals') !== -1 || cellVal.indexOf('total turn') !== -1) &&
              cellVal.indexOf('per week') === -1 && cellVal.indexOf('/week') === -1 && cellVal.indexOf('hours') === -1 && cellVal.indexOf('credits') === -1) {
            for (var c2 = c + 1; c2 < data[r].length; c2++) {
              var val = parseInt(data[r][c2]);
              if (!isNaN(val) && val > 5) {
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
        if (data[12] && data[12].length > 8) {
          var v12 = parseInt(data[12][8]) || 0;
          if (v12 > 5) totalLectures = v12;
        }
        if (data[13] && data[13].length > 8) {
          var v13 = parseInt(data[13][8]) || 0;
          if (v13 > 5) totalTutorials = v13;
        }
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
      if (h.indexOf('syllabus') !== -1 || h.indexOf('topic') !== -1 || h.indexOf('particular') !== -1 || h.indexOf('content') !== -1 || h.indexOf('description') !== -1 || h.indexOf('experiment') !== -1 || h.indexOf('details of') !== -1) {
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

    for (var i = startRow; i < data.length; i++) {
      var row = data[i];
      var rawSyl = row[colIdxSyllabus];
      var syllabus = '';
      if (rawSyl && !isDateOrNumberVal(rawSyl)) {
        syllabus = String(rawSyl).trim();
      }
      if (!syllabus) {
        for (var c = 0; c < row.length; c++) {
          var strCell = String(row[c] || '').trim();
          if (strCell.length > 5 && !isDateOrNumberVal(row[c]) && strCell.indexOf('Total') === -1 && strCell.indexOf('Signature') === -1) {
            syllabus = strCell;
            break;
          }
        }
      }

      if (syllabus && syllabus.indexOf('Total') === -1 && syllabus.indexOf('Signature') === -1) {
        var lectNoRaw = row[colIdxLectureNo] !== undefined ? String(row[colIdxLectureNo]).trim() : String(topics.length + 1);
        var lectNo = parseInt(lectNoRaw);
        if (isNaN(lectNo)) lectNo = topics.length + 1;

        var plannedDate = parseAndFormatDate(row[colIdxPlanned], tpSs.getSpreadsheetTimeZone());
        var executedDate = parseAndFormatDate(row[colIdxExecuted], tpSs.getSpreadsheetTimeZone());
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

    var parsedSubjectCodeInfo = _parseSubjectCode(code, '', subject);
    var fallbackTotal = parsedSubjectCodeInfo.isPractical ? 15 : 45;
    var conductedCount = topics.filter(function(t) { return t.executedDate !== ''; }).length;
    var effectiveTotal = totalLectures > 0 ? totalLectures : (topics.length > 0 ? topics.length : fallbackTotal);
    if (topics.length > 0) {
      effectiveTotal = Math.max(topics.length, totalLectures);
    }
    var percent = effectiveTotal > 0 ? Math.min(100, Math.round((conductedCount / effectiveTotal) * 100)) : 0;

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
        totalLectures: effectiveTotal,
        totalTutorials: totalTutorials,
        conductedLectures: conductedCount,
        percent: percent
      },
      theory: topics
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function syncTeachingPlan(code, teacher, sheetId) {
  try {
    var targetIds = getTargetSheetIds(code, sheetId);
    if (!targetIds.teachingPlanId) {
      return { success: false, error: 'Teaching plan spreadsheet not found' };
    }

    var outputSheetId = targetIds.outputSheetId || getOutputSheetId(sheetId);
    var taughtResult = getTaughtTopics(code, outputSheetId, sheetId);
    var taughtMap = taughtResult.success ? (taughtResult.taughtTopics || {}) : {};

    var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
    var ws = _findSheetByCode(tpSs, code);
    if (!ws) {
      return { success: false, error: 'Teaching plan sheet not found' };
    }

    var data = ws.getDataRange().getValues();
    var headerRowIdx = -1;
    for (var r = 0; r < Math.min(data.length, 25); r++) {
      var rowStr = data[r].join(' ').toLowerCase();
      if (rowStr.indexOf('lecture no') !== -1 || rowStr.indexOf('sr. no.') !== -1 || rowStr.indexOf('unit') !== -1 || rowStr.indexOf('details of topic') !== -1 || rowStr.indexOf('syllabus') !== -1) {
        headerRowIdx = r;
        break;
      }
    }
    if (headerRowIdx === -1) headerRowIdx = 14;

    var colIdxPlanned = -1, colIdxExecuted = -1, colIdxSyllabus = -1;
    var headerRow = data[headerRowIdx] || [];
    for (var c = 0; c < headerRow.length; c++) {
      var h = String(headerRow[c] || '').toLowerCase().trim();
      if (h.indexOf('syllabus') !== -1 || h.indexOf('topic') !== -1) colIdxSyllabus = c;
      if (h.indexOf('planned') !== -1) colIdxPlanned = c;
      if (h.indexOf('executed') !== -1 || h.indexOf('conducted') !== -1) colIdxExecuted = c;
    }
    if (colIdxSyllabus === -1) colIdxSyllabus = 2;
    if (colIdxPlanned === -1) colIdxPlanned = 3;
    if (colIdxExecuted === -1) colIdxExecuted = 4;

    var updatedCount = 0;
    var dates = Object.keys(taughtMap);

    for (var i = headerRowIdx + 1; i < data.length; i++) {
      var currentExecuted = data[i][colIdxExecuted];
      if (!currentExecuted && updatedCount < dates.length) {
        var dateToSet = dates[updatedCount];
        ws.getRange(i + 1, colIdxExecuted + 1).setValue(dateToSet);
        updatedCount++;
      }
    }

    return { success: true, updatedRows: updatedCount };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function saveRemark(code, rowIndex, remark, sheetId) {
  try {
    var targetIds = getTargetSheetIds(code, sheetId);
    if (!targetIds.teachingPlanId) return { success: false, error: 'No teaching plan sheet found' };
    var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
    var ws = _findSheetByCode(tpSs, code);
    if (!ws) return { success: false, error: 'Sheet not found' };

    var data = ws.getDataRange().getValues();
    var headerRowIdx = -1;
    for (var r = 0; r < Math.min(data.length, 25); r++) {
      var rowStr = data[r].join(' ').toLowerCase();
      if (rowStr.indexOf('lecture no') !== -1 || rowStr.indexOf('sr. no.') !== -1 || rowStr.indexOf('details of topic') !== -1 || rowStr.indexOf('syllabus') !== -1) {
        headerRowIdx = r;
        break;
      }
    }
    if (headerRowIdx === -1) headerRowIdx = 14;

    var colIdxRemark = -1;
    var headerRow = data[headerRowIdx] || [];
    for (var c = 0; c < headerRow.length; c++) {
      var h = String(headerRow[c] || '').toLowerCase().trim();
      if (h.indexOf('remark') !== -1 || h.indexOf('pedagogy') !== -1) {
        colIdxRemark = c;
        break;
      }
    }
    if (colIdxRemark === -1) colIdxRemark = 5;

    ws.getRange(rowIndex, colIdxRemark + 1).setValue(remark);
    return { success: true, rowIndex: rowIndex, remark: remark };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function addCustomSyllabusTopic(data, sheetId) {
  try {
    var code = data.code;
    var topic = data.topic;
    var remark = data.remark || '';
    var date = data.date || '';

    if (!code || !topic) return { success: false, error: 'Code and topic are required' };

    var targetIds = getTargetSheetIds(code, sheetId);
    if (!targetIds.teachingPlanId) return { success: false, error: 'Teaching plan spreadsheet not found' };
    var tpSs = _getSpreadsheet(targetIds.teachingPlanId);
    var ws = _findSheetByCode(tpSs, code);
    if (!ws) return { success: false, error: 'Teaching plan sheet not found' };

    var lastRow = ws.getLastRow();
    ws.appendRow([lastRow, topic, date, date, remark]);
    return { success: true, message: 'Topic appended successfully' };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function getSyllabus(link, code, sheetId) {
  try {
    var sId = extractSpreadsheetId(link) || getTargetSheetIds(code, sheetId).teachingPlanId;
    if (!sId) return { success: false, error: 'Syllabus link invalid' };
    return getSyllabusPointsFromLink("https://docs.google.com/spreadsheets/d/" + sId + "/edit", code);
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function getSyllabusPointsFromLink(url, code) {
  try {
    var sId = extractSpreadsheetId(url);
    if (!sId) return { success: false, error: 'Invalid URL' };
    var ss = _getSpreadsheet(sId);
    var ws = _findSheetByCode(ss, code);
    if (!ws) return { success: false, error: 'Syllabus tab not found' };
    var data = ws.getDataRange().getValues();
    var topics = [];
    for (var r = 0; r < data.length; r++) {
      for (var c = 0; c < data[r].length; c++) {
        var str = String(data[r][c] || '').trim();
        if (str.length > 8 && !isDateOrNumberVal(data[r][c])) {
          topics.push({ topic: str });
        }
      }
    }
    return { success: true, count: topics.length, topics: topics };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/* ═══════════════════════════════════════════════════════════════
   ACADEMIC SCHEDULE & DOCUMENTS (TIMETABLES & CALENDARS)
   ═══════════════════════════════════════════════════════════════ */

function _isAcademicCalendarsFolder(name) {
  if (!name) return false;
  var n = String(name).trim().toLowerCase();
  return (n === "academic calendars" || n === "academic calendar" || n === "academic schedules" || n === "academic schedule" || n.indexOf("academic calendar") !== -1);
}

function _findAcademicFolder(parentFolder, autoCreate) {
  if (!parentFolder) return null;
  var subFolders = parentFolder.getFolders();
  while (subFolders.hasNext()) {
    var f = subFolders.next();
    if (_isAcademicCalendarsFolder(f.getName())) {
      return f;
    }
  }
  if (autoCreate) {
    try {
      return parentFolder.createFolder("Academic Calendars");
    } catch(e) {
      Logger.log("Failed to create Academic Calendars folder: " + e.message);
    }
  }
  return null;
}

function _resolveCollegeTeachingPlanId(sheetId, teachingPlanLink) {
  if (teachingPlanLink) {
    var explicitId = extractSpreadsheetId(teachingPlanLink);
    if (explicitId) return explicitId;
  }
  var MASTER_CONFIG_ID = "1p3WoC2s-YYqn9ekqkQ72banxAAd-ujlDoFYpv4fkXmk";
  try {
    var ss = _getSpreadsheet(MASTER_CONFIG_ID);
    var ws = ss.getSheetByName('colleges') || ss.getSheets()[0];
    var data = ws.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var rawLink = String(row[1] || '');
      var cId = extractSpreadsheetId(rawLink) || rawLink;
      if (cId === sheetId || (rawLink && rawLink.indexOf(sheetId) !== -1)) {
        if (row[3]) {
          var id3 = extractSpreadsheetId(String(row[3]).trim());
          if (id3) return id3;
        }
      }
    }
  } catch(e) {}
  return sheetId;
}

function getAcademicSchedule(sheetId, teachingPlanLink) {
  try {
    var targetSpreadsheetId = _resolveCollegeTeachingPlanId(sheetId, teachingPlanLink);
    var parentFolder = null;
    var targetFile = null;

    if (targetSpreadsheetId) {
      try {
        targetFile = DriveApp.getFileById(targetSpreadsheetId);
        var parents = targetFile.getParents();
        if (parents.hasNext()) {
          parentFolder = parents.next();
        }
      } catch(e) {
        Logger.log("Could not find parent folder via getFileById: " + e.message);
      }
    }

    if (!parentFolder) {
      var defaultFolderIter = DriveApp.getFoldersByName("Academic Calendars");
      if (defaultFolderIter.hasNext()) {
        parentFolder = defaultFolderIter.next();
      }
    }

    if (!parentFolder) {
      return {
        success: true,
        timetables: [],
        calendars: [],
        folderId: "",
        folderName: "Academic Calendars",
        notice: "Folder not found in Drive"
      };
    }

    var acadFolder = _findAcademicFolder(parentFolder, false) || parentFolder;
    var timetables = [];
    var calendars = [];
    var files = acadFolder.getFiles();

    while (files.hasNext()) {
      var file = files.next();
      var fName = file.getName();
      var mime = file.getMimeType();
      var thumb = "";
      try { thumb = file.getThumbnail() ? file.getThumbnail().getUrl() : ""; } catch(te) {}

      var fileObj = {
        id: file.getId(),
        name: fName,
        mimeType: mime,
        webViewLink: file.getUrl(),
        thumbnailLink: thumb,
        lastUpdated: file.getLastUpdated().toISOString()
      };

      var fLower = fName.toLowerCase();
      if (fLower.indexOf("timetable") !== -1 || fLower.indexOf("time table") !== -1 || fLower.indexOf("time-table") !== -1 || fLower.indexOf("tt") !== -1) {
        timetables.push(fileObj);
      } else {
        calendars.push(fileObj);
      }
    }

    return {
      success: true,
      timetables: timetables,
      calendars: calendars,
      folderId: acadFolder.getId(),
      folderName: acadFolder.getName()
    };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function uploadAcademicDocument(data, sheetId) {
  try {
    if (!data || !data.fileData || !data.fileName) {
      return { success: false, error: "Invalid file data or file name." };
    }

    var targetSpreadsheetId = _resolveCollegeTeachingPlanId(sheetId, data.teachingPlanLink);
    var parentFolder = null;
    var targetFile = null;

    if (targetSpreadsheetId) {
      try {
        targetFile = DriveApp.getFileById(targetSpreadsheetId);
        var parents = targetFile.getParents();
        if (parents.hasNext()) {
          parentFolder = parents.next();
        }
      } catch(e) {}
    }

    if (!parentFolder) {
      var defaultFolderIter = DriveApp.getFoldersByName("Academic Calendars");
      if (defaultFolderIter.hasNext()) {
        parentFolder = defaultFolderIter.next();
      } else {
        parentFolder = DriveApp.getRootFolder();
      }
    }

    var uploadFolder = _findAcademicFolder(parentFolder, true) || parentFolder;
    var rawBase64 = data.fileData;
    if (rawBase64.indexOf("base64,") !== -1) {
      rawBase64 = rawBase64.split("base64,")[1];
    }
    var decodedBlob = Utilities.newBlob(Utilities.base64Decode(rawBase64), data.mimeType || "application/pdf", data.fileName);
    var uploadedFile = uploadFolder.createFile(decodedBlob);
    try { uploadedFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(se) {}

    return {
      success: true,
      file: {
        id: uploadedFile.getId(),
        name: uploadedFile.getName(),
        mimeType: uploadedFile.getMimeType(),
        webViewLink: uploadedFile.getUrl(),
        lastUpdated: uploadedFile.getLastUpdated().toISOString()
      }
    };
  } catch (err) {
    return { success: false, error: "Drive Upload Failed: " + err.message };
  }
}
