/**
 * ============================================================
 *  マスターズレガッタ2026 試合結果PDF生成システム (Code.gs)
 *  Version: 0.15.3
 *  Last Updated: 2026/05/22
 *  Changes:
 *   - v0.15.3 (2026/05/22): 新雛形対応 — 「B」列削除、カテゴリと着順入れ替え、着順は手書きのためGAS書き込みスキップ（列が無ければ書かない）
 *   - v0.15.2 (2026/05/21): 日付正規化（ゼロ埋め）を強化。master.json の 2026/5/23 形式と 2026/05/23 形式を統一比較
 *   - v0.15.1 (2026/05/21): 準備資料を日付ごとに分割生成（実行時間制限対策）、ファイル名 レース前準備資料_YYYY-MM-DD.pdf
 *   - v0.15.0 (2026/05/21): 準備資料 雛形 gid=1774552995 使用・順位列を「レーン」表記対応・レーン1〜6固定（不在は空欄）
 *   - v0.14.3 (2026/05/21): CacheService.put を try-catch で囲み、サイズ超過時もエラーで止まらないように
 *   - v0.14.2 (2026/05/21): 備考の表記「カテゴリ」→「カテゴリー」変更、カテゴリ列検出は両対応
 *   - v0.14.0 (2026/05/21): API クォータ対策 — Contents API sha でレース変更検知（変更なし時は fetch せず）、トリガー間隔 1分→5分、master.json キャッシュ 240秒
 *   - v0.13.0 (2026/05/21): クルー名列を2段表示対応 — 上段に団体名・下段にクルー名
 *   - v0.12.0 (2026/05/21): 大会名動的書き込み + レース前準備資料生成 generatePreRaceBooklet() 追加（A4横モノクロ全レース1PDF）
 *   - v0.11.0 (2026/05/21): カテゴリ対応 — ヘッダ age_group / 順位表カテゴリ列 / 備考にカテゴリ別順位
 *   - v0.9.0 (2026/05/20): クリア時の既存PDFをゴミ箱→印刷済アーカイブフォルダに移動するよう変更
 *   - v0.8.0 (2026/05/20): サイト同期 — last_cleared_at で過去データ判定、サイトから消えたレースはDrive PDFも自動削除
 *   - v0.7.3 (2026/05/20): Race No. / レース時間 / 種目名 をラベル下のセルに書き込むよう修正（雛形の縦並び対応）
 *   - v0.7.1 (2026/05/20): 結果なし（results空/cleared:true）レースは PDF 生成スキップ
 *   - v0.7.0 (2026/05/20): GitHub API 認証対応 — Authorization ヘッダー付与、レート制限回避
 *   - v0.6.0 (2026/05/20): 安定運用対応 — initializeTemplate() 追加 / 順位列数値ベースの行検出に統一
 *   - v0.5.0 (2026/05/20): 雛形の2行ピッチに自動対応（データ行を検出して書き込み）
 *   - v0.4.0 (2026/05/20): テスト関数追加 (実race_NNN.json形式 / DNS・DNF対応確認)
 *   - v0.3.0 (2026/05/20): 実race_NNN.json形式対応・両形式統合
 *   - v0.2.0 (2026/05/20): 1ページ厳守(scale=4) / 500m込みダミー / 詳細ログ
 *   - v0.1.0 (2026/05/20): 初版
 * ============================================================
 * GitHubの race_NNN.json を監視し、変更があったレースだけPDFを再生成する。
 */
const PDF_PUBLISHER_VERSION = '0.15.3 (2026/05/22)';

const CONFIG_KEYS = {
  githubRepo: 'GITHUB_REPO',
  githubBranch: 'GITHUB_BRANCH',
  githubToken: 'GITHUB_TOKEN',
  templateSheetId: 'TEMPLATE_SHEET_ID',
  outputFolderId: 'PDF_OUTPUT_FOLDER_ID',
  archiveFolderId: 'PDF_ARCHIVE_FOLDER_ID'
};

const DEFAULT_CONFIG = {
  GITHUB_REPO: 'rowingishikawadev-del/masters-regatta-2026',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: '',
  TEMPLATE_SHEET_ID: '1A_CIgcyJ-1jp6qwIhxItDKpVtbMIRc8C5IGJajr0D7g',
  PDF_OUTPUT_FOLDER_ID: '1n74sgVFD40JIjDf06pltjKp77yBhs4mY',
  PDF_ARCHIVE_FOLDER_ID: '12a23a8CwR8f6yLMS_kt5C_M1ZnK1Xvp5'
};

const CACHE_KEYS = {
  master: 'PDF_PUBLISHER_MASTER_JSON',
  resultList: 'PDF_PUBLISHER_RESULT_LIST'
};

const RESULT_DIR = 'data/results';
const JST_TIMEZONE = 'Asia/Tokyo';
const RANKING_ROW_COUNT = 8;
const DEFAULT_INITIAL_RANKS = 6;
const LOCK_WAIT_MS = 500;
const MAX_RUNTIME_MS = 4 * 60 * 1000;
const STOP_BEFORE_MS = 25 * 1000;
const PRE_RACE_BOOKLET_FOLDER_ID = '1LHAVHRnwVgMaQL4ipaDGa6HINz-9oXkn';
const PRE_RACE_BOOKLET_FILENAME = 'レース前準備資料.pdf';
const BOOKLET_TEMPLATE_GID = 1774552995;  // 準備資料用テンプレートシートの gid

