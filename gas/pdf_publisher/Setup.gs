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
  GITHUB_REPO: '',            // Script Properties で設定必須（setupFromConfig 参照）
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: '',           // 龍偉が手動で設定する
  TEMPLATE_SHEET_ID: '',      // Script Properties で設定必須（setupFromConfig 参照）
  PDF_OUTPUT_FOLDER_ID: '',   // Script Properties で設定必須（setupFromConfig 参照）
  PDF_ARCHIVE_FOLDER_ID: '',  // Script Properties で設定必須（setupFromConfig 参照）
  PRE_RACE_BOOKLET_FOLDER_ID: '',  // Script Properties で設定必須（setupFromConfig 参照）
  BOOKLET_TEMPLATE_GID: ''    // Script Properties で設定必須（setupFromConfig 参照）
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
  // ID 全文はログに残さない（Viewer 権限者がログ閲覧可能なため先頭4文字のみ）
  Logger.log(JSON.stringify(maskSecrets_(values), null, 2));
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

/**
 * tournament.config.json の gas セクション JSON を貼り付けることで
 * Script Properties へ一括投入する（SPEC §5 gas マッピング表準拠）。
 *
 * 使い方:
 *   1. tournament.config.json の "gas" セクション全体を JSON 文字列化して引数に渡す
 *   2. GASエディタで setupFromConfig を選択して実行
 *
 * 例:
 *   setupFromConfig('{"pdf_template_sheet_id":"1A...","pdf_output_folder_id":"1n...","pdf_archive_folder_id":"12...","booklet_folder_id":"1L...","booklet_template_gid":"1774552995","judge_template_sheet_id":"1Q...","prep_folder_id":"1L..."}')
 *
 * マッピング（SPEC §5 gas セクション → Script Properties キー）:
 *   pdf_template_sheet_id  → TEMPLATE_SHEET_ID
 *   pdf_output_folder_id   → PDF_OUTPUT_FOLDER_ID
 *   pdf_archive_folder_id  → PDF_ARCHIVE_FOLDER_ID
 *   booklet_folder_id      → PRE_RACE_BOOKLET_FOLDER_ID
 *   booklet_template_gid   → BOOKLET_TEMPLATE_GID
 *
 * @param {string} jsonString  tournament.config.json の gas セクション（JSON 文字列）
 */
function setupFromConfig(jsonString) {
  const gas = JSON.parse(jsonString);
  const mapping = {
    pdf_template_sheet_id: 'TEMPLATE_SHEET_ID',
    pdf_output_folder_id:  'PDF_OUTPUT_FOLDER_ID',
    pdf_archive_folder_id: 'PDF_ARCHIVE_FOLDER_ID',
    booklet_folder_id:     'PRE_RACE_BOOKLET_FOLDER_ID',
    booklet_template_gid:  'BOOKLET_TEMPLATE_GID'
  };

  const properties = PropertiesService.getScriptProperties();
  const toSet = {};

  Object.keys(mapping).forEach(function(configKey) {
    if (gas[configKey] !== undefined && gas[configKey] !== null && gas[configKey] !== '') {
      toSet[mapping[configKey]] = String(gas[configKey]);
    }
  });

  // github_repo は deploy.github_repo から取得できる場合も考慮（任意）
  if (gas.github_repo) {
    toSet['GITHUB_REPO'] = gas.github_repo;
  }

  properties.setProperties(toSet, false);
  Logger.log('[setupFromConfig] pdf_publisher: Script Properties を投入しました');
  Logger.log(JSON.stringify(maskSecrets_(toSet), null, 2));
  Logger.log('⚠️ GITHUB_TOKEN は手動で設定してください（既存GASと同じ値）');
}

/** ログ出力用に値をマスクする（先頭4文字のみ表示） */
function maskSecrets_(obj) {
  const masked = {};
  Object.keys(obj).forEach(k => {
    const v = String(obj[k] || '');
    masked[k] = v ? v.substring(0, 4) + '***' : '(未設定)';
  });
  return masked;
}
