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
    if (questionKey.endsWith('.distress') && def.distressScale) {
      const opt = def.distressScale.options.find((o) => String(o.value) === String(value));
      if (opt) return opt.label;
    }
    const options = this.getOptionsForKey(def, questionKey);
    if (options) {
      const opt = options.find((o) => String(o.value) === String(value));
      if (opt) return opt.label;
    }
    if (value === 'yes') return 'ΝΑΙ';
    if (value === 'no') return 'ΟΧΙ';
    if (value === 'true') return 'Σωστό';
    if (value === 'false') return 'Λάθος';
    return String(value);
  },

  getOptionsForKey(def, key) {
    if (def.type === 'hads' && def.questions) {
      const q = def.questions.find((item) => item.id === key);
      return q ? q.options : null;
    }

    if (def.scale && def.questions?.some((q) => q.id === key)) {
      return def.scale.options;
    }

    if (!def.sections) return null;

    for (const section of def.sections) {
      if (!section.questions) continue;

      for (const q of section.questions) {
        const fullKey = `${section.id}.${q.id}`;
        if (fullKey !== key) continue;

        if (section.type === 'yesno') {
          return section.scale?.options || null;
        }
        if (section.type === 'likert') {
          return q.scale?.options || null;
        }
        if (section.type === 'numeric_scale') {
          const options = [];
          for (let v = section.min; v <= section.max; v++) {
            options.push({ value: v, label: String(v) });
          }
          return options;
        }
        if (section.type === 'standalone' && q.scale) {
          return q.scale.options;
        }
      }
    }

    return null;
  },

  isYesNoOptions(options) {
    if (!options || options.length > 2) return false;
    const values = options.map((o) => String(o.value));
    return values.every((v) => v === 'yes' || v === 'no');
  },

  _buildAnswerRow(def, key, questionText, rawValue) {
    if (rawValue === undefined || rawValue === '') return null;

    const options = this.getOptionsForKey(def, key);
    if (options && options.length) {
      const opt = options.find((o) => String(o.value) === String(rawValue));
      if (opt) {
        return {
          key,
          question: questionText,
          answer: opt.label,
          value: this.isYesNoOptions(options) ? '-' : opt.value,
        };
      }
    }

    return {
      key,
      question: questionText,
      answer: this.getAnswerLabel(def, key, rawValue),
      value: rawValue,
    };
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
    if (def.type === 'true_false_distress') {
      return this._formatTrueFalseDistress(def, answers);
    }
    if (def.type === 'likert' || def.type === 'yesno' || def.type === 'hads') {
      return this._formatLikert(def, answers);
    }
    if (def.type === 'mixed') {
      return this._formatMixed(def, answers);
    }

    const rows = [];
    Object.entries(answers).forEach(([key, value]) => {
      if (value === undefined || value === '') return;
      rows.push({
        key,
        question: this.getQuestionText(def, key),
        answer: this.getAnswerLabel(def, key, value),
        value,
      });
    });
    return rows;
  },

  _formatTrueFalseDistress(def, answers) {
    const rows = [];
    (def.questions || []).forEach((q) => {
      const answerKey = `${q.id}.answer`;
      const distressKey = `${q.id}.distress`;
      const answerVal = answers[answerKey];
      if (answerVal === undefined || answerVal === '') return;

      if (answerVal === 'false') {
        rows.push({
          key: answerKey,
          question: q.text,
          answer: 'Λάθος',
          value: '-',
        });
        return;
      }

      let answerLabel = 'Σωστό';
      let storedValue = '-';
      const distressVal = answers[distressKey];
      if (distressVal !== undefined && distressVal !== '') {
        const distressLabel = this.getAnswerLabel(def, distressKey, distressVal);
        answerLabel = `${answerLabel} — ${distressLabel}`;
        storedValue = distressVal;
      }

      rows.push({
        key: answerKey,
        question: q.text,
        answer: answerLabel,
        value: storedValue,
      });
    });
    return rows;
  },

  _formatLikert(def, answers) {
    const rows = [];
    (def.questions || []).forEach((q) => {
      const row = this._buildAnswerRow(def, q.id, q.text, answers[q.id]);
      if (row) rows.push(row);
    });
    return rows;
  },

  _formatMixed(def, answers) {
    const rows = [];
    (def.sections || []).forEach((section) => {
      (section.questions || []).forEach((q) => {
        const key = `${section.id}.${q.id}`;
        const row = this._buildAnswerRow(def, key, q.text, answers[key]);
        if (row) rows.push(row);
      });
    });
    return rows;
  },
};