function initializeTemplate() {
  Logger.log('=== 雛形初期化開始 v' + PDF_PUBLISHER_VERSION + ' ===');
  const config = getConfig_();
  const sheet = SpreadsheetApp.openById(config.templateSheetId).getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  const header = findCell_(values, function(text) { return text === '順位' || text.indexOf('順位') !== -1; });
  if (!header) throw new Error('順位ヘッダーが見つかりません。');

  // 既存のデータ行（順位列に値あり or 行内に値あり）を検出
  const dataRows = [];
  for (let r = header.row + 1; r <= values.length && dataRows.length < RANKING_ROW_COUNT; r++) {
    const rowValues = values[r - 1] || [];
    const joined = rowValues.join('').trim();
    if (joined.indexOf('天候') !== -1 || joined.indexOf('協会') !== -1 || joined.indexOf('備考:') !== -1 || joined.indexOf('風向') !== -1 || joined.indexOf('風速') !== -1) break;
    if (joined !== '') dataRows.push(r);
  }

  if (dataRows.length < 1) throw new Error('既存のデータ行が見つかりません。雛形に最低1行のデータ行が必要です。');

  // 行ピッチを推測（2行ピッチ前提）
  let pitch = 2; // デフォルト
  if (dataRows.length >= 2) {
    pitch = dataRows[1] - dataRows[0];
  }
  Logger.log('検出された行ピッチ: ' + pitch);

  // DEFAULT_INITIAL_RANKS 行まで拡張
  while (dataRows.length < DEFAULT_INITIAL_RANKS) {
    dataRows.push(dataRows[dataRows.length - 1] + pitch);
  }

  // 順位列に 1〜DEFAULT_INITIAL_RANKS をベタ書き（既存値は上書き）
  for (let i = 0; i < DEFAULT_INITIAL_RANKS; i++) {
    sheet.getRange(dataRows[i], header.col).setValue(i + 1);
  }

  SpreadsheetApp.flush();
  Logger.log('雛形初期化完了: 順位列に 1〜' + DEFAULT_INITIAL_RANKS + ' を設定');
  Logger.log('データ行: ' + JSON.stringify(dataRows));
  return dataRows;
}

