/**
 * Google Apps Script — Patient Questionnaire Storage
 *
 * SETUP:
 * 1. Open your Google Sheet → Extensions → Apps Script → paste this code
 *    OR set SPREADSHEET_ID below if using a standalone script project.
 * 2. Deploy → New deployment → Web app
 *    Execute as: Me | Who has access: Anyone
 * 3. After ANY code change: Manage deployments → Edit → New version → Deploy
 */

const SPREADSHEET_ID = '';
const ADMIN_KEY = ''; // Set only in Apps Script editor — never commit a real password
const META_COLUMN = 5; // hidden column storing full JSON for admin panel

function getSpreadsheet_() {
  if (SPREADSHEET_ID) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      'No spreadsheet linked. Either open Apps Script from Extensions → Apps Script inside your Google Sheet, or set SPREADSHEET_ID at the top of Code.gs.'
    );
  }
  return ss;
}

function checkAdminKey_(e) {
  if (!ADMIN_KEY) {
    throw new Error('Admin API disabled. Set ADMIN_KEY in the Apps Script editor.');
  }
  const key = e && e.parameter ? e.parameter.key : '';
  if (key !== ADMIN_KEY) {
    throw new Error('Unauthorized admin access.');
  }
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const raw = e.postData ? e.postData.contents : e.parameter.payload;
    if (!raw) {
      throw new Error('No data received.');
    }

    const data = JSON.parse(raw);
    if (!data.patient || !data.questionnaires) {
      throw new Error('Invalid payload structure.');
    }

    const ss = getSpreadsheet_();
    const sheetName = buildSheetName_(data.patient);
    const sheet = createPatientSheet_(ss, sheetName);

    writePatientData_(sheet, data);

    return jsonResponse_({ success: true, sheet: sheetName });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function doGet(e) {
  try {
    const action = e && e.parameter ? e.parameter.action : '';

    if (action === 'list') {
      checkAdminKey_(e);
      return jsonResponse_(listPatients_());
    }

    if (action === 'search') {
      checkAdminKey_(e);
      const query = (e.parameter.q || '').toLowerCase().trim();
      return jsonResponse_(searchPatients_(query));
    }

    if (action === 'get') {
      checkAdminKey_(e);
      const sheetName = e.parameter.sheet;
      if (!sheetName) {
        throw new Error('Missing sheet parameter.');
      }
      return jsonResponse_(getPatient_(sheetName));
    }

    if (action === 'stats') {
      checkAdminKey_(e);
      return jsonResponse_(getStats_());
    }

    const ss = getSpreadsheet_();
    return jsonResponse_({
      status: 'ok',
      message: 'Patient Questionnaire API',
      spreadsheet: ss.getName(),
    });
  } catch (err) {
    return jsonResponse_({ success: false, error: err.message });
  }
}

function testSpreadsheet() {
  const ss = getSpreadsheet_();
  Logger.log('Connected to: ' + ss.getName());
  Logger.log('URL: ' + ss.getUrl());
}

function listPatients_() {
  const ss = getSpreadsheet_();
  const sheets = ss.getSheets();
  const patients = [];

  sheets.forEach(function(sheet) {
    const info = readPatientMeta_(sheet);
    if (info) {
      patients.push(info);
    }
  });

  patients.sort(function(a, b) {
    return new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0);
  });

  return { success: true, total: patients.length, patients: patients };
}

function searchPatients_(query) {
  const all = listPatients_().patients;
  if (!query) {
    return { success: true, total: all.length, patients: all };
  }

  const words = query.split(/\s+/).filter(Boolean);
  const filtered = all.filter(function(p) {
    const name = (p.name || '').toLowerCase();
    return words.every(function(w) { return name.indexOf(w) !== -1; });
  });

  return { success: true, total: filtered.length, patients: filtered };
}

function getStats_() {
  const result = listPatients_();
  return {
    success: true,
    totalPatients: result.total,
    spreadsheet: getSpreadsheet_().getName(),
  };
}

function getPatient_(sheetName) {
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Patient not found: ' + sheetName);
  }

  const stored = sheet.getRange(1, META_COLUMN).getValue();
  if (stored) {
    try {
      const data = JSON.parse(stored);
      return {
        success: true,
        sheet: sheetName,
        patient: data.patient,
        questionnaires: data.questionnaires,
      };
    } catch (err) {
      // fall through to parser
    }
  }

  const parsed = parsePatientSheet_(sheet);
  return {
    success: true,
    sheet: sheetName,
    patient: parsed.patient,
    questionnaires: parsed.questionnaires,
  };
}

function readPatientMeta_(sheet) {
  const stored = sheet.getRange(1, META_COLUMN).getValue();
  if (stored) {
    try {
      const data = JSON.parse(stored);
      return {
        sheet: sheet.getName(),
        name: data.patient.name,
        date: data.patient.date,
        submittedAt: data.patient.submittedAt,
        questionnaireCount: data.questionnaires ? data.questionnaires.length : 0,
      };
    } catch (err) {
      // fall through
    }
  }

  const name = sheet.getRange(3, 2).getValue();
  if (!name || name === '') return null;

  return {
    sheet: sheet.getName(),
    name: String(name),
    date: String(sheet.getRange(4, 2).getValue() || ''),
    submittedAt: String(sheet.getRange(5, 2).getValue() || ''),
    questionnaireCount: 0,
  };
}

