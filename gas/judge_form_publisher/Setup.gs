/**
 * ============================================================
 *  マスターズ判定員帳票生成 - 初期セットアップ (Setup.gs)
 *  Version: 0.1.0
 *  Last Updated: 2026/05/21
 * ============================================================
 * このGASは手動実行のみ。トリガーは作成しない。
 */

const DEFAULT_SETUP = {
  GITHUB_REPO: 'rowingishikawadev-del/masters-regatta-2026',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: '',
  TEMPLATE_SHEET_ID: '1Q37f2gAgfLwIr2snBjLUiZKcUEr99wr97NjbhDNFRHc',
  OUTPUT_FOLDER_ID: '1LHAVHRnwVgMaQL4ipaDGa6HINz-9oXkn'
};

/**
 * 初期値をスクリプトプロパティへ保存する。
 * 既存値がある場合は保持する。GITHUB_TOKEN は手動設定推奨。
 */
function saveSetup() {
  const properties = PropertiesService.getScriptProperties();
  const current = properties.getProperties();
  const values = {};

  Object.keys(DEFAULT_SETUP).forEach(function(key) {
    values[key] = current[key] || DEFAULT_SETUP[key];
  });

  properties.setProperties(values, false);
  Logger.log('マスターズ判定員帳票生成 v0.1.0: スクリプトプロパティを保存しました。');
  Logger.log(JSON.stringify(maskSecretValues_(values), null, 2));

  if (!values.GITHUB_TOKEN) {
    Logger.log('GITHUB_TOKEN が未設定です。既存GASと同じ値をスクリプトプロパティに手動で設定してください。');
  }
}

/**
 * 念のため現在のトリガー一覧を確認する。
 * このGASはトリガー不使用。
 */
function listExistingTriggers() {
  const triggers = ScriptApp.getProjectTriggers();

  if (triggers.length === 0) {
    Logger.log('現在トリガーはありません。このGASは手動実行のみです。');
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

  Logger.log('現在のトリガー一覧:');
  Logger.log(JSON.stringify(rows, null, 2));
  return rows;
}

function maskSecretValues_(values) {
  const copy = {};
  Object.keys(values).forEach(function(key) {
    copy[key] = key === 'GITHUB_TOKEN' && values[key] ? '***' : values[key];
  });
  return copy;
}