function processPendingPDFs() {
  Logger.log('=== PDF Publisher v' + PDF_PUBLISHER_VERSION + ' 実行開始 ===');
  const startedAt = Date.now();
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(LOCK_WAIT_MS);
  } catch (error) {
    Logger.log('ロック取得失敗のため終了: ' + error);
    return;
  }

  try {
    const config = getConfig_();
    const properties = PropertiesService.getScriptProperties();
    const masterData = fetchMasterData_(config);
    const raceFiles = listRaceFiles_(config);

    for (let i = 0; i < raceFiles.length; i++) {
      if (Date.now() - startedAt > MAX_RUNTIME_MS - STOP_BEFORE_MS) {
        Logger.log('実行時間上限が近いため次回へ持ち越し: index=' + i);
        break;
      }

      const raceFile = raceFiles[i];
      try {
        const hashKey = getHashKey_(raceFile.raceNo);
        const currentSha = raceFile.sha;
        const storedSha = properties.getProperty(hashKey);

        if (storedSha === currentSha) {
          Logger.log('変更なし: race_' + raceFile.raceNo + ' (sha一致)');
          continue;
        }

        const resultText = fetchText_(raceFile.downloadUrl, config);
        const resultJson = JSON.parse(resultText);
        // サイト (js/app.js) と同じ判定基準: cleared / last_cleared_at より古い updated_at は非表示
        const lastClearedAt = masterData && masterData.tournament && masterData.tournament.last_cleared_at;
        const isStale = lastClearedAt && resultJson.updated_at && resultJson.updated_at < lastClearedAt;
        const hasResults = resultJson
          && Array.isArray(resultJson.results)
          && resultJson.results.length > 0
          && !resultJson.cleared
          && !isStale;
        if (!hasResults) {
          // サイトから消えたレース → Drive の既存 PDF をアーカイブに移動して同期
          try {
            const outputFolder = DriveApp.getFolderById(config.outputFolderId);
            moveToArchive_(outputFolder, raceFile.raceNo + '.pdf', config.archiveFolderId);
          } catch (cleanupError) {
            Logger.log('既存PDFアーカイブ移動エラー race_' + raceFile.raceNo + ': ' + cleanupError);
          }
          Logger.log('結果なし/過去データのためスキップ + 既存PDFアーカイブ移動: race_' + raceFile.raceNo + (isStale ? ' (updated_at=' + resultJson.updated_at + ' < last_cleared_at=' + lastClearedAt + ')' : ''));
          properties.setProperty(hashKey, currentSha);
          continue;
        }

        generatePdf(raceFile.raceNo, masterData, resultJson);
        properties.setProperty(hashKey, currentSha);
        Logger.log('PDF生成完了: ' + raceFile.raceNo + '.pdf');
      } catch (raceError) {
        Logger.log('レース処理エラー race_' + raceFile.raceNo + ': ' + raceError);
      }
    }
  } catch (error) {
    Logger.log('processPendingPDFs エラー: ' + error);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function generatePdf(raceNo, masterData, resultData) {
  const config = getConfig_();
  const normalizedRaceNo = normalizeRaceNo_(raceNo);
  const loadedMasterData = masterData || fetchMasterData_(config);
  const loadedResultData = resultData || fetchRaceResult_(config, normalizedRaceNo);
  const tmpTitle = '_tmp_race_' + normalizedRaceNo + '_' + Utilities.formatDate(new Date(), JST_TIMEZONE, 'yyyyMMdd_HHmmss');
  const templateFile = DriveApp.getFileById(config.templateSheetId);
  const outputFolder = DriveApp.getFolderById(config.outputFolderId);
  const tmpFile = templateFile.makeCopy(tmpTitle);
  Logger.log('雛形コピー作成完了: ' + tmpFile.getId());

  try {
    const spreadsheet = SpreadsheetApp.openById(tmpFile.getId());
    populateSheet(spreadsheet, normalizedRaceNo, loadedMasterData, loadedResultData);
    Logger.log('populateSheet 完了');
    SpreadsheetApp.flush();
    Utilities.sleep(800);

    const pdfBlob = exportSpreadsheetPdf_(spreadsheet.getId(), normalizedRaceNo + '.pdf', spreadsheet.getSheets()[0].getSheetId());
    Logger.log('PDF export 完了: bytes=' + pdfBlob.getBytes().length);
    trashExistingPdf_(outputFolder, normalizedRaceNo + '.pdf');
    Logger.log('既存PDF削除完了');
    outputFolder.createFile(pdfBlob);
    Logger.log('PDF作成完了: ' + outputFolder.getId() + '/' + normalizedRaceNo + '.pdf');
    return { raceNo: normalizedRaceNo, fileName: normalizedRaceNo + '.pdf' };
  } finally {
    tmpFile.setTrashed(true);
  }
}

function populateSheet(spreadsheet, raceNo, masterData, resultData) {
  const sheet = spreadsheet.getSheets()[0];
  const values = sheet.getDataRange().getDisplayValues();
  const raceInfo = buildRaceInfo_(raceNo, masterData, resultData);

  writeTournamentName_(sheet, values, masterData);
  writePrintTime_(sheet, values);
  writeBelowLabel_(sheet, values, 'Race No.', raceNo);
  writeBelowLabel_(sheet, values, 'レース時間', raceInfo.raceTime);
  writeBelowLabel_(sheet, values, '種目名', raceInfo.eventName);
  writeBelowLabel_(sheet, values, 'カテゴリ', raceInfo.ageGroup);
  writeRoundValue_(sheet, values, raceInfo.roundName);
  writeRankingRows_(sheet, values, raceInfo.entries);
}

/**
 * 全日程の準備資料を日付ごとに分割生成する。
 * 各日付ごとに別 PDF（実行時間制限対策）。
 */
function generatePreRaceBooklet() {
  Logger.log('=== レース前準備資料生成開始 v' + PDF_PUBLISHER_VERSION + ' ===');
  const config = getConfig_();
  const masterData = fetchMasterData_(config);
  const dates = ((masterData.tournament || {}).dates || []).slice();
  if (dates.length === 0) throw new Error('tournament.dates が空です。');
  dates.forEach(function(d) {
    generatePreRaceBookletForDate(String(d).replace(/-/g, '/'), masterData);
  });
  Logger.log('=== 全日程の準備資料生成完了 dates=' + dates.length + ' ===');
}

/**
 * 指定日のレースだけで準備資料 PDF を生成する。
 * ファイル名: レース前準備資料_YYYY-MM-DD.pdf
 */
function normalizeDateKey_(s) {
  // 'YYYY/MM/DD' 形式に統一（ゼロ埋め）
  const parts = String(s || '').replace(/-/g, '/').split('/');
  if (parts.length !== 3) return '';
  return parts[0] + '/' + ('0' + parts[1].trim()).slice(-2) + '/' + ('0' + parts[2].trim()).slice(-2);
}

function generatePreRaceBookletForDate(dateStr, masterData) {
  Logger.log('=== generatePreRaceBookletForDate v' + PDF_PUBLISHER_VERSION + ' date=' + dateStr + ' ===');
  const config = getConfig_();
  const loadedMasterData = masterData || fetchMasterData_(config);
  const normalizedDate = normalizeDateKey_(dateStr);
  const schedule = (loadedMasterData.schedule || [])
    .filter(function(r) { return normalizeDateKey_(r.date) === normalizedDate; })
    .sort(function(a, b) { return (a.race_no || 0) - (b.race_no || 0); });
  if (schedule.length === 0) {
    Logger.log('対象日のレースなし: ' + dateStr);
    return;
  }

  const tmpTitle = '_tmp_pre_race_booklet_' + normalizedDate.replace(/\//g, '-') + '_' + Date.now();
  const templateFile = DriveApp.getFileById(config.templateSheetId);
  const tmpFile = templateFile.makeCopy(tmpTitle);
  const tmpSpreadsheet = SpreadsheetApp.openById(tmpFile.getId());
  Logger.log('一時Spreadsheet作成: ' + tmpFile.getId());

  try {
    // 準備資料用テンプレートシート（gid=1774552995）を使う
    const allSheets = tmpSpreadsheet.getSheets();
    let templateSheet = allSheets.find(function(s) { return s.getSheetId() === BOOKLET_TEMPLATE_GID; });
    if (!templateSheet) {
      Logger.log('警告: gid=' + BOOKLET_TEMPLATE_GID + ' のシートが見つからない。先頭シートを使用');
      templateSheet = allSheets[0];
    }
    allSheets.forEach(function(s) {
      if (s.getSheetId() !== templateSheet.getSheetId()) {
        try { tmpSpreadsheet.deleteSheet(s); } catch (e) { Logger.log('シート削除警告: ' + e); }
      }
    });

    schedule.forEach(function(race, idx) {
      let sheet;
      if (idx === 0) {
        sheet = templateSheet;
        sheet.setName('R' + String(race.race_no).padStart(3, '0'));
      } else {
        sheet = templateSheet.copyTo(tmpSpreadsheet);
        sheet.setName('R' + String(race.race_no).padStart(3, '0'));
      }
      populateSheetForPreRace_(sheet, race, loadedMasterData);
      Logger.log('シート生成完了: R' + race.race_no + ' (' + (idx + 1) + '/' + schedule.length + ')');
    });

    SpreadsheetApp.flush();
    Utilities.sleep(1500);

    const fileName = 'レース前準備資料_' + normalizedDate.replace(/\//g, '-') + '.pdf';
    const pdfBlob = exportBookletPdf_(tmpSpreadsheet.getId(), fileName);
    Logger.log('PDF export 完了: bytes=' + pdfBlob.getBytes().length);

    const targetFolder = DriveApp.getFolderById(PRE_RACE_BOOKLET_FOLDER_ID);
    const existing = targetFolder.getFilesByName(fileName);
    while (existing.hasNext()) existing.next().setTrashed(true);
    targetFolder.createFile(pdfBlob);
    Logger.log('PDF格納完了: ' + PRE_RACE_BOOKLET_FOLDER_ID + '/' + fileName);

    return { fileName: fileName, raceCount: schedule.length };
  } finally {
    tmpFile.setTrashed(true);
  }
}

function populateSheetForPreRace_(sheet, race, masterData) {
  const values = sheet.getDataRange().getDisplayValues();
  const raceTime = composeRaceTime_(race.date, race.time);
  const ageGroup = race.age_group || '';
  const roundName = decodeRound(race.round || '');

  writeTournamentName_(sheet, values, masterData);
  writePrintTime_(sheet, values);
  writeBelowLabel_(sheet, values, 'Race No.', String(race.race_no));
  writeBelowLabel_(sheet, values, 'レース時間', raceTime);
  writeBelowLabel_(sheet, values, '種目名', race.event_name || '');
  writeBelowLabel_(sheet, values, 'カテゴリ', ageGroup);
  writeRoundValue_(sheet, values, roundName);

  // レーン1〜6 固定（不在レーンは空欄、レーン番号は雛形ベタ書きを維持）
  // 500m / 1000m / 備考は空欄。
  const raceEntries = race.entries || [];
  const entries = [];
  for (let lane = 1; lane <= 6; lane++) {
    const e = raceEntries.find(function(x) { return Number(x.lane) === lane; });
    if (e) {
      entries.push([
        String(lane),                // 順位列（=レーン）の値
        e.affiliation || '',         // 団体名
        String(lane),                // B（レーン番号）
        e.category || '',
        '',                          // 500m
        '',                          // 1000m
        '',                          // 備考
        e.crew_name || ''            // クルー名
      ]);
    } else {
      entries.push([
        String(lane),                // レーン番号は固定で表示
        '',                          // 団体名空
        String(lane),                // レーン番号
        '',                          // カテゴリー空
        '',
        '',
        '',
        ''
      ]);
    }
  }
  writeRankingRows_(sheet, values, entries);
}

function decodeRound(code) {
  const map = {
    FA: '決勝A', FB: '決勝B', FC: '決勝C', F: '決勝',
    SA: '準決A', SB: '準決B', SC: '準決C', S: '準決',
    R: '敗復', RA: '敗復A', RB: '敗復B',
    H: '予選', HA: '予選A', HB: '予選B', HC: '予選C', HD: '予選D'
  };
  return map[code] || code || '';
}

function testRunOnce() {
  processPendingPDFs();
}

function testGenerateRace1() {
  const config = getConfig_();
  const masterData = fetchMasterData_(config);
  const dummyResult = {
    race_no: 1,
    results: [
      { rank: 1, lane: 4, category: 'F', affiliation: 'ＲⅭ神戸', crew_name: 'ＲＣ神戸　なでしこＯｈバーン', time_500: '1:38.20', time_1000: '3:24.50', note: '' },
      { rank: 2, lane: 2, category: 'D', affiliation: '愛知東郷ボートクラブ', crew_name: '愛知東郷ボートクラブ', time_500: '1:42.50', time_1000: '3:31.20', note: '' },
      { rank: 3, lane: 5, category: 'F', affiliation: '瀬田漕艇クラブ', crew_name: '瀬田漕艇クラブ', time_500: '1:44.00', time_1000: '3:34.80', note: '' },
      { rank: 4, lane: 1, category: 'D', affiliation: 'Ｅ．Ｒ．Ｃ．Ｃ', crew_name: 'Ｅ．Ｒ．Ｃ．Ｃ　Ｗ４Ｘ＋　Ｄ', time_500: '1:45.30', time_1000: '3:38.10', note: '' },
      { rank: 5, lane: 3, category: 'E', affiliation: 'ボート団塊号', crew_name: '宮ヶ瀬', time_500: '1:47.10', time_1000: '3:42.60', note: '' },
      { rank: 6, lane: 6, category: 'F', affiliation: '浜寺マスターズクラブ', crew_name: '浜寺マスターズアマゾネスＢ', time_500: '1:51.80', time_1000: '3:48.30', note: '' }
    ]
  };
  return generatePdf('1', masterData, dummyResult);
}

function testGenerateBooklet() {
  return generatePreRaceBooklet();
}

function testGenerateBookletDay1() {
  return generatePreRaceBookletForDate('2026/05/23');
}

function testGenerateBookletDay2() {
  return generatePreRaceBookletForDate('2026/05/24');
}

function testGenerateRace1RealFormat() {
  const config = getConfig_();
  const masterData = fetchMasterData_(config);
  const dummyRealFormat = {
    race_no: 1,
    updated_at: new Date().toISOString(),
    results: [
      { lane: 4, rank: 1, times: { '500m': { time_ms: 98200, formatted: '1:38.20' }, '1000m': { time_ms: 204500, formatted: '3:24.50' } }, finish: { time_ms: 204500, formatted: '3:24.50' }, split: '', tie_group: '', photo_flag: false, note: '', status: 'finish' },
      { lane: 2, rank: 2, times: { '500m': { time_ms: 102500, formatted: '1:42.50' }, '1000m': { time_ms: 211200, formatted: '3:31.20' } }, finish: { time_ms: 211200, formatted: '3:31.20' }, split: '', tie_group: '', photo_flag: false, note: '', status: 'finish' },
      { lane: 5, rank: 3, times: { '500m': { time_ms: 104000, formatted: '1:44.00' }, '1000m': { time_ms: 214800, formatted: '3:34.80' } }, finish: { time_ms: 214800, formatted: '3:34.80' }, split: '', tie_group: '', photo_flag: false, note: '', status: 'finish' },
      { lane: 1, rank: 4, times: { '500m': { time_ms: 105300, formatted: '1:45.30' }, '1000m': { time_ms: 218100, formatted: '3:38.10' } }, finish: { time_ms: 218100, formatted: '3:38.10' }, split: '', tie_group: '', photo_flag: false, note: '', status: 'finish' },
      { lane: 3, rank: 5, times: { '500m': { time_ms: 107100, formatted: '1:47.10' }, '1000m': { time_ms: 222600, formatted: '3:42.60' } }, finish: { time_ms: 222600, formatted: '3:42.60' }, split: '', tie_group: '', photo_flag: false, note: '', status: 'finish' },
      { lane: 6, rank: 6, times: { '500m': { time_ms: 111800, formatted: '1:51.80' }, '1000m': { time_ms: 228300, formatted: '3:48.30' } }, finish: { time_ms: 228300, formatted: '3:48.30' }, split: '', tie_group: '', photo_flag: false, note: '', status: 'finish' }
    ]
  };
  return generatePdf('1', masterData, dummyRealFormat);
}

function testGenerateRace1Status() {
  const config = getConfig_();
  const masterData = fetchMasterData_(config);
  const dummyWithStatus = {
    race_no: 1,
    results: [
      { lane: 4, rank: 1, times: { '500m': { formatted: '1:38.20' }, '1000m': { formatted: '3:24.50' } }, status: 'finish', note: '' },
      { lane: 2, rank: 2, times: { '500m': { formatted: '1:42.50' }, '1000m': { formatted: '3:31.20' } }, status: 'finish', note: '' },
      { lane: 5, rank: 3, times: { '500m': { formatted: '1:44.00' }, '1000m': { formatted: '3:34.80' } }, status: 'finish', note: '' },
      { lane: 1, status: 'DNS', note: '' },
      { lane: 3, status: 'DNF', note: '' },
      { lane: 6, rank: 4, times: { '500m': { formatted: '1:51.80' }, '1000m': { formatted: '3:48.30' } }, status: 'finish', note: '' }
    ]
  };
  return generatePdf('1', masterData, dummyWithStatus);
}

function testClearAllHashes() {
  const properties = PropertiesService.getScriptProperties();
  const all = properties.getProperties();
  let deletedCount = 0;

  Object.keys(all).forEach(function(key) {
    if (key.indexOf('LAST_PROCESSED_HASH_') === 0) {
      properties.deleteProperty(key);
      deletedCount++;
    }
  });
  Logger.log('削除したハッシュ数: ' + deletedCount);
}

function getConfig_() {
  const properties = PropertiesService.getScriptProperties().getProperties();
  return {
    githubRepo: properties[CONFIG_KEYS.githubRepo] || DEFAULT_CONFIG.GITHUB_REPO,
    githubBranch: properties[CONFIG_KEYS.githubBranch] || DEFAULT_CONFIG.GITHUB_BRANCH,
    githubToken: properties[CONFIG_KEYS.githubToken] || DEFAULT_CONFIG.GITHUB_TOKEN,
    templateSheetId: properties[CONFIG_KEYS.templateSheetId] || DEFAULT_CONFIG.TEMPLATE_SHEET_ID,
    outputFolderId: properties[CONFIG_KEYS.outputFolderId] || DEFAULT_CONFIG.PDF_OUTPUT_FOLDER_ID,
    archiveFolderId: properties[CONFIG_KEYS.archiveFolderId] || DEFAULT_CONFIG.PDF_ARCHIVE_FOLDER_ID
  };
}

function moveToArchive_(folder, fileName, archiveFolderId) {
  if (!archiveFolderId) {
    // アーカイブフォルダ未設定 → ゴミ箱へフォールバック
    trashExistingPdf_(folder, fileName);
    return;
  }
  let archiveFolder;
  try {
    archiveFolder = DriveApp.getFolderById(archiveFolderId);
  } catch (e) {
    Logger.log('アーカイブフォルダ取得失敗 → ゴミ箱へフォールバック: ' + e);
    trashExistingPdf_(folder, fileName);
    return;
  }
  const files = folder.getFilesByName(fileName);
  let moved = 0;
  while (files.hasNext()) {
    const file = files.next();
    file.moveTo(archiveFolder);
    moved++;
  }
  if (moved > 0) {
    Logger.log('アーカイブに移動: ' + fileName + ' (' + moved + '件)');
  }
}

function fetchMasterData_(config) {
  const cache = CacheService.getScriptCache();
  const cached = cache.get(CACHE_KEYS.master);
  if (cached) return JSON.parse(cached);

  const text = fetchText_(buildRawUrl_(config, 'data/master.json'), config);
  try {
    cache.put(CACHE_KEYS.master, text, 240);
  } catch (cacheError) {
    Logger.log('master.json キャッシュ保存失敗（サイズ超過の可能性）: ' + cacheError);
  }
  return JSON.parse(text);
}

function listRaceFiles_(config) {
  const cache = CacheService.getScriptCache();
  const cacheKey = CACHE_KEYS.resultList + '_' + config.githubRepo + '_' + config.githubBranch;
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const url = 'https://api.github.com/repos/' + config.githubRepo + '/contents/' + RESULT_DIR + '?ref=' + config.githubBranch;
  const files = JSON.parse(fetchText_(url, config))
    .filter(function(item) { return item.type === 'file' && /^race_\d+\.json$/i.test(item.name); })
    .map(function(item) {
      const m = item.name.match(/^race_(\d+)\.json$/i);
      return {
        raceNo: m ? parseInt(m[1], 10) : null,
        fileName: item.name,
        downloadUrl: item.download_url || buildRawUrl_(config, RESULT_DIR + '/' + item.name),
        sha: item.sha
      };
    })
    .filter(function(item) { return item.raceNo !== null; })
    .sort(function(a, b) { return Number(a.raceNo) - Number(b.raceNo); });

  try {
    cache.put(cacheKey, JSON.stringify(files), 60);
  } catch (cacheError) {
    Logger.log('race files リスト キャッシュ保存失敗: ' + cacheError);
  }
  return files;
}

function fetchRaceResult_(config, raceNo) {
  const fileName = 'race_' + padRaceNo_(raceNo) + '.json';
  return JSON.parse(fetchText_(buildRawUrl_(config, RESULT_DIR + '/' + fileName), config));
}

function buildRawUrl_(config, path) {
  return 'https://raw.githubusercontent.com/' + config.githubRepo + '/' + config.githubBranch + '/' + path;
}

function fetchText_(url, config) {
  const headers = { 'User-Agent': 'masters-regatta-pdf-publisher' };
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

function createHash_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    const unsigned = byte < 0 ? byte + 256 : byte;
    return ('0' + unsigned.toString(16)).slice(-2);
  }).join('');
}

function getHashKey_(raceNo) {
  return 'LAST_PROCESSED_HASH_' + padRaceNo_(raceNo);
}

function normalizeRaceNo_(raceNo) {
  const text = String(raceNo || '').replace(/^race_/, '').replace(/\.json$/, '');
  const number = Number(text);
  return isNaN(number) ? text : String(number);
}

function padRaceNo_(raceNo) {
  return ('000' + normalizeRaceNo_(raceNo)).slice(-3);
}

function buildRaceInfo_(raceNo, masterData, resultData) {
  const schedule = (masterData.schedule || []).find(function(s) { return String(s.race_no) === String(raceNo); }) || {};
  const eventName = schedule.event_name || '';
  const ageGroup = schedule.age_group || '';
  const roundName = decodeRound(schedule.round || '');
  const raceTime = composeRaceTime_(schedule.date, schedule.time);

  // レース距離（500m or 1000m）。schedule.course_length 優先 → tournament.course_length → デフォルト 1000m
  const tournamentLen = (masterData.tournament && masterData.tournament.course_length) || 1000;
  const courseLength = parseInt(schedule.course_length || tournamentLen, 10);
  const is500mRace = (courseLength === 500);

  const masterEntries = schedule.entries || [];
  const results = (resultData && resultData.results) || [];
  const categoryRanks = buildCategoryRanks_(results, masterEntries);
  const isCombinedCategory = String(ageGroup || '').length >= 2;

  let entries = [];
  if (results.length > 0) {
    entries = results
      .slice()
      .sort(function(a, b) { return (a.rank || 99) - (b.rank || 99); })
      .map(function(r) {
        // 500m レース: 500m 列に実値（旧データ互換: '1000m' スロットにゴールが入っているケースもフォールバック）、1000m 列はブランク
        // 1000m レース: 既存通り（500m=中間、1000m=ゴール）
        let time500 = '';
        let time1000 = '';
        if (is500mRace) {
          time500 = extractTime_(r, '500m', 'time_500')
                 || extractTime_(r, '1000m', 'time_1000'); // 旧仕様で 1000m スロットに入った 500m ゴールを救済
          time1000 = ''; // 500m レースは 1000m 列を必ずブランク
        } else {
          time500 = extractTime_(r, '500m', 'time_500');
          time1000 = extractTime_(r, '1000m', 'time_1000');
        }
        return [
          extractRank_(r),
          extractAffiliation_(r, masterEntries),
          String(r.lane || ''),
          extractCategory_(r, masterEntries),
          time500,
          time1000,
          extractCategoryNote_(r, masterEntries, categoryRanks, isCombinedCategory),
          extractCrewName_(r, masterEntries)
        ];
      });
  }

  return {
    eventName: eventName,
    ageGroup: ageGroup,
    roundName: roundName,
    raceTime: raceTime,
    courseLength: courseLength, // PDF 側で参照可能に（必要なら見出し表示などに利用）
    is500mRace: is500mRace,
    entries: entries
  };
}

function buildCategoryRanks_(results, masterEntries) {
  const groups = {};
  (results || []).forEach(function(r) {
    const rank = Number(r.rank);
    if (!rank || isNaN(rank)) return;
    const status = String(r.status || '').toUpperCase();
    if (status === 'DNS' || status === 'DNF') return;
    const category = extractCategory_(r, masterEntries);
    if (!category) return;
    if (!groups[category]) groups[category] = [];
    groups[category].push({ lane: String(r.lane || ''), rank: rank });
  });

  const ranks = {};
  Object.keys(groups).forEach(function(category) {
    groups[category]
      .sort(function(a, b) { return a.rank - b.rank; })
      .forEach(function(item, index) {
        ranks[category + ':' + item.lane] = index + 1;
      });
  });
  return ranks;
}

function extractRank_(r) {
  if (r.status && r.status !== 'finish') return '';
  return String(r.rank || '');
}

function extractCrewName_(r, masterEntries) {
  if (r.crew_name) return r.crew_name;
  const entry = masterEntries.find(function(e) { return String(e.lane) === String(r.lane); });
  return entry ? (entry.crew_name || '') : '';
}

function extractAffiliation_(r, masterEntries) {
  if (r.affiliation) return r.affiliation;
  const entry = masterEntries.find(function(e) { return String(e.lane) === String(r.lane); });
  return entry ? (entry.affiliation || '') : '';
}

function extractCategory_(r, masterEntries) {
  if (r.category) return r.category;
  const entry = masterEntries.find(function(e) { return String(e.lane) === String(r.lane); });
  return entry ? (entry.category || '') : '';
}

function extractTime_(r, key, dummyKey) {
  if (r.status && r.status !== 'finish') return '';
  if (r[dummyKey]) return r[dummyKey];
  if (r.times && r.times[key] && r.times[key].formatted) {
    return r.times[key].formatted;
  }
  return '';
}

function extractNote_(r) {
  if (r.status && r.status !== 'finish') return r.status;
  return r.note || '';
}

function extractCategoryNote_(r, masterEntries, categoryRanks, isCombinedCategory) {
  if (!isCombinedCategory) return extractNote_(r);
  const category = extractCategory_(r, masterEntries);
  const categoryRank = categoryRanks[category + ':' + String(r.lane || '')];
  if (!category || !categoryRank) return extractNote_(r);
  return category + 'カテゴリー　' + categoryRank + '位';
}

function composeRaceTime_(date, time) {
  if (!date) return '';
  const d = String(date).replace(/-/g, '/');
  const parts = d.split('/');
  const yyyy = parts[0];
  const mm = ('0' + (parts[1] || '')).slice(-2);
  const dd = ('0' + (parts[2] || '')).slice(-2);
  const t = String(time || '');
  const tParts = t.split(':');
  const hh = ('0' + (tParts[0] || '0')).slice(-2);
  const mi = ('0' + (tParts[1] || '00')).slice(-2);
  return yyyy + '/' + mm + '/' + dd + '　' + hh + ':' + mi;
}

function lookupCrewName_(masterEntries, lane) {
  const entry = masterEntries.find(function(e) { return String(e.lane) === String(lane); });
  return entry ? (entry.crew_name || '') : '';
}

function findRaceMaster_(raceNo, masterData, resultData) {
  const normalizedRaceNo = normalizeRaceNo_(raceNo);
  const candidates = [];
  collectNestedArrays_(candidates, masterData);

  return candidates.filter(function(item) {
    return normalizeRaceNo_(item.race_no || item.raceNo || item.no || item.id) === normalizedRaceNo;
  })[0] || resultData.race || resultData.meta || {};
}

function collectNestedArrays_(target, value) {
  if (!value || typeof value !== 'object') return;

  Object.keys(value).forEach(function(key) {
    const child = value[key];
    if (Array.isArray(child)) {
      child.forEach(function(item) {
        if (item && typeof item === 'object') target.push(item);
      });
      return;
    }
    if (child && typeof child === 'object') {
      Object.keys(child).forEach(function(grandKey) {
        const grandChild = child[grandKey];
        if (Array.isArray(grandChild)) {
          grandChild.forEach(function(item) {
            if (item && typeof item === 'object') target.push(item);
          });
        }
      });
    }
  });
}

function extractEntries_(resultData) {
  const source = pickFirstArray_([
    resultData.results, resultData.result, resultData.ranking, resultData.rankings,
    resultData.crews, resultData.entries, resultData.lanes,
    resultData.race && resultData.race.results, resultData.race && resultData.race.crews
  ]);
  const rows = source.map(function(entry, index) { return normalizeEntry_(entry, index); });
  while (rows.length < RANKING_ROW_COUNT) rows.push(['', '', '', '', '', '']);
  return rows.slice(0, RANKING_ROW_COUNT);
}

function normalizeEntry_(entry, index) {
  const crewName = pickFirst_([
    entry.crew_name, entry.crewName, entry.crew, entry.team_name,
    entry.teamName, entry.name, entry.organization
  ]);

  return [
    pickFirst_([entry.rank, entry.place, entry.position, entry.result_rank, entry.resultRank, entry.order]) || (crewName ? String(index + 1) : ''),
    crewName,
    pickFirst_([entry.bow, entry.B, entry.lane, entry.lane_no, entry.laneNo, entry.number]),
    pickFirst_([entry['500m'], entry.time_500m, entry.time500, entry.split_500m, entry.split500, entry.t500]),
    pickFirst_([entry['1000m'], entry.time_1000m, entry.time1000, entry.split_1000m, entry.split1000, entry.goal_time, entry.goalTime, entry.finish_time, entry.finishTime, entry.time]),
    pickFirst_([entry.note, entry.notes, entry.remark, entry.remarks, entry.comment, entry.status, entry.result_note, entry.resultNote])
  ];
}

function pickFirst_(values) {
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== null && values[i] !== undefined && values[i] !== '') return String(values[i]);
  }
  return '';
}

