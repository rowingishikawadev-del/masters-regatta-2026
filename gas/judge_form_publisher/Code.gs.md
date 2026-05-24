/**
 * ============================================================
 *  マスターズ判定員帳票生成 (Code.gs)
 *  Version: 0.5.3 (2026/05/21)
 *  Changes:
 *   - v0.5.3 (2026/05/21): 団体名・クルー名のどちらかがある場合のみカテゴリー記入（両方空ならカテゴリーも空）
 *   - v0.5.2 (2026/05/21): カテゴリー書き込みを setValues 一括方式に変更 + ファイル名を日付のみに短縮（YYYY-MM-DD.pdf）+ entry内容ログ強化
 *   - v0.5.1 (2026/05/21): カテゴリー書き込み後のリードバック検証ログ追加（実行ログで実際の値を確認）
 *   - v0.5.0 (2026/05/21): 雛形構造変更対応 — 印刷範囲 A1:I7、レーン列 D〜I、ヘッダー行2、レーン行5-7
 *   - v0.4.3 (2026/05/21): セル結合を breakApart で解除してから書き込み（Race1 でカテゴリー欠落バグ対策）+ 書き込みログ追加
 *   - v0.4.2 (2026/05/21): 単一カテゴリーレースで age_group を全レーンの category として書き込み
 *   - v0.4.1 (2026/05/21): 一時Spreadsheetを雛形コピーで作成（Range.copyToのクロスSpreadsheet制約を回避）
 *   - v0.4.0 (2026/05/21): testGenerateRace1And2() 追加（フォーマット確認用・Race 1,2 のみ書き出し）
 *   - v0.3.0 (2026/05/21): 印刷範囲を A1:M8 → A1:K8 に変更
 *   - v0.2.0 (2026/05/21): A4縦→A4横に変更、印刷範囲 A1:M8 固定
 *   - v0.1.0 (2026/05/21): 初版
 * ============================================================
 * GitHub の data/master.json から大会日ごとの判定員用帳票PDFを手動生成する。
 * 既存のマスターズPDF生成GASとは完全独立。
 */
const JUDGE_FORM_PUBLISHER_VERSION = '0.5.3 (2026/05/21)';

const CONFIG_KEYS = {
  githubRepo: 'GITHUB_REPO',
  githubBranch: 'GITHUB_BRANCH',
  githubToken: 'GITHUB_TOKEN',
  templateSheetId: 'TEMPLATE_SHEET_ID',
  outputFolderId: 'OUTPUT_FOLDER_ID'
};

const DEFAULT_CONFIG = {
  GITHUB_REPO: 'rowingishikawadev-del/masters-regatta-2026',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: '',
  TEMPLATE_SHEET_ID: '1Q37f2gAgfLwIr2snBjLUiZKcUEr99wr97NjbhDNFRHc',
  OUTPUT_FOLDER_ID: '1LHAVHRnwVgMaQL4ipaDGa6HINz-9oXkn'
};

const MASTER_JSON_PATH = 'data/master.json';
const JST_TIMEZONE = 'Asia/Tokyo';
const JUDGE_TEMPLATE_RANGE_A1 = 'A1:I7';
const JUDGE_MAX_LANE = 6;
const JUDGE_FIRST_LANE_COL = 4;
// 新雛形（v0.5.0〜）のセル位置定数
const JUDGE_HEADER_VALUE_ROW = 2;       // race_no / レース時間 / 種目名 / age_group の行
const JUDGE_HEADER_RACE_NO_COL = 1;     // A2
const JUDGE_HEADER_RACE_TIME_COL = 2;   // B2
const JUDGE_HEADER_EVENT_NAME_COL = 4;  // D2
const JUDGE_HEADER_AGE_GROUP_COL = 9;   // I2
const JUDGE_LANE_AFFILIATION_ROW = 5;
const JUDGE_LANE_CREW_ROW = 6;
const JUDGE_LANE_CATEGORY_ROW = 7;

function generateAllJudgeForms() {
  Logger.log('=== generateAllJudgeForms start v' + JUDGE_FORM_PUBLISHER_VERSION + ' ===');
  const config = getConfig_();
  const masterData = fetchMasterData_(config);
  const dates = getTournamentDates_(masterData);

  if (dates.length === 0) {
    throw new Error('master.json の tournament.dates が空です。');
  }

  dates.forEach(function(dateStr) {
    generateJudgeFormForDate(dateStr, masterData);
  });

  Logger.log('=== generateAllJudgeForms done v' + JUDGE_FORM_PUBLISHER_VERSION + ' count=' + dates.length + ' ===');
}

