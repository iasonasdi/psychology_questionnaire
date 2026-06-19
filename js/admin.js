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
      this.showToast('Ρυθμίστε το GOOGLE_SCRIPT_URL στο config.js', true);
      return;
    }

    this.bindEvents();

    if (this.isLoggedIn()) {
      await this.startDashboard();
    } else {
      this.showLogin();
    }
  },

  async handleLogin() {
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.hidden = true;

    sessionStorage.setItem('admin_key', password);

    try {
      await this.fetchApi('stats');
      await this.startDashboard();
    } catch {
      sessionStorage.removeItem('admin_key');
      errorEl.hidden = false;
    }
  },

  async startDashboard() {
    await this.loadQuestionnaireDefs();
    this.showDashboard();
    await this.loadPatients();
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
    document.getElementById('btn-search').addEventListener('click', () => this.search());
    document.getElementById('btn-clear').addEventListener('click', () => this.loadPatients());
    document.getElementById('btn-refresh').addEventListener('click', () => this.loadPatients());
    document.getElementById('btn-back-list').addEventListener('click', () => this.showDashboard());
    document.getElementById('search-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.search();
    });
  },

  async loadPatients() {
    const list = document.getElementById('patient-list');
    list.innerHTML = '<p class="loading-text">Φόρτωση…</p>';
    document.getElementById('search-input').value = '';

    try {
      const data = await this.fetchApi('list');
      this.state.patients = data.patients || [];
      document.getElementById('stat-total').textContent = data.total || 0;
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
      <button type="button" class="patient-row" data-sheet="${this.escape(p.sheet)}">
        <div class="patient-row-main">
          <span class="patient-name">${this.escape(p.name)}</span>
          <span class="patient-date">${this.formatDate(p.date)}</span>
        </div>
        <div class="patient-row-meta">
          <span>Υποβλήθηκε: ${this.formatDateTime(p.submittedAt)}</span>
          <span class="patient-arrow">→</span>
        </div>
      </button>
    `
      )
      .join('');

    list.querySelectorAll('.patient-row').forEach((row) => {
      row.addEventListener('click', () => this.openPatient(row.dataset.sheet));
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
      <h2>${this.escape(patient.name)}</h2>
      <div class="overview-grid">
        <div class="overview-item">
          <span class="overview-label">Ημερομηνία ραντεβού</span>
          <span class="overview-value">${this.formatDate(patient.date)}</span>
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
