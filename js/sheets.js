const SheetsAPI = {
  async validateCode(code) {
    if (!CONFIG.GOOGLE_SCRIPT_URL) {
      throw new Error(
        'Το Google Sheets URL δεν έχει ρυθμιστεί. Δείτε το αρχείο js/config.js.'
      );
    }

    const url = new URL(CONFIG.GOOGLE_SCRIPT_URL);
    url.searchParams.set('action', 'validate');
    url.searchParams.set('code', String(code).trim().toUpperCase());

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!data.success) {
      throw new Error(this._validateErrorMessage(data));
    }

    return data;
  },

  _validateErrorMessage(data) {
    if (data.errorCode === 'already_submitted') {
      return 'Αυτό το ερωτηματολόγιο έχει ήδη υποβληθεί.';
    }
    if (data.errorCode === 'not_found' || data.errorCode === 'invalid') {
      return 'Ο κωδικός δεν είναι έγκυρος. Ελέγξτε τον κωδικό στο link που σας στάλθηκε.';
    }
    return data.error || 'Ο κωδικός δεν είναι έγκυρος.';
  },

  buildPayload(patient, questionnaires, allAnswers) {
    return {
      patient: {
        code: patient.code,
        date: patient.date,
        submittedAt: new Date().toISOString(),
      },
      questionnaires: questionnaires.map((q) => {
        const answers = allAnswers[q.id] || {};
        const entry = {
          id: q.id,
          title: q.title,
          shortTitle: q.shortTitle,
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

  async submit(patient, questionnaires, allAnswers) {
    if (!CONFIG.GOOGLE_SCRIPT_URL) {
      throw new Error(
        'Το Google Sheets URL δεν έχει ρυθμιστεί. Δείτε το αρχείο js/config.js.'
      );
    }

    const payload = this.buildPayload(patient, questionnaires, allAnswers);
    const body = JSON.stringify(payload);

    try {
      const response = await fetch(CONFIG.GOOGLE_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body,
        redirect: 'follow',
      });

      const text = await response.text();
      let result;

      try {
        result = JSON.parse(text);
      } catch {
        throw new Error('Μη έγκυρη απάντηση από τον server. Ελέγξτε ότι το Apps Script είναι deployed σωστά.');
      }

      if (!result.success) {
        throw new Error(result.error || 'Η αποθήκευση απέτυχε.');
      }

      return result;
    } catch (err) {
      if (err.message && !err.message.includes('fetch')) {
        throw err;
      }

      // Fallback: form POST (works when fetch is blocked by CORS)
      return this._submitViaForm(body);
    }
  },

  _submitViaForm(body) {
    return new Promise((resolve, reject) => {
      const frameName = 'gas-submit-frame';
      let frame = document.getElementById(frameName);

      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = frameName;
        frame.name = frameName;
        frame.style.display = 'none';
        document.body.appendChild(frame);
      }

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = CONFIG.GOOGLE_SCRIPT_URL;
      form.target = frameName;
      form.style.display = 'none';

      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'payload';
      input.value = body;
      form.appendChild(input);

      document.body.appendChild(form);
      form.submit();

      setTimeout(() => {
        form.remove();
        resolve({ success: true, sheet: '(ελέγξτε το spreadsheet)' });
      }, 3000);
    });
  },

  async submitWithFallback(patient, questionnaires, allAnswers) {
    return this.submit(patient, questionnaires, allAnswers);
  },
};
