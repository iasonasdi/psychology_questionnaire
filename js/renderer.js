/**
 * Renders questionnaire forms from JSON definitions.
 */
const Renderer = {
  render(questionnaire, answers = {}) {
    const form = document.createElement('div');
    form.className = 'questionnaire-form-inner';

    switch (questionnaire.type) {
      case 'likert':
        this._renderLikert(form, questionnaire, answers);
        break;
      case 'yesno':
        this._renderLikert(form, questionnaire, answers);
        break;
      case 'mixed':
        this._renderMixed(form, questionnaire, answers);
        break;
      case 'true_false_distress':
        this._renderTrueFalseDistress(form, questionnaire, answers);
        break;
      case 'hads':
        this._renderHads(form, questionnaire, answers);
        break;
      default:
        form.innerHTML = '<p>Άγνωστος τύπος ερωτηματολογίου.</p>';
    }

    return form;
  },

  _renderLikert(container, data, answers, questions = null, prefix = '') {
    const qs = questions || data.questions;
    const scale = data.scale;

    qs.forEach((q, i) => {
      const key = prefix ? `${prefix}.${q.id}` : q.id;
      const block = this._createQuestionBlock(i + 1, q.text, key);
      const scaleOpts = q.scale?.options || scale?.options;
      block.appendChild(this._createOptionGroup(key, scaleOpts, answers[key], 'likert-scale'));
      container.appendChild(block);
    });
  },

  _renderMixed(container, data, answers) {
    if (data.sections) {
      data.sections.forEach((section) => {
        if (section.intro) {
          const intro = document.createElement('div');
          intro.className = 'section-intro';
          intro.textContent = section.intro;
          container.appendChild(intro);
        }

        if (section.type === 'yesno') {
          this._renderLikert(container, { scale: section.scale }, answers, section.questions, section.id);
        } else if (section.type === 'likert') {
          section.questions.forEach((q, i) => {
            const key = `${section.id}.${q.id}`;
            const block = this._createQuestionBlock(i + 1, q.text, key);
            block.appendChild(this._createOptionGroup(key, q.scale.options, answers[key], 'likert-scale'));
            container.appendChild(block);
          });
        } else if (section.type === 'numeric_scale') {
          section.questions.forEach((q, i) => {
            const key = `${section.id}.${q.id}`;
            const block = this._createQuestionBlock(i + 1, q.text, key);
            const options = [];
            for (let v = section.min; v <= section.max; v++) {
              options.push({ value: v, label: String(v) });
            }
            block.appendChild(this._createOptionGroup(key, options, answers[key], 'numeric-scale'));
            if (data.scaleLabels) {
              const labels = document.createElement('div');
              labels.className = 'scale-labels';
              labels.innerHTML = `<span>${data.scaleLabels['0']}</span><span>${data.scaleLabels['4']}</span>`;
              block.appendChild(labels);
            }
            container.appendChild(block);
          });
        } else if (section.type === 'number_input') {
          section.questions.forEach((q, i) => {
            const key = `${section.id}.${q.id}`;
            const block = this._createQuestionBlock(i + 1, q.text, key);
            block.appendChild(this._createNumberInput(key, q, answers[key]));
            container.appendChild(block);
          });
        } else if (section.type === 'standalone') {
          section.questions.forEach((q, i) => {
            const key = `${section.id}.${q.id}`;
            const block = this._createQuestionBlock(i + 1, q.text, key);
            if (q.type === 'yesno' || q.type === 'likert') {
              block.appendChild(this._createOptionGroup(key, q.scale.options, answers[key], 'likert-scale'));
            }
            container.appendChild(block);
          });
        }
      });
    }
  },

  _renderTrueFalseDistress(container, data, answers) {
    data.questions.forEach((q, i) => {
      const block = document.createElement('div');
      block.className = 'question-block tf-distress-block';
      block.dataset.questionId = q.id;

      const textEl = document.createElement('div');
      textEl.className = 'question-text';
      textEl.innerHTML = `<span class="question-number">${i + 1}</span><span>${q.text}</span>`;
      block.appendChild(textEl);

      const tfRow = document.createElement('div');
      tfRow.className = 'tf-row options-row';

      const tfOptions = [
        { value: 'true', label: 'Σωστό' },
        { value: 'false', label: 'Λάθος' },
      ];

      tfOptions.forEach((opt) => {
        const key = `${q.id}.answer`;
        const btn = this._createOptionButton(`${key}`, opt.value, opt.label, answers[key]);
        tfRow.appendChild(btn);
      });
      block.appendChild(tfRow);

      const distressRow = document.createElement('div');
      distressRow.className = 'distress-row hidden';
      if (answers[`${q.id}.answer`] === 'true') {
        distressRow.classList.remove('hidden');
      }

      const distressLabel = document.createElement('div');
      distressLabel.className = 'distress-label';
      distressLabel.textContent = 'Πόσο σας αγχώνει αυτή η εμπειρία;';
      distressRow.appendChild(distressLabel);

      const distressKey = `${q.id}.distress`;
      distressRow.appendChild(
        this._createOptionGroup(distressKey, data.distressScale.options, answers[distressKey], 'options-row')
      );
      block.appendChild(distressRow);

      tfRow.addEventListener('change', (e) => {
        if (e.target.name === `${q.id}.answer`) {
          const showDistress = e.target.value === 'true';
          distressRow.classList.toggle('hidden', !showDistress);
          if (!showDistress) {
            distressRow.querySelectorAll('input').forEach((input) => {
              input.checked = false;
            });
          }
        }
      });

      const validation = document.createElement('div');
      validation.className = 'validation-msg';
      validation.textContent = 'Παρακαλώ απαντήστε σε αυτή την ερώτηση.';
      block.appendChild(validation);

      container.appendChild(block);
    });
  },

  _renderHads(container, data, answers) {
    data.questions.forEach((q, i) => {
      const block = this._createQuestionBlock(i + 1, q.text, q.id);

      const subscaleBadge = document.createElement('span');
      subscaleBadge.className = `subscale-badge subscale-${q.subscale}`;
      subscaleBadge.textContent = q.subscale;
      block.querySelector('.question-text span:last-child').appendChild(subscaleBadge);

      block.appendChild(this._createOptionGroup(q.id, q.options, answers[q.id], 'likert-scale'));
      container.appendChild(block);
    });
  },

  _createQuestionBlock(num, text, id) {
    const block = document.createElement('div');
    block.className = 'question-block';
    block.dataset.questionId = id;

    const textEl = document.createElement('div');
    textEl.className = 'question-text';
    textEl.innerHTML = `<span class="question-number">${num}</span><span>${text}</span>`;
    block.appendChild(textEl);

    const validation = document.createElement('div');
    validation.className = 'validation-msg';
    validation.textContent = 'Παρακαλώ απαντήστε σε αυτή την ερώτηση.';
    block.appendChild(validation);

    return block;
  },

  _createOptionGroup(name, options, currentValue, cssClass = 'options-row') {
    const group = document.createElement('div');
    group.className = cssClass;

    options.forEach((opt) => {
      group.appendChild(this._createOptionButton(name, opt.value, opt.label, currentValue));
    });

    return group;
  },

  _createOptionButton(name, value, label, currentValue) {
    const wrapper = document.createElement('div');
    wrapper.className = 'option-btn';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.id = `${name}_${value}`;
    input.value = value;
    if (String(currentValue) === String(value)) {
      input.checked = true;
    }

    const labelEl = document.createElement('label');
    labelEl.htmlFor = input.id;
    labelEl.textContent = label;

    wrapper.appendChild(input);
    wrapper.appendChild(labelEl);
    return wrapper;
  },

  _createNumberInput(name, config, currentValue) {
    const group = document.createElement('div');
    group.className = 'number-input-group';

    const input = document.createElement('input');
    input.type = 'number';
    input.name = name;
    input.id = name;
    input.min = config.min;
    input.max = config.max;
    input.step = 1;
    if (currentValue !== undefined && currentValue !== '') {
      input.value = currentValue;
    }

    const unit = document.createElement('span');
    unit.className = 'number-unit';
    unit.textContent = config.unit || '';

    group.appendChild(input);
    group.appendChild(unit);
    return group;
  },

  collectAnswers(formEl, questionnaire) {
    const answers = {};

    const collectField = (name) => {
      const el = formEl.querySelector(`[name="${name}"]`);
      if (!el) return undefined;
      if (el.type === 'radio') {
        const checked = formEl.querySelector(`[name="${name}"]:checked`);
        return checked ? checked.value : undefined;
      }
      return el.value;
    };

    switch (questionnaire.type) {
      case 'likert':
        questionnaire.questions.forEach((q) => {
          answers[q.id] = collectField(q.id);
        });
        break;

      case 'mixed':
        questionnaire.sections.forEach((section) => {
          if (section.type === 'yesno' && section.questions) {
            section.questions.forEach((q) => {
              answers[`${section.id}.${q.id}`] = collectField(`${section.id}.${q.id}`);
            });
          } else if (section.type === 'likert' && section.questions) {
            section.questions.forEach((q) => {
              answers[`${section.id}.${q.id}`] = collectField(`${section.id}.${q.id}`);
            });
          } else if (section.type === 'numeric_scale' && section.questions) {
            section.questions.forEach((q) => {
              answers[`${section.id}.${q.id}`] = collectField(`${section.id}.${q.id}`);
            });
          } else if (section.type === 'number_input' && section.questions) {
            section.questions.forEach((q) => {
              answers[`${section.id}.${q.id}`] = collectField(`${section.id}.${q.id}`);
            });
          } else if (section.type === 'standalone' && section.questions) {
            section.questions.forEach((q) => {
              answers[`${section.id}.${q.id}`] = collectField(`${section.id}.${q.id}`);
            });
          }
        });
        break;

      case 'true_false_distress':
        questionnaire.questions.forEach((q) => {
          answers[`${q.id}.answer`] = collectField(`${q.id}.answer`);
          answers[`${q.id}.distress`] = collectField(`${q.id}.distress`);
        });
        break;

      case 'hads':
        questionnaire.questions.forEach((q) => {
          answers[q.id] = collectField(q.id);
        });
        break;
    }

    return answers;
  },

  validate(formEl, questionnaire) {
    let valid = true;
    formEl.querySelectorAll('.question-block').forEach((block) => {
      block.classList.remove('invalid');
    });

    const checkRequired = (name, blockSelector) => {
      const block = formEl.querySelector(`[data-question-id="${blockSelector || name}"]`);
      const radio = formEl.querySelector(`[name="${name}"]`);
      const number = formEl.querySelector(`input[type="number"][name="${name}"]`);

      let answered = false;
      if (radio?.type === 'radio') {
        answered = !!formEl.querySelector(`[name="${name}"]:checked`);
      } else if (number) {
        answered = number.value !== '' && number.value !== null;
      }

      if (!answered && block) {
        block.classList.add('invalid');
        valid = false;
      }
      return answered;
    };

    switch (questionnaire.type) {
      case 'likert':
        questionnaire.questions.forEach((q) => checkRequired(q.id));
        break;

      case 'mixed':
        questionnaire.sections.forEach((section) => {
          if (section.questions) {
            section.questions.forEach((q) => {
              const key = `${section.id}.${q.id}`;
              checkRequired(key);
            });
          }
        });
        break;

      case 'true_false_distress':
        questionnaire.questions.forEach((q) => {
          const block = formEl.querySelector(`[data-question-id="${q.id}"]`);
          const answer = formEl.querySelector(`[name="${q.id}.answer"]:checked`);
          if (!answer) {
            block?.classList.add('invalid');
            valid = false;
          } else if (answer.value === 'true') {
            const distress = formEl.querySelector(`[name="${q.id}.distress"]:checked`);
            if (!distress) {
              block?.classList.add('invalid');
              valid = false;
            }
          }
        });
        break;

      case 'hads':
        questionnaire.questions.forEach((q) => checkRequired(q.id));
        break;
    }

    return valid;
  },

  computeHadsScores(questionnaire, answers) {
    let anxiety = 0;
    let depression = 0;

    questionnaire.questions.forEach((q) => {
      const val = parseInt(answers[q.id], 10);
      if (isNaN(val)) return;
      if (q.subscale === 'A') anxiety += val;
      else if (q.subscale === 'D') depression += val;
    });

    return { anxiety, depression, total: anxiety + depression };
  },
};