function generateJudgeFormForDate(dateStr, masterData) {
  Logger.log('=== generateJudgeFormForDate start v' + JUDGE_FORM_PUBLISHER_VERSION + ' date=' + dateStr + ' ===');
  const config = getConfig_();
  const loadedMasterData = masterData || fetchMasterData_(config);
  const normalizedDate = normalizeDateString_(dateStr);
  const races = getScheduleArray_(loadedMasterData)
    .filter(function(race) {
      return normalizeDateString_(race.date) === normalizedDate;
    })
    .sort(function(a, b) {
      return Number(a.race_no || 0) - Number(b.race_no || 0);
    });

  if (races.length === 0) {
    throw new Error('対象日のレースが見つかりません: ' + dateStr);
  }

  // 雛形 Spreadsheet を一時コピーとして作成（Range.copyTo は同一 Spreadsheet 内のみ可のため）
  const templateFile = DriveApp.getFileById(config.templateSheetId);
  const tmpTitle = 'tmp_judge_forms_' + normalizedDate.replace(/\//g, '-') + '_' + Date.now();
  const tmpFile = templateFile.makeCopy(tmpTitle);
  const tempSpreadsheet = SpreadsheetApp.openById(tmpFile.getId());
  const spreadsheetId = tempSpreadsheet.getId();

  try {
    const templateSheet = tempSpreadsheet.getSheets()[0];

    races.forEach(function(race, index) {
      const sheetName = buildSheetName_(race, index);
      let sheet;
      if (index === 0) {
        sheet = templateSheet;
        sheet.setName(sheetName);
      } else {
        sheet = templateSheet.copyTo(tempSpreadsheet).setName(sheetName);
      }
      populateJudgeSheet_(sheet, race);
      Logger.log('帳票シート作成: date=' + normalizedDate + ' race_no=' + race.race_no + ' sheet=' + sheetName);
    });

    SpreadsheetApp.flush();

    const fileName = normalizedDate.replace(/\//g, '-') + '.pdf';
    const pdfBlob = exportJudgeFormPdf_(spreadsheetId, fileName);
    const outputFolder = DriveApp.getFolderById(config.outputFolderId);
    trashExistingFileByName_(outputFolder, fileName);
    const createdFile = outputFolder.createFile(pdfBlob).setName(fileName);

    Logger.log('PDF生成完了: ' + fileName + ' races=' + races.length + ' fileId=' + createdFile.getId());
    return createdFile;
  } finally {
    DriveApp.getFileById(spreadsheetId).setTrashed(true);
    Logger.log('一時Spreadsheetをゴミ箱へ移動: ' + spreadsheetId);
  }
}

function populateJudgeSheet_(sheet, race) {
  // ヘッダー値（行2）
  sheet.getRange(JUDGE_HEADER_VALUE_ROW, JUDGE_HEADER_RACE_NO_COL).setValue(race.race_no || '');
  sheet.getRange(JUDGE_HEADER_VALUE_ROW, JUDGE_HEADER_RACE_TIME_COL).setValue(composeRaceTime_(race.date, race.time));
  sheet.getRange(JUDGE_HEADER_VALUE_ROW, JUDGE_HEADER_EVENT_NAME_COL).setValue(race.event_name || '');
  sheet.getRange(JUDGE_HEADER_VALUE_ROW, JUDGE_HEADER_AGE_GROUP_COL).setValue(race.age_group || '');

  // レーンデータ範囲（行5〜7, 列 D〜I）のセル結合を解除
  try {
    sheet.getRange(JUDGE_LANE_AFFILIATION_ROW, JUDGE_FIRST_LANE_COL, 3, JUDGE_MAX_LANE).breakApart();
  } catch (mergeError) {
    Logger.log('breakApart 警告: ' + mergeError);
  }

  // 単一カテゴリーレース（age_group が 1 文字）はその文字を全レーンに入れる
  const ageGroup = String(race.age_group || '');
  const isSingleCategory = ageGroup.length === 1;

  // 6レーン分の配列を準備（lane 1〜6 順）
  const affiliations = [];
  const crews = [];
  const categories = [];
  const entries = getRaceEntries_(race);

  for (let lane = 1; lane <= JUDGE_MAX_LANE; lane++) {
    const entry = entries.find(function(e) { return Number(e.lane) === lane; }) || {};
    const crewName = String(entry.crew_name || '').trim();
    const affiliationName = String(entry.affiliation || '').trim();
    // 団体名・クルー名のどちらかがある場合のみカテゴリー記入。両方空ならカテゴリーも空。
    const hasData = crewName !== '' || affiliationName !== '';
    const category = hasData ? (entry.category || (isSingleCategory ? ageGroup : '')) : '';
    affiliations.push(entry.affiliation || '');
    crews.push(entry.crew_name || '');
    categories.push(category);
    Logger.log('entry race=' + race.race_no + ' lane=' + lane + ' hasData=' + hasData + ' category=' + (entry.category || '') + ' final=' + category + ' affiliation=' + affiliationName + ' crew=' + crewName);
  }

  // setValues で1行ずつ一括書き込み
  sheet.getRange(JUDGE_LANE_AFFILIATION_ROW, JUDGE_FIRST_LANE_COL, 1, JUDGE_MAX_LANE).setValues([affiliations]);
  sheet.getRange(JUDGE_LANE_CREW_ROW, JUDGE_FIRST_LANE_COL, 1, JUDGE_MAX_LANE).setValues([crews]);
  sheet.getRange(JUDGE_LANE_CATEGORY_ROW, JUDGE_FIRST_LANE_COL, 1, JUDGE_MAX_LANE).setValues([categories]);

  // 書き込み後の確認: getValues でリードバック
  SpreadsheetApp.flush();
  const readBack = sheet.getRange(JUDGE_LANE_CATEGORY_ROW, JUDGE_FIRST_LANE_COL, 1, JUDGE_MAX_LANE).getValues()[0];
  Logger.log('verify race=' + race.race_no + ' categories(row=' + JUDGE_LANE_CATEGORY_ROW + ')=' + JSON.stringify(readBack));

  Logger.log('populateJudgeSheet_ done v' + JUDGE_FORM_PUBLISHER_VERSION + ' race_no=' + (race.race_no || ''));
}

function exportJudgeFormPdf_(spreadsheetId, fileName) {
  Logger.log('PDF export start v' + JUDGE_FORM_PUBLISHER_VERSION + ' spreadsheetId=' + spreadsheetId + ' fileName=' + fileName);
  // A4 横・モノクロ・印刷範囲 A1:I7（r1=0..r2=7, c1=0..c2=9 の0-indexed・半開区間）
  const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?' +
    'format=pdf&size=A4&portrait=false&fitw=true&top_margin=0.25&bottom_margin=0.25&left_margin=0.25&right_margin=0.25' +
    '&gridlines=false&printtitle=false&sheetnames=false&pagenum=false&horizontal_alignment=CENTER&vertical_alignment=TOP' +
    '&scale=4&blackandwhite=true' +
    '&r1=0&c1=0&r2=7&c2=9';
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken()
    }
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('PDF export失敗: status=' + status + ' body=' + response.getContentText().substring(0, 500));
  }
  return response.getBlob().setName(fileName);
}