function pickFirstArray_(values) {
  for (let i = 0; i < values.length; i++) {
    if (Array.isArray(values[i])) return values[i];
  }
  return [];
}

function formatRaceTime_(value) {
  if (!value) return '';
  const text = String(value);
  const date = new Date(text);
  if (!isNaN(date.getTime())) {
    return Utilities.formatDate(date, JST_TIMEZONE, 'yyyy/MM/dd') + '　' + Utilities.formatDate(date, JST_TIMEZONE, 'HH:mm');
  }
  return text.replace(/\s+/, '　').replace(/-/g, '/');
}

function confirmTournamentName_(values, masterData) {
  const tournament = masterData.tournament || {};
  const raceName = tournament.race_name || tournament.raceName || tournament.name;
  if (!raceName) return;

  const flatText = values.map(function(row) { return row.join(' '); }).join(' ');
  if (flatText.indexOf(raceName) === -1) {
    Logger.log('大会名確認: 雛形内に master.json の大会名が見つかりません: ' + raceName);
  }
}

function writeTournamentName_(sheet, values, masterData) {
  const raceName = (masterData && masterData.tournament && masterData.tournament.race_name) || '';
  if (!raceName) return;
  const cell = findCell_(values, function(text) {
    return text.indexOf('マスターズ') !== -1 || text.indexOf('レガッタ') !== -1 || text.indexOf('大会') !== -1;
  });
  if (!cell) {
    Logger.log('大会名セルが見つかりません');
    return;
  }
  sheet.getRange(cell.row, cell.col).setValue(raceName);
  Logger.log('大会名を更新: ' + raceName);
}

