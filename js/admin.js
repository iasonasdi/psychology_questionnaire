/**
 * Admin panel — Firebase Auth + Firestore.
 */
const Admin = {
  state: {
    patients: [],
    questionnaireDefs: [],
    currentPatient: null,
    authReady: false,
  },

  async init() {
    try {
      FirebaseApp.init();
    } catch (err) {
      this.showToast(err.message, true);
      this.showLogin();
      return;
    }

    this.bindEvents();
    this.initGenerateDatePicker();

    FirebaseApp.auth.onAuthStateChanged(async (user) => {
      this.state.authReady = true;
      if (!user) {
        this.showLogin();
        return;
      }

      try {
        await FirebaseApp.requireAdmin();
        await this.startDashboard();
      } catch {
        await FirebaseApp.auth.signOut();
        this.showLogin();
      }
    });
  },

  _loginElements() {
    return {
      errorEl: document.getElementById('login-error'),
      loadingEl: document.getElementById('login-loading'),
      emailInput: document.getElementById('admin-email'),
      passwordInput: document.getElementById('admin-password'),
      submitBtn: document.getElementById('login-submit'),
      googleBtn: document.getElementById('btn-google-login'),
      form: document.getElementById('login-form'),
    };
  },

  _setLoginBusy(busy) {
    const { loadingEl, emailInput, passwordInput, submitBtn, googleBtn, form } = this._loginElements();
    loadingEl.hidden = !busy;
    form.setAttribute('aria-busy', busy ? 'true' : 'false');
    emailInput.disabled = busy;
    passwordInput.disabled = busy;
    submitBtn.disabled = busy;
    googleBtn.disabled = busy;
    submitBtn.textContent = busy ? 'Έλεγχος...' : 'Είσοδος';
  },

  async _completeLogin() {
    await FirebaseApp.requireAdmin();
    await this.startDashboard();
  },

  async handleLogin() {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    const { errorEl } = this._loginElements();

    errorEl.hidden = true;
    this._setLoginBusy(true);

    try {
      await FirebaseApp.auth.signInWithEmailAndPassword(email, password);
      await this._completeLogin();
    } catch (err) {
      await FirebaseApp.auth.signOut().catch(() => {});
      errorEl.textContent = this._loginErrorMessage(err);
      errorEl.hidden = false;
    } finally {
      this._setLoginBusy(false);
    }
  },

  async handleGoogleLogin() {
    const { errorEl } = this._loginElements();

    errorEl.hidden = true;
    this._setLoginBusy(true);

    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await FirebaseApp.auth.signInWithPopup(provider);
      await this._completeLogin();
    } catch (err) {
      if (err && err.code === 'auth/popup-closed-by-user') {
        return;
      }
      await FirebaseApp.auth.signOut().catch(() => {});
      errorEl.textContent = this._loginErrorMessage(err);
      errorEl.hidden = false;
    } finally {
      this._setLoginBusy(false);
    }
  },

  _loginErrorMessage(err) {
    const code = err && err.code;
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
      return 'Λάθος email ή κωδικός πρόσβασης.';
    }
    if (code === 'auth/too-many-requests') {
      return 'Πολλές αποτυχημένες προσπάθειες. Δοκιμάστε αργότερα.';
    }
    if (code === 'auth/popup-blocked') {
      return 'Το αναδυόμενο παράθυρο αποκλείστηκε. Επιτρέψτε popups για αυτόν τον ιστότοπο.';
    }
    if (code === 'auth/account-exists-with-different-credential') {
      return 'Υπάρχει ήδη λογαριασμός με αυτό το email. Χρησιμοποιήστε email/κωδικό.';
    }
    if (err.message && err.message.includes('admin')) {
      return 'Ο λογαριασμός δεν έχει δικαιώματα admin.';
    }
    return 'Η σύνδεση απέτυχε. Δοκιμάστε ξανά.';
  },

  async handleLogout() {
    await FirebaseApp.auth.signOut();
    this.showLogin();
    this.showToast('Αποσυνδεθήκατε.');
  },

  async startDashboard() {
    await this.loadQuestionnaireDefs();
    this.showDashboard();
    await Promise.all([this.loadStats(), this.loadPatients()]);
  },

  showLogin() {
    document.getElementById('admin-login').classList.add('active');
    document.getElementById('admin-dashboard').classList.remove('active');
    document.getElementById('admin-detail').classList.remove('active');
    document.getElementById('btn-logout').hidden = true;
  },

  async loadQuestionnaireDefs() {
    const manifestRes = await fetch('data/manifest.json');
    const manifest = await manifestRes.json();
    const defs = await Promise.all(
      manifest.questionnaires
        .sort((a, b) => a.order - b.order)
        .map(async (entry) => {
          const res = await fetch(`data/${entry.file}`);
          return res.json();
        })
    );
    this.state.questionnaireDefs = defs;
  },

  bindEvents() {
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
    document.getElementById('btn-google-login').addEventListener('click', () => this.handleGoogleLogin());
    document.getElementById('btn-logout').addEventListener('click', () => this.handleLogout());
    document.getElementById('btn-generate').addEventListener('click', () => this.generateQuestionnaire());
    document.getElementById('btn-clear-filters').addEventListener('click', () => this.clearFilters());
    document.getElementById('btn-filter-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleFilterDropdown();
    });
    document.addEventListener('click', (e) => this.handleFilterOutsideClick(e));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeFilterDropdown();
    });
    document.getElementById('btn-refresh').addEventListener('click', () => this.refreshDashboard());
    document.getElementById('btn-back-list').addEventListener('click', () => this.showDashboard());
    document.getElementById('search-input').addEventListener('input', () => this.applyFilters());
    document.getElementById('filter-status').addEventListener('change', () => {
      this.applyFilters();
      this.updateFilterIndicator();
    });
    document.getElementById('filter-sort').addEventListener('change', () => {
      this.applyFilters();
      this.updateFilterIndicator();
    });
  },

  toggleFilterDropdown() {
    const dropdown = document.getElementById('filter-dropdown');
    const toggle = document.getElementById('btn-filter-toggle');
    const isOpen = !dropdown.hidden;
    dropdown.hidden = isOpen;
    toggle.setAttribute('aria-expanded', String(!isOpen));
  },

  closeFilterDropdown() {
    const dropdown = document.getElementById('filter-dropdown');
    const toggle = document.getElementById('btn-filter-toggle');
    if (dropdown.hidden) return;
    dropdown.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  },

  handleFilterOutsideClick(e) {
    const wrap = document.querySelector('.filter-dropdown-wrap');
    if (wrap && !wrap.contains(e.target)) {
      this.closeFilterDropdown();
    }
  },

  updateFilterIndicator() {
    const status = document.getElementById('filter-status').value;
    const sort = document.getElementById('filter-sort').value;
    const hasActive = status !== 'all' || sort !== 'issued-desc';
    const dot = document.getElementById('filter-active-dot');
    const toggle = document.getElementById('btn-filter-toggle');
    dot.hidden = !hasActive;
    toggle.classList.toggle('has-active-filters', hasActive);
  },

  initGenerateDatePicker() {
    const input = document.getElementById('generate-date');
    if (!input) return;

    if (typeof flatpickr === 'undefined') {
      input.type = 'date';
      if (!input.value) {
        input.value = new Date().toISOString().split('T')[0];
      }
      return;
    }

    this.generateDatePicker = flatpickr(input, {
      locale: flatpickr.l10ns.gr,
      dateFormat: 'Y-m-d',
      altInput: true,
      altFormat: 'd/m/Y',
      altInputClass: 'admin-date-input',
      defaultDate: new Date(),
      allowInput: false,
      disableMobile: true,
    });
  },

  setDefaultGenerateDate() {
    if (this.generateDatePicker) {
      this.generateDatePicker.setDate(new Date(), true);
      return;
    }
    const dateInput = document.getElementById('generate-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  },

  async refreshDashboard() {
    await Promise.all([this.loadStats(), this.loadPatients()]);
  },

  async loadStats() {
    await FirebaseApp.requireAdmin();
    const snap = await FirebaseApp.db.collection('issued').get();
    const patients = snap.docs.map((doc) => doc.data());
    document.getElementById('stat-total').textContent = patients.length;
    document.getElementById('stat-pending').textContent = patients.filter((p) => p.status === 'pending').length;
    document.getElementById('stat-submitted').textContent = patients.filter((p) => p.status === 'submitted').length;
  },

  async loadPatients() {
    const list = document.getElementById('patient-list');
    list.innerHTML = '<p class="loading-text">Φόρτωση…</p>';

    try {
      await FirebaseApp.requireAdmin();
      const snap = await FirebaseApp.db.collection('issued').get();
      this.state.patients = snap.docs.map((doc) => ({ ...doc.data(), code: doc.id }));
      this.applyFilters();
    } catch (err) {
      list.innerHTML = `<p class="error-text">${this.escape(err.message)}</p>`;
      this.showToast(err.message, true);
    }
  },

  clearFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('filter-sort').value = 'issued-desc';
    this.updateFilterIndicator();
    this.applyFilters();
    this.closeFilterDropdown();
  },

  applyFilters() {
    const q = document.getElementById('search-input').value.trim().toLowerCase();
    const status = document.getElementById('filter-status').value;
    const sort = document.getElementById('filter-sort').value;
    this.updateFilterIndicator();

    let filtered = [...this.state.patients];

    if (status !== 'all') {
      filtered = filtered.filter((p) => p.status === status);
    }

    if (q) {
      const words = q.split(/\s+/).filter(Boolean);
      filtered = filtered.filter((p) => {
        const haystack = [
          p.code,
          p.date,
          p.status,
          this.renderStatusLabel(p.status),
          p.issuedAt,
          p.submittedAt,
        ]
          .join(' ')
          .toLowerCase();
        return words.every((w) => haystack.includes(w));
      });
    }

    filtered.sort((a, b) => this._comparePatientsForSort(a, b, sort));

    this.renderPatientList(filtered);
  },

  _parseSortTimestamp(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;

    const iso = Date.parse(text);
    if (!Number.isNaN(iso)) return iso;

    const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnly) {
      return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])).getTime();
    }

    return null;
  },

  _comparePatientsForSort(a, b, sort) {
    const ascending = sort.endsWith('-asc');
    const field = sort.startsWith('submitted') ? 'submittedAt' : 'issuedAt';
    const aTime = this._parseSortTimestamp(a[field]);
    const bTime = this._parseSortTimestamp(b[field]);

    if (aTime === null && bTime === null) {
      return (a.code || '').localeCompare(b.code || '', 'el');
    }
    if (aTime === null) return 1;
    if (bTime === null) return -1;

    if (aTime !== bTime) {
      return ascending ? aTime - bTime : bTime - aTime;
    }

    return (a.code || '').localeCompare(b.code || '', 'el');
  },

  renderPatientList(patients) {
    const list = document.getElementById('patient-list');

    if (!patients.length) {
      list.innerHTML = '<p class="empty-text">Δεν βρέθηκαν αποτελέσματα.</p>';
      return;
    }

    list.innerHTML = patients
      .map(
        (p) => `
      <div class="patient-row-card">
        <button type="button" class="patient-row status-${p.status === 'submitted' ? 'submitted' : 'pending'}" data-code="${this.escape(p.code)}">
          <div class="patient-row-main">
            <span class="patient-name">${this.escape(p.code)}</span>
            <span class="patient-date">${this.formatDate(p.date)}</span>
          </div>
          <div class="patient-row-meta">
            <span>${this.renderStatusLabel(p.status)} · Εκδόθηκε: ${this.formatDateTime(p.issuedAt)}</span>
            <span>${p.submittedAt ? `Υποβλήθηκε: ${this.formatDateTime(p.submittedAt)}` : 'Δεν έχει υποβληθεί ακόμα'}</span>
            <span class="patient-arrow">→</span>
          </div>
        </button>
        <div class="patient-row-actions">
          ${this.renderCopyIconButton('btn-inline-copy', `data-link="${this.escape(this.buildPatientLink(p.code, p.date))}"`)}
          ${this.renderDownloadIconButton('btn-inline-download', { disabled: p.status !== 'submitted', attrs: `data-code="${this.escape(p.code)}"` })}
        </div>
      </div>
    `
      )
      .join('');

    list.querySelectorAll('.patient-row').forEach((row) => {
      row.addEventListener('click', () => this.openPatient(row.dataset.code));
    });
    list.querySelectorAll('.btn-inline-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.copyToClipboard(btn.dataset.link, 'Το link αντιγράφηκε.');
      });
    });
    list.querySelectorAll('.btn-inline-download').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (btn.disabled) return;
        await this.downloadPatientExcel(btn.dataset.code);
      });
    });
  },

  async fetchPatientData(code) {
    await FirebaseApp.requireAdmin();
    const issuedDoc = await FirebaseApp.db.collection('issued').doc(code).get();
    if (!issuedDoc.exists) {
      throw new Error('Το ερωτηματολόγιο δεν βρέθηκε.');
    }

    const issued = issuedDoc.data();
    const submissionDoc = await FirebaseApp.db.collection('submissions').doc(code).get();
    const submission = submissionDoc.exists ? submissionDoc.data() : null;

    return {
      code,
      patient: {
        ...issued,
        submittedAt: submission ? submission.submittedAt : issued.submittedAt || '',
      },
      questionnaires: submission ? submission.questionnaires || [] : [],
    };
  },

  async openPatient(code) {
    try {
      const data = await this.fetchPatientData(code);
      this.state.currentPatient = data;
      this.renderPatientDetail(data);
      this.showDetail();
    } catch (err) {
      this.showToast(err.message, true);
    }
  },

  async downloadPatientExcel(code) {
    try {
      if (!this.state.questionnaireDefs.length) {
        await this.loadQuestionnaireDefs();
      }

      let data =
        this.state.currentPatient && this.state.currentPatient.code === code
          ? this.state.currentPatient
          : await this.fetchPatientData(code);

      if (data.patient.status !== 'submitted') {
        throw new Error('Η λήψη Excel είναι διαθέσιμη μόνο μετά την υποβολή.');
      }

      if (!data.questionnaires || !data.questionnaires.length) {
        throw new Error('Δεν υπάρχουν υποβληθέντα δεδομένα για export.');
      }

      await ExcelExport.download(data, this.state.questionnaireDefs);
      this.showToast('Το Excel κατέβηκε.');
    } catch (err) {
      this.showToast(err.message, true);
    }
  },

  renderPatientDetail(data) {
    const { patient, questionnaires } = data;
    const submissions = questionnaires.map((q) => {
      const id = q.id || this.guessId(q.title);
      const def = this.state.questionnaireDefs.find((d) => d.id === id);
      const sub = { ...q, id };
      if (id === 'q06-hads' && !sub.scores && def) {
        sub.scores = Scoring._computeHadsFromAnswers(def, sub.answers || {});
      }
      if (def) sub._def = def;
      return sub;
    });

    const evaluated = Scoring.evaluateAll(this.state.questionnaireDefs, submissions);

    document.getElementById('patient-overview').innerHTML = `
      <h2>${this.escape(patient.code || data.code)}</h2>
      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-label">Κωδικός</span>
          <span class="overview-value">${this.escape(patient.code || '—')}</span>
        </div>
        <div class="overview-item">
          <span class="overview-label">Ημερομηνία</span>
          <span class="overview-value">${this.formatDate(patient.date)}</span>
        </div>
        <div class="overview-item">
          <span class="overview-label">Εκδόθηκε</span>
          <span class="overview-value">${this.formatDateTime(patient.issuedAt)}</span>
        </div>
        <div class="overview-item">
          <span class="overview-label">Κατάσταση</span>
          <span class="overview-value">${this.renderStatusLabel(patient.status)}</span>
        </div>
        <div class="overview-item">
          <span class="overview-label">Υποβολή ερωτηματολογίων</span>
          <span class="overview-value">${this.formatDateTime(patient.submittedAt)}</span>
        </div>
        <div class="overview-item">
          <span class="overview-label">Ερωτηματολόγια</span>
          <span class="overview-value">${submissions.length} / 6</span>
        </div>
      </div>
      <div class="link-row">
        ${this.renderCopyIconButton('', `data-copy-link="${this.escape(this.buildPatientLink(patient.code, patient.date))}"`)}
        ${this.renderDownloadIconButton('', { disabled: !(patient.status === 'submitted' && questionnaires.length), attrs: `data-download-excel="${this.escape(patient.code)}"` })}
      </div>
    `;

    document.getElementById('summary-grid').innerHTML = evaluated.length
      ? evaluated
          .map(
            (item) => `
      <div class="summary-card">
        <span class="summary-badge">${this.escape(item.shortTitle)}</span>
        <h3>${this.escape(item.title)}</h3>
        <p class="summary-label">${this.escape(item.summary.label)}</p>
        <p class="summary-detail">${this.escape(item.summary.detail)}</p>
        ${
          item.summary.metrics
            ? `<div class="metric-bars">${item.summary.metrics
                .map(
                  (m) => `
              <div class="metric">
                <div class="metric-header"><span>${m.name}</span><span>${m.value}/${m.max}</span></div>
                <div class="metric-bar"><div class="metric-fill" style="width:${Math.min(100, (m.value / m.max) * 100)}%"></div></div>
              </div>`
                )
                .join('')}</div>`
            : ''
        }
      </div>
    `
          )
          .join('')
      : '<p class="empty-text">Δεν υπάρχουν υποβολές ακόμα.</p>';

    const detailsEl = document.getElementById('questionnaire-details');
    detailsEl.innerHTML = evaluated.length
      ? evaluated
          .map((item) => {
            const def = this.state.questionnaireDefs.find((d) => d.id === item.id);
            const rows = def
              ? Scoring.formatAnswersForDisplay(def, item.answers)
              : Object.entries(item.answers).map(([key, value]) => ({
                  question: key,
                  answer: Scoring.getAnswerLabel(def, key, value),
                }));

            return `
        <details class="card q-detail-card" ${item.id === 'q01-adhd' ? 'open' : ''}>
          <summary>
            <span class="summary-badge">${this.escape(item.shortTitle)}</span>
            <span>${this.escape(item.title)}</span>
            <span class="q-count">${rows.length} απαντήσεις</span>
          </summary>
          <div class="answers-table-wrap">
            <table class="answers-table">
              <thead>
                <tr><th>#</th><th>Ερώτηση</th><th>Απάντηση</th></tr>
              </thead>
              <tbody>
                ${rows
                  .map(
                    (r, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${this.escape(r.question)}</td>
                    <td><span class="answer-pill">${this.escape(r.answer)}</span></td>
                  </tr>`
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        </details>`;
          })
          .join('')
      : '';

    const copyBtn = document.querySelector('[data-copy-link]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await this.copyToClipboard(copyBtn.dataset.copyLink, 'Το link αντιγράφηκε.');
      });
    }

    const downloadBtn = document.querySelector('[data-download-excel]');
    if (downloadBtn) {
      downloadBtn.addEventListener('click', async () => {
        if (downloadBtn.disabled) return;
        await this.downloadPatientExcel(downloadBtn.dataset.downloadExcel);
      });
    }
  },

  guessId(title) {
    const def = this.state.questionnaireDefs.find((d) => d.title === title);
    return def ? def.id : title;
  },

  showDashboard() {
    document.getElementById('admin-login').classList.remove('active');
    document.getElementById('admin-dashboard').classList.add('active');
    document.getElementById('admin-detail').classList.remove('active');
    document.getElementById('btn-logout').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async generateQuestionnaire() {
    const date = document.getElementById('generate-date').value;
    const resultEl = document.getElementById('generated-result');
    resultEl.hidden = false;
    resultEl.innerHTML = '<p class="loading-text">Δημιουργία...</p>';

    try {
      await FirebaseApp.requireAdmin();
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('Μη έγκυρη ημερομηνία.');
      }

      const code = await QuestionnaireAPI.generateUniqueCode();
      const issuedAt = new Date().toISOString();
      await FirebaseApp.db.collection('issued').doc(code).set({
        code,
        date,
        issuedAt,
        status: 'pending',
        submittedAt: '',
      });

      const link = this.buildPatientLink(code, date);
      resultEl.innerHTML = `
        <div class="generated-card">
          <p><strong>Κωδικός:</strong> ${this.escape(code)}</p>
          <p><strong>Ημερομηνία:</strong> ${this.escape(this.formatDate(date))}</p>
          <p><strong>Link:</strong> <a href="${this.escape(link)}" target="_blank" rel="noopener">${this.escape(link)}</a></p>
          ${this.renderCopyIconButton('', 'id="btn-copy-generated"')}
        </div>
      `;
      document.getElementById('btn-copy-generated').addEventListener('click', async () => {
        await this.copyToClipboard(link, 'Το link αντιγράφηκε.');
      });
      await this.refreshDashboard();
    } catch (err) {
      resultEl.innerHTML = `<p class="error-text">${this.escape(err.message)}</p>`;
      this.showToast(err.message, true);
    }
  },

  showDetail() {
    document.getElementById('admin-login').classList.remove('active');
    document.getElementById('admin-dashboard').classList.remove('active');
    document.getElementById('admin-detail').classList.add('active');
    document.getElementById('btn-logout').hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  formatDate(dateStr) {
    if (!dateStr) return '—';
    if (dateStr.includes('T')) return this.formatDate(dateStr.split('T')[0]);
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  },

  formatDateTime(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('el-GR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  },

  renderStatusLabel(status) {
    return status === 'submitted' ? 'Υποβλήθηκε' : 'Εκκρεμεί';
  },

  iconCopy() {
    return `<svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
  },

  iconDownload() {
    return `<svg class="btn-icon-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
  },

  renderCopyIconButton(className = '', attrs = '') {
    const label = 'Αντιγραφή συνδέσμου';
    const classes = ['btn', 'btn-secondary', 'btn-sm', 'btn-icon', 'has-tooltip', className].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" ${attrs} title="${label}" aria-label="${label}" data-tooltip="${label}">${this.iconCopy()}</button>`;
  },

  renderDownloadIconButton(className = '', { disabled = false, attrs = '' } = {}) {
    const label = disabled ? 'Διαθέσιμο μετά την υποβολή' : 'Κατέβασμα xls αρχείου';
    const classes = ['btn', 'btn-secondary', 'btn-sm', 'btn-icon', 'has-tooltip', className].filter(Boolean).join(' ');
    const button = `<button type="button" class="${classes}" ${attrs} title="${label}" aria-label="Κατέβασμα xls αρχείου" data-tooltip="${label}" ${disabled ? 'disabled' : ''}>${this.iconDownload()}</button>`;
    return disabled ? `<span class="has-tooltip tooltip-wrap" data-tooltip="${label}">${button}</span>` : button;
  },

  buildPatientLink(code, date) {
    const url = new URL('index.html', window.location.href);
    url.searchParams.set('code', code || '');
    url.searchParams.set('date', date || '');
    return url.toString();
  },

  async copyToClipboard(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      this.showToast(successMessage || 'Αντιγράφηκε.');
    } catch {
      this.showToast('Δεν ήταν δυνατή η αντιγραφή.', true);
    }
  },

  escape(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  },

  showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  },
};

document.addEventListener('DOMContentLoaded', () => Admin.init());