function parsePatientSheet_(sheet) {
  const patient = {
    name: String(sheet.getRange(3, 2).getValue() || ''),
    date: String(sheet.getRange(4, 2).getValue() || ''),
    submittedAt: String(sheet.getRange(5, 2).getValue() || ''),
  };

  const lastRow = sheet.getLastRow();
  const data = sheet.getRange(1, 1, lastRow, 3).getValues();
  const questionnaires = [];
  let current = null;

  for (var i = 0; i < data.length; i++) {
    const colA = String(data[i][0] || '').trim();
    const colB = String(data[i][1] || '').trim();
    const colC = data[i][2];

    if (colA === 'Ερώτηση' && colB === 'Απάντηση') continue;
    if (colA === 'Βαθμολογίες HADS') continue;
    if (colA === 'Άγχος (A)' || colA === 'Κατάθλιψη (D)' || colA === 'Σύνολο') continue;
    if (!colA || colA === 'Ερωτηματολόγια Ασθενούς') continue;
    if (colA === 'Ονοματεπώνυμο' || colA === 'Ημερομηνία' || colA === 'Υποβλήθηκε') continue;

    if (colB === '' && colC === '' && colA.length > 3) {
      if (current) questionnaires.push(current);
      current = { title: colA, shortTitle: '', answers: {} };
      continue;
    }

    if (current && colA && colB) {
      current.answers[colA] = colC !== '' && colC !== null ? colC : colB;
    }
  }

  if (current) questionnaires.push(current);

  return { patient: patient, questionnaires: questionnaires };
}

function buildSheetName_(patient) {
  const datePart = patient.date ? patient.date.replace(/-/g, '') : '';
  const namePart = patient.name
    .replace(/[^\w\u0370-\u03FF\u1F00-\u1FFF\s]/g, '')
    .trim()
    .substring(0, 30);
  let sheetName = namePart + '_' + datePart;

  if (sheetName.length > 100) {
    sheetName = sheetName.substring(0, 100);
  }

  return sheetName || 'Patient_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
}

function createPatientSheet_(ss, name) {
  let uniqueName = name;
  let counter = 1;

  while (ss.getSheetByName(uniqueName)) {
    uniqueName = name + '_' + counter;
    counter++;
  }

  return ss.insertSheet(uniqueName);
}

function writePatientData_(sheet, data) {
  writePatientHeader_(sheet, data.patient);
  writeQuestionnaires_(sheet, data.questionnaires);

  const meta = {
    patient: data.patient,
    questionnaires: data.questionnaires,
  };
  sheet.getRange(1, META_COLUMN).setValue(JSON.stringify(meta));
  sheet.hideColumns(META_COLUMN);
}

function writePatientHeader_(sheet, patient) {
  const rows = [
    ['Ερωτηματολόγια Ασθενούς', ''],
    ['', ''],
    ['Ονοματεπώνυμο', patient.name],
    ['Ημερομηνία', patient.date],
    ['Υποβλήθηκε', patient.submittedAt || new Date().toISOString()],
    ['', ''],
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.getRange(3, 1).setFontWeight('bold');
}

function writeQuestionnaires_(sheet, questionnaires) {
  var row = 8;

  questionnaires.forEach(function(q) {
    sheet.getRange(row, 1).setValue(q.title).setFontWeight('bold').setFontSize(12);
    row++;

    sheet.getRange(row, 1, 1, 3).setValues([['Ερώτηση', 'Απάντηση', 'Τιμή']]);
    sheet.getRange(row, 1, 1, 3).setFontWeight('bold').setBackground('#e8f4f3');
    row++;

    const answerEntries = getAnswerEntries_(q);
    answerEntries.forEach(function(entry) {
      sheet.getRange(row, 1, 1, 3).setValues([[entry[0], entry[1], entry[2] !== undefined ? entry[2] : '']]);
      row++;
    });

    if (q.scores) {
      row++;
      sheet.getRange(row, 1).setValue('Βαθμολογίες HADS').setFontWeight('bold');
      row++;
      sheet.getRange(row, 1, 1, 2).setValues([['Άγχος (A)', q.scores.anxiety]]);
      row++;
      sheet.getRange(row, 1, 1, 2).setValues([['Κατάθλιψη (D)', q.scores.depression]]);
      row++;
      sheet.getRange(row, 1, 1, 2).setValues([['Σύνολο', q.scores.total]]);
      row++;
    }

    row += 2;
  });

  sheet.autoResizeColumns(1, 3);
  sheet.setColumnWidth(1, 280);
  sheet.setColumnWidth(2, 200);
}

function getAnswerEntries_(q) {
  if (q.answerRows && q.answerRows.length) {
    return q.answerRows.map(function(row) {
      return [row.question, row.answer, row.value];
    });
  }
  return flattenAnswers_(q.answers);
}

function flattenAnswers_(answers) {
  const entries = [];

  Object.keys(answers).forEach(function(key) {
    const value = answers[key];
    if (value === undefined || value === '') return;

    let label = String(value);
    if (value === 'yes') label = 'ΝΑΙ';
    else if (value === 'no') label = 'ΟΧΙ';
    else if (value === 'true') label = 'Σωστό';
    else if (value === 'false') label = 'Λάθος';

    entries.push([key, label, value]);
  });

  return entries;
}