function writePrintTime_(sheet, values) {
  const cell = findCell_(values, function(text) { return text.toLowerCase().indexOf('print') !== -1; });
  if (!cell) return Logger.log('print セルが見つかりません。');

  sheet.getRange(cell.row, cell.col).setValue('print ' + Utilities.formatDate(new Date(), JST_TIMEZONE, 'yyyy/MM/dd HH:mm:ss'));
}

function writeRightOfLabel_(sheet, values, label, value) {
  const cell = findCell_(values, function(text) { return text.indexOf(label) !== -1; });
  if (!cell) return Logger.log('ラベルが見つかりません: ' + label);

  sheet.getRange(cell.row, cell.col + 1).setValue(value || '');
}

function writeBelowLabel_(sheet, values, label, value) {
  const cell = findCell_(values, function(text) { return text.indexOf(label) !== -1; });
  if (!cell) return Logger.log('ラベルが見つかりません: ' + label);

  sheet.getRange(cell.row + 1, cell.col).setValue(value || '');
}

function writeRoundValue_(sheet, values, roundName) {
  if (!roundName) return;

  const cell = findCell_(values, function(text) {
    return text.indexOf('ラウンド') !== -1 || text.indexOf('決勝') !== -1 || text.indexOf('予選') !== -1 || text.indexOf('準決') !== -1 || text.indexOf('敗復') !== -1;
  });
  if (!cell) return Logger.log('ラウンドセルが見つかりません。');

  sheet.getRange(cell.row, cell.text.indexOf('ラウンド') !== -1 ? cell.col + 1 : cell.col).setValue(roundName);
}

