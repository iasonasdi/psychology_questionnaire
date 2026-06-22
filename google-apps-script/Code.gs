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
const STATUS_PENDING = 'pending';
const STATUS_SUBMITTED = 'submitted';

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
    const sheet = getIssuedSheetForSubmission_(ss, data.patient);
    const existingMeta = readSheetMeta_(sheet) || {};
    const patient = buildSubmissionPatient_(existingMeta.patient || {}, data.patient);

    writePatientData_(sheet, {
      patient: patient,
      questionnaires: data.questionnaires,
    });

    return jsonResponse_({ success: true, sheet: sheet.getName(), code: patient.code });
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

    if (action === 'generate') {
      checkAdminKey_(e);
      return jsonResponse_(generateQuestionnaire_(e.parameter.date || ''));
    }

    if (action === 'validate') {
      return jsonResponse_(validateCode_(e.parameter.code || ''));
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

/**
 * Run once from Apps Script if older versions hid patient sheets.
 * Extensions → Apps Script → select revealAllPatientSheets → Run
 */
function revealAllPatientSheets() {
  const ss = getSpreadsheet_();
  var count = 0;
  ss.getSheets().forEach(function(sheet) {
    if (readPatientMeta_(sheet)) {
      sheet.showSheet();
      count++;
    }
  });
  Logger.log('Revealed ' + count + ' patient sheet(s) in: ' + ss.getName());
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
    return new Date(b.issuedAt || 0) - new Date(a.issuedAt || 0);
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
    const haystack = [
      p.code || '',
      p.name || '',
      p.sheet || '',
      p.date || '',
      p.status || '',
    ].join(' ').toLowerCase();
    return words.every(function(w) { return haystack.indexOf(w) !== -1; });
  });

  return { success: true, total: filtered.length, patients: filtered };
}

