/**
 * Clinical scoring and summary labels for admin panel.
 */
const Scoring = {
  evaluateAll(questionnaireDefs, submissions) {
    const byId = {};
    submissions.forEach((q) => {
      byId[q.id] = q;
    });

    return questionnaireDefs.map((def) => {
      const sub = byId[def.id];
      const answers = sub ? sub.answers || {} : {};
      const summary = this.evaluate(def, answers, sub);
      return { id: def.id, shortTitle: def.shortTitle, title: def.title, summary, answers };
    });
  },

  evaluate(def, answers, submission) {
    switch (def.id) {
      case 'q01-adhd': return this._adhd(answers);
      case 'q02-mdq': return this._mdq(answers);
      case 'q03-sds': return this._sds(answers);
      case 'q04-pq16': return this._pq16(answers);
      case 'q05-isi': return this._isi(answers);
      case 'q06-hads': return this._hads(answers, submission);
      default: return { label: '—', detail: '' };
    }
  },

  _adhd(answers) {
    const vals = Object.values(answers).map(Number).filter((n) => !isNaN(n));
    const total = vals.reduce((s, n) => s + n, 0);
    const avg = vals.length ? (total / vals.length).toFixed(1) : 0;
    let label = 'Χαμηλή';
    if (total >= 14) label = 'Υψηλή';
    else if (total >= 8) label = 'Μέτρια';
    return {
      label,
      detail: `Σύνολο: ${total}/24 · Μ.Ο.: ${avg}`,
      metrics: [{ name: 'Σύνολο', value: total, max: 24 }],
    };
  },

  _mdq(answers) {
    const symptoms = Object.keys(answers).filter((k) => k.startsWith('symptoms.'));
    const yesCount = symptoms.filter((k) => answers[k] === 'yes').length;
    const problem = answers['followup.problem_level'];
    const problemLabels = ['Καθόλου', 'Ήπιο', 'Μέτριο', 'Σοβαρό'];
    const problemLabel = problem !== undefined ? problemLabels[Number(problem)] || '—' : '—';
    let label = yesCount >= 7 ? 'Θετικό σκρίνινγκ' : 'Αρνητικό σκρίνινγκ';
    return {
      label,
      detail: `ΝΑΙ σε ${yesCount}/13 συμπτώματα · Πρόβλημα: ${problemLabel}`,
      metrics: [{ name: 'ΝΑΙ', value: yesCount, max: 13 }],
    };
  },

  _sds(answers) {
    const work = Number(answers['disability.work']);
    const social = Number(answers['disability.social']);
    const family = Number(answers['disability.family']);
    const scales = [work, social, family].filter((n) => !isNaN(n));
    const avg = scales.length ? (scales.reduce((s, n) => s + n, 0) / scales.length).toFixed(1) : 0;
    const missed = answers['absence.days_missed'] || 0;
    const reduced = answers['absence.days_reduced'] || 0;
    let label = Number(avg) >= 7 ? 'Σημαντική αναπηρία' : Number(avg) >= 4 ? 'Μέτρια αναπηρία' : 'Ήπια αναπηρία';
    return {
      label,
      detail: `Μ.Ο. αναπηρίας: ${avg}/10 · Ημέρες απουσίας: ${missed} · Μειωμένη απόδοση: ${reduced}`,
      metrics: [{ name: 'Μ.Ο.', value: avg, max: 10 }],
    };
  },

  _pq16(answers) {
    const items = Object.keys(answers).filter((k) => k.endsWith('.answer'));
    const positive = items.filter((k) => answers[k] === 'true').length;
    const distress = items
      .filter((k) => answers[k] === 'true')
      .reduce((s, k) => s + (Number(answers[k.replace('.answer', '.distress')]) || 0), 0);
    let label = positive >= 6 ? 'Υψηλό σκρίνινγκ' : positive >= 3 ? 'Μέτριο σκρίνινγκ' : 'Χαμηλό σκρίνινγκ';
    return {
      label,
      detail: `Θετικές απαντήσεις: ${positive}/16 · Άγχος: ${distress}`,
      metrics: [{ name: 'Θετικά', value: positive, max: 16 }],
    };
  },

  _isi(answers) {
    const keys = [
      'satisfaction.sleep_satisfaction',
      'impact.daily_impact',
      'severity.difficulty_falling',
      'severity.difficulty_staying',
      'severity.early_waking',
      'noticeability.noticeable_to_others',
      'worry.sleep_worry',
    ];
    const vals = keys.map((k) => Number(answers[k])).filter((n) => !isNaN(n));
    const total = vals.reduce((s, n) => s + n, 0);
    let label = 'Χωρίς αϋπνία';
    if (total >= 22) label = 'Σοβαρή αϋπνία';
    else if (total >= 15) label = 'Μέτρια αϋπνία';
    else if (total >= 8) label = 'Υποκλινική αϋπνία';
    return {
      label,
      detail: `ISI σύνολο: ${total}/28`,
      metrics: [{ name: 'ISI', value: total, max: 28 }],
    };
  },

  _hads(answers, submission) {
    let anxiety, depression;
    if (submission && submission.scores) {
      anxiety = submission.scores.anxiety;
      depression = submission.scores.depression;
    } else if (submission && submission._def) {
      const s = this._computeHadsFromAnswers(submission._def, answers);
      anxiety = s.anxiety;
      depression = s.depression;
    } else {
      anxiety = depression = 0;
    }
    const interp = (score) => {
      if (score >= 11) return 'Κλινικό';
      if (score >= 8) return 'Οριακό';
      return 'Φυσιολογικό';
    };
    return {
      label: `Άγχος: ${interp(anxiety)} · Κατάθλιψη: ${interp(depression)}`,
      detail: `A=${anxiety}/21 · D=${depression}/21`,
      metrics: [
        { name: 'Άγχος (A)', value: anxiety, max: 21 },
        { name: 'Κατάθλιψη (D)', value: depression, max: 21 },
      ],
    };
  },

  _computeHadsFromAnswers(def, answers) {
    let anxiety = 0;
    let depression = 0;
    (def.questions || []).forEach((q) => {
      const val = parseInt(answers[q.id], 10);
      if (isNaN(val)) return;
      if (q.subscale === 'A') anxiety += val;
      else depression += val;
    });
    return { anxiety, depression, total: anxiety + depression };
  },

  getAnswerLabel(def, questionKey, value) {
    if (value === 'yes') return 'ΝΑΙ';
    if (value === 'no') return 'ΟΧΙ';
    if (value === 'true') return 'Σωστό';
    if (value === 'false') return 'Λάθος';
    return String(value);
  },

  getQuestionText(def, answerKey) {
    const findInQuestions = (questions, key) => {
      if (!questions) return null;
      const q = questions.find((item) => item.id === key || key.endsWith('.' + item.id));
      return q ? q.text : null;
    };

    if (def.questions) {
      const text = findInQuestions(def.questions, answerKey);
      if (text) return text;
    }

    if (def.sections) {
      for (const section of def.sections) {
        if (section.questions) {
          const shortKey = answerKey.split('.').pop();
          const q = section.questions.find((item) => item.id === shortKey);
          if (q) return q.text;
        }
      }
    }

    if (answerKey.includes('.answer')) {
      const qId = answerKey.replace('.answer', '');
      const q = def.questions && def.questions.find((item) => item.id === qId);
      if (q) return q.text;
    }

    if (answerKey.includes('.distress')) {
      return 'Επίπεδο αγχωτικότητας';
    }

    return answerKey;
  },

  formatAnswersForDisplay(def, answers) {
    const rows = [];
    const skipDistress = new Set();

    Object.entries(answers).forEach(([key, value]) => {
      if (value === undefined || value === '') return;
      if (key.endsWith('.distress') && answers[key.replace('.distress', '.answer')] !== 'true') return;

      rows.push({
        key,
        question: this.getQuestionText(def, key),
        answer: this.getAnswerLabel(def, key, value),
        value,
      });
    });

    return rows;
  },
};