function writeRankingRows_(sheet, values, entries) {
  // 「順位」または「レーン」ヘッダーを検出（準備資料雛形は「レーン」表記）
  const header = findCell_(values, function(text) {
    return text === '順位' || text === 'レーン';
  });
  if (!header) throw new Error('順位 or レーン ヘッダーが見つかりません。');

  const columns = detectRankingColumns_(values[header.row - 1], header.col);

  // 順位列に数値がある行を上から順に収集（1, 2, 3, ... の順）
  const dataRows = [];
  for (let r = header.row + 1; r <= values.length && dataRows.length < RANKING_ROW_COUNT; r++) {
    const rowValues = values[r - 1] || [];
    const joined = rowValues.join('').trim();
    if (joined.indexOf('天候') !== -1 || joined.indexOf('協会') !== -1 || joined.indexOf('備考:') !== -1 || joined.indexOf('風向') !== -1 || joined.indexOf('風速') !== -1) break;
    const rankCellValue = String(rowValues[columns.rank - 1] || '').trim();
    if (/^[0-9]+$/.test(rankCellValue)) {
      dataRows.push(r);
    }
  }

  // 順位列に数値がなかった場合: ヘッダー直下から1行ピッチで補完
  if (dataRows.length === 0) {
    Logger.log('警告: 順位列に数値が見つからない。1行ピッチで補完します。initializeTemplate() の実行を推奨。');
    for (let r = header.row + 1; r <= header.row + RANKING_ROW_COUNT; r++) {
      dataRows.push(r);
    }
  }

  // 不足分は検出済みピッチを使って8行まで拡張
  if (dataRows.length >= 2 && dataRows.length < RANKING_ROW_COUNT) {
    const pitch = dataRows[1] - dataRows[0];
    if (pitch > 0) {
      while (dataRows.length < RANKING_ROW_COUNT) {
        dataRows.push(dataRows[dataRows.length - 1] + pitch);
      }
    }
  }

  Logger.log('順位表データ行: ' + JSON.stringify(dataRows));

  // entries（着順ソート済み）を上から順に書き込み
  // entries が dataRows より少ない場合は余った行を空クリア
  for (let i = 0; i < dataRows.length; i++) {
    const upperRow = dataRows[i];
    const lowerRow = upperRow + 1;
    const row = entries[i] || ['', '', '', '', '', '', '', ''];
    if (columns.rank > 0) sheet.getRange(upperRow, columns.rank).setValue(row[0]);
    if (columns.crew > 0) sheet.getRange(upperRow, columns.crew).setValue(row[1]);
    if (columns.lane > 0) sheet.getRange(upperRow, columns.lane).setValue(row[2]);
    if (columns.category > 0) sheet.getRange(upperRow, columns.category).setValue(row[3]);
    if (columns.time500 > 0) sheet.getRange(upperRow, columns.time500).setValue(row[4]);
    if (columns.time1000 > 0) sheet.getRange(upperRow, columns.time1000).setValue(row[5]);
    if (columns.note > 0) sheet.getRange(upperRow, columns.note).setValue(row[6]);
    if (columns.crew > 0) sheet.getRange(lowerRow, columns.crew).setValue(row[7]);
  }
}

