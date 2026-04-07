# システム仕様書 — 全日本マスターズレガッタ 2026 速報サイト

| 項目 | 内容 |
|---|---|
| 作成日 | 2026-04-07 14:53 |
| リポジトリ | [RYUIYAMADA/masters-regatta-2026](https://github.com/RYUIYAMADA/masters-regatta-2026) |
| 本番URL | https://masters-regatta-2026-3ha.pages.dev |
| 管理画面 | https://masters-regatta-2026-3ha.pages.dev/admin/9922/ |

---

## 目次

1. [システム概要](#1-システム概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [データ仕様](#3-データ仕様)
4. [フロントエンド仕様](#4-フロントエンド仕様)
5. [GAS（バックエンド）仕様](#5-gasバックエンド仕様)
6. [インフラ・セキュリティ](#6-インフラセキュリティ)
7. [管理者画面](#7-管理者画面)
8. [運用マニュアル体系](#8-運用マニュアル体系)
9. [作業フロー](#9-作業フロー)
10. [既知の制約・リスク管理](#10-既知の制約リスク管理)

---

## 1. システム概要

### 目的

ボート競技大会のレース結果をリアルタイムで観客・参加者にWebブラウザから提供する。計測スタッフがCSVをGoogle Driveにアップロードするだけで、エンジニア不在でも自動更新される。

### 設計原則

| 原則 | 内容 |
|---|---|
| サーバーレス | バックエンドサーバーなし。データはすべてGitHub内のJSONファイル |
| ゼロコスト | すべてのサービスを無料枠で運用 |
| 非エンジニア運用 | スタッフはCSVをDriveにアップするだけ。コマンドライン操作不要 |
| 耐同時アクセス | Cloudflare CDN配信によりスパイクアクセスに強い |

---

## 2. アーキテクチャ

### データの流れ

```
計測アプリ（RowingTimerWeb）
  ↓ CSV書き出し・手動アップ
Google Drive（race_csv/500m・1000m/）
  ↓ GAS 2分間隔ポーリング
GitHub リポジトリ（data/results/race_XXX.json）
  ↓ 自動デプロイ（Push検知・約30〜60秒）
Cloudflare Pages（CDN配信）
  ↓ 120秒間隔・自動fetch
ブラウザ（観客・参加者）
```

### コンポーネント

| コンポーネント | 技術 | 役割 | 費用 |
|---|---|---|---|
| フロントエンド | HTML / CSS / Vanilla JS | レース結果表示UI | 無料 |
| ホスティング | Cloudflare Pages | 静的ファイル配信・CDN・HTTPS | 無料 |
| ソース管理 | GitHub | コード・JSONデータのバージョン管理 | 無料 |
| CSV監視・変換 | Google Apps Script | DriveのCSVをJSONに変換→GitHub Push | 無料（制限あり） |
| データ投入先 | Google Drive | 計測スタッフがCSVをアップする作業領域 | 無料 |

### ファイル構成

```
/
├── index.html              # 公開ページ
├── css/style.css           # 全スタイル（レスポンシブ）
├── js/app.js               # 全ロジック
├── _headers                # Cloudflare Pages HTTPヘッダー設定
├── data/
│   ├── master.json         # 大会情報・スケジュール・エントリー
│   └── results/
│       └── race_001.json   # レース結果（GASが自動生成）
├── admin/9922/index.html   # 管理者ダッシュボード
├── docs/                   # 各種HTMLマニュアル
└── gas/Code.gs             # GASスクリプト（Driveには直接コピーして使用）
```

---

## 3. データ仕様

### CSVファイル命名規則

正規表現: `/^(?:\d{8}_\d{6}_)?R(\d{3})_(.+)\.csv$/i`

| 形式 | 例 | 備考 |
|---|---|---|
| 推奨 | `R001_500m.csv` | レース番号3桁ゼロ埋め必須 |
| 旧形式（互換） | `20260607_070000_R001_500m.csv` | RowingTimerWebが自動付与する日時プレフィクス |

**よくあるミス（GASがスキップする）**

| NG例 | 問題点 |
|---|---|
| `R001_500.csv` | `m` が抜けている |
| `r001_500m.csv` | 先頭が小文字（GAS側で `.toLowerCase()` 対処済み） |
| `R01_500m.csv` | レース番号が2桁（3桁必須） |
| `R001_500m.CSV` | 拡張子が大文字 |

### CSVフォーマット（RowingTimerWeb出力）

```csv
measurement_point,lane,lap_index,time_ms,formatted,race_no,tie_group,photo_flag,note
500m,1,1,112834,1:52.834,1,,,
500m,2,1,113201,1:53.201,1,,,
```

| カラム | 型 | 説明 |
|---|---|---|
| measurement_point | string | 計測ポイント（`500m` / `1000m`）。GASはこの値でフォルダと照合 |
| lane | int | レーン番号（1〜） |
| time_ms | int | タイム（ミリ秒）。GASはこれから `M:SS.cc` を再計算（`formatted`列は無視） |
| tie_group | string | 同着グループID |
| photo_flag | bool | 写真判定フラグ |
| note | string | DNS / DNF など |

> BOM（UTF-8 BOM）はGASが自動除去。

### JSONデータ構造

**data/master.json**（GASがセットアップ時に生成・管理）

```json
{
  "generated_at": "ISO8601",
  "updated_at": "ISO8601",
  "last_trigger_at": "ISO8601",      // GASハートビート（2分ごとに更新）
  "measurement_points": ["500m", "1000m"],
  "tournament": {
    "race_name": "全日本マスターズレガッタ 2026",
    "dates": ["2026-06-06", "2026-06-07"],
    "venue": "戸田公園ボート場",
    "youtube_url": ""
  },
  "schedule": [
    {
      "race_no": 1,
      "event_code": "M_1X",
      "event_name": "男子シングルスカル",
      "category": "M",
      "round": "FA",
      "date": "2026-06-07",
      "time": "07:00",
      "entries": [{ "lane": 1, "crew_name": "...", "affiliation": "..." }]
    }
  ]
}
```

**data/results/race_001.json**（GASがCSV処理時に生成・Push）

```json
{
  "race_no": 1,
  "updated_at": "ISO8601",
  "results": [
    {
      "lane": 3,
      "rank": 1,
      "times": {
        "500m": { "time_ms": 111490, "formatted": "1:51.49" },
        "1000m": { "time_ms": 224100, "formatted": "3:44.10" }
      },
      "finish": { "time_ms": 224100, "formatted": "3:44.10" },
      "split": "(1:52.61)",
      "tie_group": "",
      "photo_flag": false,
      "note": "",
      "status": "finish"           // "finish" | "DNS" | "DNF" | "DQ"
    }
  ]
}
```

---

## 4. フロントエンド仕様

### UI構成（3ビュー）

| ビュー | 説明 |
|---|---|
| 種目別（デフォルト） | event_codeでグループ化したアコーディオン表示 |
| 全レース一覧 | 全レースを横断表示。列クリックでソート可能 |
| スケジュール | 日別タブで発艇時刻・組・ラウンドを表示 |

### データ取得ロジック

| 処理 | 実装 |
|---|---|
| 初期ロード | `master.json` をfetch → 全レース結果を**並列fetch**（`Promise.allSettled`） |
| 自動更新 | 120秒間隔。±15秒のランダムジッター付きで同時アクセスを分散 |
| オフライン検知 | `navigator.onLine` でステータスバーに表示 |
| 遅延検知 | 8秒以上かかると「接続確認中」メッセージを自動表示 |
| キャッシュ回避 | fetch URLに `?t=タイムスタンプ` を付加（JSONの `Cache-Control: no-store` と二重対策） |

### 永続化（localStorage）

| キー | 内容 |
|---|---|
| `checklist_*` | 当日チェックリストの完了状態 |
| `fontSize` | 表示フォントサイズ（ユーザー設定） |

### 対応ブラウザ

| プラットフォーム | 最低バージョン |
|---|---|
| iPhone (Safari) | iOS 14 |
| Android (Chrome) | Android 9 |
| PC Chrome / Edge | 90 |
| PC Safari | 14 |
| PC Firefox | 88 |
| Internet Explorer | **非対応**（フッターに明記） |

> ⚠️ 外部ライブラリ・NPMパッケージ・ビルドツールは一切不使用（Vanilla JS）

---

## 5. GAS（バックエンド）仕様

### トリガー設定

| 設定 | 値 |
|---|---|
| 実行間隔 | 2分（時間ベーストリガー） |
| 有効期間 | **大会前日から大会最終日まで**（前日に手動ON・終了後に手動OFF） |
| 最大実行時間 | 4分（CONFIG.maxExecutionMs）超過時は自動停止・次回に持ち越し |

### 実行フロー（onTrigger 1回）

```
① LockService でロック取得
    └── 取得失敗 → 即終了（二重実行防止）
② GitHub APIレート制限フラグを確認
    └── 制限中 → 15分スキップ
③ processPendingCSVs()
    ├── race_csv/500m/ と race_csv/1000m/ を走査
    ├── ファイル名を正規表現でパース（大文字小文字を正規化）
    ├── 両ポイント揃ったレースのみ処理
    │   └── buildAndPushRaceJSON() → pushToGitHub() → processed/ へ移動
    └── 片方のみ → スキップ（次の2分後に再試行）
④ updateTriggerHeartbeat_()
    └── master.json の last_trigger_at を更新（管理画面の死活監視用）
⑤ ロック解放
```

### スクリプトプロパティ（秘密情報）

| キー | 内容 |
|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token（write権限必須） |
| `GITHUB_REPO` | `RYUIYAMADA/masters-regatta-2026` |
| `DRIVE_FOLDER_ID_500M` | race_csv/500m/ のDriveフォルダID |
| `DRIVE_FOLDER_ID_1000M` | race_csv/1000m/ のDriveフォルダID |
| `DRIVE_FOLDER_ID_MASTER` | master/ のDriveフォルダID |

### 主要関数

| 関数 | 用途 |
|---|---|
| `onTrigger()` | 2分ごと自動実行のエントリーポイント |
| `runNow()` | 手動で即時実行（障害対応時） |
| `runImportMaster()` | schedule.csv / entries.csv を master.json にインポート |
| `saveSetup()` | スクリプトプロパティへの初期設定 |
| `setupAll()` | DriveフォルダとGitHubリポジトリの初期構築 |

### GAS実行時間の見積もり

| 条件 | 消費時間 |
|---|---|
| ハートビートのみ（CSV処理なし） | 約5秒/回 |
| CSVあり（処理あり） | 約15〜25秒/回 |
| 平均（1大会日10時間） | 約32〜40分/日 |
| 無料枠上限 | **90分/日** |

> 余裕は十分（約50〜60分の余白）。管理画面でリアルタイム残量を表示。

---

## 6. インフラ・セキュリティ

### HTTPヘッダー（_headers）

| 対象 | Cache-Control | 目的 |
|---|---|---|
| デフォルト（HTML等） | `no-cache` | 毎回再検証 |
| `data/*`（JSON） | `no-store, no-cache, must-revalidate` | 速報性確保（キャッシュ禁止） |
| `css/*, js/*` | `public, max-age=86400` | 静的アセットは1日キャッシュ |

追加ヘッダー:

| ヘッダー | 値 |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src https://www.youtube.com` |

> ⚠️ `unsafe-inline` は将来的に解消が望ましい（現状はインラインJSが多く大規模リファクタが必要）

### シークレット管理

| 項目 | 保管場所 |
|---|---|
| GitHub Token | GASスクリプトプロパティ（暗号化保存） |
| DriveフォルダID | GASスクリプトプロパティ |
| 管理画面URL | 関係者のみに口頭・限定共有（URLによるアクセス制御） |

---

## 7. 管理者画面

**URL**: `https://masters-regatta-2026-3ha.pages.dev/admin/9922/`

静的HTMLのみで完結する読み取り専用ダッシュボード。認証なし（URL秘匿による運用）。

| セクション | 内容 |
|---|---|
| 大会サマリー | 大会名・期間・種目数・エントリー数・結果投入数 |
| タイムライン | 発艇予定時刻と結果投入状況を時系列表示 |
| パイプライン監視 | GASの死活状態・GitHub Token有効期限・GAS残り実行時間 |
| CSVファイル名チェッカー | 入力したファイル名の正誤をリアルタイム判定 |
| テストCSVダウンロード | テンプレート・サンプルCSVへのリンク |
| リンク一覧 | 全管理URLのリンク集 |
| 当日チェックリスト | 前日〜終了後の確認項目（localStorageに保存） |

### パイプライン監視の判定基準

| 項目 | 緑（正常） | 黄（警告） | 赤（異常） |
|---|---|---|---|
| GAS死活（last_trigger_at からの経過） | ≤5分 | 6〜10分 | 11分以上 |
| GAS実行時間残量 | 40分以上 | 20〜39分 | 20分未満 |

---

## 8. 運用マニュアル体系

| ファイル | 対象 | 内容 |
|---|---|---|
| `docs/day-manual.html` | 当日計測スタッフ（非エンジニア） | CSVアップ手順・フォルダ選択ビジュアルガイド・ファイル名チェッカー |
| `docs/handover.html` | 大会管理者・引継ぎ者 | Drive/GAS/GitHub設定の引継ぎ情報 |
| `docs/csv_naming_rules.html` | 計測スタッフ・管理者 | CSVファイル命名規則の詳細 |
| `docs/schedule_input_guide.html` | 大会事務局 | スケジュール・エントリーCSV作成方法 |
| `docs/site-checklist.html` | 管理者・エンジニア | デプロイ前の動作確認22項目 |
| `gas/セットアップガイド.html` | エンジニア | GASの初期設定手順 |

---

## 9. 作業フロー

### 大会当日（1レースの更新フロー）

| 担当 | 作業 | 目安時間 |
|---|---|---|
| 計測スタッフ | RowingTimerWebでタイム計測→CSV書き出し | — |
| **計測スタッフ（手動）** | **ファイル名確認→Driveの正しいフォルダにアップ** | 1〜2分 |
| GAS（自動） | Drive走査→両ポイント揃い検知→JSON生成→GitHub Push→CSV移動 | 0〜2分 |
| Cloudflare（自動） | GitHub Pushを検知→自動デプロイ | 30〜60秒 |
| **合計（最短〜最大）** | | **約2〜4分** |

### 大会前セットアップ（1回限り）

1. GitHub リポジトリ作成・push → Cloudflare Pages デプロイ設定 (**エンジニア**)
2. Google Drive にフォルダ作成: `race_csv/500m/` `race_csv/1000m/` `master/` (**エンジニア**)
3. GAS セットアップ: `saveSetup()` → `setupAll()` → 2分トリガー設定 (**エンジニア**)
4. 大会データ投入: `schedule.csv` と `entries.csv` を `master/` へ投入 → `runImportMaster()` 実行 (**事務局＋エンジニア**)
5. 疎通テスト: テストCSVをDriveに投入 → 2〜3分後にサイト反映確認 (**エンジニア**)
6. スタッフへ当日マニュアルを配布 (**管理者**)

### 前日チェックリスト（主要項目）

- [ ] master.json にスケジュール・エントリーが反映されているか
- [ ] GASトリガーを有効化（前日に設定）
- [ ] **GitHub Token の有効期限を確認**（大会日以降に切れていないか）
- [ ] テストCSVで疎通確認
- [ ] スタッフへマニュアルを再共有

### 大会終了後

- [ ] GASトリガーを停止（Google Apps Script から手動OFF）
- [ ] `race_csv/processed/` の不要ファイルを清掃

---

## 10. 既知の制約・リスク管理

### 設計上の制約

| 項目 | 内容 | 対策 |
|---|---|---|
| GAS実行時間 | 90分/日（無料枠）。実績は32〜40分/日 | 前日ON・最終日後OFFの運用。管理画面で残量表示 |
| GitHub API レート | 5,000回/時（Personal Token）。1レース1〜2Push | 問題なし。制限検知時は15分自動スキップ |
| 反映遅延 | CSVアップ → 表示更新まで最大3〜4分 | 速報用途として許容範囲。マニュアルに明記 |
| 管理画面認証 | URLのみ（読み取り専用のため影響は限定的） | 将来的にCloudflare Accessを検討 |

### リスク一覧

#### 🔴 高リスク

| # | 問題 | 状況 |
|---|---|---|
| R-2 | GitHub Token の失効 | ✅ 前日チェックリストに確認項目を追加済み |
| R-3 | 計測ポイントが揃わない場合の永続スキップ（500mのみ種目等） | ⏸ 設計変更が大きいため保留。運用でカバー |

#### 🟡 中リスク

| # | 問題 | 状況 |
|---|---|---|
| M-1 | ファイル名の大文字小文字不一致（`500M.csv` 等） | ✅ `.toLowerCase()` 比較に修正済み |
| M-2 | 管理画面に認証なし | ⏸ Cloudflare Access 導入を将来検討 |
| M-3 | CSP に `unsafe-inline` を許可 | ⏸ 全インラインJS外部ファイル化が必要（大規模リファクタ） |
| M-4 | 自動更新タイマーの同期によるリクエスト集中 | ✅ ランダムジッター（±15秒）を追加済み |
| M-5 | ハートビートがGitHub Pushを発生しCloudflareビルドを消費 | ⏸ 監視アーキテクチャ変更が必要 |

#### 🟢 低リスク

| # | 問題 | 改善案 |
|---|---|---|
| L-1 | fetchエラー時のリトライロジックなし | 指数バックオフリトライの実装 |
| L-3 | GASのタイムゾーンが明示されていない | `appsscript.json` の `"timeZone": "Asia/Tokyo"` を確認 |
| L-4 | GASのユニットテストなし | clasp + jest 環境の導入を検討 |
| L-5 | processed/ の定期清掃フローなし | 終了後チェックリストに清掃手順を追加 |

### 障害時の対処

| 症状 | 原因候補 | 対処 |
|---|---|---|
| 4分以上サイトが更新されない | GASトリガー停止 / CSVのフォルダ誤り / ファイル名不正 | 管理画面で監視状態を確認 → GASで `runNow()` 手動実行 |
| GAS実行時間が枯渇 | 実行回数が多すぎた（想定外） | 翌日自動リセット。リモートから `runNow()` で補完 |
| 誤CSVをアップしてしまった | スタッフミス | 正しいCSVで上書きアップ。GASが最新ファイルを自動採用 |
| GitHub Token 切れ | Token有効期限超過 | Token を再生成 → GASスクリプトプロパティを更新 |

---

*最終更新: 2026-04-07 14:53 / リポジトリ: [RYUIYAMADA/masters-regatta-2026](https://github.com/RYUIYAMADA/masters-regatta-2026)*
