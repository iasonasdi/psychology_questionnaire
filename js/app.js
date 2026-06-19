/**
 * Main application controller.
 */
const App = {
  state: {
    patient: null,
    currentIndex: 0,
    questionnaires: [],
    answers: {},
  },

  elements: {},

  async init() {
    this._cacheElements();
    this._bindEvents();
    await this._loadQuestionnaires();
    this._setDefaultDate();
  },

  _cacheElements() {
    this.elements = {
      screens: {
        welcome: document.getElementById('screen-welcome'),
        questionnaire: document.getElementById('screen-questionnaire'),
        review: document.getElementById('screen-review'),
        success: document.getElementById('screen-success'),
      },
      patientForm: document.getElementById('patient-form'),
      questionnaireForm: document.getElementById('questionnaire-form'),
      progressLabel: document.getElementById('progress-label'),
      progressPercent: document.getElementById('progress-percent'),
      progressFill: document.getElementById('progress-fill'),
      questionnaireDots: document.getElementById('questionnaire-dots'),
      qBadge: document.getElementById('q-badge'),
      qTitle: document.getElementById('q-title'),
      qInstructions: document.getElementById('q-instructions'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      btnBackEdit: document.getElementById('btn-back-edit'),
      btnSubmit: document.getElementById('btn-submit'),
      reviewSummary: document.getElementById('review-summary'),
      successDetail: document.getElementById('success-detail'),
      toast: document.getElementById('toast'),
      loadingOverlay: document.getElementById('loading-overlay'),
    };
  },

  _bindEvents() {
    this.elements.patientForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this._startQuestionnaires();
    });

    this.elements.btnPrev.addEventListener('click', () => this._goPrev());
    this.elements.btnNext.addEventListener('click', () => this._goNext());
    this.elements.btnBackEdit.addEventListener('click', () => this._goToQuestionnaire(this.state.questionnaires.length - 1));
    this.elements.btnSubmit.addEventListener('click', () => this._submitAll());
  },

  _setDefaultDate() {
    const dateInput = document.getElementById('patient-date');
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  },

  async _loadQuestionnaires() {
    const manifestRes = await fetch('data/manifest.json');
    const manifest = await manifestRes.json();

    const loaded = await Promise.all(
      manifest.questionnaires
        .sort((a, b) => a.order - b.order)
        .map(async (entry) => {
          const res = await fetch(`data/${entry.file}`);
          return res.json();
        })
    );

    this.state.questionnaires = loaded;
    this._renderDots();
  },

  _renderDots() {
    const dots = this.elements.questionnaireDots;
    dots.innerHTML = '';
    this.state.questionnaires.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'dot';
      dot.title = this.state.questionnaires[i].shortTitle;
      dots.appendChild(dot);
    });
  },

  _updateDots() {
    const dots = this.elements.questionnaireDots.querySelectorAll('.dot');
    dots.forEach((dot, i) => {
      dot.classList.remove('active', 'completed');
      if (i < this.state.currentIndex) dot.classList.add('completed');
      if (i === this.state.currentIndex) dot.classList.add('active');
    });
  },

  _showScreen(name) {
    Object.values(this.elements.screens).forEach((s) => s.classList.remove('active'));
    this.elements.screens[name].classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  _startQuestionnaires() {
    const name = document.getElementById('patient-name').value.trim();
    const date = document.getElementById('patient-date').value;

    if (!name) {
      document.getElementById('patient-name').classList.add('error');
      this._showToast('Παρακαλώ εισάγετε το ονοματεπώνυμό σας.', true);
      return;
    }

    document.getElementById('patient-name').classList.remove('error');
    this.state.patient = { name, date };
    this.state.currentIndex = 0;
    this._showScreen('questionnaire');
    this._renderCurrentQuestionnaire();
  },

  _renderCurrentQuestionnaire() {
    const q = this.state.questionnaires[this.state.currentIndex];
    const total = this.state.questionnaires.length;
    const idx = this.state.currentIndex;

    this.elements.qBadge.textContent = q.shortTitle;
    this.elements.qTitle.textContent = q.title;
    this.elements.qInstructions.textContent = q.instructions;

    const percent = Math.round(((idx) / total) * 100);
    this.elements.progressLabel.textContent = `Ερωτηματολόγιο ${idx + 1} από ${total}`;
    this.elements.progressPercent.textContent = `${percent}%`;
    this.elements.progressFill.style.width = `${percent}%`;

    this.elements.btnPrev.disabled = idx === 0;

    const isLast = idx === total - 1;
    this.elements.btnNext.textContent = isLast ? 'Ολοκλήρωση' : 'Επόμενο';

    const form = this.elements.questionnaireForm;
    form.innerHTML = '';
    const rendered = Renderer.render(q, this.state.answers[q.id] || {});
    form.appendChild(rendered);

    this._updateDots();
  },

  _saveCurrentAnswers() {
    const q = this.state.questionnaires[this.state.currentIndex];
    this.state.answers[q.id] = Renderer.collectAnswers(this.elements.questionnaireForm, q);
  },

  _goPrev() {
    this._saveCurrentAnswers();
    if (this.state.currentIndex > 0) {
      this.state.currentIndex--;
      this._renderCurrentQuestionnaire();
    }
  },

  _goNext() {
    const q = this.state.questionnaires[this.state.currentIndex];
    const valid = Renderer.validate(this.elements.questionnaireForm, q);

    if (!valid) {
      this._showToast('Παρακαλώ απαντήστε σε όλες τις ερωτήσεις.', true);
      const firstInvalid = this.elements.questionnaireForm.querySelector('.invalid');
      firstInvalid?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    this._saveCurrentAnswers();

    if (this.state.currentIndex < this.state.questionnaires.length - 1) {
      this.state.currentIndex++;
      this._renderCurrentQuestionnaire();
    } else {
      this._showReview();
    }
  },

  _goToQuestionnaire(index) {
    this.state.currentIndex = index;
    this._showScreen('questionnaire');
    this._renderCurrentQuestionnaire();
  },

  _showReview() {
    const { patient, questionnaires, answers } = this.state;

    let html = `
      <div class="review-patient">
        ${patient.name} — ${this._formatDate(patient.date)}
      </div>
    `;

    questionnaires.forEach((q) => {
      const qAnswers = answers[q.id] || {};
      const count = Object.keys(qAnswers).filter((k) => qAnswers[k] !== undefined && qAnswers[k] !== '').length;
      html += `
        <div class="review-item">
          <span>${q.shortTitle}: ${q.title}</span>
          <span class="status">✓ ${count} απαντήσεις</span>
        </div>
      `;
    });

    this.elements.reviewSummary.innerHTML = html;
    this.elements.progressFill.style.width = '100%';
    this._showScreen('review');
  },

  async _submitAll() {
    this.elements.loadingOverlay.hidden = false;

    try {
      await SheetsAPI.submitWithFallback(
        this.state.patient,
        this.state.questionnaires,
        this.state.answers
      );

      this.elements.successDetail.textContent =
        `${this.state.patient.name} — ${this._formatDate(this.state.patient.date)}`;
      this._showScreen('success');
    } catch (err) {
      this._showToast(err.message || 'Σφάλμα κατά την αποθήκευση. Δοκιμάστε ξανά.', true);
    } finally {
      this.elements.loadingOverlay.hidden = true;
    }
  },

  _formatDate(dateStr) {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
  },

  _showToast(message, isError = false) {
    const toast = this.elements.toast;
    toast.textContent = message;
    toast.classList.toggle('error', isError);
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 4000);
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());
