# ボート競技 速報サイト — システム仕様書

**全日本マスターズレガッタ 2026 向けビルド（masters-regatta-2026）**

| 項目 | 内容 |
|---|---|
| 作成日 | 2026-04-07 |
| リポジトリ | [RYUIYAMADA/masters-regatta-2026](https://github.com/RYUIYAMADA/masters-regatta-2026) |
| 本番URL | https://masters-regatta-2026-3ha.pages.dev |

---

## 目次

1. [システム概要・アーキテクチャ](#1-システム概要アーキテクチャ)
2. [更新フロー・作業フロー](#2-更新フロー作業フロー)
3. [データフロー詳細](#3-データフロー詳細)
4. [フロントエンド仕様](#4-フロントエンド仕様)
5. [インフラ・セキュリティ](#5-インフラセキュリティ)
6. [管理者画面仕様](#6-管理者画面仕様)
7. [運用マニュアル体系](#7-運用マニュアル体系)
8. [既知の制約・リスク](#8-既知の制約リスク)
9. [問題点・リスク・改善提案](#9-問題点リスク改善提案レビュー対象)

---

## 1. システム概要・アーキテクチャ

### 目的
ボート競技大会のレース結果をリアルタイムで観客・参加者にWebブラウザから提供する静的速報サイト。計測スタッフがCSVをアップロードするだけで、エンジニア不在でも自動更新される仕組みを実現する。

### 全体構成

```
計測アプリ(RowingTimerWeb)
  → CSV出力（スタッフが手動アップ）
  → Google Drive（race_csv/500m・1000m/）
  → GAS（2分間隔トリガー）
  → GitHub（Contents API）
  → Cloudflare Pages（自動デプロイ）
  → ブラウザ（観客・参加者）
```

### コンポーネント一覧

| コンポーネント | 技術・サービス | 役割 | 費用 |
|---|---|---|---|
| フロントエンド | HTML / CSS / Vanilla JS（ビルドツールなし） | レース結果表示UI | 無料 |
| ホスティング | Cloudflare Pages | 静的ファイル配信・CDN・HTTPS | 無料 |
| ソースコード管理 | GitHub（RYUIYAMADA/masters-regatta-2026） | コード・JSONデータの保管とバージョン管理 | 無料 |
| CSV監視・変換 | Google Apps Script（GAS） | DriveのCSVをJSONに変換しGitHubへPush | 無料（制限あり） |
| CSV投入先 | Google Drive（共有フォルダ） | 計測スタッフがCSVをアップロードする作業領域 | 無料 |

### 設計方針

- **サーバーレス・フルスタティック**: バックエンドサーバーなし。データはすべてGitHubリポジトリ内のJSONファイルとして管理
- **ゼロランニングコスト**: すべてのサービスを無料枠で運用
- **エンジニア不在での運用**: スタッフがCSVをDriveにアップするだけで更新。コマンドライン操作不要
- **同時アクセス耐性**: Cloudflare CDNによる配信のためスパイクアクセスに強い

---

## 2. 更新フロー・作業フロー

### 2.1 大会当日の更新フロー（1レースあたり）

| 担当 | 作業 | 所要時間 |
|---|---|---|
| 計測スタッフ | RowingTimerWebでタイム計測 → CSV書き出し | — |
| **計測スタッフ（手動）** | **ファイル名確認 → Driveの正しいフォルダにアップ** | 1〜2分 |
| GAS（自動） | Drive監視（2分間隔） → 両ポイント揃い検知 → JSON組み立て → GitHub Push → CSVをprocessed/へ移動 | 0〜2分 |
| Cloudflare（自動） | GitHub Pushを検知 → 自動デプロイ | 30〜60秒 |
| 観客・参加者 | 速報サイトを開く → 120秒ごとに自動fetch → 結果表示 | — |
| **合計（最短〜最大）** | | **2〜4分** |

> ⚠️ **スタッフが行うのは「CSVを正しいフォルダにアップする」だけ。それ以外は自動。**

### 2.2 大会前セットアップフロー（1回限り）

1. GitHubリポジトリ作成・push → Cloudflare Pagesにデプロイ設定（**エンジニア**）
2. Google Driveにフォルダ作成: `race_csv/500m/` `race_csv/1000m/` `master/`（**エンジニア**）
3. GASセットアップ: `saveSetup()`実行 → `setupAll()`実行 → 2分トリガー設定（**エンジニア**）
4. 大会データ投入: `schedule.csv` と `entries.csv` を `master/` に投入 → `runImportMaster()`実行（**事務局＋エンジニア**）
5. 疎通テスト: テストCSVをDriveに投入 → 2〜3分後にサイト反映確認（**エンジニア**）
6. スタッフへ当日マニュアルを配布（**管理者**）

### 2.3 GAS内部処理フロー（onTrigger実行ごと）

```
[開始]
 ↓
① LockService でロック取得（失敗したら即終了・二重実行防止）
 ↓
② GitHub APIレート制限フラグを確認（制限中は15分スキップ）
 ↓
③ processPendingCSVs()
   - race_csv/500m/ と race_csv/1000m/ を走査
   - ファイル名を正規表現でマッチ
   - 全ポイント揃ったレースのみ処理
   - buildAndPushRaceJSON() → pushToGitHub() → CSVをprocessed/へ移動
 ↓
④ updateTriggerHeartbeat_()
   - master.json の last_trigger_at を更新（管理画面の死活監視用）
 ↓
[ロック解放・終了]（次の実行は2分後）
```

> ⚠️ 実行時間が **4分**（CONFIG.maxExecutionMs）を超えると自動停止。処理途中のレースは次の2分後に再試行。

---

## 3. データフロー詳細

### 3.1 CSVファイル仕様

**ファイル命名規則**

正規表現: `/^(?:\d{8}_\d{6}_)?R(\d{3})_(.+)\.csv$/i`

| 形式 | 例 | 備考 |
|---|---|---|
| 推奨形式 | `R001_500m.csv` | レース番号3桁ゼロ埋め必須 |
| 旧形式（後方互換） | `20260607_070000_R001_500m.csv` | RowingTimerWebが自動付与する日時プレフィクス |

**CSVフォーマット（RowingTimerWeb出力）**

```
measurement_point,lane,lap_index,time_ms,formatted,race_no,tie_group,photo_flag,note
500m,1,1,112834,1:52.834,1,,,
500m,2,1,113201,1:53.201,1,,,
```

| カラム | 型 | 内容 | 必須 |
|---|---|---|---|
| measurement_point | string | 計測ポイント名（500m / 1000m） | ○ |
| lane | int | レーン番号（1〜） | ○ |
| time_ms | int | 計測タイム（ミリ秒） | ○ |
| tie_group | string | 同着グループID | — |
| photo_flag | bool | 写真判定フラグ | — |
| note | string | 備考（DNS/DNFなど） | — |

> GASはCSVの `formatted` 列を無視し、`time_ms` から独自に再計算（`M:SS.cc` 形式）。BOM（UTF-8 BOM）は自動除去。

### 3.2 JSONデータ構造

**data/master.json**

```json
{
  "generated_at": "",
  "updated_at": "",
  "last_trigger_at": "",
  "measurement_points": ["500m", "1000m"],
  "tournament": {
    "race_name": "全日本マスターズレガッタ 2026",
    "dates": ["2026-06-06", "2026-06-07"],
    "venue": "戸田公園ボート場",
    "course_length": 1000,
    "youtube_url": ""
  },
  "schedule": [
    {
      "race_no": 1,
      "event_code": "M_1X",
      "event_name": "男子シングルスカル",
      "category": "M",
      "age_group": "G",
      "round": "FA",
      "date": "2026-06-07",
      "time": "07:00",
      "entries": [
        { "lane": 1, "crew_name": "...", "affiliation": "..." }
      ]
    }
  ]
}
```

**data/results/race_XXX.json**

```json
{
  "race_no": 1,
  "updated_at": "2026-06-07T07:03:12.000Z",
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
      "status": "finish"
    }
  ]
}
```

---

## 4. フロントエンド仕様

### ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 公開ページ本体 |
| `css/style.css` | 全スタイル（レスポンシブ・モバイルカードレイアウト） |
| `js/app.js` | 全ロジック（データ取得・レンダリング・フィルタ・タイマー） |
| `data/master.json` | 大会情報・スケジュール・エントリー |
| `data/results/race_XXX.json` | 各レースの結果（GASが自動生成・Push） |
| `_headers` | Cloudflare Pages用のレスポンスヘッダー設定 |
| `admin/9922/index.html` | 管理者ダッシュボード |

> ⚠️ 外部ライブラリ・NPMパッケージ・ビルドツールは一切使用していない（Vanilla JS）

### データ取得・更新ロジック

- **初期ロード**: `data/master.json` をfetch → 全レース結果を**並列fetch**（`Promise.allSettled`） → UI描画
- **自動更新**: 120秒間隔（±15秒のランダムジッターで同時アクセスを分散）
- **オフライン検知**: `navigator.onLine` でステータスバーに表示
- **読み込み遅延検知**: 8秒経過で「接続確認」メッセージを自動表示

### ビュー構成

| ビュー | 内容 |
|---|---|
| ① 種目別（toggle） | event_codeでグループ化したアコーディオン |
| ② 全レース一覧（table） | 全レースを横断表示。列クリックでソート可能 |
| ③ スケジュール（schedule） | 日別タブで発艇時刻・組・ラウンドを表示 |

### 動作環境

| プラットフォーム | 対応バージョン |
|---|---|
| iPhone (iOS Safari) | iOS 14 以上 |
| Android (Chrome) | Android 9 以上 |
| PC Chrome | Chrome 90 以上 |
| PC Edge | Edge 90 以上 |
| PC Safari | Safari 14 以上 |
| PC Firefox | Firefox 88 以上 |
| Internet Explorer | **非対応**（フッターに明記） |

---

## 5. インフラ・セキュリティ

### HTTPヘッダー設定（_headersファイル）

| ヘッダー | 値 | 目的 |
|---|---|---|
| Cache-Control (default) | no-cache | HTMLは毎回再検証 |
| Cache-Control (data/*) | no-store, no-cache, must-revalidate | JSONは必ずサーバーから取得（速報性確保） |
| Cache-Control (css/*, js/*) | public, max-age=86400 | 静的アセットは1日キャッシュ |
| X-Content-Type-Options | nosniff | MIMEタイプスニッフィング防止 |
| X-Frame-Options | DENY | クリックジャッキング防止 |
| Content-Security-Policy | default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src https://www.youtube.com | 外部リソース制限 |

### シークレット管理

| シークレット | 保管場所 |
|---|---|
| GitHub Personal Access Token | GASスクリプトプロパティ（暗号化） |
| Drive フォルダID | GASスクリプトプロパティ（暗号化） |
| 管理者画面URL | 関係者間で口頭・限定共有 |

> ⚠️ 管理画面（`admin/9922/`）はHTTP認証なし。URLによるセキュリティ・バイ・オブスキュリティを採用。URLを関係者のみに共有する運用で対処。

---

## 6. 管理者画面仕様

**URL**: `https://masters-regatta-2026-3ha.pages.dev/admin/9922/`

静的HTMLで完結する読み取り専用の監視ダッシュボード。

| セクション | 内容 | データソース |
|---|---|---|
| ① 大会サマリー | 大会名・期間・種目数・エントリー数・結果投入数 | master.json |
| ② タイムライン | 発艇予定時刻と結果投入状況を時系列表示 | master.json + results/ |
| ③ CSV自動アップロード監視 | GASパイプライン状態・CSVファイル名チェッカー | master.json（last_trigger_at） |
| ④ テストCSVダウンロード | テンプレート・サンプルCSVへのリンク | 静的ファイル |
| ⑤ リンク一覧 | 全管理URLのリンク集 | 静的HTML |
| 当日チェックリスト | 前日〜終了後のチェック項目（localStorage保存） | localStorage |

### パイプライン監視の状態判定

| ステップ | 判定条件 |
|---|---|
| GAS自動処理 | `last_trigger_at` から経過時間 ≤5分→緑、6〜10分→黄、11分以上→赤 |
| GAS実行時間残量 | 0.12分/回で推計。残量をプログレスバー表示。残20分未満で赤警告 |

---

## 7. 運用マニュアル体系

| ファイル | 対象者 | 内容 |
|---|---|---|
| `docs/day-manual.html` | 当日計測スタッフ（非エンジニア） | CSVアップロード手順・NG/OKファイル名比較・ブラウザ内チェッカー |
| `docs/handover.html` | 大会管理者・引継ぎ者 | システム引継ぎ情報・Drive/GAS/GitHub設定内容 |
| `docs/csv_naming_rules.html` | 計測スタッフ・管理者 | CSVファイル命名規則の詳細 |
| `docs/schedule_input_guide.html` | 大会事務局 | スケジュール・エントリーCSV作成方法 |
| `docs/site-checklist.html` | 管理者・エンジニア | デプロイ前の動作確認22項目 |
| `gas/セットアップガイド.html` | 管理者・エンジニア | GASの初期設定手順 |

### 人為的ミス防止の仕組み

- フォルダ選択ビジュアルガイド（500m/1000mの分岐をカード形式で表示）
- NG/OK ファイル名比較（「m抜け」「小文字r」「桁数不足」の具体例）
- **CSVファイル名チェッカー**（当日マニュアル・管理画面の両方に設置。入力するとリアルタイムで正誤判定・投入先フォルダを表示）
- GAS側での二重チェック（ファイル名パターン不一致・フォルダ不一致はスキップしてログに記録）

---

## 8. 既知の制約・リスク

### 設計上の制約

| 項目 | 制約内容 | 対策 |
|---|---|---|
| GAS実行時間 | 無料枠90分/日 | 実測で1日約32〜40分の消費。前日から有効化・最終日終了後に停止する運用で対処。管理画面で残量をプログレスバー表示 |
| GitHub API レート制限 | Personal Access Token: 5,000回/時 | 1レースにつきPush1〜2回のため問題なし。制限検知時は15分スキップ |
| 反映遅延 | CSVアップ → サイト更新まで最大3〜4分 | 速報サイトとしての許容範囲。マニュアルに「約2〜3分」と明記 |
| 管理者画面の認証 | URLのみによるアクセス制御 | 管理画面は読み取り専用。URLを関係者のみに共有 |

### 障害シナリオと対処

| シナリオ | 原因 | 対処 |
|---|---|---|
| サイトが更新されない（4分以上） | GASトリガー停止 / CSVのフォルダ誤り / ファイル名不正 | 管理画面のパイプライン監視を確認 → GASエディタで `runNow()` を手動実行 |
| GAS実行時間枯渇 | 当日の実行回数が多すぎた | 翌日自動リセット。リモート管理者が `runNow()` を手動実行して補完 |
| 誤ったCSVをアップした | スタッフのミス | 正しいCSVで上書きアップ。GASが最新ファイルを自動採用 |

---

## 9. 問題点・リスク・改善提案（レビュー対象）

### 🔴 高リスク

| # | 問題 | 影響 | 改善提案 | 状況 |
|---|---|---|---|---|
| ~~R-1~~ | GAS実行時間の枯渇 | — | 実測で1日約32〜40分と判明。運用ルールで対処可能 | ✅ **解決済み** |
| R-2 | GitHub Personal Access Tokenの有効期限 | 大会直前に失効するとGASがPushできなくなる | 前日チェックリストに確認項目を追加済み | ✅ **対処済み** |
| R-3 | 計測ポイントが揃わない場合に永続スキップ | 500mのみの種目が未処理になる | per-race の course_type 実装が必要（設計変更が大きいため保留） | ⏸ 保留 |
| R-4 | master.jsonの整合性チェックなし | entries.csvのrace_no不整合を検知できない | `importMasterData()` 実行時に警告ログを出力するよう修正済み | ✅ **対処済み** |

### 🟡 中リスク

| # | 問題 | 影響 | 改善提案 | 状況 |
|---|---|---|---|---|
| M-1 | ファイル名の大文字小文字処理が不統一 | `R001_500M.csv`（Mが大文字）がスキップされる | `.toLowerCase()` 比較に修正済み | ✅ **修正済み** |
| M-2 | 管理画面に認証なし | URL漏洩で誰でも閲覧可能（読み取り専用のため影響は限定的） | Cloudflare Access導入を将来検討 | ⏸ 保留 |
| M-3 | CSPに `unsafe-inline` を許可 | XSSバイパスリスクが増加 | 全インラインJSの外部ファイル化が必要（大規模リファクタ） | ⏸ 保留 |
| M-4 | 自動更新タイマーが同期 | 同時アクセス時にリクエストが集中 | ランダムジッター（±15秒）を追加済み | ✅ **修正済み** |
| M-5 | ハートビートがGitHub Pushを発生 | Cloudflareビルド回数を無駄に消費 | 監視アーキテクチャ自体の変更が必要 | ⏸ 保留 |

### 🟢 低リスク（改善でUXが向上）

| # | 問題 | 改善提案 |
|---|---|---|
| L-1 | fetch失敗時のリトライロジックなし | 指数バックオフリトライの実装 |
| L-2 | results/のJSONを削除しても検知できない | 引継ぎ書に再処理不可の旨を明記 |
| L-3 | タイムゾーンが明示的に設定されていない | `appsscript.json` の `"timeZone": "Asia/Tokyo"` を確認 |
| L-4 | GASのユニットテストなし | clasp + jest 環境の導入を検討 |
| L-5 | processed/フォルダの定期清掃フローなし | 終了後チェックリストに「processed/を空にする」を追加 |

---

*作成日: 2026-04-07 / リポジトリ: RYUIYAMADA/masters-regatta-2026*
