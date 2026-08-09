/**
 * Academic File PWA — Google Sheets API Module
 * Integrates with Central Google Apps Script backend.
 */

const API = (() => {
  const CACHE_PREFIX = 'acad_cache_';
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1500;

  function _getBaseUrl() {
    return (window.appStartContext && window.appStartContext.serverUrl) || (window.ACAD_CONFIG && window.ACAD_CONFIG.API_URL) || '';
  }

  function _getSheetId() {
    return (window.appStartContext && window.appStartContext.sheetId) || (window.ACAD_CONFIG && window.ACAD_CONFIG.SHEET_ID) || '';
  }

  // ─── Internal helpers ───
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

  // ─── Cache ───
  function _setCache(key, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch (e) { /* quota exceeded */ }
  }

  function _getCache(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw).data;
    } catch { return null; }
  }

  // ─── Public API ───
  async function getAllData() {
    if (navigator.onLine) {
      try {
        const data = await _get('getAllData');
        if (data.success || data.teachers) {
          data.success = true;
          _setCache('allData', data);
          return data;
        }
        const cached = _getCache('allData');
        if (cached) return cached;
        return data;
      } catch (e) {
        console.warn('API.getAllData network failed:', e.message);
      }
    }
    const cached = _getCache('allData');
    if (cached) return cached;
    return { success: false, error: 'No offline cache available. Please connect to the internet.' };
  }

  async function getTeachingPlan(code, teacher) {
    const cacheKey = 'teaching_plan_' + code;
    if (navigator.onLine) {
      try {
        const data = await _get('getTeachingPlan', { code: code, teacher: teacher });
        if (data.success) {
          _setCache(cacheKey, data);
          return data;
        }
        const cached = _getCache(cacheKey);
        if (cached) return cached;
        return data;
      } catch (e) {
        console.warn('API.getTeachingPlan network failed:', e.message);
      }
    }
    const cached = _getCache(cacheKey);
    if (cached) return cached;
    return { success: false, error: 'Offline. Unable to load teaching plan.' };
  }

  async function syncTeachingPlan(code, teacher) {
    if (!navigator.onLine) {
      return getTeachingPlan(code, teacher); // fallback to cached teaching plan
    }
    try {
      const data = await _get('syncTeachingPlan', { code: code, teacher: teacher });
      if (data.success) {
        _setCache('teaching_plan_' + code, data);
      }
      return data;
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function saveRemark(code, rowIndex, remark) {
    if (!navigator.onLine) {
      return { success: false, error: 'Cannot save remark offline. Connect to the internet.' };
    }
    try {
      return await _post('saveRemark', {
        code: code,
        rowIndex: rowIndex,
        remark: remark
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async function addCustomSyllabusTopic(code, topic, remark, date) {
    if (!navigator.onLine) {
      return { success: false, error: 'Cannot add custom topic offline.' };
    }
    try {
      return await _post('addCustomSyllabusTopic', {
        code: code,
        topic: topic,
        remark: remark,
        date: date
      });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }


  async function getAcademicSchedule(explicitTpLink) {
    const cacheKey = 'academic_schedule';
    
    // Comprehensive resolution of college Teaching Plan Link
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
        const data = await _get('getAcademicSchedule', { teachingPlanLink: tpLink });
        if (data.success) {
          _setCache(cacheKey, data);
          return data;
        }
        if (data.error && /permission|folder not found|security block|drive|not configured/i.test(data.error)) {
          return data;
        }
        const cached = _getCache(cacheKey);
        if (cached) return cached;
        return data;
      } catch (e) {
        console.warn('API.getAcademicSchedule failed:', e.message);
        if (e.message && /permission|folder not found|security block|drive|not configured/i.test(e.message)) {
          return { success: false, error: e.message };
        }
      }
    }
    const cached = _getCache(cacheKey);
    if (cached) return cached;
    return { success: false, error: 'Offline.' };
  }

  async function getSubjects(teacher) {
    if (navigator.onLine) {
      try {
        const data = await _get('getSubjects', { teacher: teacher || '' });
        return data;
      } catch (e) {
        console.warn('API.getSubjects network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline.' };
  }

  async function getAcademicIncharges() {
    if (navigator.onLine) {
      try {
        const data = await _get('getAcademicIncharges');
        if (data.success) {
          _setCache('academic_incharges', data);
          return data;
        }
        const cached = _getCache('academic_incharges');
        if (cached) return cached;
        return data;
      } catch (e) {
        console.warn('API.getAcademicIncharges network failed:', e.message);
      }
    }
    const cached = _getCache('academic_incharges');
    if (cached) return cached;
    return { success: false, error: 'Offline.' };
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

  async function getInchargeDashboard() {
    const cacheKey = 'incharge_dashboard';
    if (navigator.onLine) {
      try {
        const data = await _get('getInchargeDashboard');
        if (data.success) {
          _setCache(cacheKey, data);
          return data;
        }
        const cached = _getCache(cacheKey);
        if (cached) return cached;
        return data;
      } catch (e) {
        console.warn('API.getInchargeDashboard failed:', e.message);
      }
    }
    const cached = _getCache(cacheKey);
    if (cached) return cached;
    return { success: false, error: 'Offline.' };
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

  async function getStudents(sheetName, batchGroup) {
    if (navigator.onLine) {
      try {
        const data = await _get('getStudents', { sheet: sheetName || '', batch: batchGroup || '' });
        return data;
      } catch (e) {
        console.warn('API.getStudents network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline or failed to fetch students.' };
  }

  async function getAttendance(code, year, date, outputSheetId) {
    if (navigator.onLine) {
      try {
        const data = await _get('getAttendance', { code: code || '', year: year || '', date: date || '', outputSheetId: outputSheetId || '' });
        return data;
      } catch (e) {
        console.warn('API.getAttendance network failed:', e.message);
      }
    }
    return { success: false, error: 'Offline or failed to fetch attendance.' };
  }

  return {
    getAllData,
    getSubjects,
    getTeachingPlan,
    syncTeachingPlan,
    saveRemark,
    addCustomSyllabusTopic,
    getAcademicSchedule,
    getAcademicIncharges,
    academicInchargeLogin,
    getInchargeDashboard,
    uploadAcademicDocument,
    getStudents,
    getAttendance
  };
})();
