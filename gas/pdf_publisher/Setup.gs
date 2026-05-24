/**
 * ============================================================
 *  マスターズレガッタ2026 PDF生成 - 初期セットアップ (Setup.gs)
 *  Version: 0.14.1
 *  Last Updated: 2026/05/21
 *  Changes:
 *   - v0.14.1 (2026/05/21): sha比較でfetch大幅削減のため1分間隔に戻す
 *   - v0.14.0 (2026/05/21): API クォータ対策 — トリガー間隔を 1分→5分に変更
 *   - v0.9.0 (2026/05/20): PDF_ARCHIVE_FOLDER_ID 追加（クリア時の既存PDF移動先）
 *   - v0.7.2 (2026/05/20): everyMinutes(2) は GAS で無効のため 1分間隔に変更
 * ============================================================
 * プロパティとトリガー管理だけを担当する。Code.gsとは分離。
 */

const DEFAULT_SETUP = {
  GITHUB_REPO: 'rowingishikawadev-del/masters-regatta-2026',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: '',  // 龍偉が手動で設定する
  TEMPLATE_SHEET_ID: '1A_CIgcyJ-1jp6qwIhxItDKpVtbMIRc8C5IGJajr0D7g',
  PDF_OUTPUT_FOLDER_ID: '1n74sgVFD40JIjDf06pltjKp77yBhs4mY',
  PDF_ARCHIVE_FOLDER_ID: '12a23a8CwR8f6yLMS_kt5C_M1ZnK1Xvp5'
};

const PDF_TRIGGER_FUNCTION = 'processPendingPDFs';

/**
 * 初期値をスクリプトプロパティへ保存する。
 * すでに値が入っている場合は上書きしない。
 */
function saveSetup() {
  const properties = PropertiesService.getScriptProperties();
  const current = properties.getProperties();
  const values = {};

  Object.keys(DEFAULT_SETUP).forEach(function(key) {
    values[key] = current[key] || DEFAULT_SETUP[key];
  });

  properties.setProperties(values, false);
  Logger.log('スクリプトプロパティを保存しました。');
  Logger.log(JSON.stringify(values, null, 2));
  if (!values.GITHUB_TOKEN) {
    Logger.log('⚠️ GITHUB_TOKEN が未設定です。スクリプトプロパティに手動で設定してください（既存GASと同じ値）。');
  }
}

/**
 * 1分間隔トリガーを作成する。
 * 同じ関数の既存トリガーは削除してから作り直す。
 * Code.gs v0.14.0 以降は Contents API の sha 比較で fetch を激減させているため、1分間隔でもクォータ余裕。
 */
function setupTrigger() {
  removeTrigger();

  // GAS の everyMinutes() は 1/5/10/15/30 のみ許可。1分間隔を採用。
  ScriptApp.newTrigger(PDF_TRIGGER_FUNCTION)
    .timeBased()
    .everyMinutes(1)
    .create();

  Logger.log('1分間隔トリガーを作成しました: ' + PDF_TRIGGER_FUNCTION);
  listTriggers();
}

/**
 * processPendingPDFs のトリガーを削除する。
 * 大会終了後や停止したいときに実行する。
 */
function removeTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  let removedCount = 0;

  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === PDF_TRIGGER_FUNCTION) {
      ScriptApp.deleteTrigger(trigger);
      removedCount++;
    }
  });

  Logger.log('削除したトリガー数: ' + removedCount);
}

/**
 * 現在のトリガー一覧をログに表示する。
 */
function listTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  if (triggers.length === 0) {
    Logger.log('現在トリガーはありません。');
    return [];
  }

  const rows = triggers.map(function(trigger) {
    return {
      functionName: trigger.getHandlerFunction(),
      eventType: String(trigger.getEventType()),
      source: String(trigger.getTriggerSource()),
      uniqueId: trigger.getUniqueId()
    };
  });

  Logger.log(JSON.stringify(rows, null, 2));
  return rows;
}