function detectRankingColumns_(headerRow, rankCol) {
  const labels = headerRow.map(function(text) { return String(text || '').trim(); });
  return {
    rank: findColumnByLabels_(labels, ['順位', 'レーン'], rankCol),
    crew: findColumnByLabels_(labels, ['クルー名', 'クルー', '団体名'], rankCol + 1),
    // lane: 「B」が無い雛形（準備資料 v2 等）では 0 を返して書き込みスキップ
    lane: findColumnByLabelsStrict_(labels, ['B', 'Lane']),
    category: findColumnByLabels_(labels, ['カテゴリー', 'カテゴリ', 'Category', '区分'], rankCol + 3),
    time500: findColumnByLabels_(labels, ['500m', '500'], rankCol + 4),
    time1000: findColumnByLabels_(labels, ['1000m', '1000'], rankCol + 5),
    note: findColumnByLabels_(labels, ['備考', 'メモ', 'Note'], rankCol + 6)
  };
}

function findColumnByLabels_(labels, candidates, fallbackCol) {
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (labels[i].indexOf(candidates[j]) !== -1) return i + 1;
    }
  }
  return fallbackCol;
}

function findColumnByLabelsStrict_(labels, candidates) {
  // 完全一致のみ。candidates のいずれかに **完全一致** したら列番号を返す。見つからなければ 0。
  for (let i = 0; i < labels.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (labels[i] === candidates[j]) return i + 1;
    }
  }
  return 0;
}