function composeRaceTime_(date, time) {
  const normalizedDate = normalizeDateString_(date);
  const normalizedTime = String(time || '').trim();
  return normalizedDate + '　' + normalizedTime;
}

function fetchMasterData_(config) {
  Logger.log('master.json fetch start v' + JUDGE_FORM_PUBLISHER_VERSION);
  const text = fetchText_(buildRawUrl_(config, MASTER_JSON_PATH), config);
  const masterData = JSON.parse(text);
  Logger.log('master.json fetch done bytes=' + text.length);
  return masterData;
}

function testGenerateDay1() {
  generateJudgeFormForDate('2026/05/23');
}

function testGenerateDay2() {
  generateJudgeFormForDate('2026/05/24');
}

function testGenerateAllDays() {
  generateAllJudgeForms();
}

/**
 * フォーマット確認用テスト: 1日目のレース1とレース2のみ書き出す。
 * 出力ファイル名: TEST_判定員帳票_Race1-2.pdf
 */
function testGenerateRace1And2() {
  Logger.log('=== testGenerateRace1And2 start v' + JUDGE_FORM_PUBLISHER_VERSION + ' ===');
  const config = getConfig_();
  const masterData = fetchMasterData_(config);
  const races = getScheduleArray_(masterData)
    .filter(function(race) { return Number(race.race_no) === 1 || Number(race.race_no) === 2; })
    .sort(function(a, b) { return Number(a.race_no || 0) - Number(b.race_no || 0); });

  if (races.length === 0) throw new Error('Race 1, 2 が schedule に見つかりません');

  const templateFile = DriveApp.getFileById(config.templateSheetId);
  const tmpFile = templateFile.makeCopy('tmp_judge_forms_TEST_Race1-2_' + Date.now());
  const tempSpreadsheet = SpreadsheetApp.openById(tmpFile.getId());
  const spreadsheetId = tempSpreadsheet.getId();

  try {
    const templateSheet = tempSpreadsheet.getSheets()[0];

    races.forEach(function(race, index) {
      const sheetName = buildSheetName_(race, index);
      let sheet;
      if (index === 0) {
        sheet = templateSheet;
        sheet.setName(sheetName);
      } else {
        sheet = templateSheet.copyTo(tempSpreadsheet).setName(sheetName);
      }
      populateJudgeSheet_(sheet, race);
      Logger.log('帳票シート作成: race_no=' + race.race_no + ' sheet=' + sheetName);
    });

    SpreadsheetApp.flush();

    const fileName = 'TEST_判定員帳票_Race1-2.pdf';
    const pdfBlob = exportJudgeFormPdf_(spreadsheetId, fileName);
    const outputFolder = DriveApp.getFolderById(config.outputFolderId);
    trashExistingFileByName_(outputFolder, fileName);
    const createdFile = outputFolder.createFile(pdfBlob).setName(fileName);

    Logger.log('TEST PDF生成完了: ' + fileName + ' races=' + races.length + ' fileId=' + createdFile.getId());
    return createdFile;
  } finally {
    DriveApp.getFileById(spreadsheetId).setTrashed(true);
    Logger.log('一時Spreadsheetをゴミ箱へ移動: ' + spreadsheetId);
  }
}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  return {
    githubRepo: properties[CONFIG_KEYS.githubRepo] || DEFAULT_CONFIG.GITHUB_REPO,
    githubBranch: properties[CONFIG_KEYS.githubBranch] || DEFAULT_CONFIG.GITHUB_BRANCH,
    githubToken: properties[CONFIG_KEYS.githubToken] || DEFAULT_CONFIG.GITHUB_TOKEN,
    templateSheetId: properties[CONFIG_KEYS.templateSheetId] || DEFAULT_CONFIG.TEMPLATE_SHEET_ID,
    outputFolderId: properties[CONFIG_KEYS.outputFolderId] || DEFAULT_CONFIG.OUTPUT_FOLDER_ID
  };
}

