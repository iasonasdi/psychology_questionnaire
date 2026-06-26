/**
 * Patient questionnaire API — Firestore only.
 */
const QuestionnaireAPI = {
  normalizeCode(code) {
    return String(code || '').trim().toUpperCase();
  },

  /** Firestore does not accept undefined — strip or omit those values. */
  sanitizeForFirestore(value) {
    if (value === undefined) {
      return undefined;
    }
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => (item === undefined ? null : this.sanitizeForFirestore(item)));
    }

    const clean = {};
    Object.entries(value).forEach(([key, val]) => {
      if (val === undefined) return;
      clean[key] = this.sanitizeForFirestore(val);
    });
    return clean;
  },

  cleanAnswers(answers) {
    const clean = {};
    Object.entries(answers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        clean[key] = value;
      }
    });
    return clean;
  },

  buildPayload(patient, questionnaires, allAnswers) {
    const submittedAt = new Date().toISOString();
    const code = this.normalizeCode(patient.code);

    return {
      code,
      submittedAt,
      patient: {
        code,
        date: patient.date || '',
        issuedAt: patient.issuedAt || '',
        submittedAt,
        status: 'submitted',
      },
      questionnaires: questionnaires.map((q) => {
        const answers = this.cleanAnswers(allAnswers[q.id] || {});
        const entry = {
          id: q.id,
          title: q.title,
          shortTitle: q.shortTitle || '',
          answers,
          answerRows: Scoring.formatAnswersForDisplay(q, answers),
        };

        if (q.id === 'q06-hads') {
          entry.scores = Renderer.computeHadsScores(q, answers);
        }

        return entry;
      }),
    };
  },

  isValidCodeFormat(code) {
    return /^PQ-[A-F0-9]{8}$/.test(code);
  },

  _validateErrorMessage(data) {
    if (data.status === 'submitted') {
      return 'Αυτό το ερωτηματολόγιο έχει ήδη υποβληθεί.';
    }
    return 'Ο κωδικός δεν είναι έγκυρος. Ελέγξτε τον κωδικό στο link που σας στάλθηκε.';
  },

  async validateCode(code) {
    FirebaseApp.init();
    const normalized = this.normalizeCode(code);

    if (!this.isValidCodeFormat(normalized)) {
      throw new Error(this._validateErrorMessage({ status: 'missing' }));
    }

    try {
      const doc = await FirebaseApp.db.collection('issued').doc(normalized).get();

      if (!doc.exists) {
        throw new Error(this._validateErrorMessage({ status: 'missing' }));
      }

      const data = doc.data();
      if (data.status === 'submitted') {
        throw new Error(this._validateErrorMessage(data));
      }

      return {
        success: true,
        code: data.code,
        date: data.date,
        status: data.status,
        issuedAt: data.issuedAt || '',
      };
    } catch (err) {
      if (err.code === 'permission-denied') {
        throw new Error(this._validateErrorMessage({ status: 'missing' }));
      }
      throw err;
    }
  },

  async submit(patient, questionnaires, allAnswers) {
    FirebaseApp.init();
    const payload = this.sanitizeForFirestore(
      this.buildPayload(patient, questionnaires, allAnswers)
    );
    const code = payload.code;
    const db = FirebaseApp.db;
    const batch = db.batch();

    batch.set(db.collection('submissions').doc(code), payload);
    batch.update(db.collection('issued').doc(code), {
      status: 'submitted',
      submittedAt: payload.submittedAt,
    });

    try {
      await batch.commit();
    } catch (err) {
      if (err.code === 'permission-denied') {
        throw new Error('Ο κωδικός δεν είναι έγκυρος ή έχει ήδη χρησιμοποιηθεί.');
      }
      throw new Error(err.message || 'Η αποθήκευση απέτυχε.');
    }

    return { success: true, code };
  },

  async submitWithFallback(patient, questionnaires, allAnswers) {
    return this.submit(patient, questionnaires, allAnswers);
  },

  async generateUniqueCode() {
    FirebaseApp.init();
    for (let i = 0; i < 50; i++) {
      const code =
        'PQ-' + crypto.randomUUID().replace(/-/g, '').substring(0, 8).toUpperCase();
      const doc = await FirebaseApp.db.collection('issued').doc(code).get();
      if (!doc.exists) return code;
    }
    throw new Error('Δεν ήταν δυνατή η δημιουργία μοναδικού κωδικού.');
  },
};
