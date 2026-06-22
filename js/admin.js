/**
 * Admin panel — view and search patient submissions.
 */
const Admin = {
  state: {
    patients: [],
    questionnaireDefs: [],
    currentPatient: null,
  },

  apiUrl(action, params = {}) {
    const url = new URL(CONFIG.GOOGLE_SCRIPT_URL);
    url.searchParams.set('action', action);
    const key = sessionStorage.getItem('admin_key') || '';
    if (key) {
      url.searchParams.set('key', key);
    }
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    return url.toString();
  },

  requiresLogin() {
    return true;
  },

  isLoggedIn() {
    return !this.requiresLogin() || Boolean(sessionStorage.getItem('admin_key'));
  },

  async fetchApi(action, params = {}) {
    const res = await fetch(this.apiUrl(action, params));
    const data = await res.json();
    if (data.error && (data.error.includes('Unauthorized') || data.error.includes('admin access'))) {
      sessionStorage.removeItem('admin_key');
      this.showLogin();
      throw new Error('Απαιτείται σύνδεση admin.');
    }
    if (!data.success && data.error) {
      throw new Error(data.error);
    }
    return data;
  },

  async init() {
    if (!CONFIG.GOOGLE_SCRIPT_URL) {
      this.showToast('Δεν έχει ρυθμιστεί το GOOGLE_SCRIPT_URL. Ελέγξτε το deploy στο GitHub Actions.', true);
      this.showLogin();
      return;
    }

    this.bindEvents();
    this.setDefaultGenerateDate();

    if (this.isLoggedIn()) {
      await this.startDashboard();
    } else {
      this.showLogin();
    }
  },

  async handleLogin() {
    const form = document.getElementById('login-form');
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('login-error');
    const loadingEl = document.getElementById('login-loading');
    const passwordInput = document.getElementById('admin-password');
    const submitBtn = document.getElementById('login-submit');
    errorEl.hidden = true;
    loadingEl.hidden = false;
    form.setAttribute('aria-busy', 'true');
    passwordInput.disabled = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Έλεγχος...';

    sessionStorage.setItem('admin_key', password);

    try {
      await this.fetchApi('stats');
      await this.startDashboard();
    } catch {
      sessionStorage.removeItem('admin_key');
      errorEl.hidden = false;
    } finally {
      loadingEl.hidden = true;
      form.removeAttribute('aria-busy');
      passwordInput.disabled = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Είσοδος';
    }
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
    document.getElementById('btn-generate').addEventListener('click', () => this.generateQuestionnaire());
    document.getElementById('btn-search').addEventListener('click', () => this.search());
    document.getElementById('btn-clear').addEventListener('click', () => this.loadPatients());
    document.getElementById('btn-refresh').addEventListener('click', () => this.refreshDashboard());
    document.getElementById('btn-back-list').addEventListener('click', () => this.showDashboard());
    document.getElementById('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search();
    });
  },

  setDefaultGenerateDate() {
    const dateInput = document.getElementById('generate-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  },

  async refreshDashboard() {
    await Promise.all([this.loadStats(), this.loadPatients()]);
  },

  async loadStats() {
    const data = await this.fetchApi('stats');
    document.getElementById('stat-total').textContent = data.totalPatients || 0;
    document.getElementById('stat-pending').textContent = data.pending || 0;
    document.getElementById('stat-submitted').textContent = data.submitted || 0;
  },

  async loadPatients() {
    const list = document.getElementById('patient-list');
    list.innerHTML = '<p class="loading-text">Φόρτωση…</p>';
    document.getElementById('search-input').value = '';

    try {
      const data = await this.fetchApi('list');
      this.state.patients = data.patients || [];
      this.renderPatientList(this.state.patients);
    } catch (err) {
      list.innerHTML = `<p class="error-text">${err.message}</p>`;
      this.showToast(err.message, true);
    }
  },

  async search() {
    const q = document.getElementById('search-input').value.trim();
    const list = document.getElementById('patient-list');
    list.innerHTML = '<p class="loading-text">Αναζήτηση…</p>';

    try {
      const data = await this.fetchApi('search', { q });
      this.renderPatientList(data.patients || []);
    } catch (err) {
      list.innerHTML = `<p class="error-text">${err.message}</p>`;
    }
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
        <button type="button" class="patient-row" data-sheet="${this.escape(p.sheet)}">
          <div class="patient-row-main">
            <span class="patient-name">${this.escape(p.code || p.name || p.sheet)}</span>
            <span class="patient-date">${this.formatDate(p.date)}</span>
          </div>
          <div class="patient-row-meta">
            <span>${this.renderStatusLabel(p.status)} · Εκδόθηκε: ${this.formatDateTime(p.issuedAt)}</span>
            <span>${p.submittedAt ? `Υποβλήθηκε: ${this.formatDateTime(p.submittedAt)}` : 'Δεν έχει υποβληθεί ακόμα'}</span>
            <span class="patient-arrow">→</span>
          </div>
        </button>
        <div class="patient-row-actions">
          ${p.code ? `<button type="button" class="btn btn-secondary btn-sm btn-inline-copy" data-link="${this.escape(this.buildPatientLink(p.code, p.date))}">Copy Link</button>` : ''}
        </div>
      </div>
    `
      )
      .join('');

    list.querySelectorAll('.patient-row').forEach((row) => {
      row.addEventListener('click', () => this.openPatient(row.dataset.sheet));
    });
    list.querySelectorAll('.btn-inline-copy').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this.copyToClipboard(btn.dataset.link, 'Το link αντιγράφηκε.');
      });
    });
  },

  async openPatient(sheetName) {
    try {
      const data = await this.fetchApi('get', { sheet: sheetName });
      this.state.currentPatient = data;
      this.renderPatientDetail(data);
      this.showDetail();
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
      <h2>${this.escape(patient.code || data.sheet)}</h2>
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
        <button type="button" class="btn btn-secondary btn-sm" data-copy-link="${this.escape(this.buildPatientLink(patient.code, patient.date))}">Αντιγραφή Link</button>
      </div>
    `;

    document.getElementById('summary-grid').innerHTML = evaluated
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
      .join('');

    const detailsEl = document.getElementById('questionnaire-details');
    detailsEl.innerHTML = evaluated
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
      .join('');

    const copyBtn = document.querySelector('[data-copy-link]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        await this.copyToClipboard(copyBtn.dataset.copyLink, 'Το link αντιγράφηκε.');
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  async generateQuestionnaire() {
    const date = document.getElementById('generate-date').value;
    const resultEl = document.getElementById('generated-result');
    resultEl.hidden = false;
    resultEl.innerHTML = '<p class="loading-text">Δημιουργία...</p>';

    try {
      const data = await this.fetchApi('generate', { date });
      const link = this.buildPatientLink(data.code, data.date);
      resultEl.innerHTML = `
        <div class="generated-card">
          <p><strong>Κωδικός:</strong> ${this.escape(data.code)}</p>
          <p><strong>Ημερομηνία:</strong> ${this.escape(this.formatDate(data.date))}</p>
          <p><strong>Link:</strong> <a href="${this.escape(link)}" target="_blank" rel="noopener">${this.escape(link)}</a></p>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-copy-generated">Αντιγραφή Link</button>
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
    return status === 'submitted' ? 'Submitted' : 'Pending';
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