function getTournamentDates_(masterData) {
  const dates = masterData && masterData.tournament && masterData.tournament.dates;
  if (!Array.isArray(dates)) return [];
  return dates.map(normalizeDateString_).filter(function(dateStr) { return dateStr; });
}

function getScheduleArray_(masterData) {
  if (!masterData) return [];
  if (Array.isArray(masterData.schedule)) return masterData.schedule;
  if (masterData.schedule && Array.isArray(masterData.schedule.races)) return masterData.schedule.races;
  return [];
}

function getRaceEntries_(race) {
  if (!race || !Array.isArray(race.entries)) return [];
  return race.entries
    .slice()
    .sort(function(a, b) {
      return Number(a.lane || 0) - Number(b.lane || 0);
    });
}

function copyTemplateRange_(templateSheet, sheet) {
  templateSheet.getRange(JUDGE_TEMPLATE_RANGE_A1).copyTo(sheet.getRange(JUDGE_TEMPLATE_RANGE_A1), { contentsOnly: false });
  copySheetDimensions_(templateSheet, sheet);
  sheet.setFrozenRows(0);
  sheet.setFrozenColumns(0);
  sheet.getRange(JUDGE_TEMPLATE_RANGE_A1).activate();
}

function copySheetDimensions_(sourceSheet, targetSheet) {
  for (let col = 1; col <= 13; col++) {
    targetSheet.setColumnWidth(col, sourceSheet.getColumnWidth(col));
  }
  for (let row = 1; row <= 8; row++) {
    targetSheet.setRowHeight(row, sourceSheet.getRowHeight(row));
  }
}

function buildSheetName_(race, index) {
  const raceNo = String(race.race_no || index + 1);
  return ('R' + raceNo).substring(0, 100);
}

function trashExistingFileByName_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  let count = 0;
  while (files.hasNext()) {
    files.next().setTrashed(true);
    count++;
  }
  if (count > 0) {
    Logger.log('既存同名PDFをゴミ箱へ移動: ' + fileName + ' count=' + count);
  }
}

function normalizeDateString_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, JST_TIMEZONE, 'yyyy/MM/dd');
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return text;
  return match[1] + '/' + pad2_(match[2]) + '/' + pad2_(match[3]);
}

function pad2_(value) {
  return ('0' + Number(value)).slice(-2);
}

function buildRawUrl_(config, path) {
  return 'https://raw.githubusercontent.com/' + config.githubRepo + '/' + config.githubBranch + '/' + path;
}

function fetchText_(url, config) {
  const headers = { 'User-Agent': 'masters-regatta-judge-form-publisher' };
  if (config && config.githubToken) {
    headers.Authorization = 'token ' + config.githubToken;
  }

  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: headers
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('fetch失敗: status=' + status + ' url=' + url + ' body=' + response.getContentText().substring(0, 500));
  }
  return response.getContentText();
}