function findCell_(values, predicate) {
  for (let row = 0; row < values.length; row++) {
    for (let col = 0; col < values[row].length; col++) {
      const text = String(values[row][col] || '').trim();
      if (text && predicate(text)) return { row: row + 1, col: col + 1, text: text };
    }
  }
  return null;
}

function exportSpreadsheetPdf_(spreadsheetId, fileName, gid) {
  const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?format=pdf&size=A4&portrait=false&fitw=true&top_margin=0.25&bottom_margin=0.25&left_margin=0.25&right_margin=0.25&gridlines=false&printtitle=false&sheetnames=false&pagenum=false&horizontal_alignment=CENTER&vertical_alignment=TOP&scale=4&r1=0&c1=0&r2=34&c2=13&gid=' + gid;
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('PDF export失敗: status=' + status + ' body=' + response.getContentText());
  }
  return response.getBlob().setName(fileName).setContentType('application/pdf');
}

function exportBookletPdf_(spreadsheetId, fileName) {
  // 全シート・A4横・モノクロ・印刷範囲は各シートの print_area もしくは fitw で自動
  const url = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/export?' +
    'format=pdf' +
    '&size=A4' +
    '&portrait=false' +
    '&fitw=true' +
    '&top_margin=0.25' +
    '&bottom_margin=0.25' +
    '&left_margin=0.25' +
    '&right_margin=0.25' +
    '&gridlines=false' +
    '&printtitle=false' +
    '&sheetnames=false' +
    '&pagenum=false' +
    '&horizontal_alignment=CENTER' +
    '&vertical_alignment=TOP' +
    '&scale=4' +
    '&printnotes=false' +
    '&blackandwhite=true';
  const response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }
  });
  const status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Booklet PDF export 失敗: status=' + status + ' body=' + response.getContentText().substring(0, 500));
  }
  return response.getBlob().setName(fileName).setContentType('application/pdf');
}

function trashExistingPdf_(folder, fileName) {
  const files = folder.getFilesByName(fileName);
  while (files.hasNext()) files.next().setTrashed(true);
}
