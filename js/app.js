/**
 * Academic File PWA — Core Controller (v2.0)
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
    show(title, msg, type = 'success') {
      const stack = document.getElementById('toast-stack');
      if (!stack) return;
      
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
      }, 4000);
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
      'teaching-plan': 'Syllabus & Teaching Plan'
    };
    document.getElementById('portal-view-title').innerText = titles[viewId] || 'Portal';

    // Synchronize views with current data
    if (viewId === 'teaching-plan') populateTeachingPlan();
    else if (viewId === 'academic-schedule') loadAcademicSchedule();
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

    try {
      const data = await API.getAllData();
      if (!data.success) {
        Toast.show('Sync Failure', data.error || 'Server connection error.', 'danger');
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
    state.activeCode = '';
    state.activeSubject = null;
    localStorage.setItem('acad_faculty', name);
    
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
    state.teachingPlan = { theory: [], practical: [] };
    localStorage.removeItem('acad_faculty');
    document.getElementById('login-pin').value = '';
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
    Toast.show('Syncing Workload', `Loading active database logs for ${code}...`, 'success');

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
      Toast.show('Sync Error', e.message || 'Unable to sync database logs.', 'danger');
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
    const reqTopics = state.metadata.totalLectures || filteredTopics.length || 0;
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
    Toast.show('Sync Executing', 'Re-evaluating attendance log date entries...', 'success');
    triggerSyncAllViews().then(() => {
      populateTeachingPlan();
      Toast.show('Sync Complete', 'Dates aligned with attendance sheet.', 'success');
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
      if (metadata && typeof metadata.totalLectures === 'number' && metadata.totalLectures > 0 && metadata.totalLectures <= topicsList.length) {
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
      return topicsList.length;
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
          if (days > 1)       { fillerLabel = 'Upcoming'; fillerVal = `in ${days} days`; }
          else if (days === 1){ fillerLabel = 'Upcoming'; fillerVal = 'tomorrow'; }
          else if (days === 0){ fillerLabel = 'Today';    fillerVal = 'due today'; }
          else if (days === -1){ fillerLabel = 'Overdue'; fillerVal = '1 day late'; fillerCls = 'late'; }
          else                { fillerLabel = 'Overdue';  fillerVal = `${-days} days late`; fillerCls = 'late'; }
        }
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
              <span class="d5-ms-tag ${done ? 'done' : 'pending'}">${done ? (isPractical ? 'Conducted' : 'Taught') : 'Pending'}</span>
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
        <i class="ph-fill ${done ? 'ph-check-circle d5-ms-icon done' : 'ph-warning d5-ms-icon pending'}"></i>
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

        // Update Module 1 card badge & footer
        const filesChip = document.getElementById('card-cal-files');
        if (filesChip) filesChip.innerText = `${files.length} file${files.length === 1 ? '' : 's'}`;
        const calStatus = document.getElementById('card-cal-status');
        if (calStatus) calStatus.innerText = files.length ? 'Auto-synced' : 'No files';

        // Show blinking "NEW UPDATE" badge on dashboard card if changes found
        updateScheduleBadge(hasUpdates ? 'update' : (files.length ? 'synced' : 'empty'));

        if (files.length === 0) {
          grid.innerHTML = `
            <div class="schedule-empty">
              <i class="ph ph-cloud-arrow-up" style="font-size: 48px; color: var(--accent-blue); opacity: 0.5;"></i>
              <h4>No Files Found</h4>
              <p>Upload PDFs, images, or documents to your<br><strong>"Academic Calendars & Timetable"</strong> Google Drive folder.</p>
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
          const previewUrl = (f.webViewLink || '').replace('/view?usp=drivesdk', '/preview').replace('/view', '/preview');
          const isUpdated = changedIds.has(f.id);

          return `
            <div class="schedule-file-card" onclick="App.openFilePreview('${escHtml(previewUrl)}', '${escHtml(f.name)}', '${escHtml(f.webViewLink || '')}')" style="--i:${i}; animation-delay: ${i * 0.06}s;">
              ${isUpdated ? '<span class="file-update-pip">NEW</span>' : ''}
              <div class="schedule-file-thumb" style="${thumbUrl ? `background-image: url('${thumbUrl}');` : ''}">
                ${!thumbUrl ? `<i class="ph ${icon}" style="font-size: 40px; color: ${color};"></i>` : ''}
              </div>
              <div class="schedule-file-info">
                <span class="schedule-file-name" title="${escHtml(f.name)}">${escHtml(displayName)}</span>
                ${ext ? `<span class="schedule-file-ext" style="color: ${color};">${ext}</span>` : ''}
              </div>
            </div>
          `;
        }).join('');

        // Save current fingerprint so next load won't show badges again
        _saveSeenFingerprint(files);

      } else {
        grid.innerHTML = `
          <div class="schedule-empty">
            <i class="ph ph-warning-circle" style="font-size: 48px; color: var(--danger); opacity: 0.6;"></i>
            <h4>Sync Error</h4>
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

  function openFilePreview(previewUrl, fileName, driveUrl) {
    const modal = document.getElementById('file-preview-modal');
    const iframe = document.getElementById('file-preview-iframe');
    const title = document.getElementById('file-preview-title');
    const openBtn = document.getElementById('file-preview-open');
    if (!modal) return;
    title.innerText = fileName || 'File Preview';
    iframe.src = previewUrl;
    if (openBtn) openBtn.href = driveUrl || '#';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function closeFilePreview() {
    const modal = document.getElementById('file-preview-modal');
    const iframe = document.getElementById('file-preview-iframe');
    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = '';
    document.body.style.overflow = '';
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
      badge.innerHTML = 'Synced';
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
      if (metadata && typeof metadata.totalLectures === 'number' && metadata.totalLectures > 0 && metadata.totalLectures <= topicsList.length) {
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
      return topicsList.length;
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


  // ─── ACCREDITATION FILE COMPILER (CARD 15 ACTION) ─────────
  const consoleMessages = [
    "📡 Syncing lecture logs from Smart Attendance Sheet...",
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
    const reqTopics = (state.metadata && typeof state.metadata.totalLectures === 'number' && state.metadata.totalLectures > 0)
      ? state.metadata.totalLectures
      : filteredTopics.length;
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
[X] 4. Executed Teaching Plan Logs (Synced from Smart Attendance: ${conducted}/${reqTopics} topics, ${progressPct}%)
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

    // YYYY-MM-DD (build locally to avoid UTC shift)
    let m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

    // DD-MMM-YY / DD-MMM-YYYY (e.g. 13-Jul-26)
    m = trimmed.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
    if (m) {
      const mi = mos.indexOf(m[2].toLowerCase());
      let y = +m[3]; if (y < 100) y += 2000;
      if (mi >= 0) return new Date(y, mi, +m[1]);
    }

    // DD/MM/YY, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YY (Indian/British day-first)
    m = trimmed.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      const d = +m[1], mo = +m[2]; let y = +m[3]; if (y < 100) y += 2000;
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo - 1, d);
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
    changeActiveSubject,
    switchView,
    triggerManualSync,
    downloadTeachingPlanDoc,
    filterTeachingPlan,
    saveTopicRemark,
    startCompilation,
    loadAcademicSchedule,
    openFilePreview,
    closeFilePreview
  };
})();
