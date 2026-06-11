/**
 * ============================================================
 *  マスターズ判定員帳票生成 - 初期セットアップ (Setup.gs)
 *  Version: 0.1.0
 *  Last Updated: 2026/05/21
 * ============================================================
 * このGASは手動実行のみ。トリガーは作成しない。
 */

const DEFAULT_SETUP = {
  GITHUB_REPO: '',         // Script Properties で設定必須（setupFromConfig 参照）
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: '',
  TEMPLATE_SHEET_ID: '',   // Script Properties で設定必須（setupFromConfig 参照）
  OUTPUT_FOLDER_ID: ''     // Script Properties で設定必須（setupFromConfig 参照）
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

/**
 * tournament.config.json の gas セクション JSON を貼り付けることで
 * Script Properties へ一括投入する（SPEC §5 gas マッピング表準拠）。
 *
 * 使い方:
 *   1. tournament.config.json の "gas" セクション全体を JSON 文字列化して引数に渡す
 *   2. GASエディタで setupFromConfig を選択して実行
 *
 * マッピング（SPEC §5 gas セクション → Script Properties キー）:
 *   judge_template_sheet_id → TEMPLATE_SHEET_ID
 *   prep_folder_id          → OUTPUT_FOLDER_ID
 *
 * @param {string} jsonString  tournament.config.json の gas セクション（JSON 文字列）
 */
function setupFromConfig(jsonString) {
  const gas = JSON.parse(jsonString);
  const mapping = {
    judge_template_sheet_id: 'TEMPLATE_SHEET_ID',
    prep_folder_id:          'OUTPUT_FOLDER_ID'
  };

  const properties = PropertiesService.getScriptProperties();
  const toSet = {};

  Object.keys(mapping).forEach(function(configKey) {
    if (gas[configKey] !== undefined && gas[configKey] !== null && gas[configKey] !== '') {
      toSet[mapping[configKey]] = String(gas[configKey]);
    }
  });

  if (gas.github_repo) {
    toSet['GITHUB_REPO'] = gas.github_repo;
  }

  properties.setProperties(toSet, false);
  Logger.log('[setupFromConfig] judge_form_publisher: Script Properties を投入しました');
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
