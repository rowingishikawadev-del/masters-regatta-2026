// ⚠️ AUTO-GENERATED from gas/shared/Shared.gs — 直接編集禁止。make build-gas で再生成
//    正本: gas/shared/Shared.gs
//    生成コマンド: make build-gas  (python3 tools/build_gas.py)

/**
 * ============================================================
 *  GAS 共有ユーティリティ（正本）
 *
 *  このファイルが正本。各プロジェクトの Shared.gs は
 *  make build-gas で生成する。直接編集してはいけない。
 *
 *  共有対象プロジェクト:
 *    - gas/pdf_publisher/
 *    - gas/judge_form_publisher/
 *
 *  Last Updated: 2026-06-12
 * ============================================================
 */

// ============================================================
//  定数
// ============================================================

/**
 * タイムゾーン（Asia/Tokyo）
 * @const {string}
 */
const JST_TIMEZONE = 'Asia/Tokyo';

// ============================================================
//  GitHub URL / HTTP
// ============================================================

/**
 * GitHub raw コンテンツ URL を構築する。
 * @param {object} config  getConfig_() が返すオブジェクト
 * @param {string} path    リポジトリルートからの相対パス（例: 'data/master.json'）
 * @return {string}
 */
function buildRawUrl_(config, path) {
  return 'https://raw.githubusercontent.com/' + config.githubRepo + '/' + config.githubBranch + '/' + path;
}

/**
 * URL を fetch して文字列を返す。
 * config.userAgent が設定されている場合はそれを User-Agent ヘッダーに使用する。
 * 未設定の場合は 'masters-regatta-gas' をフォールバックとして使用する。
 * @param {string} url
 * @param {object} config  getConfig_() が返すオブジェクト
 * @return {string}
 */
function fetchText_(url, config) {
  const userAgent = (config && config.userAgent) ? config.userAgent : 'masters-regatta-gas';
  const headers = { 'User-Agent': userAgent };
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

// ============================================================
//  書式ユーティリティ
// ============================================================

/**
 * 数値を2桁ゼロ埋め文字列にして返す。
 * @param {number|string} value
 * @return {string}
 */
function pad2_(value) {
  return ('0' + Number(value)).slice(-2);
}

// ============================================================
//  master.json ユーティリティ
// ============================================================

/**
 * masterData から大会日付の配列を返す。
 * 各要素は normalizeDateString_ で 'YYYY/MM/DD' 形式に正規化済み。
 * @param {object} masterData
 * @return {string[]}
 */
function getTournamentDates_(masterData) {
  const dates = masterData && masterData.tournament && masterData.tournament.dates;
  if (!Array.isArray(dates)) return [];
  return dates.map(normalizeDateString_).filter(function(dateStr) { return dateStr; });
}

/**
 * masterData からスケジュール配列を返す。
 * masterData.schedule が配列の場合はそのまま返す。
 * masterData.schedule.races が配列の場合はそちらを返す。
 * @param {object} masterData
 * @return {Array}
 */
function getScheduleArray_(masterData) {
  if (!masterData) return [];
  if (Array.isArray(masterData.schedule)) return masterData.schedule;
  if (masterData.schedule && Array.isArray(masterData.schedule.races)) return masterData.schedule.races;
  return [];
}

/**
 * 日付文字列を 'YYYY/MM/DD' 形式に正規化する。
 * Date オブジェクトは JST でフォーマットする。
 * 文字列は 'YYYY/MM/DD' または 'YYYY-MM-DD'（月・日はゼロ埋め任意）を受け付ける。
 * マッチしない文字列はそのまま返す。
 * @param {string|Date} value
 * @return {string}
 */
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
