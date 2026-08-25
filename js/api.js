/**
 * Academic File PWA — Google Sheets API Module (v2.0 — Session Cache)
 * 
 * On app launch, calls getBulkSessionData() ONCE to download all data.
 * All subsequent reads (getStudents, getAttendance, getDashboard, etc.)
 * are served from local JS memory — zero API calls during the session.
 * Write operations (saveRemark, upload, sync) still hit the network.
 * App restart = fresh data download.
 */

const API = (() => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1500;

  // ═══════════════════════════════════════════════════════
  //  SESSION CACHE — Local in-memory store for the session
  // ═══════════════════════════════════════════════════════

  const SessionCache = {
    data: null,
    loaded: false,

    /** Initialize the session cache with bulk data from the server */
    load(bulkData) {
      if (!bulkData || !bulkData.success) return false;
      this.data = bulkData;
      this.loaded = true;
      console.log('[SessionCache] Loaded —',
        (bulkData.subjects || []).length, 'subjects,',
        (bulkData.teachers || []).length, 'teachers,',
        Object.keys(bulkData.students || {}).length, 'class rosters,',
        ((bulkData.attendance && bulkData.attendance.records) || []).length, 'attendance records'
      );
      return true;
    },

    /** Clear the cache (on app close / restart) */
    clear() {
      this.data = null;
      this.loaded = false;
    }
  };

  // ═══════════════════════════════════════════════════════
  //  INTERNAL HELPERS
  // ═══════════════════════════════════════════════════════

  function _getBaseUrl() {
    return (window.appStartContext && window.appStartContext.serverUrl) || (window.ACAD_CONFIG && window.ACAD_CONFIG.API_URL) || '';
  }

  function _getSheetId() {
    return (window.appStartContext && window.appStartContext.sheetId) || (window.ACAD_CONFIG && window.ACAD_CONFIG.SHEET_ID) || '';
  }

  async function _get(action, params = {}) {
    params.sheetId = _getSheetId();
    let url = _getBaseUrl() + '?action=' + encodeURIComponent(action);
    for (const k in params) {
      if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
        url += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }
    }

    let lastErr;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const res = await fetch(url, { method: 'GET', redirect: 'follow' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let data = await res.json();
        if (data && data.success && data.data && typeof data.data === 'object') {
          data = { ...data, ...data.data };
        }
        return data;
      } catch (err) {
        lastErr = err;
        if (i < MAX_RETRIES - 1) await _sleep(RETRY_DELAY_MS * (i + 1));
      }
    }
    throw lastErr;
  }

  async function _post(action, body) {
    body.sheetId = _getSheetId();
    const url = _getBaseUrl() + '?action=' + encodeURIComponent(action);

    let lastErr;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow'
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let data = await res.json();
        if (data && data.success && data.data && typeof data.data === 'object') {
          data = { ...data, ...data.data };
        }
        return data;
      } catch (err) {
        lastErr = err;
        if (i < MAX_RETRIES - 1) await _sleep(RETRY_DELAY_MS * (i + 1));
      }
    }
    throw lastErr;
  }

  function _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ═══════════════════════════════════════════════════════
  //  SESSION CACHE INITIALIZATION
  // ═══════════════════════════════════════════════════════

  /**
   * Call ONCE on app launch. Downloads all data in a single API call.
   * After this, all read operations are served from local memory.
   */
  async function initSessionCache() {
    if (SessionCache.loaded) return SessionCache.data;

    if (!navigator.onLine) {
      console.warn('[SessionCache] Offline — cannot initialize');
      return null;
    }

    try {
      console.log('[SessionCache] Downloading bulk session data...');
      const data = await _get('getBulkSessionData');
      if (data && data.success && data._bulkSession) {
        SessionCache.load(data);
        return data;
      }
      console.warn('[SessionCache] Bulk download returned unsuccessful:', data && data.error);
      return null;
    } catch (e) {
      console.error('[SessionCache] Bulk download failed:', e.message);
      return null;
    }
  }

  /** Check if session cache is loaded and available */
  function isSessionCacheLoaded() {
    return SessionCache.loaded;
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC READ APIs — Cache-first, network fallback
  // ═══════════════════════════════════════════════════════

  async function getAllData() {
    if (SessionCache.loaded) {
      return {
        success: true,
        teachers: SessionCache.data.teachers || [],
        subjects: SessionCache.data.subjects || [],
        attendanceLimit: SessionCache.data.attendanceLimit || 75,
        config: SessionCache.data.config || {}
      };
    }

    if (navigator.onLine) {
      try {
        const data = await _get('getAllData');
        if (data.success || data.teachers) {
          data.success = true;
          return data;
        }
        return data;
      } catch (e) {
        console.warn('API.getAllData network failed:', e.message);
      }
    }
    return { success: false, error: 'No data available. Please connect to the internet.' };
  }

  async function getSubjects(teacher) {
    if (SessionCache.loaded) {
      let subjects = SessionCache.data.enrichedSubjects || SessionCache.data.subjects || [];
      if (teacher) {
        const t = teacher.toLowerCase();
        subjects = subjects.filter(s => {
          const fac = String(s.faculty || '').toLowerCase();
          return fac.split(',').map(x => x.trim()).includes(t);
        });
      }
      return { success: true, subjects: subjects };
    }

    if (navigator.onLine) {
      try {
        return await _get('getSubjects', { teacher: teacher || '' });
      } catch (e) {
        console.warn('API.getSubjects network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline.' };
  }

  async function getStudents(sheetName, batchGroup) {
    if (SessionCache.loaded && SessionCache.data.students) {
      let cached = SessionCache.data.students[sheetName];
      if (!cached && sheetName) {
        const targetClean = String(sheetName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const k of Object.keys(SessionCache.data.students)) {
          const kClean = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (kClean === targetClean || (targetClean && (kClean.includes(targetClean) || targetClean.includes(kClean)))) {
            cached = SessionCache.data.students[k];
            break;
          }
        }
      }
      if (cached) {
        let students = cached;
        if (batchGroup) {
          students = students.filter(s => s.batch === batchGroup);
        }
        return { success: true, students: students, sheet: sheetName };
      }
      return { success: true, students: [], sheet: sheetName };
    }

    if (navigator.onLine) {
      try {
        return await _get('getStudents', { sheet: sheetName || '', batch: batchGroup || '' });
      } catch (e) {
        console.warn('API.getStudents network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline or failed to fetch students.' };
  }

  async function getAttendance(code, year, date, outputSheetId) {
    if (SessionCache.loaded && SessionCache.data.attendance) {
      const allRecords = SessionCache.data.attendance.records || [];
      const filtered = allRecords.filter(r => {
        if (code && code !== '*' && code !== 'all') {
          const recCode = String(r.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          const inputCode = String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (recCode !== inputCode && recCode.indexOf(inputCode) === -1 && inputCode.indexOf(recCode) === -1) {
            return false;
          }
        }
        if (date && String(r.date || '').indexOf(date) === -1) {
          return false;
        }
        return true;
      });
      return { success: true, records: filtered };
    }

    if (navigator.onLine) {
      try {
        return await _get('getAttendance', { code: code || '', year: year || '', date: date || '', outputSheetId: outputSheetId || '' });
      } catch (e) {
        console.warn('API.getAttendance network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline or failed to fetch attendance.' };
  }

  async function getInchargeDashboard() {
    if (SessionCache.loaded && SessionCache.data.dashboard) {
      return SessionCache.data.dashboard;
    }

    if (navigator.onLine) {
      try {
        return await _get('getInchargeDashboard');
      } catch (e) {
        console.warn('API.getInchargeDashboard failed:', e.message);
      }
    }
    return { success: false, error: 'Offline.' };
  }

  async function getAcademicIncharges() {
    if (SessionCache.loaded && SessionCache.data.incharges) {
      return { success: true, incharges: SessionCache.data.incharges };
    }

    if (navigator.onLine) {
      try {
        return await _get('getAcademicIncharges');
      } catch (e) {
        console.warn('API.getAcademicIncharges network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline.' };
  }

  // ═══════════════════════════════════════════════════════
  //  READ APIs — Always network (per-subject, not bulk)
  // ═══════════════════════════════════════════════════════

  async function getTeachingPlan(code, teacher, batch) {
    if (navigator.onLine) {
      try {
        return await _get('getTeachingPlan', { code: code, teacher: teacher, batch: batch || '' });
      } catch (e) {
        console.warn('API.getTeachingPlan network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline. Unable to load teaching plan.' };
  }

  async function getAcademicSchedule(explicitTpLink) {
    let tpLink = explicitTpLink || '';
    if (!tpLink && typeof App !== 'undefined' && App.state) {
      if (App.state.activeSubject && App.state.activeSubject.teachingPlanLink) {
        tpLink = App.state.activeSubject.teachingPlanLink;
      } else if (App.state.subjects && App.state.subjects.length) {
        const found = App.state.subjects.find(s => s && s.teachingPlanLink);
        if (found) tpLink = found.teachingPlanLink;
      } else if (App.state.allData && App.state.allData.subjects && App.state.allData.subjects.length) {
        const found = App.state.allData.subjects.find(s => s && s.teachingPlanLink);
        if (found) tpLink = found.teachingPlanLink;
      }
    }
    if (!tpLink) {
      const ctx = window.appStartContext || {};
      tpLink = ctx.teachingPlanLink || (ctx.config && (ctx.config.teaching_plan_link || ctx.config.teachingPlanLink)) || '';
    }

    if (navigator.onLine) {
      try {
        return await _get('getAcademicSchedule', { teachingPlanLink: tpLink });
      } catch (e) {
        console.warn('API.getAcademicSchedule failed:', e.message);
      }
    }
    return { success: false, error: 'Offline.' };
  }

  // ═══════════════════════════════════════════════════════
  //  WRITE APIs — Always hit the network
  // ═══════════════════════════════════════════════════════

  async function syncTeachingPlan(code, teacher, batch) {
    if (!navigator.onLine) {
      return getTeachingPlan(code, teacher, batch);
    }
    try {
      return await _get('syncTeachingPlan', { code: code, teacher: teacher, batch: batch || '' });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function saveRemark(code, rowIndex, remark) {
    if (!navigator.onLine) {
      return { success: false, error: 'Cannot save remark offline. Connect to the internet.' };
    }
    try {
      return await _post('saveRemark', { code, rowIndex, remark });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function addCustomSyllabusTopic(code, topic, remark, date) {
    if (!navigator.onLine) {
      return { success: false, error: 'Cannot add custom topic offline.' };
    }
    try {
      return await _post('addCustomSyllabusTopic', { code, topic, remark, date });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function academicInchargeLogin(name, pin) {
    if (!navigator.onLine) {
      return { success: false, error: 'Cannot authenticate offline. Connect to the internet.' };
    }
    try {
      return await _get('academicInchargeLogin', { name, pin });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function uploadAcademicDocument(fileData, fileName, mimeType, docType, teachingPlanLink) {
    if (!navigator.onLine) return { success: false, error: 'Offline. Connect to internet to upload documents.' };
    try {
      return await _post('uploadAcademicDocument', {
        fileData,
        fileName,
        mimeType,
        docType: docType || 'timetable',
        teachingPlanLink: teachingPlanLink || ''
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  // ═══════════════════════════════════════════════════════
  //  PUBLIC INTERFACE
  // ═══════════════════════════════════════════════════════

  return {
    // Session cache management
    initSessionCache,
    isSessionCacheLoaded,

    // Read APIs (cache-first)
    getAllData,
    getSubjects,
    getStudents,
    getAttendance,
    getInchargeDashboard,
    getAcademicIncharges,

    // Read APIs (always network)
    getTeachingPlan,
    syncTeachingPlan,
    getAcademicSchedule,

    // Write APIs (always network)
    saveRemark,
    addCustomSyllabusTopic,
    academicInchargeLogin,
    uploadAcademicDocument
  };
})();
