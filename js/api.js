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


  async function getAcademicSchedule() {
    const cacheKey = 'academic_schedule';
    if (navigator.onLine) {
      try {
        const data = await _get('getAcademicSchedule');
        if (data.success) {
          _setCache(cacheKey, data);
          return data;
        }
      } catch (e) {
        console.warn('API.getAcademicSchedule failed:', e.message);
      }
    }
    const cached = _getCache(cacheKey);
    if (cached) return cached;
    return { success: false, error: 'Offline.' };
  }

  return {
    getAllData,
    getTeachingPlan,
    syncTeachingPlan,
    saveRemark,
    addCustomSyllabusTopic,
    getAcademicSchedule
  };
})();
