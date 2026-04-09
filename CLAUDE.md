# 第17回全日本マスターズレガッタ 速報サイト（本番）

## 大会情報
- **大会名**: 第17回全日本マスターズレガッタ
- **日程**: 2026年5月23日(土)〜24日(日)
- **会場**: 石川県津幡漕艇競技場
- **コース**: 1000m（500m・1000m計測）
- **主催**: 石川県ボート協会

## リポジトリ・デプロイ構成
| 項目 | 内容 |
|------|------|
| 開発リポジトリ | `RYUIYAMADA/masters-regatta-2026` |
| 石川県用Fork | `rowingishikawadev-del/masters-regatta-2026` |
| 本番URL | Cloudflare Pages（設定後に更新） |
| テストサイト | https://rowing-live-results.pages.dev |
| ソースベース | rowing-live-results からコピー |

## GitHub アカウント体制
- `RYUIYAMADA`（龍偉）: 開発オーナー・管理者
- `rowingishikawadev-del`（石川県ボート協会スタッフ用）: Fork経由で当日更新を担当

## 作業ログ
- 2026-04-06: 本番サイト初期構築・管理画面・CSVテンプレート整備
- 2026-04-06: Google Driveフォルダ構成・GASトリガー2分間隔設定
- 2026-04-06: システム引継ぎ資料作成
- 2026-04-07: 要項対応4項目実装（複数カテゴリー合同・全角半角正規化・年齢定義A〜N）
- 2026-04-07: モバイルUI全面刷新・フォントサイズ切替（高齢者向け）
- 2026-04-07: 仕様書(spec.html/SPEC.md)・GAS実行時間残量表示・バグ修正
- 2026-04-07: GitHub Actions 半自動ループ追加
- 2026-04-08: テストサイト改善を本番に反映（XSS対策・日付自動選択等）
- 2026-04-08: LINE公式アカウント導入提案書(docs/line-proposal.html)作成
- 2026-04-09: LINE提案書をプレゼン資料に全面リデザイン
- 2026-04-10: CLAUDE.md再開情報を整備

## 残作業（TODO）
- [ ] Cloudflare Pages 本番デプロイ設定
- [ ] GASプロジェクト本番用作成（GITHUB_REPOをこのリポジトリに向ける）
- [ ] スケジュール・エントリーCSV入稿（大会確定後）
- [ ] rowingishikawadev-del アカウントへのコラボレーター権限確認
- [ ] 公開前チェックリスト22項目実施（docs/site-checklist.html）

## ディレクトリ構成
```
masters-regatta-2026/
├── CLAUDE.md              ← このファイル（作業ログ・再開情報）
├── index.html             ← メインページ（観客・参加者向け速報）
├── css/style.css
├── js/app.js              ← フィルタ・検索・レース表示ロジック
├── data/
│   ├── master.json        ← 大会マスタ・スケジュール・エントリー情報
│   └── results/           ← GASがPushするJSON（race_001.json等）
├── admin/9922/            ← 管理者ダッシュボード（URLを知る人のみ）
├── docs/
│   ├── line-proposal.html      ← LINE公式アカウント提案書
│   ├── day-manual.html         ← 当日担当者マニュアル
│   ├── schedule_input_guide.html ← スケジュール入力ガイド
│   ├── site-checklist.html     ← 公開前チェックリスト22項目
│   ├── db_structure.html       ← データベース構造説明
│   ├── handover.html           ← システム引継ぎ資料
│   ├── spec.html               ← システム仕様書（公開用）
│   └── csv_naming_rules.html   ← CSVファイル名ルール
├── gas/
│   ├── Code.gs                 ← GAS自動連携スクリプト
│   ├── appsscript.json
│   └── セットアップガイド.html
├── sample_csv/            ← CSVテンプレート・サンプル
├── test/csv/              ← テスト用CSVデータ
└── tools/                 ← 運用ツール群
```

## 公開ページ一覧（テストサイトで確認可）
| 対象 | URL | 内容 |
|------|-----|------|
| 観客・参加者 | / | 速報トップ |
| 運営責任者 | /admin/9922/ | 管理者ダッシュボード |
| 計測担当 | /docs/day-manual.html | 当日マニュアル |
| 入稿担当 | /docs/schedule_input_guide.html | スケジュール入力ガイド |
| システム担当 | /docs/site-checklist.html | 公開前チェックリスト |
| システム担当 | /docs/db_structure.html | DB構造説明 |

## 技術スタック
- **フロントエンド**: HTML / CSS / JavaScript（静的サイト）
- **ホスティング**: Cloudflare Pages（GitHub連携自動デプロイ）
- **自動連携**: Google Apps Script（Drive監視 → CSV→JSON変換 → GitHub Push）
- **Google Drive**: フォルダID `1sCKohwJK8DWjINLxEfe_eO9Nm-DBshop`

## 自動更新フロー
```
Google Drive (race_csv/500m/, race_csv/1000m/)
  ↓ GAS 2分間隔トリガー
  ↓ 全ラップ揃いチェック（500m + 1000m 両方必要）
  ↓ CSV → JSON変換
  ↓ GitHub Contents API でPush (data/results/race_XXX.json)
  ↓ Cloudflare Pages 自動デプロイ（約1分）
サイト更新完了（合計3分以内）
```

## 重要な制約
- Google Oneアカウント（Workspaceではない）: API制限は無料アカウントと同じ
- GAS実行時間制限: 6分/回、トリガー総実行時間: 90分/日
- GitHub Personal Access Token: スクリプトプロパティで管理（コードに直書き禁止）