function getStats_() {
  const result = listPatients_();
  const pending = result.patients.filter(function(p) { return p.status === STATUS_PENDING; }).length;
  const submitted = result.patients.filter(function(p) { return p.status === STATUS_SUBMITTED; }).length;
  return {
    success: true,
    totalPatients: result.total,
    pending: pending,
    submitted: submitted,
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
  const data = readSheetMeta_(sheet);
  if (!data || !data.patient) return null;

  if (data.patient.code) {
    return {
      sheet: sheet.getName(),
      code: data.patient.code,
      date: data.patient.date || '',
      issuedAt: data.patient.issuedAt || '',
      submittedAt: data.patient.submittedAt || '',
      status: data.patient.status || STATUS_PENDING,
      questionnaireCount: data.questionnaires ? data.questionnaires.length : 0,
    };
  }

  return {
    sheet: sheet.getName(),
    name: data.patient.name || '',
    date: data.patient.date || '',
    issuedAt: data.patient.submittedAt || '',
    submittedAt: data.patient.submittedAt || '',
    status: STATUS_SUBMITTED,
    questionnaireCount: data.questionnaires ? data.questionnaires.length : 0,
  };
}

function parsePatientSheet_(sheet) {
  const patient = {
    code: String(sheet.getRange(3, 2).getValue() || ''),
    date: String(sheet.getRange(4, 2).getValue() || ''),
    issuedAt: String(sheet.getRange(5, 2).getValue() || ''),
    status: String(sheet.getRange(6, 2).getValue() || STATUS_PENDING),
    submittedAt: String(sheet.getRange(7, 2).getValue() || ''),
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
    if (colA === 'Κωδικός' || colA === 'Ημερομηνία' || colA === 'Εκδόθηκε' || colA === 'Κατάσταση' || colA === 'Υποβλήθηκε') continue;

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
  const codePart = String(patient.code || '')
    .replace(/[^\w-]/g, '')
    .trim()
    .substring(0, 40);
  let sheetName = codePart + '_' + datePart;

  if (sheetName.length > 100) {
    sheetName = sheetName.substring(0, 100);
  }

  return sheetName || 'Questionnaire_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
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
  sheet.clear();
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
    ['Κωδικός', patient.code],
    ['Ημερομηνία', patient.date],
    ['Εκδόθηκε', patient.issuedAt || ''],
    ['Κατάσταση', patient.status || STATUS_PENDING],
    ['Υποβλήθηκε', patient.submittedAt || ''],
    ['', ''],
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1).setFontWeight('bold').setFontSize(14);
  sheet.getRange(3, 1, 5, 1).setFontWeight('bold');
}

function writeQuestionnaires_(sheet, questionnaires) {
  var row = 10;

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

function generateQuestionnaire_(date) {
  const normalizedDate = normalizeDate_(date);
  const ss = getSpreadsheet_();
  const patient = {
    code: generateUniqueCode_(ss),
    date: normalizedDate,
    issuedAt: new Date().toISOString(),
    submittedAt: '',
    status: STATUS_PENDING,
  };
  const sheet = createPatientSheet_(ss, buildSheetName_(patient));
  writePatientData_(sheet, {
    patient: patient,
    questionnaires: [],
  });

  return {
    success: true,
    code: patient.code,
    date: patient.date,
    issuedAt: patient.issuedAt,
    status: patient.status,
    sheet: sheet.getName(),
  };
}

function normalizeDate_(value) {
  if (!value) {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const match = String(value).match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) {
    throw new Error('Invalid date. Use YYYY-MM-DD.');
  }
  return value;
}

function generateUniqueCode_(ss) {
  for (var i = 0; i < 50; i++) {
    const code = 'PQ-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase();
    if (!findSheetByCode_(ss, code)) {
      return code;
    }
  }
  throw new Error('Could not generate a unique code.');
}

function findSheetByCode_(ss, code) {
  const sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    const meta = readSheetMeta_(sheets[i]);
    if (meta && meta.patient && meta.patient.code === code) {
      return sheets[i];
    }
  }
  return null;
}

function readSheetMeta_(sheet) {
  const stored = sheet.getRange(1, META_COLUMN).getValue();
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (err) {
    return null;
  }
}

function getIssuedSheetForSubmission_(ss, patient) {
  const code = String(patient.code || '').trim();
  if (!code) {
    throw new Error('Missing questionnaire code.');
  }

  const sheet = findSheetByCode_(ss, code);
  if (!sheet) {
    throw new Error('Questionnaire code not found.');
  }

  const meta = readSheetMeta_(sheet);
  if (!meta || !meta.patient) {
    throw new Error('Issued questionnaire record is invalid.');
  }

  if (meta.patient.status === STATUS_SUBMITTED) {
    throw new Error('This questionnaire has already been submitted.');
  }

  return sheet;
}

function buildSubmissionPatient_(issuedPatient, submittedPatient) {
  return {
    code: issuedPatient.code || submittedPatient.code || '',
    date: issuedPatient.date || submittedPatient.date || '',
    issuedAt: issuedPatient.issuedAt || '',
    submittedAt: new Date().toISOString(),
    status: STATUS_SUBMITTED,
  };
}

function validateCode_(code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) {
    return { success: false, errorCode: 'missing', error: 'Missing questionnaire code.' };
  }

  const ss = getSpreadsheet_();
  const sheet = findSheetByCode_(ss, normalized);
  if (!sheet) {
    return { success: false, errorCode: 'not_found', error: 'Questionnaire code not found.' };
  }

  const meta = readSheetMeta_(sheet);
  if (!meta || !meta.patient) {
    return { success: false, errorCode: 'invalid', error: 'Issued questionnaire record is invalid.' };
  }

  if (meta.patient.status === STATUS_SUBMITTED) {
    return {
      success: false,
      errorCode: 'already_submitted',
      error: 'This questionnaire has already been submitted.',
    };
  }

  return {
    success: true,
    code: meta.patient.code,
    date: meta.patient.date,
    status: meta.patient.status,
  };
}
