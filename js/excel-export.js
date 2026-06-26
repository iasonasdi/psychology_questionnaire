/**
 * Export patient submissions to styled multi-sheet Excel (.xlsx).
 */
const ExcelExport = {
  COLORS: {
    navy: 'FF24243E',
    teal: 'FF80BDBB',
    tealLight: 'FFE8F4F3',
    border: 'FFB0BEC5',
    white: 'FFFFFFFF',
  },

  async download(patientData, questionnaireDefs) {
    if (typeof ExcelJS === 'undefined') {
      throw new Error('Το Excel export δεν είναι διαθέσιμο.');
    }

    const patient = patientData.patient || {};
    const code = patient.code || patientData.code || 'questionnaire';
    const workbook = await this.buildWorkbook(patientData, questionnaireDefs);
    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `${code}_${patient.date || 'export'}.xlsx`;
    this._saveBuffer(buffer, fileName);
  },

  _saveBuffer(buffer, fileName) {
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  },

  _thinBorder() {
    const color = { argb: this.COLORS.border };
    return {
      top: { style: 'thin', color },
      left: { style: 'thin', color },
      bottom: { style: 'thin', color },
      right: { style: 'thin', color },
    };
  },

  _sanitizeSheetName(name) {
    return String(name || 'Sheet')
      .replace(/[\\/?*[\]:]/g, '')
      .substring(0, 31) || 'Sheet';
  },

  _exportValue(value) {
    return value === '' || value === undefined || value === null ? '-' : value;
  },

  _formatDisplayDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('el-GR', {
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

  _prepareSubmissions(patientData, questionnaireDefs) {
    return (patientData.questionnaires || []).map((q) => {
      if (q.id === 'q06-hads' && !q.scores) {
        const def = questionnaireDefs.find((d) => d.id === q.id);
        if (def) {
          return {
            ...q,
            scores: Scoring._computeHadsFromAnswers(def, q.answers || {}),
          };
        }
      }
      return q;
    });
  },

  async buildWorkbook(patientData, questionnaireDefs) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Psychology Questionnaire';
    workbook.created = new Date();

    const patient = patientData.patient || {};
    const submissions = this._prepareSubmissions(patientData, questionnaireDefs);
    const evaluated = Scoring.evaluateAll(questionnaireDefs, submissions);

    this._buildSummarySheet(workbook, patient, evaluated);

    const byId = {};
    submissions.forEach((q) => {
      byId[q.id] = q;
    });

    questionnaireDefs.forEach((def) => {
      const sub = byId[def.id];
      if (sub) {
        this._buildQuestionnaireSheet(workbook, def, sub);
      }
    });

    return workbook;
  },

  _buildSummarySheet(workbook, patient, evaluated) {
    const sheet = workbook.addWorksheet('Σύνοψη', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    sheet.columns = [
      { width: 22 },
      { width: 42 },
      { width: 42 },
    ];

    let row = 1;
    const title = sheet.getRow(row);
    title.getCell(1).value = 'Ερωτηματολόγια Ασθενούς';
    title.getCell(1).font = { bold: true, size: 16, color: { argb: this.COLORS.navy } };
    sheet.mergeCells(row, 1, row, 3);
    row += 2;

    const meta = [
      ['Κωδικός', patient.code || ''],
      ['Ημερομηνία', patient.date || ''],
      ['Εκδόθηκε', this._formatDisplayDate(patient.issuedAt)],
      ['Κατάσταση', patient.status === 'submitted' ? 'Υποβλήθηκε' : 'Εκκρεμεί'],
      ['Υποβλήθηκε', this._formatDisplayDate(patient.submittedAt)],
    ];

    meta.forEach(([label, value]) => {
      const r = sheet.getRow(row);
      r.getCell(1).value = label;
      r.getCell(1).font = { bold: true, color: { argb: this.COLORS.navy } };
      r.getCell(2).value = value;
      r.getCell(2).border = this._thinBorder();
      row += 1;
    });

    row += 1;
    const summaryTitle = sheet.getRow(row);
    summaryTitle.getCell(1).value = 'Σύνοψη Ερωτηματολογίων';
    summaryTitle.getCell(1).font = { bold: true, size: 13, color: { argb: this.COLORS.navy } };
    sheet.mergeCells(row, 1, row, 3);
    row += 1;

    const headerRow = sheet.getRow(row);
    ['Ερωτηματολόγιο', 'Αποτέλεσμα', 'Λεπτομέρειες'].forEach((text, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = text;
      cell.font = { bold: true, color: { argb: this.COLORS.white } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: this.COLORS.teal } };
      cell.border = this._thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    const summaryHeaderRow = row;
    row += 1;

    evaluated.forEach((item) => {
      const r = sheet.getRow(row);
      r.getCell(1).value = item.title;
      r.getCell(2).value = item.summary.label;
      r.getCell(3).value = item.summary.detail;
      [1, 2, 3].forEach((col) => {
        const cell = r.getCell(col);
        cell.border = this._thinBorder();
        cell.alignment = { vertical: 'top', wrapText: true };
      });
      row += 1;
    });

    if (evaluated.length) {
      this._applyTableBorders(sheet, summaryHeaderRow, row - 1, 1, 3);
    }
  },

  _buildQuestionnaireSheet(workbook, def, sub) {
    const sheet = workbook.addWorksheet(this._sanitizeSheetName(def.shortTitle || def.id), {
      views: [{ state: 'frozen', ySplit: 3 }],
    });

    sheet.columns = [
      { width: 58 },
      { width: 28 },
      { width: 12 },
    ];

    let row = 1;
    const titleRow = sheet.getRow(row);
    titleRow.getCell(1).value = def.title;
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: this.COLORS.navy } };
    sheet.mergeCells(row, 1, row, 3);
    row += 1;

    if (def.instructions) {
      const introRow = sheet.getRow(row);
      introRow.getCell(1).value = def.instructions;
      introRow.getCell(1).font = { italic: true, color: { argb: 'FF5C5C7A' } };
      introRow.getCell(1).alignment = { wrapText: true };
      sheet.mergeCells(row, 1, row, 3);
      row += 1;
    }

    row += 1;
    const tableStart = row;
    const headerRow = sheet.getRow(row);
    ['Ερώτηση', 'Απάντηση', 'Τιμή'].forEach((text, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = text;
      cell.font = { bold: true, color: { argb: this.COLORS.navy } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: this.COLORS.tealLight } };
      cell.border = this._thinBorder();
      cell.alignment = { vertical: 'middle' };
    });
    row += 1;

    const answers = sub.answers || {};
    const answerRows = Scoring.formatAnswersForDisplay(def, answers);
    answerRows.forEach((r) => {
      const dataRow = sheet.getRow(row);
      dataRow.getCell(1).value = r.question;
      dataRow.getCell(2).value = r.answer;
      dataRow.getCell(3).value = this._exportValue(r.value);
      [1, 2, 3].forEach((col) => {
        const cell = dataRow.getCell(col);
        cell.border = this._thinBorder();
        cell.alignment = { vertical: 'top', wrapText: col === 1 };
      });
      row += 1;
    });

    if (answerRows.length) {
      this._applyTableBorders(sheet, tableStart, row - 1, 1, 3);
    }

    if (def.id === 'q06-hads') {
      row += 1;
      const scores = sub.scores || Scoring._computeHadsFromAnswers(def, answers);
      const scoresTitle = sheet.getRow(row);
      scoresTitle.getCell(1).value = 'Βαθμολογίες HADS';
      scoresTitle.getCell(1).font = { bold: true, color: { argb: this.COLORS.navy } };
      sheet.mergeCells(row, 1, row, 2);
      row += 1;

      const scoreStart = row;
      [
        ['Άγχος (A)', scores.anxiety],
        ['Κατάθλιψη (D)', scores.depression],
        ['Σύνολο', scores.total],
      ].forEach(([label, value]) => {
        const scoreRow = sheet.getRow(row);
        scoreRow.getCell(1).value = label;
        scoreRow.getCell(1).font = { bold: true };
        scoreRow.getCell(2).value = value;
        scoreRow.getCell(1).border = this._thinBorder();
        scoreRow.getCell(2).border = this._thinBorder();
        row += 1;
      });
      this._applyTableBorders(sheet, scoreStart, row - 1, 1, 2);
    }
  },

  _applyTableBorders(sheet, startRow, endRow, startCol, endCol) {
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = sheet.getRow(r).getCell(c);
        cell.border = this._thinBorder();
      }
    }
  },
};
