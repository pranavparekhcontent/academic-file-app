/**
 * Academic File PWA — Core Controller (v2.8.5)
 * Manages states, inputs, syncing, auto-match remarks, averages, and compiler.
 */

const App = (() => {
  // ─── STATE ─────────────────────────────────────────────
  const state = {
    currentScreen: 'login', // setup, login, portal
    currentView: 'dashboard',
    
    // Config
    teachers: [],
    subjects: [],
    facultyName: '',
    allData: null,

    // Academic Incharge State
    academicIncharges: [],
    inchargeName: '',
    isAcademicIncharge: false,
    inchargeDashboard: null,
    _inchargeAttempts: {},
    _inchargeLocked: {},
    loginMode: 'faculty',
    
    // Active Workload Subject
    activeCode: '',
    activeSubject: null, // full subject details
    
    // Core Datasets
    teachingPlan: { theory: [], practical: [] },
    metadata: {},
    currentTpType: 'theory'
  };

  // ─── UTILS ─────────────────────────────────────────────
  function isPracticalSubject(subject) {
    if (!subject) return false;
    if (state.metadata && state.metadata.isPractical !== undefined) {
      if (state.metadata.isPractical) return true;
    }
    const type = String(subject.type || '').toLowerCase().trim();
    if (type.includes('practical') || type.includes('lab') || type === 'pr' || type === 'p') {
      return true;
    }
    const name = String(subject.name || '').toLowerCase().trim();
    if (name.includes('practical') || name.includes('lab')) {
      return true;
    }
    const code = String(subject.code || '').trim();
    // Strip parenthetical text e.g. "BP702P (A)" -> "BP702P"
    const baseCode = code.replace(/\s*\([^)]*\)/g, '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (/.*?\d+P$/i.test(baseCode) || baseCode.endsWith('P')) {
      return true;
    }
    return false;
  }

  function extractBatchInfo(topic, subject) {
    if (!topic) return 'Batch A';
    if (topic.batch) return String(topic.batch).trim();
    if (topic.executedBatch) return String(topic.executedBatch).trim();

    // Check syllabus text or remark
    const text = `${topic.syllabus || ''} ${topic.remark || ''} ${subject ? subject.name || '' : ''} ${subject ? subject.code || '' : ''}`;
    const match = text.match(/\b(batch\s*[a-d0-9]+|batch\s*[a-d]|batch\s*all)\b/i);
    if (match) {
      const raw = match[0].trim();
      return raw.charAt(0).toUpperCase() + raw.slice(1);
    }

    // Check parenthetical text in code e.g. "BP107P (B)" -> "Batch B"
    if (subject && subject.code) {
      const codeMatch = subject.code.match(/\(([^)]+)\)/);
      if (codeMatch && codeMatch[1]) {
        const val = codeMatch[1].trim();
        if (/^[a-d0-9]+$/i.test(val)) return `Batch ${val.toUpperCase()}`;
      }
    }

    // Default for practical milestones
    return 'Batch A';
  }

  // ─── TOAST NOTIFICATIONS ────────────────────────────────
  const Toast = {
    dismissAll() {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;
      stack.querySelectorAll('.toast').forEach(t => {
        t.classList.remove('active');
        if (t.parentNode) t.parentNode.removeChild(t);
      });
      stack.classList.remove('has-toasts');
    },

    show(title, msg, type = 'success') {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;

      // Deduplicate: Don't show duplicate toasts if identical toast is already active
      const activeToasts = stack.querySelectorAll('.toast');
      for (let t of activeToasts) {
        const h5 = t.querySelector('h5');
        const p = t.querySelector('p');
        if (h5 && p && h5.innerText === String(title) && p.innerText === String(msg)) {
          return; // Skip duplicate toast
        }
      }
      
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      
      let icon = 'ph-fill ph-check-circle';
      if (type === 'warning') icon = 'ph-fill ph-warning';
      if (type === 'danger') icon = 'ph-fill ph-warning-octagon';
      
      toast.innerHTML = `
        <i class="${icon}"></i>
        <div class="toast-details">
          <h5>${title}</h5>
          <p>${msg}</p>
        </div>
      `;
      
      stack.appendChild(toast);
      stack.classList.add('has-toasts');
      requestAnimationFrame(() => toast.classList.add('active'));
      
      setTimeout(() => {
        toast.classList.remove('active');
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
          // Remove backdrop if no more toasts
          if (stack.querySelectorAll('.toast').length === 0) {
            stack.classList.remove('has-toasts');
          }
        }, 350);
      }, 3000);
    },

    showSubjectPicker(facultySubs, onSelect) {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;

      // Remove existing subject picker toast if any
      const existing = stack.querySelector('.toast-subject-picker');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

      const toast = document.createElement('div');
      toast.className = 'toast warning toast-subject-picker';

      const itemsHtml = facultySubs.map(s => {
        const optionLabel = `${s.name} (${s.code}) - SEM ${s.semester}`;
        return `
          <div class="toast-glass-subject-item" data-code="${escHtml(s.code)}" data-label="${escHtml(optionLabel)}">
            <div class="toast-subject-icon"><i class="ph ph-book-bookmark"></i></div>
            <div class="toast-subject-details">
              <div class="toast-subject-name">${escHtml(s.name)}</div>
              <div class="toast-subject-meta">${escHtml(s.code)} • SEM ${escHtml(s.semester)}</div>
            </div>
            <i class="ph ph-caret-right toast-subject-arrow"></i>
          </div>
        `;
      }).join('');

      toast.innerHTML = `
        <div class="toast-details" style="width: 100%;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
            <i class="ph-fill ph-notebook" style="font-size: 22px; color: #60a5fa;"></i>
            <h5 style="font-size: 15px;">Select Workload Subject</h5>
          </div>
          <p style="margin-bottom: 12px; opacity: 0.85;">Choose your assigned subject to access files & syllabus plan:</p>
          <div class="toast-subject-list">
            ${itemsHtml}
          </div>
        </div>
      `;

      stack.appendChild(toast);
      stack.classList.add('has-toasts');
      requestAnimationFrame(() => toast.classList.add('active'));

      // Attach click listeners to custom glass subject items
      toast.querySelectorAll('.toast-glass-subject-item').forEach(item => {
        item.onclick = (e) => {
          e.stopPropagation();
          const code = item.dataset.code;
          const label = item.dataset.label;
          if (code) {
            toast.classList.remove('active');
            setTimeout(() => {
              if (toast.parentNode) toast.parentNode.removeChild(toast);
              if (stack.querySelectorAll('.toast').length === 0) {
                stack.classList.remove('has-toasts');
              }
            }, 350);
            if (onSelect) onSelect(code, label);
          }
        };
      });
    }
  };

  // ─── INITIALIZATION ─────────────────────────────────────
  async function init() {
    // Always force session clearance on fresh app launch
    localStorage.removeItem('acad_faculty');
    state.facultyName = '';

    // Register exit/unload listeners to always logout on app close/exit
    window.addEventListener('beforeunload', clearSession);
    window.addEventListener('pagehide', clearSession);

    // Read local storage configuration
    const savedConfig = localStorage.getItem('acad_config');
    if (savedConfig) {
      try {
        window.ACAD_CONFIG = JSON.parse(savedConfig);
      } catch (e) {}
    }

    // Set screen state
    updateMasterConfigDisplay();
    if (window.ACAD_CONFIG && window.ACAD_CONFIG.API_URL && window.ACAD_CONFIG.SHEET_ID) {
      showScreen('login');
      await loadTeachers();
    } else {
      showScreen('setup');
    }
    
    // Set network status listeners
    window.addEventListener('online', () => {
      document.body.classList.remove('offline');
      Toast.show('Connected', 'Systems are online.', 'success');
      triggerSyncAllViews();
    });
    window.addEventListener('offline', () => {
      document.body.classList.add('offline');
      Toast.show('Disconnected', 'Offline mode activated.', 'warning');
    });
    if (!navigator.onLine) document.body.classList.add('offline');
  }

  function clearSession() {
    localStorage.removeItem('acad_faculty');
    state.facultyName = '';
  }

  // ─── INITIALIZATION FROM ENGINE ─────────────────────────
  async function initFromEngine(context) {
    // Always force session clearance on fresh engine launch
    clearSession();

    // Immediately display login screen to eliminate any blank delay
    showScreen('login');

    // Register exit/unload listeners to always logout on app close/exit
    window.addEventListener('beforeunload', clearSession);
    window.addEventListener('pagehide', clearSession);

    // 1. Receive data from the engine's background fetch
    let rawData = null;
    if (context.fetchedData) {
      rawData = context.fetchedData.allData || context.fetchedData.data || context.fetchedData;
      if (typeof rawData === 'string' && rawData.trim().startsWith('{')) {
        try { rawData = JSON.parse(rawData); } catch(e) {}
      }
    }

    // 2. Validate and fallback if missing
    if (!rawData || (!rawData.success && !rawData.teachers)) {
      console.log("AppStart data missing or invalid, fetching directly...");
      rawData = await API.getAllData();
    }

    if (rawData) {
      state.allData = rawData;
      state.teachers = rawData.teachers || [];
      state.subjects = rawData.subjects || [];
    }

    // 3. Register network status listeners
    window.addEventListener('online', () => {
      document.body.classList.remove('offline');
      Toast.show('Connected', 'Systems are online.', 'success');
      triggerSyncAllViews();
    });
    window.addEventListener('offline', () => {
      document.body.classList.add('offline');
      Toast.show('Disconnected', 'Offline mode activated.', 'warning');
    });
    if (!navigator.onLine) document.body.classList.add('offline');

    // 4. Setup select options & update headers
    updateMasterConfigDisplay();
    buildFacultySelector();
  }

  function updateMasterConfigDisplay() {
    const ctx = window.appStartContext || {};
    const cfg = ctx.config || {};
    const meta = (state.allData && state.allData.metadata) || state.metadata || {};

    const mgmt = ctx.managementName || cfg.management_name || cfg.managementName || meta.managementName || (window.ACAD_CONFIG && window.ACAD_CONFIG.managementName) || '';
    const college = ctx.collegeName || cfg.college_name || cfg.collegeName || meta.collegeName || (window.ACAD_CONFIG && window.ACAD_CONFIG.collegeName) || '';
    const ay = cfg.academic_year || cfg.academicYear || cfg.ay || meta.academicYear || (window.ACAD_CONFIG && window.ACAD_CONFIG.academicYear) || '';

    // Store in state metadata so document generator & compiler use dynamic values
    if (!state.metadata) state.metadata = {};
    if (mgmt) state.metadata.managementName = mgmt;
    if (college) state.metadata.collegeName = college;
    if (ay) state.metadata.academicYear = ay;

    // 1. Update Login Subtitle
    const loginSubtitleEl = document.getElementById('login-subtitle');
    if (loginSubtitleEl) {
      const parts = [mgmt, college].filter(Boolean);
      loginSubtitleEl.innerText = parts.length > 0 ? parts.join(' — ') : 'Academic File Workspace';
    }

    // 2. Update Header Banner Management Name
    const mgmtEl = document.getElementById('header-mgmt-name');
    if (mgmtEl && mgmt) {
      mgmtEl.innerText = mgmt;
    }

    // 3. Update Header Banner College Name
    const collegeEl = document.getElementById('header-college-name');
    if (collegeEl && college) {
      collegeEl.innerText = college;
    }

    // 4. Update Header Banner Academic Year Pill
    const ayEl = document.getElementById('header-ay');
    if (ayEl && ay) {
      ayEl.innerText = String(ay).toLowerCase().includes('a.y') ? ay : `A.Y. ${ay}`;
    }
  }

  // ─── SCREEN NAVIGATION ──────────────────────────────────
  function showScreen(screenId) {
    state.currentScreen = screenId;
    document.getElementById('screen-setup').style.display = screenId === 'setup' ? 'flex' : 'none';
    document.getElementById('screen-login').style.display = screenId === 'login' ? 'flex' : 'none';
    document.getElementById('screen-portal').style.display = screenId === 'portal' ? 'flex' : 'none';
  }

  function switchView(viewId) {
    if (viewId === 'teaching-plan' && !state.activeCode) {
      const facultySubs = state.subjects.filter(s => {
        const teachers = s.faculty.split(',').map(name => name.trim().toLowerCase());
        return teachers.includes(state.facultyName.toLowerCase());
      });
      if (facultySubs.length > 0) {
        Toast.showSubjectPicker(facultySubs, (code, label) => {
          selectCustomSubjectOption(code, label);
        });
      } else {
        Toast.show('Select Subject Required', 'Please select your workload subject from the header dropdown first.', 'warning');
      }
      return;
    }

    state.currentView = viewId;

    // Hide all views
    document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
    // Show active view
    const target = document.getElementById('view-' + viewId);
    if (target) target.classList.add('active');

    // Update sidebar navigation active item
    document.querySelectorAll('.sidebar .nav-item').forEach(item => {
      item.classList.remove('active');
    });
    const activeNav = document.getElementById('nav-' + viewId);
    if (activeNav) activeNav.classList.add('active');

    // Update portal title
    const titles = {
      dashboard: 'Index',
      'academic-schedule': 'Academic Calendars & Timetable',
      'teaching-plan': 'Syllabus & Teaching Plan',
      'incharge-dashboard': 'Academic Incharge Dashboard',
      'incharge-reports': 'Academic Reports & Analytics'
    };
    document.getElementById('portal-view-title').innerText = titles[viewId] || 'Portal';

    // Toggle compile course file button visibility (Requirement 4)
    const compileBtn = document.querySelector('.topbar-right');
    if (compileBtn) {
      compileBtn.style.display = (state.isAcademicIncharge || viewId === 'incharge-dashboard' || viewId === 'incharge-reports') ? 'none' : 'flex';
    }

    // Hide topbar header strip for Academic Incharge session (both incharge dashboard & plan inspection), keep visible for Faculty dashboard
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.style.display = (state.isAcademicIncharge || viewId === 'incharge-dashboard' || viewId === 'incharge-reports') ? 'none' : 'flex';
    }

    // Hide subject select dropdown in incharge dashboard, as it is only for faculty
    const subjWrapper = document.getElementById('custom-subject-wrapper');
    if (subjWrapper) {
      subjWrapper.style.display = (viewId === 'incharge-dashboard' || viewId === 'incharge-reports') ? 'none' : 'flex';
    }

    // Hide Index button (nav-dashboard) & Syllabus/Plan button (nav-teaching-plan) for Academic Incharge
    const navIndex = document.getElementById('nav-dashboard');
    if (navIndex) {
      navIndex.style.display = state.isAcademicIncharge ? 'none' : 'flex';
    }
    const navTeachingPlan = document.getElementById('nav-teaching-plan');
    if (navTeachingPlan) {
      navTeachingPlan.style.display = state.isAcademicIncharge ? 'none' : 'flex';
    }
    const navInchargeReports = document.getElementById('nav-incharge-reports');
    if (navInchargeReports) {
      navInchargeReports.style.display = state.isAcademicIncharge ? 'flex' : 'none';
      navInchargeReports.classList.toggle('active', viewId === 'incharge-reports');
    }

    // Hide download syllabus completion button for Academic Incharge (not faculty task)
    const dlBtn = document.querySelector('.d5-glass-btn');
    if (dlBtn) {
      dlBtn.style.display = (state.isAcademicIncharge && viewId === 'teaching-plan') ? 'none' : '';
    }

    // Show/hide back-to-incharge-dashboard button
    const backBtn = document.getElementById('btn-back-incharge');
    if (backBtn) {
      backBtn.style.display = (state.isAcademicIncharge && viewId === 'teaching-plan') ? 'flex' : 'none';
    }

    // Hide Upload Document button for faculty — only Academic Incharge can upload
    const uploadDocBtn = document.getElementById('btn-upload-doc-header');
    if (uploadDocBtn) {
      uploadDocBtn.style.display = state.isAcademicIncharge ? '' : 'none';
    }

    // Synchronize views with current data
    if (viewId === 'teaching-plan') populateTeachingPlan();
    else if (viewId === 'academic-schedule') loadAcademicSchedule();
    else if (viewId === 'incharge-dashboard') loadInchargeDashboard();
    else if (viewId === 'incharge-reports') renderReportsPage();
  }

  // ─── SETUP SCREEN ──────────────────────────────────────
  function openSetup() {
    showScreen('setup');
    if (window.ACAD_CONFIG) {
      document.getElementById('setup-api-url').value = window.ACAD_CONFIG.API_URL || '';
      document.getElementById('setup-sheet-id').value = window.ACAD_CONFIG.SHEET_ID || '';
    }
  }

  function saveSetup() {
    const apiUrl = document.getElementById('setup-api-url').value.trim();
    const sheetId = document.getElementById('setup-sheet-id').value.trim();

    if (!apiUrl || !sheetId) {
      Toast.show('Setup Mismatch', 'Please fill in both URL credentials.', 'danger');
      return;
    }

    let cleanSheetId = sheetId;
    const match = sheetId.match(/\/d\/(.*?)(\/|$)/);
    if (match) cleanSheetId = match[1];

    window.ACAD_CONFIG = {
      API_URL: apiUrl.replace(/\/+$/, ''),
      SHEET_ID: cleanSheetId
    };

    localStorage.setItem('acad_config', JSON.stringify(window.ACAD_CONFIG));
    Toast.show('Config Saved', 'Connection parameters loaded.', 'success');
    showScreen('login');
    loadTeachers();
  }

  // ─── LOGIN SCREEN ──────────────────────────────────────
  async function loadTeachers() {
    const labelEl = document.getElementById('custom-faculty-label');
    const menu = document.getElementById('custom-faculty-menu');
    
    if (labelEl) labelEl.innerText = 'Loading faculty list...';
    if (menu) menu.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-secondary); text-align: center;">Loading faculty list...</div>';

    loadAcademicIncharges().catch(err => console.warn("Failed loading incharges:", err));

    try {
      const data = await API.getAllData();
      if (!data.success) {
        Toast.show('Refresh Failure', data.error || 'Server connection error.', 'danger');
        if (labelEl) labelEl.innerText = 'Offline Connection Failed';
        return;
      }

      state.allData = data;
      state.teachers = data.teachers || [];
      state.subjects = data.subjects || [];
      buildFacultySelector();
    } catch (e) {
      Toast.show('Network Issue', 'Verify API endpoint script connections.', 'danger');
      if (labelEl) labelEl.innerText = 'Network connection failed';
    }
  }

  async function loadAcademicIncharges() {
    try {
      const data = await API.getAcademicIncharges();
      if (data && data.success) {
        state.academicIncharges = data.incharges || [];
        buildInchargeSelector();
      }
    } catch(e) {
      console.warn("loadAcademicIncharges error:", e.message);
    }
  }

  function buildInchargeSelector() {
    const select = document.getElementById('login-incharge-select');
    const menu = document.getElementById('custom-incharge-menu');
    const label = document.getElementById('custom-incharge-label');
    if (!select && !menu) return;

    if (select) select.innerHTML = '<option value="">Select Academic Incharge</option>';
    if (menu) menu.innerHTML = '';

    if (!state.academicIncharges || state.academicIncharges.length === 0) {
      if (label) label.innerText = 'Select Academic Incharge';
      if (menu) menu.innerHTML = '<div style="padding: 12px; font-size: 12px; color: var(--text-secondary); text-align: center;">No incharges listed</div>';
      return;
    }

    state.academicIncharges.forEach(inc => {
      const isLocked = !!state._inchargeLocked[inc.name];
      if (select) {
        const opt = document.createElement('option');
        opt.value = inc.name;
        opt.textContent = isLocked ? `${inc.name} (Locked)` : inc.name;
        if (isLocked) opt.disabled = true;
        select.appendChild(opt);
      }

      if (menu) {
        const item = document.createElement('div');
        item.className = `custom-glass-option-item ${isLocked ? 'locked' : ''}`;
        item.innerHTML = `
          <i class="ph ph-shield-check option-icon"></i>
          <span>${escHtml(inc.name)}${isLocked ? ' <strong style="color:#ef4444;">(Locked)</strong>' : ''}</span>
        `;
        item.onclick = (e) => {
          e.stopPropagation();
          if (isLocked) {
            Toast.show('Account Locked', 'Incharge account locked due to 3 failed attempts.', 'danger');
            return;
          }
          selectCustomInchargeOption(inc.name, inc.name);
        };
        menu.appendChild(item);
      }
    });
  }

  function toggleCustomInchargeDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('custom-incharge-menu');
    const trig = document.getElementById('custom-incharge-trigger');
    if (menu && trig) {
      const isOpen = menu.style.display === 'block';
      menu.style.display = isOpen ? 'none' : 'block';
      trig.classList.toggle('active', !isOpen);
    }
  }

  function selectCustomInchargeOption(name, labelText) {
    const select = document.getElementById('login-incharge-select');
    const label = document.getElementById('custom-incharge-label');
    const menu = document.getElementById('custom-incharge-menu');
    const trig = document.getElementById('custom-incharge-trigger');

    if (select) select.value = name;
    if (label) label.innerText = labelText || name;
    if (menu) menu.style.display = 'none';
    if (trig) trig.classList.remove('active');
  }

  function switchLoginMode(mode) {
    state.loginMode = mode;
    const tabFac = document.getElementById('tab-faculty');
    const tabInc = document.getElementById('tab-incharge');
    const formFac = document.getElementById('login-faculty-form');
    const formInc = document.getElementById('login-incharge-form');

    if (tabFac) tabFac.classList.toggle('active', mode === 'faculty');
    if (tabInc) tabInc.classList.toggle('active', mode === 'incharge');
    if (formFac) formFac.style.display = mode === 'faculty' ? 'block' : 'none';
    if (formInc) formInc.style.display = mode === 'incharge' ? 'block' : 'none';
  }

  function showInchargePinPrompt() {
    if (state._inchargeLocked['global']) {
      Toast.show('Account Locked', 'Too many failed PIN attempts (3/3). Access locked until app restart.', 'danger');
      return;
    }
    const modal = document.getElementById('incharge-pin-modal');
    const pinInput = document.getElementById('login-incharge-pin-input');
    if (modal) {
      modal.style.display = 'flex';
      if (pinInput) {
        pinInput.value = '';
        setTimeout(() => pinInput.focus(), 150);
      }
    } else {
      const pin = prompt('Enter Academic Incharge Security PIN:');
      if (pin) doInchargeLogin(pin);
    }
  }

  function hideInchargePinPrompt() {
    const modal = document.getElementById('incharge-pin-modal');
    if (modal) modal.style.display = 'none';
  }

  async function doInchargeLogin(providedPin) {
    if (state._isAuthenticatingIncharge) return;

    const pinInput = document.getElementById('login-incharge-pin-input');
    const pin = providedPin !== undefined ? String(providedPin).trim() : (pinInput ? pinInput.value.trim() : '');
    const selName = document.getElementById('login-incharge-select') ? document.getElementById('login-incharge-select').value : '';

    if (!pin) {
      Toast.show('Validation Error', 'Enter Academic Incharge PIN code.', 'danger');
      return;
    }

    if (state._inchargeLocked['global']) {
      Toast.show('Account Locked', 'Too many failed PIN attempts (3/3). Access locked until app restart.', 'danger');
      return;
    }

    state._isAuthenticatingIncharge = true;

    const btn = document.getElementById('btn-incharge-login') || document.querySelector('.btn-incharge');
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.75';
      btn.style.cursor = 'not-allowed';
      btn.innerHTML = '<i class="ph ph-spinner spinner" style="font-size: 18px;"></i> Authenticating...';
    }
    if (pinInput) pinInput.disabled = true;

    try {
      const res = await API.academicInchargeLogin(selName, pin);
      if (res && res.success) {
        state._inchargeAttempts['global'] = 0;
        state.isAcademicIncharge = true;
        state.inchargeName = res.name || 'Academic Incharge';
        state.facultyName = state.inchargeName;

        hideInchargePinPrompt();

        // Update profile header UI
        const nameEl = document.getElementById('faculty-display-name');
        if (nameEl) {
          const rawName = state.inchargeName || 'Academic Incharge';
          nameEl.innerText = (rawName.toLowerCase().indexOf('academic incharge') !== -1) ? rawName : `${rawName} (Academic Incharge)`;
        }

        const avatarEl = document.getElementById('faculty-avatar');
        if (avatarEl) {
          const initials = state.inchargeName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
          avatarEl.innerText = initials || 'AI';
        }

        const navIncharge = document.getElementById('nav-incharge-dashboard');
        if (navIncharge) navIncharge.style.display = 'flex';

        const navIndex = document.getElementById('nav-dashboard');
        if (navIndex) navIndex.style.display = 'none';

        const navTeachingPlan = document.getElementById('nav-teaching-plan');
        if (navTeachingPlan) navTeachingPlan.style.display = 'none';

        showScreen('portal');
        switchView('incharge-dashboard');
        Toast.dismissAll();
        Toast.show('Access Granted', `Welcome ${state.inchargeName}`, 'success');
      } else {
        state._inchargeAttempts['global'] = (state._inchargeAttempts['global'] || 0) + 1;
        if (state._inchargeAttempts['global'] >= 3) {
          state._inchargeLocked['global'] = true;
          hideInchargePinPrompt();
          Toast.show('Account Locked', 'Too many failed PIN attempts (3/3). Access locked until app restart.', 'danger');
        } else {
          Toast.show('Access Denied', res.error || 'Incorrect security PIN code.', 'danger');
        }
      }
    } catch(e) {
      Toast.show('Network Error', e.message, 'danger');
    } finally {
      state._isAuthenticatingIncharge = false;
      if (btn) {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        btn.innerHTML = origHtml || '<i class="ph ph-key-return" style="font-size: 18px;"></i> Enter Dashboard';
      }
      if (pinInput) pinInput.disabled = false;
    }
  }

  async function doLogin() {
    const name = document.getElementById('login-teacher-select').value;
    const pin = document.getElementById('login-pin').value.trim();

    if (!name) { Toast.show('Validation Error', 'Select your faculty name first.', 'danger'); return; }
    if (!pin) { Toast.show('Validation Error', 'Password pin required.', 'danger'); return; }

    const teacher = state.teachers.find(t => t.name === name);
    if (!teacher) { Toast.show('Error', 'Faculty identity unrecognized.', 'danger'); return; }

    const validPins = teacher.pin.split(',').map(p => p.trim());
    if (!validPins.includes(pin)) {
      Toast.show('Access Denied', 'Incorrect PIN code password.', 'danger');
      return;
    }

    state.facultyName = name;
    state.isAcademicIncharge = false;
    state.activeCode = '';
    state.activeSubject = null;
    localStorage.setItem('acad_faculty', name);

    const navIncharge = document.getElementById('nav-incharge-dashboard');
    if (navIncharge) navIncharge.style.display = 'none';
    const navIndex = document.getElementById('nav-dashboard');
    if (navIndex) navIndex.style.display = 'flex';
    const navTeachingPlan = document.getElementById('nav-teaching-plan');
    if (navTeachingPlan) navTeachingPlan.style.display = 'flex';
    
    // Profile Header values
    document.getElementById('faculty-display-name').innerText = name;
    // Set avatar initials
    const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    document.getElementById('faculty-avatar').innerText = initials;

    showScreen('portal');
    buildSubjectSelector();

    // Trigger persistent subject picker toast right inside the toast itself
    setTimeout(() => {
      const facultySubs = state.subjects.filter(s => {
        const teachers = s.faculty.split(',').map(n => n.trim().toLowerCase());
        return teachers.includes(state.facultyName.toLowerCase());
      });
      if (facultySubs.length > 0 && !state.activeCode) {
        Toast.showSubjectPicker(facultySubs, (code, label) => {
          selectCustomSubjectOption(code, label);
        });
      }
    }, 350);
  }

  function doLogout() {
    state.facultyName = '';
    state.inchargeName = '';
    state.isAcademicIncharge = false;
    state.inchargeDashboard = null;
    state._inchargeAttempts = {};
    state._inchargeLocked = {};
    state.teachingPlan = { theory: [], practical: [] };
    localStorage.removeItem('acad_faculty');
    document.getElementById('login-pin').value = '';
    const inchargeNav = document.getElementById('nav-incharge-dashboard');
    if (inchargeNav) inchargeNav.style.display = 'none';
    const navIndex = document.getElementById('nav-dashboard');
    if (navIndex) navIndex.style.display = 'flex';
    const navTeachingPlan = document.getElementById('nav-teaching-plan');
    if (navTeachingPlan) navTeachingPlan.style.display = 'flex';
    showScreen('login');
    Toast.show('Signed Out', 'Academic session closed.', 'success');
  }

  // ─── LOCK SCREEN (BREAK / LECTURE MODE) ─────────────────
  function lockSession() {
    if (!state.facultyName) {
      Toast.show('Session Error', 'No active session to lock.', 'warning');
      return;
    }
    const overlay = document.getElementById('screen-lock');
    if (!overlay) return;

    // Update lock screen faculty details
    const facultyNameEl = document.getElementById('lock-faculty-name');
    const facultyAvatarEl = document.getElementById('lock-faculty-avatar');
    if (facultyNameEl) facultyNameEl.innerText = state.facultyName;
    if (facultyAvatarEl) {
      const initials = state.facultyName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      facultyAvatarEl.innerText = initials;
    }

    const pinInput = document.getElementById('lock-pin-input');
    if (pinInput) pinInput.value = '';

    overlay.style.display = 'flex';
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 150);
    Toast.show('Session Locked', 'Workspace protected for break or lecture.', 'warning');
  }

  function unlockSession() {
    const pinInput = document.getElementById('lock-pin-input');
    const enteredPin = pinInput ? pinInput.value.trim() : '';

    if (!enteredPin) {
      Toast.show('Validation Error', 'Enter your PIN code to unlock.', 'danger');
      return;
    }

    const teacher = state.teachers.find(t => t.name.toLowerCase() === state.facultyName.toLowerCase());
    if (!teacher) {
      Toast.show('Error', 'Faculty identity unrecognized.', 'danger');
      return;
    }

    const validPins = teacher.pin.split(',').map(p => p.trim());
    if (validPins.includes(enteredPin)) {
      const overlay = document.getElementById('screen-lock');
      if (overlay) overlay.style.display = 'none';
      if (pinInput) pinInput.value = '';
      Toast.show('Welcome Back', 'Session unlocked successfully.', 'success');
    } else {
      const card = document.getElementById('lock-card-box');
      if (card) {
        card.style.animation = 'none';
        card.offsetHeight; // trigger reflow
        card.style.animation = 'floatUp 0.3s ease';
      }
      Toast.show('Access Denied', 'Incorrect PIN code.', 'danger');
      if (pinInput) {
        pinInput.value = '';
        pinInput.focus();
      }
    }
  }

  // ─── LOGIN FACULTY SELECTOR (CUSTOM 3D GLASS DROPDOWN) ─────────────────────
  function toggleCustomFacultyDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('custom-faculty-menu');
    const trigger = document.getElementById('custom-faculty-trigger');
    const wrapper = document.getElementById('custom-faculty-wrapper');
    const fg = wrapper ? wrapper.closest('.form-group') : null;
    if (!menu) return;

    // Auto-populate if menu is empty
    if (!menu.children || menu.children.length === 0) {
      buildFacultySelector();
    }

    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
    if (trigger) {
      if (isVisible) {
        trigger.classList.remove('open');
        if (wrapper) wrapper.classList.remove('open');
        if (fg) fg.classList.remove('dropdown-open');
      } else {
        trigger.classList.add('open');
        if (wrapper) wrapper.classList.add('open');
        if (fg) fg.classList.add('dropdown-open');
      }
    }
  }

  function selectCustomFacultyOption(name) {
    const select = document.getElementById('login-teacher-select');
    const labelEl = document.getElementById('custom-faculty-label');
    const menu = document.getElementById('custom-faculty-menu');
    const trigger = document.getElementById('custom-faculty-trigger');
    const wrapper = document.getElementById('custom-faculty-wrapper');
    const fg = wrapper ? wrapper.closest('.form-group') : null;

    if (select) select.value = name;
    if (labelEl) labelEl.innerText = name || 'Select Faculty';
    if (menu) menu.style.display = 'none';
    if (trigger) trigger.classList.remove('open');
    if (wrapper) wrapper.classList.remove('open');
    if (fg) fg.classList.remove('dropdown-open');

    if (menu) {
      menu.querySelectorAll('.custom-glass-option').forEach(opt => {
        const check = opt.querySelector('.item-check');
        if (opt.dataset.name === name) {
          opt.classList.add('selected');
          if (check) check.style.display = 'inline-block';
        } else {
          opt.classList.remove('selected');
          if (check) check.style.display = 'none';
        }
      });
    }
  }

  function buildFacultySelector() {
    const select = document.getElementById('login-teacher-select');
    const menu = document.getElementById('custom-faculty-menu');
    const labelEl = document.getElementById('custom-faculty-label');

    if (select) select.innerHTML = '<option value="">Select Faculty</option>';
    if (menu) menu.innerHTML = '';

    if (!state.teachers || state.teachers.length === 0) {
      if (labelEl) labelEl.innerText = 'Select Faculty';
      if (menu) menu.innerHTML = '<div style="padding: 14px; font-size: 13px; font-weight: 600; color: #475569; text-align: center;">No faculty entries found</div>';
      return;
    }

    state.teachers.forEach(t => {
      const name = (typeof t === 'string') ? t : (t.name || t.facultyName || String(t));
      if (!name) return;

      if (select) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        select.appendChild(opt);
      }

      if (menu) {
        const glassOpt = document.createElement('div');
        glassOpt.className = 'custom-glass-option' + (state.facultyName === name ? ' selected' : '');
        glassOpt.dataset.name = name;
        glassOpt.onclick = () => selectCustomFacultyOption(name);
        glassOpt.innerHTML = `
          <div style="display: flex; align-items: center; gap: 10px;">
            <i class="ph-fill ph-user-circle" style="font-size: 18px; color: var(--accent-blue);"></i>
            <span style="font-weight: 700; color: #0f172a;">${name}</span>
          </div>
          <i class="ph ph-check item-check" style="display: ${state.facultyName === name ? 'inline-block' : 'none'}; font-weight: 800; font-size: 14px;"></i>
        `;
        menu.appendChild(glassOpt);
      }
    });

    if (state.facultyName) {
      if (select) select.value = state.facultyName;
      if (labelEl) labelEl.innerText = state.facultyName;
    } else if (labelEl) {
      labelEl.innerText = 'Select Faculty';
    }
  }

  // ─── WORKLOAD SUBJECT SELECTOR (CUSTOM 3D GLASS DROPDOWN) ─────────────────
  function toggleCustomSubjectDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('custom-subject-menu');
    const trigger = document.getElementById('custom-subject-trigger');
    if (!menu) return;
    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
    if (trigger) {
      if (isVisible) trigger.classList.remove('open');
      else trigger.classList.add('open');
    }
  }

  function selectCustomSubjectOption(code, label) {
    const selector = document.getElementById('subject-selector');
    const labelEl = document.getElementById('custom-subject-label');
    const menu = document.getElementById('custom-subject-menu');
    const trigger = document.getElementById('custom-subject-trigger');

    if (selector) selector.value = code;
    if (labelEl) labelEl.innerText = label;
    if (menu) menu.style.display = 'none';
    if (trigger) trigger.classList.remove('open');

    // Update active highlight class on glass options
    if (menu) {
      menu.querySelectorAll('.custom-glass-option').forEach(opt => {
        const check = opt.querySelector('.item-check');
        if (opt.dataset.code === code) {
          opt.classList.add('selected');
          if (check) check.style.display = 'inline-block';
        } else {
          opt.classList.remove('selected');
          if (check) check.style.display = 'none';
        }
      });
    }

    changeActiveSubject(code);
  }

  // ─── REPORTS PERIOD FILTER (CUSTOM 3D GLASS DROPDOWN) ──────────────────────
  function toggleCustomPeriodDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('custom-period-menu');
    const trigger = document.getElementById('custom-period-trigger');
    const wrapper = document.getElementById('custom-period-wrapper');
    const filterBar = wrapper ? wrapper.closest('.incharge-glass-filter-bar') : null;
    if (!menu) return;

    const isVisible = menu.style.display === 'block';
    menu.style.display = isVisible ? 'none' : 'block';
    if (trigger) {
      if (isVisible) {
        trigger.classList.remove('open');
        if (wrapper) wrapper.classList.remove('open');
        if (filterBar) filterBar.classList.remove('dropdown-open');
      } else {
        trigger.classList.add('open');
        if (wrapper) wrapper.classList.add('open');
        if (filterBar) filterBar.classList.add('dropdown-open');
      }
    }
  }

  function selectCustomPeriodOption(val, labelText) {
    const select = document.getElementById('reports-period-filter');
    const labelEl = document.getElementById('custom-period-label');
    const menu = document.getElementById('custom-period-menu');
    const trigger = document.getElementById('custom-period-trigger');
    const wrapper = document.getElementById('custom-period-wrapper');
    const filterBar = wrapper ? wrapper.closest('.incharge-glass-filter-bar') : null;

    if (select) {
      select.value = val;
      onReportsPeriodChange(val);
    }
    if (labelEl) labelEl.innerText = labelText;
    if (menu) menu.style.display = 'none';
    if (trigger) trigger.classList.remove('open');
    if (wrapper) wrapper.classList.remove('open');
    if (filterBar) filterBar.classList.remove('dropdown-open');

    if (menu) {
      menu.querySelectorAll('.custom-glass-option').forEach(opt => {
        const check = opt.querySelector('.item-check');
        if (opt.dataset.value === val) {
          opt.classList.add('selected');
          if (check) check.style.display = 'inline-block';
        } else {
          opt.classList.remove('selected');
          if (check) check.style.display = 'none';
        }
      });
    }
  }

  // Close dropdown menus when clicking anywhere outside
  document.addEventListener('click', (e) => {
    const subjectWrapper = document.getElementById('custom-subject-wrapper');
    const subjectMenu = document.getElementById('custom-subject-menu');
    const subjectTrigger = document.getElementById('custom-subject-trigger');
    if (subjectWrapper && !subjectWrapper.contains(e.target)) {
      if (subjectMenu) subjectMenu.style.display = 'none';
      if (subjectTrigger) subjectTrigger.classList.remove('open');
    }

    const facultyWrapper = document.getElementById('custom-faculty-wrapper');
    const facultyMenu = document.getElementById('custom-faculty-menu');
    const facultyTrigger = document.getElementById('custom-faculty-trigger');
    if (facultyWrapper && !facultyWrapper.contains(e.target)) {
      if (facultyMenu) facultyMenu.style.display = 'none';
      if (facultyTrigger) facultyTrigger.classList.remove('open');
      facultyWrapper.classList.remove('open');
      const fg = facultyWrapper.closest('.form-group');
      if (fg) fg.classList.remove('dropdown-open');
    }

    const periodWrapper = document.getElementById('custom-period-wrapper');
    const periodMenu = document.getElementById('custom-period-menu');
    const periodTrigger = document.getElementById('custom-period-trigger');
    if (periodWrapper && !periodWrapper.contains(e.target)) {
      if (periodMenu) periodMenu.style.display = 'none';
      if (periodTrigger) periodTrigger.classList.remove('open');
      periodWrapper.classList.remove('open');
      const filterBar = periodWrapper.closest('.incharge-glass-filter-bar');
      if (filterBar) filterBar.classList.remove('dropdown-open');
    }
  });

  function buildSubjectSelector() {
    const selector = document.getElementById('subject-selector');
    const menu = document.getElementById('custom-subject-menu');
    const labelEl = document.getElementById('custom-subject-label');
    const trigger = document.getElementById('custom-subject-trigger');

    if (selector) selector.innerHTML = '';
    if (menu) menu.innerHTML = '';
    if (labelEl) labelEl.innerText = 'Select a subject...';

    // Filter subjects for the logged faculty
    const facultySubs = state.subjects.filter(s => {
      const teachers = s.faculty.split(',').map(name => name.trim().toLowerCase());
      return teachers.includes(state.facultyName.toLowerCase());
    });

    if (facultySubs.length === 0) {
      Toast.show('No Workload', 'No active workload matches your identity.', 'warning');
      if (labelEl) labelEl.innerText = 'No subjects assigned';
      return;
    }

    // Add blank placeholder option to native select
    if (selector) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select a subject...';
      placeholder.disabled = true;
      placeholder.selected = true;
      selector.appendChild(placeholder);
    }

    facultySubs.forEach((s) => {
      const optionLabel = `${s.name} (${s.code}) - SEM ${s.semester}`;
      
      if (selector) {
        const opt = document.createElement('option');
        opt.value = s.code;
        opt.textContent = optionLabel;
        selector.appendChild(opt);
      }

      if (menu) {
        const item = document.createElement('div');
        item.className = 'custom-glass-option';
        item.dataset.code = s.code;
        item.innerHTML = `
          <span>${escHtml(optionLabel)}</span>
          <i class="ph ph-check item-check" style="display:none;"></i>
        `;
        item.onclick = (e) => {
          e.stopPropagation();
          selectCustomSubjectOption(s.code, optionLabel);
        };
        menu.appendChild(item);
      }
    });

    if (trigger) trigger.classList.add('pulse-subject');
  }

  async function changeActiveSubject(code) {
    if (!code) return;

    // Remove pulse animation once a subject is selected
    const trigger = document.getElementById('custom-subject-trigger');
    if (trigger) trigger.classList.remove('pulse-subject');

    state.activeCode = code;
    state.activeSubject = state.subjects.find(s => s.code === code);

    // Reset teaching plan state immediately for new subject to avoid showing stale data from previous subject
    state.teachingPlan = { all: [], theory: [], practical: [] };
    state.metadata = {
      totalLectures: 0,
      totalTutorials: 0,
      conductedCount: 0,
      percent: 0,
      managementName: (state.metadata && state.metadata.managementName) || '',
      collegeName: (state.metadata && state.metadata.collegeName) || '',
      academicYear: (state.metadata && state.metadata.academicYear) || ''
    };

    // Immediately update UI to blank state for new subject
    updateDashboardStats();

    // Show loading indicators
    Toast.show('Refreshing Workload', `Loading active database logs for ${code}...`, 'success');

    // Sync dataset with Sheets
    await triggerSyncAllViews();
    switchView(state.currentView);
  }

  function _deduplicateTopics(topics) {
    if (!Array.isArray(topics)) return [];
    const seenMap = new Map();
    topics.forEach(t => {
      const lNo = String(t.lectureNo || '').trim().toLowerCase();
      const syl = String(t.syllabus || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = `${lNo}_${syl}`;

      if (!seenMap.has(key)) {
        seenMap.set(key, { ...t });
      } else {
        const existing = seenMap.get(key);
        if (!existing.executedDate && t.executedDate) {
          existing.executedDate = t.executedDate;
        }
        if (!existing.remark && t.remark) {
          existing.remark = t.remark;
        }
      }
    });
    return Array.from(seenMap.values());
  }

  // ─── SYNC LOGIC ─────────────────────────────────────────
  async function triggerSyncAllViews() {
    if (!state.activeCode) return;

    try {
      // Trigger auto-sync matching algorithm with Smart Attendance
      const syncRes = await API.syncTeachingPlan(state.activeCode, state.facultyName);
      if (syncRes.success && syncRes.topics && syncRes.topics.length > 0) {
        const cleanTopics = _deduplicateTopics(syncRes.topics);
        state.metadata = { ...state.metadata, ...(syncRes.metadata || {}) };
        state.teachingPlan.all = cleanTopics;
        state.teachingPlan.theory = cleanTopics;
        state.teachingPlan.practical = cleanTopics;
      } else {
        // Sheet for subject not present in spreadsheet or has no topics — clear state completely!
        state.teachingPlan = { all: [], theory: [], practical: [] };
        state.metadata = {
          ...state.metadata,
          totalLectures: 0,
          totalTutorials: 0,
          conductedCount: 0,
          percent: 0,
          totalTopics: 0
        };
        const errMsg = syncRes.error || `No sheet found for subject code ${state.activeCode}.`;
        Toast.show('Sheet Not Found', errMsg, 'warning');
      }

      // Update Dashboard stats
      updateDashboardStats();
      
      // Force UI views refresh with newly fetched database data
      switchView(state.currentView);

    } catch (e) {
      console.error(e);
      state.teachingPlan = { all: [], theory: [], practical: [] };
      updateDashboardStats();
      Toast.show('Refresh Error', e.message || 'Unable to sync database logs.', 'danger');
    }
  }

  // ─── DASHBOARD RECALCULATIONS ───────────────────────────
  function updateDashboardStats() {
    const allTopics = state.teachingPlan.all || [];

    // Check type of subject
    const isPractical = isPracticalSubject(state.activeSubject);
    const unitPlural = isPractical ? 'Practicals' : 'Lectures';

    const cardBar = document.getElementById('card-tp-progress-bar');
    const cardPct = document.getElementById('card-tp-progress-pct');
    const completeLbl = document.getElementById('card-tp-complete-lbl');
    const countLbl = document.getElementById('card-tp-count-lbl');

    if (allTopics.length === 0) {
      if (cardBar) cardBar.style.width = '0%';
      if (cardPct) cardPct.innerText = '0%';
      if (completeLbl) completeLbl.innerText = `0% complete (${unitPlural})`;
      if (countLbl) countLbl.innerText = `0/0`;
      return;
    }

    // Filter out tutorial rows (same as populateTeachingPlan)
    const filteredTopics = allTopics.filter(t => {
      const lNo = String(t.lectureNo).toLowerCase();
      return !lNo.startsWith('t') && !lNo.includes('tut');
    });

    // Dashboard Cards progress updating
    const isPrac = isPracticalSubject(state.activeSubject);
    const fallbackTotal = isPrac ? 15 : 45;
    const reqTopics = (state.metadata && typeof state.metadata.totalLectures === 'number' && state.metadata.totalLectures > 5)
      ? state.metadata.totalLectures
      : (filteredTopics.length > 5 ? filteredTopics.length : fallbackTotal);
    const originalTopics = filteredTopics.slice(0, reqTopics);
    const originalConducted = originalTopics.filter(t => t.executedDate).length;
    const tpPct = reqTopics > 0 ? Math.round((originalConducted / reqTopics) * 100) : 0;

    if (cardBar) cardBar.style.width = Math.min(tpPct, 100) + '%';
    if (cardPct) cardPct.innerText = tpPct + '%';
    if (completeLbl) completeLbl.innerText = `${tpPct}% complete (${unitPlural})`;
    if (countLbl) countLbl.innerText = `${originalConducted}/${reqTopics}`;
  }

  // ─── TEACHING PLAN CONTROLLER ───────────────────────────
  function triggerManualSync() {
    Toast.show('Refresh Executing', 'Re-evaluating attendance log date entries...', 'success');
    triggerSyncAllViews().then(() => {
      populateTeachingPlan();
      Toast.show('Refresh Complete', 'Dates aligned with attendance sheet.', 'success');
    });
  }

  function filterTeachingPlan(q) {
    const query = q.toLowerCase().trim();
    document.querySelectorAll('#lectures-plan-list .d5-milestone').forEach(row => {
      const text = (row.dataset.syllabus || '').toLowerCase();
      row.style.display = text.includes(query) ? '' : 'none';
    });
  }

  function populateTeachingPlan() {
    const allTopics = state.teachingPlan.all || [];

    // Check type of subject
    const isPractical = isPracticalSubject(state.activeSubject);
    const unit = isPractical ? 'Practical' : 'Lecture';
    const unitPlural = isPractical ? 'Practicals' : 'Lectures';

    const list = document.getElementById('lectures-plan-list');
    if (!list) {
      console.warn('Milestone list element not found.');
      return;
    }
    const setText = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    if (allTopics.length === 0) {
      setText('tp-column-title', `${unitPlural} Progress`);
      setText('tp-milestone-title', `${unit} Milestones`);
      setText('tp-metadata-pct', 0);
      setText('tp-hero-sub', `No teaching plan sheet found for ${state.activeSubject ? state.activeSubject.code : ''}`);
      setText('tp-hero-covered', `0/0`);
      setText('tp-hero-required', 0);
      const heroBar = document.getElementById('tp-hero-bar-fill');
      if (heroBar) heroBar.style.width = '0%';

      list.innerHTML = `
        <div class="schedule-empty" style="padding: 60px 20px; text-align: center;">
          <i class="ph ph-file-x" style="font-size: 48px; color: var(--accent-blue); opacity: 0.5;"></i>
          <h4 style="margin: 12px 0 6px;">No Syllabus Sheet Found</h4>
          <p>The teaching plan sheet for <strong>${escHtml(state.activeSubject ? state.activeSubject.name : '')} (${escHtml(state.activeSubject ? state.activeSubject.code : '')})</strong> is not present in your Google Spreadsheet.</p>
        </div>
      `;
      return;
    }

    // Filter out tutorial rows completely
    const filteredTopics = allTopics.filter(t => {
      const lNo = String(t.lectureNo).toLowerCase();
      return !lNo.startsWith('t') && !lNo.includes('tut');
    });

    function getRequiredTopicsCount(topicsList, metadata) {
      if (metadata && typeof metadata.totalLectures === 'number' && metadata.totalLectures > 5 && metadata.totalLectures <= topicsList.length) {
        return metadata.totalLectures;
      }
      let maxSeenNo = 0;
      for (let idx = 0; idx < topicsList.length; idx++) {
        const num = parseInt(topicsList[idx].lectureNo, 10);
        if (!isNaN(num)) {
          if (num <= maxSeenNo && maxSeenNo > 5) {
            return idx;
          }
          if (num > maxSeenNo) {
            maxSeenNo = num;
          }
        }
      }
      if (topicsList.length > 5) return topicsList.length;
      return isPracticalSubject(state.activeSubject) ? 15 : 45;
    }

    const totalTopics = filteredTopics.length;
    const reqTopics = getRequiredTopicsCount(filteredTopics, state.metadata);

    // Calculate coverage based on ORIGINAL syllabus topics only (first N topics = totalLectures)
    const originalTopics = filteredTopics.slice(0, reqTopics);

    // Merge execution dates from any spillover rows at the bottom of the sheet onto original syllabus topics
    filteredTopics.slice(reqTopics).forEach(spillover => {
      const targetLNo = String(spillover.lectureNo).trim().toLowerCase();
      const target = originalTopics.find(t => String(t.lectureNo).trim().toLowerCase() === targetLNo);
      if (target) {
        if (spillover.executedDate) {
          if (!target.executedDate) {
            target.executedDate = spillover.executedDate;
          } else if (target.executedDate.indexOf(spillover.executedDate) === -1) {
            target.executedDate = target.executedDate + ', ' + spillover.executedDate;
          }
        }
        if (!target.remark && spillover.remark) {
          target.remark = spillover.remark;
        }
      }
    });

    const coveredTopics = originalTopics.filter(t => t.executedDate).length;
    // Completion percentage (relative to required lectures for accreditation)
    const pct = reqTopics > 0 ? Math.round((coveredTopics / reqTopics) * 100) : 0;

    // ── Hero banner ──
    setText('tp-column-title', `${unitPlural} Progress`);
    setText('tp-milestone-title', `${unit} Milestones`);
    setText('tp-metadata-pct', pct);
    setText('tp-hero-sub', `${coveredTopics} ${unitPlural.toLowerCase()} completed out of ${reqTopics}`);
    setText('tp-hero-covered', `${coveredTopics}/${reqTopics}`);
    setText('tp-hero-required', reqTopics);
    setText('tp-download-btn-text', isPractical ? 'Download Practical Plan / Syllabus Completion Report' : 'Download Teaching Plan / Syllabus Completion Report');

    const heroBar = document.getElementById('tp-hero-bar-fill');
    if (heroBar) heroBar.style.width = Math.min(pct, 100) + '%';

    // Reference "today" for the per-row relative-time filler below.
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Milestone rows ──
    if (originalTopics.length === 0) {
      list.innerHTML = `<div class="d5-milestone-empty">No syllabus topics defined.</div>`;
      return;
    }

    // Always clear container before populating to prevent duplicate DOM elements on sync
    list.innerHTML = '';

    originalTopics.forEach(t => {
      const done = !!t.executedDate;
      const plannedText = formatDisplayDate(t.plannedDate) || '—';
      const taughtText = done ? formatDisplayDate(t.executedDate) : '';
      const batchName = isPractical ? extractBatchInfo(t, state.activeSubject) : '';

      // Creative filler for the Taught column while a lecture is still pending:
      // a relative-time hint driven by the planned date vs today.
      let fillerLabel = 'Status', fillerVal = 'Scheduled', fillerCls = 'wait';
      if (!done) {
        const planned = parseToDate(t.plannedDate);
        if (planned) {
          const days = Math.round((planned - today) / 86400000);
          if (days > 1)       { fillerLabel = 'Upcoming'; fillerVal = `in ${days} days`; fillerCls = 'upcoming'; }
          else if (days === 1){ fillerLabel = 'Upcoming'; fillerVal = 'tomorrow'; fillerCls = 'upcoming'; }
          else if (days === 0){ fillerLabel = 'Today';    fillerVal = 'due today'; fillerCls = 'today'; }
          else if (days === -1){ fillerLabel = 'Overdue'; fillerVal = '1 day late'; fillerCls = 'late'; }
          else                { fillerLabel = 'Overdue';  fillerVal = `${-days} days late`; fillerCls = 'late'; }
        }
      }

      let iconHtml = '';
      if (done) {
        iconHtml = '<i class="ph-fill ph-check-circle d5-ms-icon done"></i>';
      } else if (fillerCls === 'late') {
        iconHtml = '<i class="ph-fill ph-warning d5-ms-icon late"></i>';
      } else if (fillerCls === 'upcoming') {
        iconHtml = '<i class="ph ph-clock d5-ms-icon upcoming"></i>';
      } else if (fillerCls === 'today') {
        iconHtml = '<i class="ph ph-clock-countdown d5-ms-icon today"></i>';
      } else {
        iconHtml = '<i class="ph ph-clock d5-ms-icon wait"></i>';
      }

      const row = document.createElement('div');
      row.className = 'd5-milestone';
      row.dataset.syllabus = t.syllabus || '';
      row.innerHTML = `
        <div class="d5-ms-num ${done ? 'done' : 'pending'}" title="${unit} ${escHtml(String(t.lectureNo))}">${escHtml(String(t.lectureNo))}</div>
        <div class="d5-ms-body">
          <div class="d5-ms-head">
            <span class="d5-ms-name">${escHtml(t.syllabus)}</span>
            <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
              ${isPractical ? `<span class="d5-ms-batch-tag"><i class="ph ph-users-three"></i> ${escHtml(batchName)}</span>` : ''}
              <span class="d5-ms-tag ${done ? 'done' : (fillerCls === 'upcoming' ? 'upcoming' : 'pending')}">${done ? (isPractical ? 'Conducted' : 'Taught') : (fillerCls === 'upcoming' ? 'Upcoming' : (fillerCls === 'today' ? 'Today' : 'Pending'))}</span>
            </div>
          </div>
          <div class="d5-ms-track ${done ? 'done' : ''}">
            <div class="d5-ms-track-fill ${done ? 'done' : ''}" style="width: ${done ? '100' : '0'}%;"></div>
          </div>
        </div>
        <div class="d5-ms-dates">
          <div class="d5-ms-date-col">
            <span class="d5-ms-date-label">Planned</span>
            <span class="d5-ms-date-val">${plannedText}</span>
          </div>
          <div class="d5-ms-date-col">
            ${done ? `
            <span class="d5-ms-date-label taught">${isPractical ? 'Conducted' : 'Taught'}</span>
            <span class="d5-ms-date-val taught">${taughtText}</span>` : `
            <span class="d5-ms-date-label ${fillerCls}">${fillerLabel}</span>
            <span class="d5-ms-date-val filler ${fillerCls}">${fillerVal}</span>`}
          </div>
        </div>
        ${iconHtml}
      `;
      list.appendChild(row);
    });
  }

  async function saveTopicRemark(rowIndex, val) {
    Toast.show('Saving Remark', 'Updating cell in teaching plan sheet...', 'success');
    try {
      const res = await API.saveRemark(state.activeCode, rowIndex, val);
      if (res.success) {
        Toast.show('Remark Saved', 'Remark written back to Google Sheet Column F.', 'success');
        // Update local state remark cache
        const allTopics = state.teachingPlan.all || [];
        const match = allTopics.find(t => t.rowIndex === rowIndex);
        if (match) match.remark = val;
      } else {
        Toast.show('Error', 'Unable to write remark back.', 'danger');
      }
    } catch(e) {
      Toast.show('Network Issue', 'Cannot communicate with Google Sheets.', 'danger');
    }
  }

  // ─── ACADEMIC SCHEDULE — DRIVE FILE GRID ──────────────
  function _getFileIcon(mimeType, name) {
    const n = (name || '').toLowerCase();
    const m = (mimeType || '').toLowerCase();
    if (m.includes('pdf')) return 'ph-file-pdf';
    if (m.includes('image')) return 'ph-image';
    if (m.includes('spreadsheet') || m.includes('excel') || n.endsWith('.xlsx') || n.endsWith('.xls')) return 'ph-file-xls';
    if (m.includes('document') || m.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return 'ph-file-doc';
    if (m.includes('presentation') || m.includes('powerpoint') || n.endsWith('.pptx')) return 'ph-file-ppt';
    if (m.includes('video')) return 'ph-video';
    if (m.includes('audio')) return 'ph-music-notes';
    if (m.includes('zip') || m.includes('rar') || m.includes('archive')) return 'ph-file-zip';
    return 'ph-file';
  }

  function _getFileColor(mimeType, name) {
    const n = (name || '').toLowerCase();
    const m = (mimeType || '').toLowerCase();
    if (m.includes('pdf')) return '#ea4335';
    if (m.includes('image')) return '#9333ea';
    if (m.includes('spreadsheet') || m.includes('excel') || n.endsWith('.xlsx')) return '#34a853';
    if (m.includes('document') || m.includes('word') || n.endsWith('.docx')) return '#4285f4';
    if (m.includes('presentation') || m.includes('powerpoint') || n.endsWith('.pptx')) return '#fbbc04';
    return '#64748b';
  }

  // ─── SCHEDULE FILE CHANGE DETECTION ──────────────────────
  const SCHEDULE_SEEN_KEY = 'academic_schedule_seen';

  /** Build a fingerprint map: { fileId: lastUpdated } */
  function _buildFileFingerprint(files) {
    const fp = {};
    for (const f of files) {
      fp[f.id] = f.lastUpdated || '';
    }
    return fp;
  }

  /** Get stored fingerprint from localStorage */
  function _getSeenFingerprint() {
    try {
      const raw = localStorage.getItem(SCHEDULE_SEEN_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Store current fingerprint to localStorage */
  function _saveSeenFingerprint(files) {
    try {
      localStorage.setItem(SCHEDULE_SEEN_KEY, JSON.stringify(_buildFileFingerprint(files)));
    } catch {}
  }

  /** Compare files against last-seen snapshot. Returns Set of updated/new file IDs. */
  function _detectChangedFiles(files) {
    const prev = _getSeenFingerprint();
    if (!prev) return new Set(); // first load → no badges
    const changed = new Set();
    for (const f of files) {
      const oldTs = prev[f.id];
      if (!oldTs) {
        // Brand-new file
        changed.add(f.id);
      } else if (f.lastUpdated && f.lastUpdated !== oldTs) {
        // Same file but updated (even same name, new content)
        changed.add(f.id);
      }
    }
    return changed;
  }

  async function loadAcademicSchedule() {
    const grid = document.getElementById('schedule-files-grid');
    if (!grid) return;

    // Loading skeleton
    grid.innerHTML = `
      <div class="schedule-loading">
        <i class="ph ph-spinner-gap schedule-loading-spinner"></i>
        <p>Fetching files from Google Drive...</p>
      </div>
    `;

    try {
      const res = await API.getAcademicSchedule();
      if (res.success) {
        const files = res.files || [];

        // ── Change Detection ──────────────────────────────
        const changedIds = _detectChangedFiles(files);
        const hasUpdates = changedIds.size > 0;

        // Update Module 1 card badge, footer & prominent Drive Account Email
        const filesChip = document.getElementById('card-cal-files');
        if (filesChip) filesChip.innerText = `${files.length} file${files.length === 1 ? '' : 's'}`;
        const calStatus = document.getElementById('card-cal-status');
        if (calStatus) calStatus.innerText = files.length ? 'Auto-refreshed' : 'No files';

        const driveEmail = res.folderOwnerEmail || '';
        const cardDriveEmailEl = document.getElementById('card-cal-drive-email');
        if (cardDriveEmailEl) {
          cardDriveEmailEl.innerText = driveEmail ? `Drive: ${driveEmail}` : 'Drive: Connected (College Folder)';
        }

        // Show blinking "NEW UPDATE" badge on dashboard card if changes found
        updateScheduleBadge(hasUpdates ? 'update' : (files.length ? 'synced' : 'empty'));

        // Update heading subtitle with Drive account email & scanned folder name prominently
        const subtitleEl = document.getElementById('schedule-subtitle');
        if (subtitleEl) {
          const folderDisplay = res.scannedFolderName ? ` • Folder: "${escHtml(res.scannedFolderName)}"` : '';
          if (driveEmail) {
            subtitleEl.innerHTML = `☁ Associated Drive: <strong>${escHtml(driveEmail)}</strong>${folderDisplay}`;
          } else {
            subtitleEl.innerText = `Files synced from your Google Drive folder. Click any file to preview.`;
          }
        }

        if (files.length === 0) {
          const folderInfo = res.scannedFolderName ? `<br><small style="opacity: 0.85; display: inline-block; margin-top: 8px;">Associated Drive: <strong>${escHtml(driveEmail)}</strong> | Folder: <strong>${escHtml(res.scannedFolderName)}</strong></small>` : '';
          grid.innerHTML = `
            <div class="schedule-empty">
              <i class="ph ph-cloud-arrow-up" style="font-size: 48px; color: var(--accent-blue); opacity: 0.5;"></i>
              <h4>No Files Found</h4>
              <p>Upload PDFs, images, or documents to your<br><strong>"Academic Calendars & Timetable"</strong> Google Drive folder.${folderInfo}</p>
            </div>
          `;
          return;
        }

        grid.innerHTML = files.map((f, i) => {
          const icon = _getFileIcon(f.mimeType, f.name);
          const color = _getFileColor(f.mimeType, f.name);
          const thumbUrl = f.thumbnailLink || '';
          const displayName = f.name.replace(/\.[^.]+$/, ''); // strip extension
          const ext = (f.name.match(/\.([^.]+)$/) || ['', ''])[1].toUpperCase();
          const previewUrl = f.id ? `https://drive.google.com/file/d/${f.id}/preview` : (f.webViewLink || '').replace(/\/view.*$/, '/preview');
          const isUpdated = changedIds.has(f.id);

          return `
            <div class="schedule-file-card" data-preview-url="${_escAttr(previewUrl)}" data-file-name="${_escAttr(f.name)}" data-file-id="${_escAttr(f.id)}" onclick="App.handleFileCardClick(this)" style="--i:${i}; animation-delay: ${i * 0.05}s;">
              ${isUpdated ? '<span class="file-update-pip">NEW</span>' : ''}
              <div class="schedule-file-thumb" style="${thumbUrl ? `background-image: url('${_escAttr(thumbUrl)}');` : ''}">
                ${!thumbUrl ? `<i class="ph ${icon}" style="font-size: 44px; color: ${color};"></i>` : ''}
              </div>
              <div class="schedule-file-info">
                <span class="schedule-file-name" title="${_escAttr(f.name)}">${escHtml(displayName)}</span>
                ${ext ? `<span class="schedule-file-ext" style="color: ${color}; font-weight: 800;">${ext}</span>` : ''}
              </div>
              <div class="schedule-file-actions" onclick="event.stopPropagation()">
                <button type="button" class="btn-card-download" onclick="App.downloadDriveFile('${_escAttr(f.id)}', '${_escAttr(f.name)}', event)" title="Download original ${escHtml(f.name)}">
                  <i class="ph ph-download-simple" style="font-size: 14px;"></i> Download
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Save current fingerprint so next load won't show badges again
        _saveSeenFingerprint(files);

      } else {
        const subtitleEl = document.getElementById('schedule-subtitle');
        if (subtitleEl) {
          subtitleEl.innerHTML = `<span style="color: var(--danger); font-weight: 500;"><i class="ph ph-warning"></i> ${escHtml(res.error || 'Failed to load files from Google Drive.')}</span>`;
        }
        const cardDriveEmailEl = document.getElementById('card-cal-drive-email');
        if (cardDriveEmailEl) {
          cardDriveEmailEl.innerText = 'Drive: Config error';
        }
        grid.innerHTML = `
          <div class="schedule-empty">
            <i class="ph ph-warning-circle" style="font-size: 48px; color: var(--danger); opacity: 0.6;"></i>
            <h4>Drive Access Error</h4>
            <p>${escHtml(res.error || 'Failed to load files from Google Drive.')}</p>
          </div>
        `;
      }
    } catch(err) {
      console.error(err);
      grid.innerHTML = `
        <div class="schedule-empty">
          <i class="ph ph-wifi-slash" style="font-size: 48px; color: var(--danger); opacity: 0.6;"></i>
          <h4>Connection Error</h4>
          <p>Cannot reach Google Drive. Check your internet connection.</p>
        </div>
      `;
    }
  }

  function _escAttr(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  let activePreviewFile = { id: '', name: '', previewUrl: '' };

  function handleFileCardClick(el) {
    if (!el) return;
    const previewUrl = el.getAttribute('data-preview-url') || '';
    const fileName = el.getAttribute('data-file-name') || '';
    const fileId = el.getAttribute('data-file-id') || '';
    openFilePreview(previewUrl, fileName, fileId);
  }

  function openFilePreview(previewUrl, fileName, fileId) {
    const modal = document.getElementById('file-preview-modal');
    const iframe = document.getElementById('file-preview-iframe');
    const title = document.getElementById('file-preview-title');
    if (!modal) return;
    activePreviewFile = { id: fileId || '', name: fileName || 'File Preview', previewUrl: previewUrl || '' };
    if (title) title.innerText = fileName || 'File Preview';
    if (iframe) iframe.src = previewUrl;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeFilePreview() {
    const modal = document.getElementById('file-preview-modal');
    const iframe = document.getElementById('file-preview-iframe');
    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = '';
    activePreviewFile = { id: '', name: '', previewUrl: '' };
    document.body.style.overflow = '';
  }

  function downloadDriveFile(fileId, fileName, event) {
    if (event) {
      if (typeof event.stopPropagation === 'function') event.stopPropagation();
      if (typeof event.preventDefault === 'function') event.preventDefault();
    }
    if (!fileId) {
      Toast.show('Download Unavailable', 'File ID is missing for this document.', 'warning');
      return;
    }
    // Google Drive direct export download URL
    const downloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName || 'document';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    Toast.show('Download Started', `Downloading "${fileName || 'document'}"...`, 'info');
  }

  function downloadCurrentPreviewFile() {
    if (!activePreviewFile.id) {
      Toast.show('Download Unavailable', 'No active file found to download.', 'warning');
      return;
    }
    downloadDriveFile(activePreviewFile.id, activePreviewFile.name);
  }

  // ─── LIVE ATTENDANCE STATS HELPERS ───────────────────────
  async function fetchLiveAttendanceStats() {
    if (!state.liveAttendanceMap) state.liveAttendanceMap = {};

    // 1. Seed from inchargeDashboard subject averages if available
    if (state.inchargeDashboard && Array.isArray(state.inchargeDashboard.faculties)) {
      state.inchargeDashboard.faculties.forEach(f => {
        (f.subjects || []).forEach(s => {
          if (s && (s.code || s.name)) {
            const rawCode = String(s.code || s.name).trim().toUpperCase();
            const cleanCode = rawCode.replace(/[^A-Z0-9]/g, '');
            const avgVal = Number(s.avgAttendance || s.attendancePercent || s.attendancePct || s.avgAtt);
            if (cleanCode && !isNaN(avgVal) && avgVal > 0) {
              if (!state.liveAttendanceMap[cleanCode]) {
                state.liveAttendanceMap[cleanCode] = { present: avgVal, total: 100 };
              }
            }
          }
        });
      });
    }

    try {
      const attRes = await API.getAttendance('', '');
      if (attRes && attRes.success && Array.isArray(attRes.records)) {
        attRes.records.forEach(r => {
          const rawCode = String(r.code || '').trim().toUpperCase();
          const cleanCode = rawCode.replace(/[^A-Z0-9]/g, '');
          if (!cleanCode) return;
          if (!state.liveAttendanceMap[cleanCode] || state.liveAttendanceMap[cleanCode].total === 100) {
            state.liveAttendanceMap[cleanCode] = { present: 0, total: 0 };
          }
          state.liveAttendanceMap[cleanCode].total++;
          const stUpper = String(r.status || '').toUpperCase().trim();
          if (stUpper === 'P' || stUpper === 'PRESENT' || stUpper === '1') {
            state.liveAttendanceMap[cleanCode].present++;
          }
        });
      }
    } catch (e) {
      console.warn('Failed to fetch live attendance stats:', e);
    }
    return state.liveAttendanceMap;
  }

  function getLiveSubjectAttendancePct(subCode) {
    if (!state.liveAttendanceMap || !subCode) return null;
    const cleanCode = String(subCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanCode) return null;
    
    let stat = state.liveAttendanceMap[cleanCode];
    if (!stat) {
      for (const k in state.liveAttendanceMap) {
        if (k === cleanCode || k.includes(cleanCode) || cleanCode.includes(k)) {
          stat = state.liveAttendanceMap[k];
          break;
        }
      }
    }
    if (stat && stat.total > 0) {
      return Math.round((stat.present / stat.total) * 100);
    }
    return null;
  }

  // ─── ACADEMIC INCHARGE DASHBOARD ─────────────────────
  // ─── ACADEMIC INCHARGE DASHBOARD ─────────────────────
  async function loadInchargeDashboard() {
    const container = document.getElementById('incharge-dashboard-content');
    if (container) {
      container.innerHTML = '<div style="padding: 30px; text-align: center; color: var(--text-secondary); font-size: 14px;"><i class="ph ph-spinner spinner" style="font-size: 24px; margin-bottom: 8px; display: block;"></i> Loading Academic Incharge Dashboard analytics...</div>';
    }

    try {
      const [data] = await Promise.all([
        API.getInchargeDashboard(),
        fetchLiveAttendanceStats().catch(() => ({}))
      ]);
      if (!data || !data.success) {
        if (container) {
          container.innerHTML = `<div style="padding: 24px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; color: #f87171; font-size: 13px;">Failed loading dashboard: ${escHtml(data ? data.error : 'Server error')}</div>`;
        }
        Toast.show('Dashboard Error', (data && data.error) ? data.error : 'Failed loading incharge dashboard.', 'danger');
        return;
      }

      state.inchargeDashboard = data;
      populateInchargeFilterDropdowns();
      renderInchargeDashboard();
    } catch (e) {
      if (container) {
        container.innerHTML = `<div style="padding: 24px; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 12px; color: #f87171; font-size: 13px;">Network error: ${escHtml(e.message)}</div>`;
      }
      Toast.show('Network Error', e.message, 'danger');
    }
  }

  function populateInchargeFilterDropdowns() {
    // No-op: Filter dropdowns replaced with single live search bar input field
  }

  function onInchargePeriodChange(periodVal) {
    const rangeDiv = document.getElementById('incharge-custom-date-range');
    if (rangeDiv) {
      rangeDiv.style.display = (periodVal === 'custom') ? 'flex' : 'none';
    }
    renderInchargeDashboard();
  }

  function onInchargeFilterChange() {
    renderInchargeDashboard();
  }

  function renderInchargeDashboard() {
    const container = document.getElementById('incharge-dashboard-content');
    const data = state.inchargeDashboard;
    if (!container || !data || !data.success) return;

    const rawStats = data.overallStats || {};
    let faculties = data.faculties || [];

    // ── 0. Remove Unassigned Faculty ──
    faculties = faculties.filter(f => f.faculty && f.faculty.toLowerCase() !== 'unassigned');

    // ── 1. Apply Smart Live Search Filter (Subject & Faculty letter-by-letter) ──
    const searchEl = document.getElementById('incharge-search-filter');
    const query = searchEl ? searchEl.value.trim().toLowerCase() : '';

    if (query) {
      faculties = faculties.map(f => {
        const facName = (f.faculty || '').toLowerCase();
        const facMatches = facName.includes(query);

        if (facMatches) {
          // Entire faculty matches by name, keep all their subjects
          return f;
        }

        // Check if any subject matches letter-by-letter
        const matchingSubs = (f.subjects || []).filter(s => {
          const subName = (s.name || '').toLowerCase();
          const subCode = (s.code || '').toLowerCase();
          return subName.includes(query) || subCode.includes(query);
        });

        if (matchingSubs.length > 0) {
          return { ...f, subjects: matchingSubs };
        }
        return null;
      }).filter(Boolean);
    }

    // ── 3. Calculate Overall Filtered Stats ──
    let totalFaculties = faculties.length;
    let totalLectures = 0;
    let totalConducted = 0;
    let totalSubjectsCount = 0;
    let sumCoveragePercent = 0;

    faculties.forEach(f => {
      (f.subjects || []).forEach(s => {
        totalSubjectsCount++;
        totalLectures += (s.totalLectures || 0);
        totalConducted += (s.totalConducted || 0);
        sumCoveragePercent += (s.percent || 0);
      });
    });

    const avgCoveragePercent = totalSubjectsCount > 0 ? Math.round(sumCoveragePercent / totalSubjectsCount) : 0;

    const overallHtml = `
      <div class="incharge-summary-cards">
        <div class="incharge-stat-card">
          <div class="stat-label" style="color: #334155; font-weight: 800; text-transform: uppercase; font-size: 12px;">Total Faculty Members</div>
          <div class="stat-value" style="color: #0f172a; font-weight: 900; font-size: 32px; margin: 4px 0;">${totalFaculties}</div>
          <div class="stat-sub" style="color: #475569; font-weight: 600; font-size: 12px;">Assigned academic staff</div>
        </div>
        <div class="incharge-stat-card">
          <div class="stat-label" style="color: #334155; font-weight: 800; text-transform: uppercase; font-size: 12px;">Total Course Subjects</div>
          <div class="stat-value" style="color: #0284c7; font-weight: 900; font-size: 32px; margin: 4px 0;">${totalSubjectsCount}</div>
          <div class="stat-sub" style="color: #475569; font-weight: 600; font-size: 12px;">Tracked academic subjects</div>
        </div>
        <div class="incharge-stat-card interactive-report-card" onclick="App.openInchargeReportsPage()" style="cursor: pointer; transition: all 0.25s ease; border: 1.5px solid rgba(99, 102, 241, 0.4); background: linear-gradient(135deg, rgba(255, 255, 255, 0.7) 0%, rgba(238, 242, 255, 0.8) 100%);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div class="stat-label" style="color: #4338ca; font-weight: 800; text-transform: uppercase; font-size: 12px;">Academic Reports</div>
            <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(99, 102, 241, 0.15); display: flex; align-items: center; justify-content: center; color: #6366f1;">
              <i class="ph ph-chart-bar-horizontal" style="font-size: 18px;"></i>
            </div>
          </div>
          <div class="stat-value" style="color: #4338ca; font-weight: 900; font-size: 22px; margin: 6px 0; display: flex; align-items: center; gap: 8px;">
            <span>Reports & Analytics</span>
            <i class="ph ph-arrow-right" style="font-size: 18px;"></i>
          </div>
          <div class="stat-sub" style="color: #475569; font-weight: 600; font-size: 12px;">Class, Student & Subject Reports</div>
        </div>
      </div>
    `;

    if (faculties.length === 0) {
      container.innerHTML = `
        ${overallHtml}
        <div style="padding: 40px; text-align: center; background: rgba(255,255,255,0.4); border-radius: 16px; border: 1px solid rgba(255,255,255,0.8); margin-top: 20px;">
          <i class="ph ph-funnel" style="font-size: 40px; color: #0284c7; opacity: 0.8; margin-bottom: 8px;"></i>
          <h4 style="margin: 0 0 6px; font-size: 15px; color: #0f172a; font-weight: 800;">No Matching Records</h4>
          <p style="margin: 0; font-size: 13px; color: #475569; font-weight: 600;">Try clearing or adjusting your search input filter.</p>
        </div>
      `;
      return;
    }

    const rainbowGlassPalettes = [
      { // 1. SAPPHIRE BLUE (Cool Royal Blue Glass)
        bg: 'linear-gradient(135deg, rgba(2, 132, 199, 0.20) 0%, rgba(186, 230, 253, 0.32) 100%)',
        bottomBorder: 'rgba(2, 132, 199, 0.55)',
        shadow: 'rgba(2, 132, 199, 0.22)',
        title: '#0c4a6e', icon: '#0284c7', subText: '#0369a1',
        badgeBg: 'linear-gradient(135deg, rgba(2, 132, 199, 0.95), rgba(56, 189, 248, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(186, 230, 253, 0.80)'
      },
      { // 2. CORAL ROSE / CRIMSON (Warm Vivid Rose Glass - strong contrast with Blue)
        bg: 'linear-gradient(135deg, rgba(225, 29, 72, 0.18) 0%, rgba(254, 205, 211, 0.32) 100%)',
        bottomBorder: 'rgba(225, 29, 72, 0.50)',
        shadow: 'rgba(225, 29, 72, 0.22)',
        title: '#881337', icon: '#e11d48', subText: '#9f1239',
        badgeBg: 'linear-gradient(135deg, rgba(225, 29, 72, 0.95), rgba(251, 113, 133, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(254, 205, 211, 0.80)'
      },
      { // 3. EMERALD GREEN (Cool Crisp Green Glass - strong contrast with Rose)
        bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.20) 0%, rgba(167, 243, 208, 0.32) 100%)',
        bottomBorder: 'rgba(16, 185, 129, 0.55)',
        shadow: 'rgba(16, 185, 129, 0.22)',
        title: '#064e3b', icon: '#059669', subText: '#047857',
        badgeBg: 'linear-gradient(135deg, rgba(5, 150, 105, 0.95), rgba(52, 211, 153, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(167, 243, 208, 0.80)'
      },
      { // 4. GOLDEN AMBER (Warm Sunburst Amber Glass - strong contrast with Green)
        bg: 'linear-gradient(135deg, rgba(217, 119, 6, 0.18) 0%, rgba(254, 240, 138, 0.32) 100%)',
        bottomBorder: 'rgba(217, 119, 6, 0.50)',
        shadow: 'rgba(217, 119, 6, 0.22)',
        title: '#713f12', icon: '#d97706', subText: '#854d0e',
        badgeBg: 'linear-gradient(135deg, rgba(217, 119, 6, 0.95), rgba(251, 191, 36, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(254, 240, 138, 0.80)'
      },
      { // 5. AMETHYST VIOLET (Deep Purple Glass - strong contrast with Amber)
        bg: 'linear-gradient(135deg, rgba(124, 58, 237, 0.19) 0%, rgba(221, 214, 254, 0.32) 100%)',
        bottomBorder: 'rgba(124, 58, 237, 0.52)',
        shadow: 'rgba(124, 58, 237, 0.22)',
        title: '#4c1d95', icon: '#7c3aed', subText: '#5b21b6',
        badgeBg: 'linear-gradient(135deg, rgba(124, 58, 237, 0.95), rgba(167, 139, 250, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(221, 214, 254, 0.80)'
      },
      { // 6. MANDARIN ORANGE (Warm Tangerine Glass - strong contrast with Purple)
        bg: 'linear-gradient(135deg, rgba(234, 88, 12, 0.18) 0%, rgba(254, 215, 170, 0.32) 100%)',
        bottomBorder: 'rgba(234, 88, 12, 0.50)',
        shadow: 'rgba(234, 88, 12, 0.22)',
        title: '#7c2d12', icon: '#ea580c', subText: '#9a3412',
        badgeBg: 'linear-gradient(135deg, rgba(234, 88, 12, 0.95), rgba(251, 146, 60, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(254, 215, 170, 0.80)'
      },
      { // 7. CARIBBEAN TEAL (Deep Aqua Teal Glass - strong contrast with Orange)
        bg: 'linear-gradient(135deg, rgba(13, 148, 136, 0.19) 0%, rgba(153, 246, 228, 0.32) 100%)',
        bottomBorder: 'rgba(13, 148, 136, 0.52)',
        shadow: 'rgba(13, 148, 136, 0.22)',
        title: '#134e4a', icon: '#0d9488', subText: '#115e59',
        badgeBg: 'linear-gradient(135deg, rgba(13, 148, 136, 0.95), rgba(45, 212, 191, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(153, 246, 228, 0.80)'
      },
      { // 8. FUCHSIA MAGENTA (Vibrant Orchid Pink Glass - strong contrast with Teal)
        bg: 'linear-gradient(135deg, rgba(217, 70, 239, 0.18) 0%, rgba(245, 208, 254, 0.32) 100%)',
        bottomBorder: 'rgba(217, 70, 239, 0.50)',
        shadow: 'rgba(217, 70, 239, 0.22)',
        title: '#701a75', icon: '#c026d3', subText: '#86198f',
        badgeBg: 'linear-gradient(135deg, rgba(192, 38, 211, 0.95), rgba(232, 121, 249, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(245, 208, 254, 0.80)'
      },
      { // 9. SPRING LIME (Zesty Light Lime Glass - strong contrast with Magenta)
        bg: 'linear-gradient(135deg, rgba(101, 163, 13, 0.19) 0%, rgba(217, 249, 157, 0.32) 100%)',
        bottomBorder: 'rgba(101, 163, 13, 0.52)',
        shadow: 'rgba(101, 163, 13, 0.22)',
        title: '#365314', icon: '#65a30d', subText: '#3f6212',
        badgeBg: 'linear-gradient(135deg, rgba(101, 163, 13, 0.95), rgba(163, 230, 53, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(217, 249, 157, 0.80)'
      },
      { // 10. DEEP INDIGO (Ultramarine Cobalt Glass - strong contrast with Lime and Sapphire)
        bg: 'linear-gradient(135deg, rgba(67, 56, 202, 0.19) 0%, rgba(199, 210, 254, 0.32) 100%)',
        bottomBorder: 'rgba(67, 56, 202, 0.52)',
        shadow: 'rgba(67, 56, 202, 0.22)',
        title: '#1e1b4b', icon: '#4338ca', subText: '#312e81',
        badgeBg: 'linear-gradient(135deg, rgba(67, 56, 202, 0.95), rgba(129, 140, 248, 0.98))',
        badgeColor: '#ffffff', badgeBorder: '#ffffff',
        subBorder: 'rgba(199, 210, 254, 0.80)'
      }
    ];

    const facultyCardsHtml = faculties.map((f, idx) => {
      const pal = rainbowGlassPalettes[idx % rainbowGlassPalettes.length];

      const subjectRows = (f.subjects || []).map(s => {
        const isPractical = isPracticalSubject(s) || s.type === 'practical' || (s.code && s.code.toUpperCase().endsWith('P')) || (s.name && s.name.toLowerCase().includes('practical'));
        const unitLabel = isPractical ? 'practicals' : 'lectures';
        const fallback = isPractical ? 15 : 45;
        const displayTotal = (s.totalLectures && s.totalLectures > 5) ? Math.max(s.totalLectures, s.totalConducted || 0) : Math.max(s.totalConducted || 0, fallback);
        const displayConducted = s.totalConducted || 0;
        const displayPercent = displayTotal > 0 ? Math.min(100, Math.round((displayConducted / displayTotal) * 100)) : 0;

        const isSubZero = (displayPercent === 0);
        const pctColor = isSubZero ? '#dc2626' : '#059669';
        const pctBg = isSubZero ? 'rgba(239, 68, 68, 0.10)' : 'rgba(16, 185, 129, 0.10)';
        const pctBorder = isSubZero ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        const sBarColor = isSubZero ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #10b981, #059669)';

        const liveSubAtt = (s.avgAttendance !== undefined && s.avgAttendance !== null && s.avgAttendance > 0) ? s.avgAttendance : getLiveSubjectAttendancePct(s.code || s.name);
        const liveSubAttText = (liveSubAtt !== null && liveSubAtt > 0) ? `${liveSubAtt}%` : (s.avgAttendance > 0 ? `${s.avgAttendance}%` : '--%');

        const semRaw = String(s.semester || 'I').trim();
        const semLabel = /^sem/i.test(semRaw) ? escHtml(semRaw) : `Sem ${escHtml(semRaw)}`;

        return `
          <div class="incharge-subject-item" style="background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); border-top: 1.5px solid #ffffff; border-left: 1.5px solid #ffffff; border-bottom: 1.5px solid ${pal.subBorder}; border-right: 1.5px solid ${pal.subBorder}; box-shadow: inset 0 1px 1.5px #ffffff, 0 4px 12px rgba(0,0,0,0.05); border-radius: 14px; padding: 12px 14px;">
            <!-- Row 1: Subject Name & Code -->
            <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
              <div style="font-weight: 800; color: #0f172a; font-size: 14px; line-height: 1.3;">
                ${escHtml(s.name)}
              </div>
              <span style="color: #475569; font-weight: 700; font-size: 12px; flex-shrink: 0;">Code: (${escHtml(s.code)})</span>
            </div>

            <!-- Row 2: Action Buttons (View Plan & Student's Feedback side-by-side centered) -->
            <div style="display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; margin-bottom: 8px;">
              <button type="button" class="btn-view-plan-link" onclick="App.selectSubjectForDrilldown('${_escAttr(s.code)}', '${_escAttr(s.name)}')" title="Click to open full syllabus & teaching plan for ${s.name}" style="background: linear-gradient(135deg, rgba(0, 122, 255, 0.12), rgba(0, 195, 255, 0.18)); border: 1.5px solid rgba(0, 122, 255, 0.35); color: #0284c7 !important; font-size: 11.5px; font-weight: 800; padding: 0 12px; height: 28px; border-radius: 9999px; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; transition: all 0.2s ease; box-shadow: inset 0 1px 1px #ffffff;">
                View Plan <i class="ph ph-caret-right" style="color: #0284c7 !important; font-weight: 800;"></i>
              </button>
              <button type="button" class="btn-student-feedback-link" onclick="Toast.show('Student Feedback', 'Student feedback module coming soon.', 'info')" title="Student\'s Feedback for ${escHtml(s.name)}" style="background: rgba(255, 255, 255, 0.75); border: 1.5px solid ${pal.icon}; color: ${pal.icon} !important; font-size: 11.5px; font-weight: 800; padding: 0 12px; height: 28px; border-radius: 9999px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: all 0.2s ease; box-shadow: inset 0 1px 1px #ffffff;">
                Student's Feedback <i class="ph ph-chat-teardrop-text" style="color: ${pal.icon} !important;"></i>
              </button>
            </div>

            <!-- Row 3: Sem, Lectures & Live Avg Attendance (SINGLE ROW ABOVE STATUS BAR) -->
            <div style="font-size: 11px; color: #475569; font-weight: 600; margin-top: 8px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; gap: 6px;">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${semLabel} • ${displayConducted} / ${displayTotal} ${unitLabel} <strong style="color: ${pctColor}; margin-left: 4px;">(${displayPercent}%)</strong></span>
              <span style="font-size: 11px; color: #334155; font-weight: 700; display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0; white-space: nowrap;">
                <i class="ph ph-users" style="color: #64748b;"></i> Avg. Att: <span style="color: #0f172a; font-weight: 800;">${liveSubAttText}</span>
              </span>
            </div>

            <!-- Row 4: Status Bar / Progress Bar -->
            <div style="height: 6px; background: rgba(0, 0, 0, 0.06); border-radius: 3px; overflow: hidden;">
              <div style="width: ${displayPercent}%; height: 100%; background: ${sBarColor}; border-radius: 3px; transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);"></div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="faculty-progress-card" style="background: ${pal.bg} !important; border-top: 1.8px solid #ffffff !important; border-left: 1.8px solid #ffffff !important; border-bottom: 1.8px solid ${pal.bottomBorder} !important; border-right: 1.8px solid ${pal.bottomBorder} !important; box-shadow: inset 0 1.5px 2px #ffffff, 0 10px 28px ${pal.shadow} !important;">
          <div class="faculty-card-header" style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
            <div class="faculty-card-name" style="color: ${pal.title}; font-weight: 800; font-size: 16px;"><i class="ph ph-user-circle" style="margin-right: 6px; color: ${pal.icon};"></i>${escHtml(f.faculty)}</div>
            <div style="display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <div class="faculty-card-badge" style="background: ${pal.badgeBg} !important; color: ${pal.badgeColor} !important; border: 1.5px solid ${pal.badgeBorder} !important; padding: 4px 14px; border-radius: 9999px; font-weight: 800;">${f.overallPercent}% Coverage</div>
            </div>
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${subjectRows}
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = `
      ${overallHtml}
      <div class="dashboard-section-header" style="margin: 24px 0 12px;">
        <h3 class="section-title" style="font-size: 16px; color: #0f172a; font-weight: 800;">Faculty Course Execution Progress</h3>
      </div>
      <div class="faculty-progress-grid">
        ${facultyCardsHtml}
      </div>
    `;
  }

  function selectSubjectForDrilldown(code, name) {
    selectCustomSubjectOption(code, name || code);
    switchView('teaching-plan');
  }

  function goBackToInchargeDashboard() {
    switchView('incharge-dashboard');
  }

  // ─── DOCUMENT UPLOAD HANDLERS ─────────────────────────
  function openUploadDocModal() {
    const modal = document.getElementById('upload-doc-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeUploadDocModal() {
    const modal = document.getElementById('upload-doc-modal');
    if (modal) modal.style.display = 'none';
  }

  async function doUploadAcademicDocument() {
    const fileInput = document.getElementById('upload-doc-file');
    const docTypeSelect = document.getElementById('upload-doc-type');
    const btn = document.getElementById('btn-do-upload-doc');

    if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
      Toast.show('File Required', 'Please select a document file to upload.', 'warning');
      return;
    }

    const file = fileInput.files[0];
    const docType = docTypeSelect ? docTypeSelect.value : 'timetable';

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="ph ph-spinner spinner"></i> Uploading to College Drive...';
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const result = e.target.result;
        const base64Data = result.split(',')[1];

        const res = await API.uploadAcademicDocument(base64Data, file.name, file.type, docType);

        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="ph ph-cloud-arrow-up"></i> Upload to College Drive';
        }

        if (res.success) {
          Toast.show('Upload Successful', `File "${file.name}" saved to College Drive.`, 'success');
          closeUploadDocModal();
          fileInput.value = '';
          loadAcademicSchedule();
        } else {
          // Strictly display error toast if upload fails — no fallback!
          Toast.show('Drive Upload Failed', res.error || 'Permission Error: Access to College Drive folder denied.', 'danger');
        }
      };
      reader.onerror = () => {
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = '<i class="ph ph-cloud-arrow-up"></i> Upload to College Drive';
        }
        Toast.show('File Read Error', 'Failed reading selected file.', 'danger');
      };
      reader.readAsDataURL(file);
    } catch(err) {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="ph ph-cloud-arrow-up"></i> Upload to College Drive';
      }
      Toast.show('Upload Error', err.message, 'danger');
    }
  }

  function updateScheduleBadge(badgeState) {
    const badge = document.getElementById('badge-calendar');
    const navDot = document.getElementById('nav-schedule-dot');
    if (!badge) return;
    if (badgeState === 'update') {
      badge.className = 'gf-badge-update';
      badge.innerHTML = '<i class="ph ph-sparkle"></i> NEW UPDATE';
      if (navDot) navDot.style.display = '';
    } else {
      badge.className = 'gf-badge';
      badge.innerHTML = 'Refreshed';
      if (navDot) navDot.style.display = 'none';
    }
  }

  // ─── DOCX (OOXML) BUILDER HELPERS ─────────────────────────
  // CRC-32 (used by the ZIP central directory).
  const _crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = _crcTable[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Build a store-only (uncompressed) ZIP blob from [{name, bytes}].
  // Store method keeps .docx valid without a compression dependency.
  function zipStore(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF];
    const u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];

    files.forEach(f => {
      const nameBytes = enc.encode(f.name);
      const data = f.bytes;
      const crc = crc32(data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push({ nameBytes, crc, size: data.length, offset });
      offset += local.length + nameBytes.length + data.length;
    });

    const cdStart = offset;
    let cdSize = 0;
    central.forEach(c => {
      const rec = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
      );
      const recArr = new Uint8Array(rec);
      chunks.push(recArr, c.nameBytes);
      cdSize += recArr.length + c.nameBytes.length;
    });

    const end = new Uint8Array([].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0)
    ));
    chunks.push(end);
    return new Blob(chunks, { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // Escape text for WordprocessingML content.
  function xmlEsc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  const DOCX_CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

  const DOCX_ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

  // ─── DOWNLOAD TEACHING PLAN AS .DOCX ──────────────────────
  function downloadTeachingPlanDoc() {
    if (!state.activeSubject) {
      Toast.show('Download Failed', 'No active subject selected.', 'danger');
      return;
    }

    const allTopics = state.teachingPlan.all || [];
    const filteredTopics = allTopics.filter(t => {
      const lNo = String(t.lectureNo).toLowerCase();
      return !lNo.startsWith('t') && !lNo.includes('tut');
    });
    function getRequiredTopicsCount(topicsList, metadata) {
      if (metadata && typeof metadata.totalLectures === 'number' && metadata.totalLectures > 5 && metadata.totalLectures <= topicsList.length) {
        return metadata.totalLectures;
      }
      let maxSeenNo = 0;
      for (let idx = 0; idx < topicsList.length; idx++) {
        const num = parseInt(topicsList[idx].lectureNo, 10);
        if (!isNaN(num)) {
          if (num <= maxSeenNo && maxSeenNo > 5) {
            return idx;
          }
          if (num > maxSeenNo) {
            maxSeenNo = num;
          }
        }
      }
      if (topicsList.length > 5) return topicsList.length;
      return isPracticalSubject(state.activeSubject) ? 15 : 45;
    }

    const reqTopics = getRequiredTopicsCount(filteredTopics, state.metadata);
    const originalTopics = filteredTopics.slice(0, reqTopics);

    filteredTopics.slice(reqTopics).forEach(spillover => {
      const targetLNo = String(spillover.lectureNo).trim().toLowerCase();
      const target = originalTopics.find(t => String(t.lectureNo).trim().toLowerCase() === targetLNo);
      if (target && spillover.executedDate) {
        if (!target.executedDate) {
          target.executedDate = spillover.executedDate;
        } else if (target.executedDate.indexOf(spillover.executedDate) === -1) {
          target.executedDate = target.executedDate + ', ' + spillover.executedDate;
        }
      }
    });

    const meta = {
      mgmt: state.metadata.managementName || 'Sinhgad Technical Education Society',
      college: state.metadata.collegeName || 'RMD Institute of Pharmaceutical Education & Research',
      acadYear: state.metadata.academicYear || '2024-25',
      subjectName: state.activeSubject.name,
      subjectCode: state.activeCode,
      semester: state.activeSubject.semester,
      courseYear: `${state.activeSubject.program || ''} ${state.activeSubject.year || ''}`.trim(),
      faculty: state.facultyName,
      unit: isPracticalSubject(state.activeSubject) ? 'Practical' : 'Lecture',
      topics: originalTopics
    };

    const documentXml = buildTeachingPlanDocx(meta);
    const enc = new TextEncoder();
    const blob = zipStore([
      { name: '[Content_Types].xml', bytes: enc.encode(DOCX_CONTENT_TYPES) },
      { name: '_rels/.rels', bytes: enc.encode(DOCX_ROOT_RELS) },
      { name: 'word/document.xml', bytes: enc.encode(documentXml) }
    ]);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Teaching_Plan_${meta.subjectCode}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.show('Downloaded', 'Teaching plan .docx generated successfully.', 'success');
  }

  // Build the WordprocessingML document.xml body for the teaching plan.
  // Grayscale / print-friendly, A4 with 1-inch (1440 twip) margins on all sides.
  function buildTeachingPlanDocx(m) {
    const HEADER_FILL = '404040';   // dark gray table-header background
    const LABEL_FILL = 'EDEDED';    // light gray info-label background
    const FONT = 'Calibri';         // single professional font throughout
    const TEXT_W = 9026;            // usable width on A4 with 1" side margins

    // A single run of text with optional properties. Sizes are half-points;
    // enforce a 12pt (24 half-pt) minimum, keep anything larger as given.
    const run = (text, { b, color, sz = 24, caps } = {}) => {
      const size = Math.max(24, sz);
      const rPr = [`<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`];
      if (b) rPr.push('<w:b/>');
      if (caps) rPr.push('<w:caps/>');
      if (color) rPr.push(`<w:color w:val="${color}"/>`);
      rPr.push(`<w:sz w:val="${size}"/>`);
      return `<w:r><w:rPr>${rPr.join('')}</w:rPr><w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r>`;
    };

    // A paragraph. opts: align, spaceAfter (twips), and runs already built.
    const para = (runsXml, { align, after = 120 } = {}) => {
      const pPr = ['<w:spacing w:after="' + after + '" w:line="240" w:lineRule="auto"/>'];
      if (align) pPr.push(`<w:jc w:val="${align}"/>`);
      return `<w:p><w:pPr>${pPr.join('')}</w:pPr>${runsXml || ''}</w:p>`;
    };

    // A table cell. shade = hex fill; align = h-alignment (v-centered always).
    const cell = (runsXml, { shade, align } = {}) => {
      const tcPr = ['<w:vAlign w:val="center"/>'];
      if (shade) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`);
      const pPr = ['<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/>'];
      if (align) pPr.push(`<w:jc w:val="${align}"/>`);
      return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr><w:p><w:pPr>${pPr.join('')}</w:pPr>${runsXml}</w:p></w:tc>`;
    };

    // Fixed-layout table wrapper: grid columns + borders + comfortable cell padding.
    const table = (cols, rows, { borders = true } = {}) => {
      const grid = `<w:tblGrid>${cols.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
      const bdr = borders
        ? `<w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="7F7F7F"/><w:left w:val="single" w:sz="4" w:color="7F7F7F"/>
            <w:bottom w:val="single" w:sz="4" w:color="7F7F7F"/><w:right w:val="single" w:sz="4" w:color="7F7F7F"/>
            <w:insideH w:val="single" w:sz="4" w:color="7F7F7F"/><w:insideV w:val="single" w:sz="4" w:color="7F7F7F"/>
          </w:tblBorders>`
        : `<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>`;
      return `<w:tbl><w:tblPr>` +
        `<w:tblW w:w="${TEXT_W}" w:type="dxa"/>` +
        `<w:jc w:val="center"/>` +
        `<w:tblLayout w:type="fixed"/>` +
        bdr +
        `<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="120" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tblCellMar>` +
        `</w:tblPr>${grid}${rows}</w:tbl>`;
    };

    // ── Info table: label / value / label / value ──
    const infoRow = (l1, v1, l2, v2) =>
      `<w:tr>` +
      cell(run(l1, { b: true }), { shade: LABEL_FILL }) +
      cell(run(v1)) +
      cell(run(l2, { b: true }), { shade: LABEL_FILL }) +
      cell(run(v2)) +
      `</w:tr>`;

    const infoCols = [2050, 2463, 2050, 2463];
    const infoTable = table(infoCols,
      infoRow('Faculty Name', m.faculty, 'Academic Year', m.acadYear) +
      infoRow('Subject Code', m.subjectCode, 'Subject Name', m.subjectName) +
      infoRow('Class & Year', m.courseYear, 'Semester', m.semester));

    // ── Data table ──
    // Taught Date column shows only when at least one lecture has been taught.
    const anyTaught = m.topics.some(t => !!t.executedDate);
    // Size the No column to the widest content it must hold (header label vs row numbers),
    // so "Lecture No" / "Practical No" doesn't wrap and the numbers stay centered.
    const noHeader = `${m.unit} No`;
    const maxRowDigits = m.topics.reduce((n, t) => Math.max(n, String(t.lectureNo).length), 1);
    // ~130 twips per char for the header + padding; ~180 per digit for the numbers.
    const noW = Math.max(1150, noHeader.length * 130 + 240, maxRowDigits * 180 + 400);
    const dateW = 1400;
    const subW = TEXT_W - noW - dateW - (anyTaught ? dateW : 0);
    const dataCols = anyTaught ? [noW, subW, dateW, dateW] : [noW, subW, dateW];
    const th = txt => run(txt, { b: true, color: 'FFFFFF', caps: true });

    const headerRow = `<w:tr><w:trPr><w:tblHeader/></w:trPr>` +
      cell(th(`${m.unit} No`), { shade: HEADER_FILL, align: 'center' }) +
      cell(th('Syllabus Planned'), { shade: HEADER_FILL, align: 'center' }) +
      cell(th('Planned Date'), { shade: HEADER_FILL, align: 'center' }) +
      (anyTaught ? cell(th('Taught Date'), { shade: HEADER_FILL, align: 'center' }) : '') +
      `</w:tr>`;

    let bodyRows = '';
    if (!m.topics.length) {
      bodyRows = `<w:tr>${cell(run('No syllabus topics found.'), { align: 'center' })}</w:tr>`;
    } else {
      m.topics.forEach((t, i) => {
        const done = !!t.executedDate;
        const shade = i % 2 ? 'F6F6F6' : undefined;
        bodyRows += `<w:tr>` +
          cell(run(String(t.lectureNo)), { shade, align: 'center' }) +
          cell(run(t.syllabus), { shade }) +
          cell(run(formatDisplayDate(t.plannedDate) || '-'), { shade, align: 'center' }) +
          (anyTaught
            ? cell(run(done ? formatDisplayDate(t.executedDate) : 'Not Taught', { b: done }), { shade, align: 'center' })
            : '') +
          `</w:tr>`;
      });
    }
    const dataTable = table(dataCols, headerRow + bodyRows);

    // ── Signature row: borderless 3-column (Faculty / Academic In-charge / Principal) ──
    const third = Math.round(TEXT_W / 3);
    const signTable = table([third, third, TEXT_W - 2 * third],
      `<w:tr>` +
      cell(run('Faculty', { b: true }), { align: 'left' }) +
      cell(run('Academic In-charge', { b: true }), { align: 'center' }) +
      cell(run('Principal', { b: true }), { align: 'right' }) +
      `</w:tr>`, { borders: false });

    const body =
      para(run(m.mgmt, { b: true, caps: true, sz: 22 }), { align: 'center', after: 40 }) +
      para(run(m.college, { b: true, sz: 32 }), { align: 'center', after: 60 }) +
      para(run('Syllabus Completion / Teaching Plan', { b: true, caps: true, sz: 26 }), { align: 'center', after: 320 }) +
      infoTable +
      para('', { after: 240 }) +
      dataTable +
      para('', { after: 900 }) +
      signTable +
      `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  }

  // ─── DOWNLOAD STUDENT ATTENDANCE REPORT AS .DOCX ──────────
  function downloadStudentAttendanceDoc() {
    const rep = state.activeStudentReport;
    if (!rep || !rep.studentList || rep.studentList.length === 0) {
      Toast.show('No Data Available', 'Please wait for student attendance records to load or select an active class.', 'warning');
      return;
    }

    const ctx = window.appStartContext || {};
    const cfg = ctx.config || {};
    const metaObj = (state.allData && state.allData.metadata) || state.metadata || {};

    const mgmt = ctx.managementName || cfg.management_name || cfg.managementName || metaObj.managementName || (window.ACAD_CONFIG && window.ACAD_CONFIG.managementName) || 'Sinhgad Technical Education Society';
    const college = ctx.collegeName || cfg.college_name || cfg.collegeName || metaObj.collegeName || (window.ACAD_CONFIG && window.ACAD_CONFIG.collegeName) || 'RMD Institute of Pharmaceutical Education & Research';
    const ay = cfg.academic_year || cfg.academicYear || cfg.ay || metaObj.academicYear || (window.ACAD_CONFIG && window.ACAD_CONFIG.academicYear) || '2024-25';

    const docMeta = {
      mgmt: mgmt,
      college: college,
      acadYear: ay,
      className: rep.className || state.activeStudentYear || 'Class Report',
      periodLabel: rep.periodLabel || 'All Time (Entire Academic Year)',
      eligibilityThreshold: rep.eligibilityThreshold || 75,
      defaulterCount: rep.defaulterCount || 0,
      studentList: rep.studentList || [],
      subjectColumns: rep.subjectColumns || []
    };

    const documentXml = buildStudentAttendanceDocx(docMeta);
    const enc = new TextEncoder();
    const blob = zipStore([
      { name: '[Content_Types].xml', bytes: enc.encode(DOCX_CONTENT_TYPES) },
      { name: '_rels/.rels', bytes: enc.encode(DOCX_ROOT_RELS) },
      { name: 'word/document.xml', bytes: enc.encode(documentXml) }
    ]);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanClass = (docMeta.className || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanAy = String(docMeta.acadYear || '2024-25').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `Attendance_Report_${cleanClass}_${cleanAy}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.show('Downloaded', 'Student attendance report .docx generated successfully.', 'success');
  }

  // Build WordprocessingML document.xml body for Student Attendance & Eligibility Report.
  // Grayscale / print-friendly, A4 Landscape (or Portrait if <= 3 subjects), 3 Signatories.
  function buildStudentAttendanceDocx(m) {
    const HEADER_FILL = '383838';      // Dark gray / charcoal table header
    const LABEL_FILL = 'EBEBEB';       // Light gray label shading
    const ZEBRA_FILL = 'F6F6F6';       // Subtle alternate row background
    const FONT = 'Calibri';            // Universally supported font across desktop & mobile
    
    const isLandscape = (m.subjectColumns || []).length >= 4;
    const PAGE_W = isLandscape ? 16838 : 11906;  // A4 dimensions in twips
    const PAGE_H = isLandscape ? 11906 : 16838;
    const MARGIN_SIDE = 720;                     // 0.5 inch side margins
    const MARGIN_VERT = 1080;                    // 0.75 inch top/bottom margins
    const TEXT_W = PAGE_W - (2 * MARGIN_SIDE);   // 15398 in landscape, 10466 in portrait

    // Helper: Run of text (supports newlines via <w:br/>)
    const run = (text, { b, color, sz = 20, caps } = {}) => {
      const size = Math.max(14, sz);
      const rPr = [`<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`];
      if (b) rPr.push('<w:b/>');
      if (caps) rPr.push('<w:caps/>');
      if (color) rPr.push(`<w:color w:val="${color}"/>`);
      rPr.push(`<w:sz w:val="${size}"/>`);
      
      const str = String(text == null ? '' : text);
      const lines = str.split('\n');
      const textNodes = lines.map(line => `<w:t xml:space="preserve">${xmlEsc(line)}</w:t>`).join('<w:br/>');
      
      return `<w:r><w:rPr>${rPr.join('')}</w:rPr>${textNodes}</w:r>`;
    };

    // Helper: Paragraph
    const para = (runsXml, { align, after = 120 } = {}) => {
      const pPr = [`<w:spacing w:after="${after}" w:line="240" w:lineRule="auto"/>`];
      if (align) pPr.push(`<w:jc w:val="${align}"/>`);
      return `<w:p><w:pPr>${pPr.join('')}</w:pPr>${runsXml || ''}</w:p>`;
    };

    // Helper: Table cell
    const cell = (runsXml, { shade, align = 'left', vAlign = 'center' } = {}) => {
      const tcPr = [`<w:vAlign w:val="${vAlign}"/>`];
      if (shade) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`);
      const pPr = ['<w:spacing w:before="30" w:after="30" w:line="240" w:lineRule="auto"/>'];
      if (align) pPr.push(`<w:jc w:val="${align}"/>`);
      return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr><w:p><w:pPr>${pPr.join('')}</w:pPr>${runsXml}</w:p></w:tc>`;
    };

    // Helper: Fixed table builder
    const table = (cols, rows, { borders = true } = {}) => {
      const tblWidth = cols.reduce((a, b) => a + b, 0);
      const grid = `<w:tblGrid>${cols.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
      const bdr = borders
        ? `<w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="7F7F7F"/><w:left w:val="single" w:sz="4" w:color="7F7F7F"/>
            <w:bottom w:val="single" w:sz="4" w:color="7F7F7F"/><w:right w:val="single" w:sz="4" w:color="7F7F7F"/>
            <w:insideH w:val="single" w:sz="4" w:color="7F7F7F"/><w:insideV w:val="single" w:sz="4" w:color="7F7F7F"/>
          </w:tblBorders>`
        : `<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>`;
      return `<w:tbl><w:tblPr>` +
        `<w:tblW w:w="${tblWidth}" w:type="dxa"/>` +
        `<w:jc w:val="center"/>` +
        `<w:tblLayout w:type="fixed"/>` +
        bdr +
        `<w:tblCellMar><w:top w:w="50" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="50" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>` +
        `</w:tblPr>${grid}${rows}</w:tbl>`;
    };

    // ── 1. Metadata Info Table ──
    const infoRow = (l1, v1, l2, v2) =>
      `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
      cell(run(l1, { b: true, sz: 19 }), { shade: LABEL_FILL }) +
      cell(run(v1, { sz: 19 })) +
      cell(run(l2, { b: true, sz: 19 }), { shade: LABEL_FILL }) +
      cell(run(v2, { sz: 19 })) +
      `</w:tr>`;

    const infoCols = isLandscape ? [2400, 5299, 2400, 5299] : [1900, 3333, 1900, 3333];
    const infoTable = table(infoCols,
      infoRow('Class / Program', m.className, 'Academic Year', m.acadYear) +
      infoRow('Timeperiod Filter', m.periodLabel, 'Eligibility Criteria', `≥ ${m.eligibilityThreshold}% Attendance`) +
      infoRow('Total Students', `${m.studentList.length} Students`, 'Attendance Status', `${m.defaulterCount > 0 ? `${m.defaulterCount} Defaulter(s) (< ${m.eligibilityThreshold}%)` : 'All Students Eligible'}`)
    );

    // ── 2. Data Table Column Width Calculations ──
    const rollW = isLandscape ? 850 : 750;
    const batchW = isLandscape ? 800 : 700;
    const avgW = isLandscape ? 1100 : 1000;
    const statusW = isLandscape ? 1300 : 1200;
    const nameW = isLandscape ? 2900 : 2500;

    const fixedTotal = rollW + nameW + batchW + avgW + statusW;
    const subCount = Math.max(1, (m.subjectColumns || []).length);
    const remainingForSubs = Math.max(subCount * 650, TEXT_W - fixedTotal);
    const subColW = Math.floor(remainingForSubs / subCount);
    
    // Exact column widths array
    const dataCols = [rollW, nameW, batchW, ...(m.subjectColumns || []).map(() => subColW), avgW, statusW];

    // ── 3. Table Header Row (Repeats across pages via <w:tblHeader/>) ──
    const th = (txt, sz = 18) => run(txt, { b: true, color: 'FFFFFF', sz });
    
    let headerCellsXml =
      cell(th('Roll No'), { shade: HEADER_FILL, align: 'center' }) +
      cell(th('Student Name'), { shade: HEADER_FILL, align: 'left' }) +
      cell(th('Batch'), { shade: HEADER_FILL, align: 'center' });

    (m.subjectColumns || []).forEach(sc => {
      const info = formatCompactSubjectHeader(sc);
      const subLabel = info.shortName ? `${info.code}\n${info.shortName}` : info.code;
      headerCellsXml += cell(th(`${subLabel}\n(%)`, 16), { shade: HEADER_FILL, align: 'center' });
    });

    headerCellsXml += cell(th('Avg. Att\n(%)'), { shade: HEADER_FILL, align: 'center' });
    headerCellsXml += cell(th('Eligibility\nStatus'), { shade: HEADER_FILL, align: 'center' });

    const headerRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>${headerCellsXml}</w:tr>`;

    // ── 4. Table Body Rows ──
    let bodyRows = '';
    if (!m.studentList || !m.studentList.length) {
      bodyRows = `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cell(run('No student attendance records found.'), { align: 'center' })}</w:tr>`;
    } else {
      m.studentList.forEach((st, i) => {
        const isDef = st.isDefaulter || (st.pct < m.eligibilityThreshold);
        const shade = i % 2 === 1 ? ZEBRA_FILL : undefined;
        const rowFontSz = isLandscape ? 18 : 17;

        let rowCellsXml =
          cell(run(String(st.rollNo || '-'), { b: isDef, sz: rowFontSz }), { shade, align: 'center' }) +
          cell(run(String(st.name || '-'), { b: isDef, sz: rowFontSz }), { shade, align: 'left' }) +
          cell(run(String(st.batch || 'Gen'), { sz: rowFontSz }), { shade, align: 'center' });

        (m.subjectColumns || []).forEach(sc => {
          const rawCode = sc.code;
          const cleanScCode = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          let subData = st.subjectMap ? (st.subjectMap[rawCode] || st.subjectMap[cleanScCode]) : null;
          if (!subData && st.subjectMap) {
            for (const k in st.subjectMap) {
              const cleanK = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (cleanK === cleanScCode || (cleanK && cleanScCode && (cleanK.includes(cleanScCode) || cleanScCode.includes(cleanK)))) {
                subData = st.subjectMap[k];
                break;
              }
            }
          }

          let cellTxt = '-';
          let isSubDef = false;
          if (subData && subData.total > 0) {
            const sPct = Math.round((subData.present / subData.total) * 100);
            cellTxt = `${sPct}%`;
            isSubDef = sPct < m.eligibilityThreshold;
          }

          rowCellsXml += cell(run(cellTxt, { b: isSubDef, sz: rowFontSz }), { shade, align: 'center' });
        });

        const avgText = typeof st.pct === 'number' ? `${st.pct}%` : '-';
        const statusText = isDef ? 'Defaulter' : 'Eligible';

        rowCellsXml += cell(run(avgText, { b: true, sz: rowFontSz }), { shade, align: 'center' });
        rowCellsXml += cell(run(statusText, { b: isDef, sz: rowFontSz }), { shade, align: 'center' });

        bodyRows += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${rowCellsXml}</w:tr>`;
      });
    }

    const dataTable = table(dataCols, headerRow + bodyRows);

    // ── 5. 3 Signatories Row (Academic In-charge / Class Teacher / Principal) ──
    const third = Math.floor(TEXT_W / 3);
    const signCols = [third, third, TEXT_W - (2 * third)];
    const signTable = table(signCols,
      `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
      cell(run('Academic In-charge', { b: true, sz: 22 }), { align: 'left' }) +
      cell(run('Class Teacher', { b: true, sz: 22 }), { align: 'center' }) +
      cell(run('Principal', { b: true, sz: 22 }), { align: 'right' }) +
      `</w:tr>`, { borders: false });

    // ── 6. Assemble Complete Document Body & Section Geometry ──
    const body =
      para(run(m.mgmt, { b: true, caps: true, sz: 22 }), { align: 'center', after: 40 }) +
      para(run(m.college, { b: true, sz: 30 }), { align: 'center', after: 60 }) +
      para(run('STUDENT ATTENDANCE & SESSIONAL ELIGIBILITY REPORT', { b: true, caps: true, sz: 24 }), { align: 'center', after: 200 }) +
      infoTable +
      para('', { after: 220 }) +
      dataTable +
      para('', { after: 800 }) +
      signTable +
      `<w:sectPr>` +
        `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}" ${isLandscape ? 'w:orient="landscape"' : ''}/>` +
        `<w:pgMar w:top="${MARGIN_VERT}" w:right="${MARGIN_SIDE}" w:bottom="${MARGIN_VERT}" w:left="${MARGIN_SIDE}" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  }

  // ─── DOWNLOAD OFFICIAL DEFAULTERS NOTICE AS .DOCX ─────────
  function downloadDefaultersNoticeDoc() {
    const rep = state.activeStudentReport;
    if (!rep || !rep.studentList || rep.studentList.length === 0) {
      Toast.show('No Data Available', 'Please wait for student attendance records to load or select an active class.', 'warning');
      return;
    }

    const ctx = window.appStartContext || {};
    const cfg = ctx.config || {};
    const metaObj = (state.allData && state.allData.metadata) || state.metadata || {};

    const mgmt = ctx.managementName || cfg.management_name || cfg.managementName || metaObj.managementName || (window.ACAD_CONFIG && window.ACAD_CONFIG.managementName) || 'Sinhgad Technical Education Society';
    const college = ctx.collegeName || cfg.college_name || cfg.collegeName || metaObj.collegeName || (window.ACAD_CONFIG && window.ACAD_CONFIG.collegeName) || 'RMD Institute of Pharmaceutical Education & Research';
    const ay = cfg.academic_year || cfg.academicYear || cfg.ay || metaObj.academicYear || (window.ACAD_CONFIG && window.ACAD_CONFIG.academicYear) || '2025-26';

    const docMeta = {
      mgmt: mgmt,
      college: college,
      acadYear: ay,
      className: rep.className || state.activeStudentYear || 'Third Year B. Pharm',
      periodLabel: rep.periodLabel || 'All Time (Entire Academic Year)',
      eligibilityThreshold: rep.eligibilityThreshold || 75,
      defaulterCount: rep.defaulterCount || 0,
      studentList: rep.studentList || [],
      subjectColumns: rep.subjectColumns || [],
      classSubjects: rep.classSubjects || rep.subjectColumns || []
    };

    const documentXml = buildDefaultersNoticeDocx(docMeta);
    const enc = new TextEncoder();
    const blob = zipStore([
      { name: '[Content_Types].xml', bytes: enc.encode(DOCX_CONTENT_TYPES) },
      { name: '_rels/.rels', bytes: enc.encode(DOCX_ROOT_RELS) },
      { name: 'word/document.xml', bytes: enc.encode(documentXml) }
    ]);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanClass = (docMeta.className || 'Class').replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanAy = String(docMeta.acadYear || '2025-26').replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `Defaulters_Notice_${cleanClass}_${cleanAy}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Toast.show('Downloaded', 'Official Defaulters Notice .docx generated successfully.', 'success');
  }

  // Build WordprocessingML document.xml for Defaulters Notice.
  // Matches exact official layout: College & Management Header, Notice body,
  // 4-Column 2-Up Defaulters list, Subject Teachers Acknowledgment table, and 3 Signatories.
  function buildDefaultersNoticeDocx(m) {
    const HEADER_FILL = '383838';      // Charcoal table header
    const ZEBRA_FILL = 'F6F6F6';       // Subtle alternate row shading
    const FONT = 'Calibri';            // Universally supported font across desktop & mobile

    const PAGE_W = 11906;              // A4 Portrait dimensions in twips
    const PAGE_H = 16838;
    const MARGIN_SIDE = 1080;          // 0.75 in side margins
    const MARGIN_VERT = 1080;          // 0.75 in top/bottom margins
    const TEXT_W = PAGE_W - (2 * MARGIN_SIDE); // 9746 twips

    // Helper: Run of text (supports newlines via <w:br/>)
    const run = (text, { b, color, sz = 24, caps } = {}) => {
      const size = Math.max(14, sz);
      const rPr = [`<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}"/>`];
      if (b) rPr.push('<w:b/>');
      if (caps) rPr.push('<w:caps/>');
      if (color) rPr.push(`<w:color w:val="${color}"/>`);
      rPr.push(`<w:sz w:val="${size}"/>`);
      
      const str = String(text == null ? '' : text);
      const lines = str.split('\n');
      const textNodes = lines.map(line => `<w:t xml:space="preserve">${xmlEsc(line)}</w:t>`).join('<w:br/>');
      
      return `<w:r><w:rPr>${rPr.join('')}</w:rPr>${textNodes}</w:r>`;
    };

    // Helper: Paragraph
    const para = (runsXml, { align, after = 120, before = 0, line = 240 } = {}) => {
      const pPr = [`<w:spacing w:before="${before}" w:after="${after}" w:line="${line}" w:lineRule="auto"/>`];
      if (align) pPr.push(`<w:jc w:val="${align}"/>`);
      return `<w:p><w:pPr>${pPr.join('')}</w:pPr>${runsXml || ''}</w:p>`;
    };

    // Helper: Table cell
    const cell = (runsXml, { shade, align = 'left', vAlign = 'center' } = {}) => {
      const tcPr = [`<w:vAlign w:val="${vAlign}"/>`];
      if (shade) tcPr.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shade}"/>`);
      const pPr = ['<w:spacing w:before="35" w:after="35" w:line="240" w:lineRule="auto"/>'];
      if (align) pPr.push(`<w:jc w:val="${align}"/>`);
      return `<w:tc><w:tcPr>${tcPr.join('')}</w:tcPr><w:p><w:pPr>${pPr.join('')}</w:pPr>${runsXml}</w:p></w:tc>`;
    };

    // Helper: Fixed table builder
    const table = (cols, rows, { borders = true } = {}) => {
      const tblWidth = cols.reduce((a, b) => a + b, 0);
      const grid = `<w:tblGrid>${cols.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
      const bdr = borders
        ? `<w:tblBorders>
            <w:top w:val="single" w:sz="4" w:color="7F7F7F"/><w:left w:val="single" w:sz="4" w:color="7F7F7F"/>
            <w:bottom w:val="single" w:sz="4" w:color="7F7F7F"/><w:right w:val="single" w:sz="4" w:color="7F7F7F"/>
            <w:insideH w:val="single" w:sz="4" w:color="7F7F7F"/><w:insideV w:val="single" w:sz="4" w:color="7F7F7F"/>
          </w:tblBorders>`
        : `<w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders>`;
      return `<w:tbl><w:tblPr>` +
        `<w:tblW w:w="${tblWidth}" w:type="dxa"/>` +
        `<w:jc w:val="center"/>` +
        `<w:tblLayout w:type="fixed"/>` +
        bdr +
        `<w:tblCellMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar>` +
        `</w:tblPr>${grid}${rows}</w:tbl>`;
    };

    const th = (txt, sz = 26) => run(txt, { b: true, color: 'FFFFFF', sz }); // 13pt bold

    // ── 1. Defaulters Roster in 2-Up (4-Column) Grid ──
    const defaulters = (m.studentList || []).filter(st => st.isDefaulter || st.pct < m.eligibilityThreshold);
    defaulters.sort((a, b) => (parseInt(a.rollNo, 10) || 0) - (parseInt(b.rollNo, 10) || 0));

    const defCols = [1100, 3773, 1100, 3773]; // sum = 9746 twips
    const defHeaderRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>` +
      cell(th('Roll No.', 26), { shade: HEADER_FILL, align: 'center' }) +
      cell(th('Name of Student', 26), { shade: HEADER_FILL, align: 'left' }) +
      cell(th('Roll No.', 26), { shade: HEADER_FILL, align: 'center' }) +
      cell(th('Name of Student', 26), { shade: HEADER_FILL, align: 'left' }) +
      `</w:tr>`;

    let defBodyRows = '';
    if (defaulters.length === 0) {
      defBodyRows = `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
        cell(run(`No defaulters found for this period. (All students have attendance ≥ ${m.eligibilityThreshold}%)`, { b: true, sz: 24 }), { align: 'center' }) +
        cell(run('', { sz: 24 }), {}) + cell(run('', { sz: 24 }), {}) + cell(run('', { sz: 24 }), {}) +
        `</w:tr>`;
    } else {
      for (let i = 0; i < defaulters.length; i += 2) {
        const d1 = defaulters[i];
        const d2 = defaulters[i + 1] || null;
        const shade = (Math.floor(i / 2) % 2 === 1) ? ZEBRA_FILL : undefined;

        defBodyRows += `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
          cell(run(String(d1.rollNo || ''), { b: true, sz: 24 }), { shade, align: 'center' }) +
          cell(run(String(d1.name || ''), { sz: 24 }), { shade, align: 'left' }) +
          cell(run(d2 ? String(d2.rollNo || '') : '', { b: true, sz: 24 }), { shade, align: 'center' }) +
          cell(run(d2 ? String(d2.name || '') : '', { sz: 24 }), { shade, align: 'left' }) +
          `</w:tr>`;
      }
    }
    const defaultersTable = table(defCols, defHeaderRow + defBodyRows);

    // ── 2. Subject Teachers Acknowledgment Table ──
    const ackCols = [5246, 3100, 1400]; // sum = 9746 twips
    const ackHeaderRow = `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>` +
      cell(th('Subject', 26), { shade: HEADER_FILL, align: 'left' }) +
      cell(th('Teacher', 26), { shade: HEADER_FILL, align: 'left' }) +
      cell(th('Sign', 26), { shade: HEADER_FILL, align: 'center' }) +
      `</w:tr>`;

    const subjectSource = (m.classSubjects && m.classSubjects.length > 0) ? m.classSubjects : (m.subjectColumns || []);
    let ackBodyRows = '';

    if (subjectSource.length === 0) {
      ackBodyRows = `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
        cell(run('No active assigned subjects logged.', { sz: 24 }), { align: 'left' }) +
        cell(run('', { sz: 24 }), {}) + cell(run('', { sz: 24 }), {}) +
        `</w:tr>`;
    } else {
      subjectSource.forEach((s, idx) => {
        const info = formatCompactSubjectHeader(s);
        const subCode = s.code || info.code || '';
        const subName = s.name || s.subject || info.fullName || '';
        const isPrac = info.isPractical || (s.type && String(s.type).toLowerCase().includes('prac'));
        const typeStr = isPrac ? 'Practical' : 'Theory';
        const displaySub = subName ? `${subCode} ${subName} – ${typeStr}` : `${subCode} – ${typeStr}`;
        const teacherName = s.teacherName || s.facultyName || s.faculty || '';
        const shade = idx % 2 === 1 ? ZEBRA_FILL : undefined;

        ackBodyRows += `<w:tr><w:trPr><w:trHeight w:val="450" w:hRule="atLeast"/><w:cantSplit/></w:trPr>` +
          cell(run(displaySub, { sz: 24, b: true }), { shade, align: 'left' }) +
          cell(run(teacherName, { sz: 24 }), { shade, align: 'left' }) +
          cell(run(' ', { sz: 24 }), { shade, align: 'center' }) +
          `</w:tr>`;
      });
    }
    const ackTable = table(ackCols, ackHeaderRow + ackBodyRows);

    // ── 3. 3 Signatories Row (Class Teacher / Academic In-charge / Principal) ──
    const third = Math.floor(TEXT_W / 3);
    const signCols = [third, third, TEXT_W - (2 * third)];
    const signTable = table(signCols,
      `<w:tr><w:trPr><w:cantSplit/></w:trPr>` +
      cell(run('Class Teacher', { b: true, sz: 26 }), { align: 'left' }) +
      cell(run('Academic In-charge', { b: true, sz: 26 }), { align: 'center' }) +
      cell(run('Principal', { b: true, sz: 26 }), { align: 'right' }) +
      `</w:tr>`, { borders: false });

    // ── 4. Assemble Document ──
    const noticeNoticeText = `All the ${m.className} students are informed that below is the list of defaulter students. The students must be present in college for Theory as well as practical otherwise strict action will be taken and will not be eligible for the sessional examination.`;

    const body =
      para(run(m.mgmt, { b: true, caps: true, sz: 24 }), { align: 'center', after: 30 }) +
      para(run(m.college, { b: true, sz: 28 }), { align: 'center', after: 40 }) +
      para(run(`${m.className} Defaulter Students List`, { b: true, sz: 28 }), { align: 'center', after: 30 }) +
      para(run(`Academic Year ${m.acadYear}`, { b: true, sz: 26 }), { align: 'center', after: 180 }) +
      para(run(noticeNoticeText, { sz: 24 }), { align: 'both', after: 140, line: 260 }) +
      para(run(`Defaulters: (${m.periodLabel})`, { b: true, sz: 26 }), { align: 'left', after: 100 }) +
      defaultersTable +
      para('', { after: 260 }) +
      para(run('Subject Teachers Acknowledgment', { b: true, sz: 28 }), { align: 'left', before: 180, after: 100 }) +
      ackTable +
      para('', { after: 850 }) +
      signTable +
      `<w:sectPr>` +
        `<w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/>` +
        `<w:pgMar w:top="${MARGIN_VERT}" w:right="${MARGIN_SIDE}" w:bottom="${MARGIN_VERT}" w:left="${MARGIN_SIDE}" w:header="720" w:footer="720" w:gutter="0"/>` +
      `</w:sectPr>`;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  }

  // ─── ACCREDITATION FILE COMPILER (CARD 15 ACTION) ─────────
  const consoleMessages = [
    "📡 Refreshing lecture logs from Smart Attendance Sheet...",
    "🔍 Matching planned vs taught syllabus dates...",
    "🧮 Calculating syllabus completion metrics...",
    "📂 Loading RMDIPER document templates...",
    "📝 Generating Content Certificate & Index Checklist...",
    "✅ Bundling documentation archive package..."
  ];

  function startCompilation() {
    const overlay = document.getElementById('console-overlay');
    const progress = document.getElementById('progress-fill');
    const log = document.getElementById('console-log');

    overlay.classList.add('active');
    progress.style.width = '0%';

    let step = 0;
    const interval = setInterval(() => {
      if (step < consoleMessages.length) {
        log.innerText = consoleMessages[step];
        progress.style.width = ((step + 1) / consoleMessages.length) * 100 + '%';
        step++;
      } else {
        clearInterval(interval);
        overlay.classList.remove('active');
        Toast.show('Checklist Generated', 'Academic file compiled successfully.', 'success');
        downloadChecklistPack();
      }
    }, 850);
  }

  function downloadChecklistPack() {
    const allTopics = state.teachingPlan.all || [];
    const filteredTopics = allTopics.filter(t => {
      const lNo = String(t.lectureNo).toLowerCase();
      return !lNo.startsWith('t') && !lNo.includes('tut');
    });
    const isPrac = isPracticalSubject(state.activeSubject);
    const fallbackTotal = isPrac ? 15 : 45;
    const reqTopics = (state.metadata && typeof state.metadata.totalLectures === 'number' && state.metadata.totalLectures > 5)
      ? state.metadata.totalLectures
      : (filteredTopics.length > 5 ? filteredTopics.length : fallbackTotal);
    const originalTopics = filteredTopics.slice(0, reqTopics);
    const conducted = originalTopics.filter(t => t.executedDate).length;
    const progressPct = reqTopics > 0 ? Math.round((conducted / reqTopics) * 100) : 0;

    const content = `================================================================================
R. M. D. IPER — COURSE FILE CHECKLIST & COMPILATION SUMMARY
Subject: ${state.activeSubject ? state.activeSubject.name : ''} [${state.activeCode}]
Faculty: ${state.facultyName}
Class/Semester: ${state.activeSubject ? state.activeSubject.program + ' ' + state.activeSubject.year : ''}
Generated: ${formatDisplayDate(new Date())}
================================================================================

[X] 1. Syllabus Copy (Declaration Index)
[X] 2. Individual Faculty Workload Time Table
[X] 3. Theory Syllabus Declaration Report
[X] 4. Executed Teaching Plan Logs (Refreshed from Smart Attendance: ${conducted}/${reqTopics} topics, ${progressPct}%)
[X] 5. Academic Calendar & Timetable Records
[X] 6. List of Reference Books & Web Resources

================================================================================`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Academic_Course_File_Pack_${state.activeCode}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─── HELPERS ───────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Parse a raw date value into a Date object (or null). Timezone-safe for
  // the string formats the sheets produce; used for schedule/overdue logic.
  function parseToDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;

    const trimmed = String(dateStr).trim();
    const mos = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

    // DD/MM/YY, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YY (Indian/British day-first: DD/MM/YYYY)
    let m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo - 1, d);
    }

    // DD-MMM-YY / DD-MMM-YYYY (e.g. 13-Jul-26)
    m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (m) {
      const mi = mos.indexOf(m[2].toLowerCase());
      let y = +m[3]; if (y < 100) y += 2000;
      if (mi >= 0) return new Date(y, mi, +m[1]);
    }

    // DD-MMM (e.g. 24-Jul, 5-Aug)
    m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})$/);
    if (m) {
      const mi = mos.indexOf(m[2].toLowerCase());
      const y = new Date().getFullYear();
      if (mi >= 0) return new Date(y, mi, +m[1]);
    }

    const fallback = new Date(trimmed);
    return isNaN(fallback.getTime()) ? null : fallback;
  }

  // Format any recognised date value as dd/mm/yyyy. Unparseable input is
  // returned unchanged so hand-typed notes survive. Handles comma-separated dates.
  function formatDisplayDate(dateStr) {
    if (!dateStr) return '';
    
    const parts = String(dateStr).split(',');
    if (parts.length > 1) {
      return parts.map(p => {
        const d = parseToDate(p);
        if (!d) return String(p).trim();
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      }).join(', ');
    }
    
    const d = parseToDate(dateStr);
    if (!d) return String(dateStr).trim();
    const day = String(d.getDate()).padStart(2, '0');
    const mon = String(d.getMonth() + 1).padStart(2, '0');
    const yr = d.getFullYear();
    return `${day}/${mon}/${yr}`;
  }

  // ─── ACADEMIC REPORTS MODULE (CLASS, STUDENT & SUBJECT REPORTS) ───
  function openInchargeReportsPage() {
    switchView('incharge-reports');
  }

  function onReportsPeriodChange(val) {
    const rangeDiv = document.getElementById('reports-custom-date-range');
    if (rangeDiv) {
      rangeDiv.style.display = (val === 'custom') ? 'flex' : 'none';
    }
    renderReportsPage();
  }

  let activeReportType = 'class';

  async function renderReportsPage() {
    try {
      await fetchLiveAttendanceStats().catch(() => ({}));
    } catch (e) {}
    if (!state.inchargeDashboard || !state.inchargeDashboard.success) {
      await loadInchargeDashboard().catch(() => ({}));
    }
    generateReportType(activeReportType);
  }

  let activeClassMindmap = null;

  function toggleClassMindmap(semKey) {
    activeClassMindmap = (activeClassMindmap === semKey) ? null : semKey;
    generateReportType('class');
  }

  function generateReportType(type) {
    activeReportType = type || 'class';

    // Highlight active card
    ['class', 'student', 'subject'].forEach(t => {
      const el = document.getElementById(`card-report-${t}`);
      if (el) {
        if (t === activeReportType) {
          el.style.border = '2px solid #6366f1';
          el.style.boxShadow = '0 10px 28px rgba(99, 102, 241, 0.25)';
          el.style.transform = 'translateY(-2px)';
        } else {
          el.style.border = '1px solid rgba(255, 255, 255, 0.8)';
          el.style.boxShadow = 'none';
          el.style.transform = 'none';
        }
      }
    });

    const outputEl = document.getElementById('reports-output-area');
    if (!outputEl) return;

    const data = state.inchargeDashboard || {};
    const faculties = (data.faculties || []).filter(f => f.faculty && f.faculty.toLowerCase() !== 'unassigned');
    const period = document.getElementById('reports-period-filter') ? document.getElementById('reports-period-filter').value : 'all';

    let periodLabel = 'All Time (Entire Academic Year)';
    if (period === 'custom') {
      const s = document.getElementById('reports-start-date') ? document.getElementById('reports-start-date').value : '';
      const e = document.getElementById('reports-end-date') ? document.getElementById('reports-end-date').value : '';
      periodLabel = (s && e) ? `Custom (${s} to ${e})` : 'Custom Range';
    }

    if (type === 'class') {
      function extractLiveClassName(item) {
        if (!item) return '';
        const name = item.year || item.className || item.class || item.courseYear || item.programYear || item.courseClass || item.course || item.branch || item.department || '';
        return String(name).trim();
      }

      function resolveSubjectClass(s) {
        const liveName = extractLiveClassName(s);
        if (liveName && !/^semester\s*\d+$/i.test(liveName) && !/^\d+$/i.test(liveName)) {
          return liveName;
        }

        if (s.semester && String(s.semester).trim()) {
          return `Semester ${String(s.semester).trim()}`;
        }
        return 'General Academic Class';
      }

      const classMap = {};

      faculties.forEach(f => {
        const facultyName = String(f.faculty || '').trim();
        if (!facultyName || facultyName.toLowerCase() === 'unassigned') return;

        (f.subjects || []).forEach(s => {
          if (!s || (!s.code && !s.name)) return;

          const className = resolveSubjectClass(s);
          const rawSem = s.semester ? String(s.semester).trim() : '1';
          const semKey = /^sem/i.test(rawSem) ? rawSem : `Semester ${rawSem}`;

          if (!classMap[className]) {
            classMap[className] = {
              className: className,
              totalLectures: 0,
              totalConducted: 0,
              subjectsCount: 0,
              totalAttPctSum: 0,
              semesters: {},
              codeSet: {}
            };
          }

          const subCode = s.code || s.name;
          const subKey = `${subCode}_${facultyName}`;
          if (classMap[className].codeSet[subKey]) return;
          classMap[className].codeSet[subKey] = true;

          if (!classMap[className].semesters[semKey]) {
            classMap[className].semesters[semKey] = {
              semName: semKey,
              semNum: parseInt(rawSem, 10) || 1,
              subjectsList: []
            };
          }

          let liveSubAtt = (s.avgAttendance !== undefined && s.avgAttendance !== null && Number(s.avgAttendance) > 0)
            ? Number(s.avgAttendance)
            : getLiveSubjectAttendancePct(s.code || s.name);
          if (liveSubAtt === null && (s.attendancePercent || s.attendancePct || s.avgAtt)) {
            const fallback = Number(s.attendancePercent || s.attendancePct || s.avgAtt);
            if (!isNaN(fallback) && fallback > 0) liveSubAtt = fallback;
          }

          const isPrac = isPracticalSubject(s);
          const fallback = isPrac ? 15 : 45;
          const displayTotal = (s.totalLectures && s.totalLectures > 5) ? Math.max(s.totalLectures, s.totalConducted || 0) : Math.max(s.totalConducted || 0, fallback);
          s.totalLectures = displayTotal;
          s.percent = displayTotal > 0 ? Math.min(100, Math.round(((s.totalConducted || 0) / displayTotal) * 100)) : 0;

          classMap[className].subjectsCount++;
          classMap[className].totalLectures += displayTotal;
          classMap[className].totalConducted += (s.totalConducted || 0);
          if (liveSubAtt !== null && !isNaN(liveSubAtt) && liveSubAtt > 0) {
            classMap[className].totalAttPctSum += liveSubAtt;
            classMap[className].validAttCount = (classMap[className].validAttCount || 0) + 1;
          }

          classMap[className].semesters[semKey].subjectsList.push({
            ...s,
            facultyName: facultyName,
            attendancePct: liveSubAtt
          });
        });
      });

      const classKeys = Object.keys(classMap).sort((a, b) => {
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
      });

      const totalSubs = classKeys.reduce((a, k) => a + classMap[k].subjectsCount, 0);

      const classRainbowPalettes = [
        { bg: 'linear-gradient(135deg, rgba(2, 132, 199, 0.18) 0%, rgba(186, 230, 253, 0.28) 100%)', bottomBorder: 'rgba(2, 132, 199, 0.45)', shadow: '0 8px 24px rgba(2, 132, 199, 0.16)', iconBg: 'rgba(2, 132, 199, 0.15)', iconColor: '#0284c7' },
        { bg: 'linear-gradient(135deg, rgba(225, 29, 72, 0.18) 0%, rgba(254, 205, 211, 0.28) 100%)', bottomBorder: 'rgba(225, 29, 72, 0.45)', shadow: '0 8px 24px rgba(225, 29, 72, 0.16)', iconBg: 'rgba(225, 29, 72, 0.15)', iconColor: '#e11d48' },
        { bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(167, 243, 208, 0.28) 100%)', bottomBorder: 'rgba(16, 185, 129, 0.45)', shadow: '0 8px 24px rgba(16, 185, 129, 0.16)', iconBg: 'rgba(16, 185, 129, 0.15)', iconColor: '#059669' },
        { bg: 'linear-gradient(135deg, rgba(217, 119, 6, 0.18) 0%, rgba(254, 240, 138, 0.28) 100%)', bottomBorder: 'rgba(217, 119, 6, 0.45)', shadow: '0 8px 24px rgba(217, 119, 6, 0.16)', iconBg: 'rgba(217, 119, 6, 0.15)', iconColor: '#d97706' },
        { bg: 'linear-gradient(135deg, rgba(124, 58, 237, 0.18) 0%, rgba(221, 214, 254, 0.28) 100%)', bottomBorder: 'rgba(124, 58, 237, 0.45)', shadow: '0 8px 24px rgba(124, 58, 237, 0.16)', iconBg: 'rgba(124, 58, 237, 0.15)', iconColor: '#7c3aed' },
        { bg: 'linear-gradient(135deg, rgba(234, 88, 12, 0.18) 0%, rgba(254, 215, 170, 0.28) 100%)', bottomBorder: 'rgba(234, 88, 12, 0.45)', shadow: '0 8px 24px rgba(234, 88, 12, 0.16)', iconBg: 'rgba(234, 88, 12, 0.15)', iconColor: '#ea580c' }
      ];

      let classNodesHtml = '';
      classKeys.forEach((clsName, clsIdx) => {
        const item = classMap[clsName];
        const avgAtt = (item.validAttCount > 0) ? Math.round(item.totalAttPctSum / item.validAttCount) : null;
        const avgAttText = (avgAtt !== null) ? `${avgAtt}%` : '--%';
        const isExpanded = activeClassMindmap === clsName;
        const pal = classRainbowPalettes[clsIdx % classRainbowPalettes.length];

        let semesterBlocksHtml = '';
        const sortedSemKeys = Object.keys(item.semesters).sort((a, b) => item.semesters[a].semNum - item.semesters[b].semNum);

        sortedSemKeys.forEach(semKey => {
          const semObj = item.semesters[semKey];
          if (!semObj.subjectsList || semObj.subjectsList.length === 0) return;

          let subjectItemsHtml = '';
          semObj.subjectsList.forEach(s => {
            const sp = s.percent || 0;
            const barColor = 'var(--success, #34c759)';
            const attVal = (s.attendancePct !== undefined && s.attendancePct !== null)
              ? s.attendancePct
              : ((s.avgAttendance !== undefined && s.avgAttendance !== null && Number(s.avgAttendance) > 0)
                ? Number(s.avgAttendance)
                : getLiveSubjectAttendancePct(s.code || s.name));
            const attText = (attVal !== null && attVal !== undefined && !isNaN(attVal)) ? `${attVal}%` : '--%';
            const attBadgeBg = (attVal !== null && attVal >= 80) ? 'rgba(52, 199, 89, 0.14)' : (attVal !== null && attVal >= 70) ? 'rgba(0, 113, 227, 0.14)' : 'rgba(255, 59, 48, 0.14)';
            const attBadgeBorder = (attVal !== null && attVal >= 80) ? 'rgba(52, 199, 89, 0.3)' : (attVal !== null && attVal >= 70) ? 'rgba(0, 113, 227, 0.3)' : 'rgba(255, 59, 48, 0.3)';
            const attBadgeColor = (attVal !== null && attVal >= 80) ? 'var(--success, #34c759)' : (attVal !== null && attVal >= 70) ? 'var(--accent-blue, #0071e3)' : 'var(--danger, #ff3b30)';

            const subCode = String(s.code || '').trim().toUpperCase();
            const subName = String(s.name || '').trim().toLowerCase();
            const subType = String(s.type || s.category || s.subjectType || '').trim().toLowerCase();
            const isPractical = subCode.endsWith('P') || subCode.endsWith('PR') || subCode.includes('PRACTICAL') || subCode.includes('LAB') || subName.includes('practical') || subName.includes('lab') || subType === 'practical' || subType === 'lab';
            const unitLabel = isPractical ? 'practicals' : 'lectures';

            subjectItemsHtml += `
              <div style="
                display: flex; align-items: center; justify-content: space-between; gap: 16px;
                padding: 12px 16px; margin-bottom: 6px;
                background: var(--colorless-glass-base);
                backdrop-filter: blur(var(--water-blur)) saturate(var(--water-saturate));
                border-top: var(--crystal-rim-top); border-left: var(--crystal-rim-top);
                border-bottom: var(--crystal-rim-bottom); border-right: var(--crystal-rim-bottom);
                border-radius: var(--radius-sm); transition: background 0.2s ease;
              " onmouseover="this.style.background='var(--colorless-glass-hover)'" onmouseout="this.style.background='var(--colorless-glass-base)'">
                
                <div style="display: flex; align-items: center; gap: 12px; flex: 1.5; min-width: 0;">
                  <span style="font-size: 11px; font-weight: 800; color: var(--accent-blue); background: var(--colorless-glass-hover); padding: 3px 10px; border-radius: var(--radius-pill); flex-shrink: 0;">
                    ${escHtml(s.code || 'SUB')}
                  </span>
                  <span style="font-size: 14px; font-weight: 800; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                    ${escHtml(s.name)}
                  </span>
                </div>

                <div style="display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-secondary); font-weight: 700; flex: 1; min-width: 0;">
                  <i class="ph ph-user-circle" style="font-size: 15px; color: var(--accent-blue); flex-shrink: 0;"></i>
                  <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main);">${escHtml(s.facultyName)}</span>
                </div>

                <div style="display: flex; align-items: center; gap: 16px; flex: 1.8; flex-shrink: 0; justify-content: flex-end;">
                  <div style="width: 145px;">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 4px;">
                      <span style="color: var(--text-muted);">${s.totalConducted || 0}/${s.totalLectures || 0} ${unitLabel} <span style="color: var(--success, #34c759); font-weight: 900;">(${sp}%)</span></span>
                    </div>
                    <div style="position: relative; height: 5px; background: var(--colorless-glass-hover); border-radius: var(--radius-pill); overflow: hidden;">
                      <div style="height: 100%; width: ${sp}%; background: ${barColor}; border-radius: var(--radius-pill); transition: width 0.6s ease;"></div>
                    </div>
                  </div>
                  <span style="font-size: 11px; font-weight: 800; color: ${attBadgeColor}; background: ${attBadgeBg}; border: 1px solid ${attBadgeBorder}; padding: 4px 10px; border-radius: var(--radius-pill); flex-shrink: 0; white-space: nowrap;">
                    ${attText} Avg Student Attendance
                  </span>
                  <button type="button" onclick="App.selectSubjectForDrilldown('${escHtml(s.code || s.name)}')" style="
                    display: inline-flex; align-items: center; gap: 4px; padding: 6px 14px;
                    font-size: 11px; font-weight: 800; color: var(--accent-blue, #0071e3);
                    background: var(--colorless-glass-hover); border: 1px solid rgba(0, 113, 227, 0.25);
                    border-radius: var(--radius-pill); cursor: pointer; transition: all 0.2s ease; flex-shrink: 0;
                  " onmouseover="this.style.background='var(--accent-blue)';this.style.color='#fff';" onmouseout="this.style.background='var(--colorless-glass-hover)';this.style.color='var(--accent-blue)';">
                    View Plan <i class="ph ph-caret-right" style="font-size: 12px;"></i>
                  </button>
                </div>

              </div>
            `;
          });

          semesterBlocksHtml += `
            <div style="margin-bottom: 16px;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px dashed var(--colorless-glass-hover);">
                <i class="ph ph-bookmark-simple" style="font-size: 15px; color: var(--accent-blue);"></i>
                <span style="font-size: 13px; font-weight: 800; color: var(--text-main); text-transform: uppercase; letter-spacing: 0.5px;">${escHtml(semKey)}</span>
                <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); background: var(--colorless-glass-hover); padding: 2px 8px; border-radius: var(--radius-pill); margin-left: auto;">
                  ${semObj.subjectsList.length} assigned subjects
                </span>
              </div>
              <div style="display: flex; flex-direction: column;">
                ${subjectItemsHtml}
              </div>
            </div>
          `;
        });

        classNodesHtml += `
          <div style="
            background: ${pal.bg} !important;
            backdrop-filter: blur(20px) saturate(180%);
            border-top: 1.8px solid #ffffff !important;
            border-left: 1.8px solid #ffffff !important;
            border-bottom: 1.8px solid ${pal.bottomBorder} !important;
            border-right: 1.8px solid ${pal.bottomBorder} !important;
            border-radius: 18px;
            box-shadow: inset 0 1.5px 2px #ffffff, ${pal.shadow} !important;
            overflow: hidden; margin-bottom: 14px; transition: all 0.3s ease;
          ">
            <div onclick="App.toggleClassMindmap('${escHtml(clsName)}')" style="
              padding: 18px 20px; cursor: pointer; display: flex; align-items: center; gap: 14px;
              transition: background 0.2s ease;
            " onmouseover="this.style.background='rgba(255, 255, 255, 0.25)'" onmouseout="this.style.background='transparent'">
              <div style="width: 44px; height: 44px; border-radius: 14px; background: ${pal.iconBg}; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: inset 0 1px 1px #ffffff;">
                <i class="ph ph-graduation-cap" style="font-size: 24px; color: ${pal.iconColor};"></i>
              </div>
              <div style="flex: 1; min-width: 0;">
                <div style="font-size: 17px; font-weight: 900; color: #0f172a; letter-spacing: -0.2px;">${escHtml(clsName)}</div>
                <div style="font-size: 12.5px; font-weight: 700; color: #475569; margin-top: 3px;">
                  ${sortedSemKeys.length} Active Semesters · ${item.subjectsCount} assigned subjects · <span style="color: ${pal.iconColor}; font-weight: 900;">${avgAttText} avg student attendance</span>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
                <i class="ph ph-caret-down" style="font-size: 20px; color: ${pal.iconColor}; font-weight: 800; transition: transform 0.35s cubic-bezier(0.4,0,0.2,1); transform: rotate(${isExpanded ? '180deg' : '0deg'});"></i>
              </div>
            </div>
            <div style="
              max-height: ${isExpanded ? '3000px' : '0'}; opacity: ${isExpanded ? '1' : '0'};
              overflow: hidden; transition: max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.35s ease, padding 0.35s ease;
              padding: ${isExpanded ? '16px 16px 8px 16px' : '0 16px'};
            ">
              ${sortedSemKeys.length > 0 ? semesterBlocksHtml : '<div style="padding: 12px; color: var(--text-muted); font-size: 12px;">No active assigned subjects logged for this class tab.</div>'}
            </div>
          </div>
        `;
      });

      outputEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid var(--colorless-glass-base); padding-bottom: 14px;">
          <div>
            <h3 style="margin: 0 0 6px; font-size: 18px; font-weight: 900; color: var(--text-main);">🏫 Class-Wise Academic Structure & Attendance</h3>
            <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">
              ${escHtml(periodLabel)} · ${classKeys.length} Active Classes · ${totalSubs} assigned subjects
            </span>
          </div>
          <button class="btn btn-primary" onclick="App.generateReportType('class')" style="
            padding: 8px 18px; font-size: 12px; font-weight: 800; border-radius: var(--radius-pill);
            display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
            box-shadow: 0 4px 12px rgba(0, 113, 227, 0.25);
          ">
            Generate Class-Wise Report <i class="ph ph-caret-right" style="font-size: 13px;"></i>
          </button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${classNodesHtml || '<div style="padding: 20px; color: var(--text-muted);">No assigned class records found from college server.</div>'}
        </div>
      `;
    } else if (type === 'student') {
      function extractLiveClassName(item) {
        if (!item) return '';
        const name = item.year || item.className || item.class || item.courseYear || item.programYear || item.courseClass || item.course || item.branch || item.department || '';
        return String(name).trim();
      }

      function resolveSubjectClass(s) {
        const liveName = extractLiveClassName(s);
        if (liveName && !/^semester\s*\d+$/i.test(liveName) && !/^\d+$/i.test(liveName)) {
          return liveName;
        }
        if (s.semester && String(s.semester).trim()) {
          return `Semester ${String(s.semester).trim()}`;
        }
        return 'General Academic Class';
      }

      const classNamesSet = {};
      faculties.forEach(f => {
        (f.subjects || []).forEach(s => {
          if (!s) return;
          const cName = resolveSubjectClass(s);
          if (cName) classNamesSet[cName] = true;
        });
      });

      const activeClassNames = Object.keys(classNamesSet);
      if (activeClassNames.length === 0) {
        activeClassNames.push('FY B. Pharm', 'SY B. Pharm', 'TY B. Pharm', 'Final Year B. Pharm');
      }

      if (!state.activeStudentYear || activeClassNames.indexOf(state.activeStudentYear) === -1) {
        state.activeStudentYear = activeClassNames[0];
      }

      let yearCardsHtml = '';
      activeClassNames.forEach(clsName => {
        const isSelected = clsName === state.activeStudentYear;
        yearCardsHtml += `
          <button type="button" onclick="App.selectStudentYearCard('${escHtml(clsName)}')" style="
            padding: 8px 16px; font-size: 12px; font-weight: 800; border-radius: var(--radius-pill);
            cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 6px;
            border: ${isSelected ? '2px solid #8b5cf6' : '1px solid var(--colorless-glass-hover)'};
            background: ${isSelected ? 'rgba(139, 92, 246, 0.15)' : 'var(--colorless-glass-base)'};
            color: ${isSelected ? '#8b5cf6' : 'var(--text-main)'};
            box-shadow: ${isSelected ? '0 4px 12px rgba(139, 92, 246, 0.2)' : 'none'};
          ">
            <i class="ph ph-student" style="font-size: 15px; color: ${isSelected ? '#8b5cf6' : 'var(--accent-blue)'};"></i>
            ${escHtml(clsName)}
          </button>
        `;
      });

      outputEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; border-bottom: 1px solid var(--colorless-glass-base); padding-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 18px; font-weight: 900; color: var(--text-main);">👨‍🎓 Student Attendance & Eligibility Report</h3>
            <span style="font-size: 12px; font-weight: 700; color: var(--text-secondary);">${escHtml(periodLabel)} · Class: <strong>${escHtml(state.activeStudentYear)}</strong></span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <button class="btn btn-outline" onclick="App.downloadStudentAttendanceDoc()" title="Download full attendance matrix Word (.docx) report with all subjects & signatures" style="
              padding: 8px 16px; font-size: 12px; font-weight: 800; border-radius: var(--radius-pill);
              display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
              background: rgba(255, 255, 255, 0.85); border: 1.5px solid rgba(66, 133, 244, 0.4); color: #1d4ed8;
              box-shadow: 0 2px 8px rgba(66, 133, 244, 0.12);
            ">
              <i class="ph ph-file-doc" style="font-size: 15px; color: #2563eb;"></i> Download Report (.docx)
            </button>
            <button class="btn btn-primary" onclick="App.downloadDefaultersNoticeDoc()" title="Generate and download official Defaulters Notice (.docx) with 4-column defaulters table, subject teachers acknowledgment & 3 signatures" style="
              padding: 8px 18px; font-size: 12px; font-weight: 800; border-radius: var(--radius-pill);
              display: inline-flex; align-items: center; gap: 6px; cursor: pointer;
              background: #dc2626; border: none; color: #fff; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
            ">
              <i class="ph ph-file-doc" style="font-size: 15px; color: #fff;"></i> Generate Defaulters Notice (.docx)
            </button>
          </div>
        </div>
        <div style="margin-bottom: 20px;">
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); margin-bottom: 8px; letter-spacing: 0.5px;">Select Class / Year:</div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px;">
            ${yearCardsHtml}
          </div>
        </div>
        <div id="student-report-table-container"></div>
      `;

      const targetYear = state.activeStudentYear;
      setTimeout(() => {
        loadStudentReportData(targetYear);
      }, 0);
    } else if (type === 'subject') {
      let subjectRows = '';
      faculties.forEach(f => {
        (f.subjects || []).forEach(s => {
          const isPrac = isPracticalSubject(s);
          const fallback = isPrac ? 15 : 45;
          const displayTotal = (s.totalLectures && s.totalLectures > 5) ? Math.max(s.totalLectures, s.totalConducted || 0) : Math.max(s.totalConducted || 0, fallback);
          const displayConducted = s.totalConducted || 0;
          const pct = displayTotal > 0 ? Math.min(100, Math.round((displayConducted / displayTotal) * 100)) : 0;
          const statusBadge = pct >= 80 ? '<span style="background: rgba(16,185,129,0.15); color: #10b981; padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px;">Completed / On Track</span>' :
                              pct >= 50 ? '<span style="background: rgba(2,132,199,0.15); color: #0284c7; padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px;">In Progress</span>' :
                              '<span style="background: rgba(245,158,11,0.15); color: #d97706; padding: 4px 10px; border-radius: 12px; font-weight: 800; font-size: 11px;">Needs Conduction</span>';

          subjectRows += `
            <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
              <td style="padding: 12px 14px; font-weight: 800; color: #0f172a;">${escHtml(s.name)} <br><span style="font-size: 11px; color: #64748b; font-weight: 600;">Code: ${escHtml(s.code)}</span></td>
              <td style="padding: 12px 14px; font-weight: 700; color: #334155;">${escHtml(f.faculty)}</td>
              <td style="padding: 12px 14px; font-weight: 700; color: #334155;">Sem ${escHtml(s.semester || 'N/A')}</td>
              <td style="padding: 12px 14px; font-weight: 700; color: #334155;">${displayConducted} / ${displayTotal}</td>
              <td style="padding: 12px 14px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <div style="flex: 1; height: 8px; background: rgba(0,0,0,0.08); border-radius: 4px; overflow: hidden; min-width: 70px;">
                    <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #10b981, #059669); border-radius: 4px;"></div>
                  </div>
                  <span style="font-weight: 900; color: #0f172a; font-size: 12px;">${pct}%</span>
                </div>
              </td>
              <td style="padding: 12px 14px; text-align: right;">${statusBadge}</td>
            </tr>
          `;
        });
      });

      outputEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(0,0,0,0.06); padding-bottom: 14px;">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 18px; font-weight: 900; color: #0f172a;">📚 Subject-Wise Conduction Log</h3>
            <span style="font-size: 12px; font-weight: 700; color: #10b981;">Timeperiod: ${escHtml(periodLabel)}</span>
          </div>
          <button class="btn btn-outline" onclick="App.printReport()" style="padding: 8px 16px; font-size: 12px; border-radius: 10px; display: flex; align-items: center; gap: 6px;">
            <i class="ph ph-printer"></i> Print Report
          </button>
        </div>
        <div class="smart-matrix-container">
          <div class="smart-matrix-scroll-wrapper" id="subject-report-scroll-wrapper">
            <table class="smart-matrix-table" style="width: 100%; border-collapse: separate; border-spacing: 0;">
              <thead>
                <tr style="text-align: left; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                  <th style="padding: 10px 14px;">Subject Name & Code</th>
                  <th style="padding: 10px 14px;">Assigned Faculty</th>
                  <th style="padding: 10px 14px;">Semester</th>
                  <th style="padding: 10px 14px;">Lectures Conducted</th>
                  <th style="padding: 10px 14px;">Completion %</th>
                  <th style="padding: 10px 14px; text-align: right;">Conduction Status</th>
                </tr>
              </thead>
              <tbody>
                ${subjectRows || '<tr><td colspan="6" style="padding: 20px; text-align: center; color: #64748b;">No subjects listed.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const subScrollWrapper = document.getElementById('subject-report-scroll-wrapper');
      if (subScrollWrapper) enableHorizontalWheelScroll(subScrollWrapper);
    }
  }

  function enableHorizontalWheelScroll(el) {
    if (!el || el._hasWheelScroll) return;
    el._hasWheelScroll = true;
    el.addEventListener('wheel', (e) => {
      // Intercept wheel when scrolling vertically over a horizontally scrollable element
      if (el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          const maxScrollLeft = el.scrollWidth - el.clientWidth;
          const canScrollLeft = el.scrollLeft > 0 && e.deltaY < 0;
          const canScrollRight = el.scrollLeft < maxScrollLeft - 1 && e.deltaY > 0;
          if (canScrollLeft || canScrollRight) {
            e.preventDefault();
            el.scrollLeft += e.deltaY * 0.95;
          }
        }
      }
    }, { passive: false });
  }

  function formatCompactSubjectHeader(sc) {
    const cleanCode = String(sc.code || '').trim().toUpperCase();
    let name = String(sc.name || '').trim();
    if (name.toUpperCase() === cleanCode) name = '';

    const isPractical = cleanCode.endsWith('P') || cleanCode.endsWith('PR') || /practical|lab/i.test(name) || /practical|lab/i.test(sc.type || '');

    let shortName = name;
    if (shortName) {
      if (shortName === shortName.toUpperCase() && shortName.length > 4) {
        shortName = shortName.toLowerCase().replace(/(^|\s|\/|\-|\()([a-z])/g, (m, p1, p2) => p1 + p2.toUpperCase());
        shortName = shortName.replace(/\b(i|ii|iii|iv|v|vi|vii|viii)\b/gi, m => m.toUpperCase());
        shortName = shortName.replace(/\b(bp|mph|bpharm|mpharm|pci|gpat)\b/gi, m => m.toUpperCase());
      }
      shortName = shortName
        .replace(/\bPharmaceutical\b/gi, 'Pharm.')
        .replace(/\bPharmacology\b/gi, 'Pharmacol.')
        .replace(/\bPharmacognosy\b/gi, 'Pharmacog.')
        .replace(/\bPhytochemistry\b/gi, 'Phytochem.')
        .replace(/\bJurisprudence\b/gi, 'Jurisprud.')
        .replace(/\bMedicinal\b/gi, 'Med.')
        .replace(/\bChemistry\b/gi, 'Chem.')
        .replace(/\bIndustrial\b/gi, 'Indust.')
        .replace(/\bPharmacy\b/gi, 'Pharm.')
        .replace(/\bPractical\b/gi, 'Pract.')
        .replace(/\band\b/gi, '&');
    }

    return {
      code: cleanCode,
      shortName: shortName,
      fullName: name || cleanCode,
      isPractical: isPractical
    };
  }

  function selectStudentYearCard(className) {
    state.activeStudentYear = className;
    generateReportType('student');
  }

  async function loadStudentReportData(className) {
    const container = document.getElementById('student-report-table-container');
    if (!container) return;

    container.innerHTML = `
      <div style="padding: 36px; text-align: center; color: var(--text-secondary); font-size: 13px;">
        <i class="ph ph-spinner spinner" style="font-size: 26px; margin-bottom: 8px; color: #8b5cf6; display: block;"></i>
        Fetching live student roster and attendance across all subject sheets for <strong>${escHtml(className)}</strong>...
      </div>
    `;

    try {
      // 1. Identify all subject codes for this class from inchargeDashboard
      const data = state.inchargeDashboard || {};
      const eligibilityThreshold = (state.allData && state.allData.attendanceLimit) ? state.allData.attendanceLimit : 75;

      const faculties = (data.faculties || []).filter(f => f.faculty && f.faculty.toLowerCase() !== 'unassigned');

      // Get enriched subjects from API to get outputSheetId
      let enrichedSubjects = [];
      try {
        const subjectsRes = await API.getSubjects('');
        if (subjectsRes && subjectsRes.success && subjectsRes.subjects) {
          enrichedSubjects = subjectsRes.subjects;
        }
      } catch (e) {
        console.warn('Failed to fetch enriched subjects:', e);
      }

      let classSubjects = [];
      const subCodeSet = {};

      faculties.forEach(f => {
        const facName = String(f.faculty || '').trim();
        (f.subjects || []).forEach(s => {
          if (!s) return;
          const liveClass = (s.year || s.className || s.class || '').trim();
          if (liveClass.toLowerCase() === className.toLowerCase() || (!liveClass && className.includes('Semester'))) {
            if (s.code && !subCodeSet[s.code]) {
              subCodeSet[s.code] = true;
              const enriched = enrichedSubjects.find(es => es.code === s.code);
              if (enriched && enriched.outputSheetId) {
                s.outputSheetId = enriched.outputSheetId;
              }
              s.teacherName = facName;
              classSubjects.push(s);
            }
          }
        });
      });

      // Fallback: if classSubjects is empty, populate from enrichedSubjects or state.allData.subjects
      if (classSubjects.length === 0) {
        const allSubs = (enrichedSubjects.length > 0 ? enrichedSubjects : (state.allData && state.allData.subjects) || []);
        allSubs.forEach(s => {
          if (!s || !s.code) return;
          const liveClass = (s.year || s.className || s.class || s.program || '').trim();
          if (!liveClass || liveClass.toLowerCase() === className.toLowerCase() || className.toLowerCase().includes(liveClass.toLowerCase()) || liveClass.toLowerCase().includes(className.toLowerCase())) {
            if (!subCodeSet[s.code]) {
              subCodeSet[s.code] = true;
              s.teacherName = s.teacherName || s.faculty || s.facultyName || '';
              classSubjects.push(s);
            }
          }
        });
      }

      const defaultOutputSheetId = enrichedSubjects.length > 0 ? enrichedSubjects[0].outputSheetId : '';
      const fetchPromises = [
        API.getStudents(className).catch(() => ({ success: false })),
        API.getAttendance('', className, '', defaultOutputSheetId).catch(() => ({ success: false }))
      ];

      // Also fetch per-subject attendance for distinct subject codes if any
      classSubjects.forEach(sub => {
        if (sub.code) {
          fetchPromises.push(API.getAttendance(sub.code, className, '', sub.outputSheetId || defaultOutputSheetId).then(res => {
            // Inject subject code into records so we know which subject this attendance belongs to
            if (res && res.success && Array.isArray(res.records)) {
              res.records.forEach(r => { if (!r.code) r.code = sub.code; });
            }
            return res;
          }).catch(() => ({ success: false })));
        }
      });

      const results = await Promise.all(fetchPromises);
      const studentsRes = results[0];
      const allAttRes = results.slice(1);

      let studentMap = {};

      // Pre-populate studentMap with official roster from API if available
      if (studentsRes && studentsRes.success && Array.isArray(studentsRes.students)) {
        studentsRes.students.forEach(st => {
          const rNo = String(st.rollNo !== undefined && st.rollNo !== null ? st.rollNo : (st.roll || '')).trim();
          const rName = String(st.name || st.studentName || '').trim();
          const key = rNo || rName;
          if (key) {
            studentMap[key] = {
              rollNo: rNo || 'N/A',
              name: rName || key,
              batch: st.batch || st.batchGroup || 'General',
              presentCount: 0,
              totalCount: 0,
              subjectMap: {}
            };
          }
        });
      }

      // 3. Process all attendance records across all subject sheets
      allAttRes.forEach(attRes => {
        if (attRes && attRes.success && Array.isArray(attRes.records)) {
          attRes.records.forEach(r => {
            const rNo = String(r.rollNo !== undefined && r.rollNo !== null ? r.rollNo : '').trim();
            const rNoNum = parseInt(rNo, 10);
            const rName = String(r.name || '').trim().toLowerCase();

            // Find matching key in studentMap
            let matchedKey = null;
            if (rNo && studentMap[rNo]) {
              matchedKey = rNo;
            } else if (!isNaN(rNoNum) && studentMap[String(rNoNum)]) {
              matchedKey = String(rNoNum);
            } else {
              for (const k in studentMap) {
                const s = studentMap[k];
                if ((rNo && String(s.rollNo).trim() === rNo) ||
                    (!isNaN(rNoNum) && parseInt(s.rollNo, 10) === rNoNum) ||
                    (rName && s.name.toLowerCase().trim() === rName)) {
                  matchedKey = k;
                  break;
                }
              }
            }

            if (!matchedKey) {
              matchedKey = rNo || r.name || ('STU_' + Object.keys(studentMap).length);
              studentMap[matchedKey] = {
                rollNo: rNo || 'N/A',
                name: r.name || matchedKey,
                batch: r.batch || 'General',
                presentCount: 0,
                totalCount: 0,
                subjectMap: {}
              };
            }

            if (r.name && (!studentMap[matchedKey].name || studentMap[matchedKey].name === matchedKey)) {
              studentMap[matchedKey].name = r.name;
            }
            if (r.batch && r.batch !== 'General') {
              studentMap[matchedKey].batch = r.batch;
            }

            const sCode = String(r.code || 'SUB').trim();
            const cleanSCode = sCode.toUpperCase().replace(/[^A-Z0-9]/g, '');

            if (!studentMap[matchedKey].subjectMap[sCode]) {
              studentMap[matchedKey].subjectMap[sCode] = { present: 0, total: 0 };
            }
            if (cleanSCode && !studentMap[matchedKey].subjectMap[cleanSCode]) {
              studentMap[matchedKey].subjectMap[cleanSCode] = studentMap[matchedKey].subjectMap[sCode];
            }

            studentMap[matchedKey].totalCount++;
            studentMap[matchedKey].subjectMap[sCode].total++;
            const stUpper = String(r.status || '').toUpperCase().trim();
            if (stUpper === 'P' || stUpper === 'PRESENT' || stUpper === '1') {
              studentMap[matchedKey].presentCount++;
              studentMap[matchedKey].subjectMap[sCode].present++;
            }
          });
        }
      });

      let studentList = [];

      if (Object.keys(studentMap).length > 0) {
        studentList = Object.values(studentMap).map(st => {
          const avgPct = st.totalCount > 0 ? Math.round((st.presentCount / st.totalCount) * 100) : 0;
          return {
            rollNo: st.rollNo,
            name: st.name,
            batch: st.batch,
            pct: avgPct,
            isDefaulter: avgPct < eligibilityThreshold,
            subjectMap: st.subjectMap || {}
          };
        });
      } else if (studentsRes && studentsRes.success && Array.isArray(studentsRes.students) && studentsRes.students.length > 0) {
        studentList = studentsRes.students.map(st => {
          const avgPct = typeof st.attendancePct === 'number' ? st.attendancePct : (st.pct || 80);
          return {
            rollNo: st.rollNo || st.roll || 'N/A',
            name: st.name || st.studentName || 'Student',
            batch: st.batch || st.batchGroup || 'General',
            pct: avgPct,
            isDefaulter: avgPct < eligibilityThreshold,
            subjectMap: {}
          };
        });
      }

      if (!studentList || studentList.length === 0) {
        container.innerHTML = `
          <div style="padding: 30px; text-align: center; color: var(--text-secondary); background: var(--colorless-glass-base); border-radius: var(--radius-md);">
            <i class="ph ph-warning-circle" style="font-size: 32px; color: var(--accent-blue); margin-bottom: 8px;"></i>
            <h4 style="margin: 0 0 6px; font-size: 15px; font-weight: 800; color: var(--text-main);">Live Student Roster Sync</h4>
            <p style="margin: 0; font-size: 12px; max-width: 520px; margin: 0 auto; color: var(--text-muted);">
              No individual student attendance records returned for <strong>${escHtml(className)}</strong> from the college spreadsheet backend.
              Ensure class student roll numbers & names are entered on the college sheet output tab.
            </p>
          </div>
        `;
        return;
      }

      // Sort students by Roll No
      studentList.sort((a, b) => {
        const rA = parseInt(a.rollNo, 10) || 0;
        const rB = parseInt(b.rollNo, 10) || 0;
        return rA - rB;
      });

      // 4. Render Table Headers and Rows
      // Deduplicate unique subject columns based on classSubjects
      const subjectColumns = [];
      const seenCodes = new Set();
      classSubjects.forEach(s => {
        if (!s.code) return;
        const clean = String(s.code).trim().toUpperCase();
        if (!seenCodes.has(clean)) {
          seenCodes.add(clean);
          subjectColumns.push({
            code: s.code,
            name: s.subject || s.name || s.code,
            type: s.type || s.category
          });
        }
      });

      const totalSubs = subjectColumns.length;
      const isDense = totalSubs >= 6;
      const colMinWidth = totalSubs > 8 ? 64 : totalSubs >= 6 ? 74 : 88;
      const colMaxWidth = totalSubs > 8 ? 80 : totalSubs >= 6 ? 96 : 120;
      const cellPadding = totalSubs > 8 ? '6px 4px' : totalSubs >= 6 ? '7px 6px' : '9px 8px';
      const fontSizePct = totalSubs > 8 ? '11px' : totalSubs >= 6 ? '11.5px' : '12.5px';

      let subjectHeadersHtml = subjectColumns.map(sc => {
        const info = formatCompactSubjectHeader(sc);
        return `
          <th style="padding: 6px 4px; text-align: center; vertical-align: middle; min-width: ${colMinWidth}px; max-width: ${colMaxWidth}px;" title="${escHtml(info.fullName)} (${escHtml(info.code)})">
            <div class="smart-matrix-subj-pill" style="color: #000000; font-weight: 900;">
              ${escHtml(info.code)}
              ${info.isPractical ? '<span style="font-size: 8.5px; opacity: 0.9; font-weight: 900;">[P]</span>' : ''}
            </div>
            ${info.shortName ? `
              <div style="font-size: 9.5px; font-weight: 800; color: #000000; line-height: 1.15; max-height: 22px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word;" title="${escHtml(info.fullName)}">
                ${escHtml(info.shortName)}
              </div>
            ` : ''}
            <div style="font-size: 9px; font-weight: 900; color: #000000; margin-top: 1px;">% Att</div>
          </th>
        `;
      }).join('');

      let rowsHtml = '';
      let defaulterCount = 0;

      studentList.forEach(st => {
        let sumPct = 0;
        let activeSubCount = 0;
        let subjectCellsHtml = '';

        subjectColumns.forEach(sc => {
          const rawCode = sc.code;
          const cleanScCode = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          let subData = st.subjectMap[rawCode] || st.subjectMap[cleanScCode];
          if (!subData) {
            for (const k in st.subjectMap) {
              const cleanK = String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (cleanK === cleanScCode || (cleanK && cleanScCode && (cleanK.includes(cleanScCode) || cleanScCode.includes(cleanK)))) {
                subData = st.subjectMap[k];
                break;
              }
            }
          }
          let cellHtml = `<span style="color: #000000; font-weight: 700; opacity: 0.5;">-</span>`;
          if (subData && subData.total > 0) {
            const subPct = Math.round((subData.present / subData.total) * 100);
            const isSubDefaulter = subPct < eligibilityThreshold;
            cellHtml = `<span class="smart-matrix-cell-pct" style="color: #000000; font-weight: ${isSubDefaulter ? '900' : '800'}; font-size: ${fontSizePct};">${subPct}%</span>`;
            sumPct += subPct;
            activeSubCount++;
          }
          subjectCellsHtml += `<td style="padding: ${cellPadding}; text-align: center; vertical-align: middle; color: #000000;">${cellHtml}</td>`;
        });

        // Compute average attendance across subjects
        const avgPct = activeSubCount > 0 ? Math.round(sumPct / activeSubCount) : (st.pct || 0);
        st.pct = avgPct;
        st.isDefaulter = avgPct < eligibilityThreshold;
        if (st.isDefaulter) defaulterCount++;

        // Defaulters = Soft Red Hue, Others = Soft Green Hue
        const rowClass = st.isDefaulter ? 'smart-matrix-row-defaulter' : 'smart-matrix-row-eligible';
        const rowBg = st.isDefaulter ? 'rgba(254, 226, 226, 0.85)' : 'rgba(220, 252, 231, 0.85)';
        const stickyBg = st.isDefaulter ? '#fee2e2' : '#dcfce7';
        const rowBorder = st.isDefaulter ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.35)';

        const statusBadge = st.isDefaulter ?
          `<span style="background: #fecaca; color: #000000; border: 1.5px solid #dc2626; padding: 3px 9px; border-radius: 9999px; font-weight: 900; font-size: 11px; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">${st.pct}% (Defaulter)</span>` :
          `<span style="background: #bbf7d0; color: #000000; border: 1.5px solid #059669; padding: 3px 9px; border-radius: 9999px; font-weight: 900; font-size: 11px; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.06);">${st.pct}% (Eligible)</span>`;

        rowsHtml += `
          <tr class="${rowClass}" style="border-bottom: 1px solid ${rowBorder}; background: ${rowBg};">
            <td class="smart-matrix-sticky-roll" style="padding: ${cellPadding}; font-weight: 900; color: #000000; font-size: 12px; background: ${stickyBg}; border-right: 1px solid ${rowBorder};">
              ${escHtml(st.rollNo)}
            </td>
            <td class="smart-matrix-sticky-name" style="padding: ${isDense ? '6px 8px' : '8px 10px'}; font-weight: 900; color: #000000; font-size: ${isDense ? '11.5px' : '12.5px'}; background: ${stickyBg}; line-height: 1.25; border-right: 1.5px solid ${rowBorder};" title="${escHtml(st.name)}">
              ${escHtml(st.name)}
            </td>
            <td style="padding: ${cellPadding}; text-align: center;">
              <span style="background: rgba(0, 0, 0, 0.08); color: #000000; border: 1px solid rgba(0, 0, 0, 0.22); padding: 2px 7px; border-radius: 9999px; font-size: 10px; font-weight: 900; white-space: nowrap;">
                ${escHtml(st.batch || 'Gen')}
              </span>
            </td>
            ${subjectCellsHtml}
            <td style="padding: ${isDense ? '6px 8px' : '8px 10px'}; text-align: center; white-space: nowrap;">
              ${statusBadge}
            </td>
          </tr>
        `;
      });

      const period = document.getElementById('reports-period-filter') ? document.getElementById('reports-period-filter').value : 'all';
      let periodLabel = 'All Time (Entire Academic Year)';
      if (period === 'custom') {
        const s = document.getElementById('reports-start-date') ? document.getElementById('reports-start-date').value : '';
        const e = document.getElementById('reports-end-date') ? document.getElementById('reports-end-date').value : '';
        periodLabel = (s && e) ? `Custom (${s} to ${e})` : 'Custom Range';
      }

      state.activeStudentReport = {
        className: className,
        studentList: studentList,
        subjectColumns: subjectColumns,
        classSubjects: classSubjects,
        defaulterCount: defaulterCount,
        eligibilityThreshold: eligibilityThreshold,
        periodLabel: periodLabel
      };

      container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; padding: 10px 14px; background: rgba(255, 255, 255, 0.7); border: 1px solid rgba(255, 255, 255, 0.9); border-radius: var(--radius-sm); backdrop-filter: blur(12px);">
          <span style="font-size: 12px; font-weight: 800; color: #000000; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span>Total Students: <strong style="color: #000000;">${studentList.length}</strong></span>
            <span>·</span>
            <span>Subjects: <strong style="color: #000000;">${subjectColumns.length}</strong></span>
            <span class="smart-scroll-hint" style="color: #334155;"><i class="ph ph-mouse-simple"></i> Mouse wheel horizontally scrolls subjects</span>
          </span>
          <span style="font-size: 12px; font-weight: 900; color: ${defaulterCount > 0 ? '#b91c1c' : '#047857'};">
            ${defaulterCount > 0 ? `⚠️ ${defaulterCount} Defaulter(s) Below ${eligibilityThreshold}%` : `✅ All Students Eligible (≥ ${eligibilityThreshold}%)`}
          </span>
        </div>
        <div class="smart-matrix-container">
          <div class="smart-matrix-scroll-wrapper" id="student-matrix-scroll-wrapper">
            <table class="smart-matrix-table">
              <thead>
                <tr>
                  <th class="smart-matrix-sticky-roll" style="padding: 8px 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: #000000; font-weight: 900;">Roll</th>
                  <th class="smart-matrix-sticky-name" style="padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; color: #000000; font-weight: 900;">Student Name</th>
                  <th style="padding: 8px 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; width: 44px; min-width: 44px; color: #000000; font-weight: 900;">Batch</th>
                  ${subjectHeadersHtml}
                  <th style="padding: 8px 10px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; text-align: center; min-width: 100px; color: #000000; font-weight: 900;">Avg. Attendance</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      `;

      const scrollWrapper = document.getElementById('student-matrix-scroll-wrapper');
      if (scrollWrapper) {
        enableHorizontalWheelScroll(scrollWrapper);
      }
    } catch (err) {
      console.error('Error fetching live student report:', err);
      if (container) {
        container.innerHTML = `<div style="padding: 20px; color: var(--danger); font-size: 13px;">Failed to load live student attendance: ${escHtml(err.message)}</div>`;
      }
    }
  }

  function printReport() {
    window.print();
  }

  // ─── PUBLIC CONTROLLER EXPORTS ──────────────────────────
  return {
    init,
    initFromEngine,
    openSetup,
    saveSetup,
    doLogin,
    doLogout,
    lockSession,
    unlockSession,
    toggleCustomFacultyDropdown,
    selectCustomFacultyOption,
    toggleCustomSubjectDropdown,
    selectCustomSubjectOption,
    toggleCustomPeriodDropdown,
    selectCustomPeriodOption,
    changeActiveSubject,
    switchView,
    triggerManualSync,
    downloadTeachingPlanDoc,
    downloadStudentAttendanceDoc,
    downloadDefaultersNoticeDoc,
    filterTeachingPlan,
    saveTopicRemark,
    startCompilation,
    loadAcademicSchedule,
    handleFileCardClick,
    openFilePreview,
    closeFilePreview,
    downloadDriveFile,
    downloadCurrentPreviewFile,
    loadAcademicIncharges,
    buildInchargeSelector,
    toggleCustomInchargeDropdown,
    selectCustomInchargeOption,
    switchLoginMode,
    doInchargeLogin,
    showInchargePinPrompt,
    hideInchargePinPrompt,
    loadInchargeDashboard,
    onInchargeFilterChange,
    onInchargePeriodChange,
    selectSubjectForDrilldown,
    goBackToInchargeDashboard,
    openUploadDocModal,
    closeUploadDocModal,
    doUploadAcademicDocument,
    openInchargeReportsPage,
    onReportsPeriodChange,
    renderReportsPage,
    generateReportType,
    selectStudentYearCard,
    toggleClassMindmap,
    printReport
  };
})();
