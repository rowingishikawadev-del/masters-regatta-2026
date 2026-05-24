# 第17回全日本マスターズレガッタ 速報サイト（本番・統合正本）

> **2026/05/24 統合**: 旧 `rowing-live-results`（初代テストサイト）と
> 旧 `ishikawa-rowing-2026`（中間版）を統合した正本プロジェクト。
> 詳細: [`MERGER_LOG.md`](./MERGER_LOG.md) 参照。

## 起動コマンド
```bash
cd ~/Desktop/ryui-workspace/projects/rowing/masters-regatta-2026 && claude
```

## 大会情報
- **大会名**: 第17回全日本マスターズレガッタ
- **日程**: 2026年5月23日(土)〜24日(日)
- **会場**: 石川県津幡漕艇競技場
- **コース**: 1000m（500m・1000m計測）
- **主催**: 石川県ボート協会

## 統合の経緯（3 プロジェクト → 1 プロジェクト）

このプロジェクトは、**段階的に進化した 3 つのリポジトリを 2026-05-24 に統合した正本**：

```
[Phase 1] rowing-live-results          ← 初代テストサイト（汎用速報システムの原型）
   ↓ コピー＆大会情報書き換え
[Phase 2] ishikawa-rowing-2026         ← 石川県大会向け中間バージョン
   ↓ 本番化・要項対応・運用機能拡充（4月〜5月）
[Phase 3] masters-regatta-2026         ← ★本番運用版（このプロジェクト・統合正本）
```

統合後の所在:
- **正本（このプロジェクト）**: `projects/rowing/masters-regatta-2026/`
- **旧版アーカイブ**: `archive/rowing-legacy/{rowing-live-results,ishikawa-rowing-2026}/`
- **救出データ**: ishikawa の「テストリザルト」CSV 4 件 → `test/legacy-results/`
- **公開 HTML 進化版**: 旧 `docs/{day-manual,db_structure,schedule_input_guide,site-checklist}.html` は本プロジェクトの `staff/x8f24k/` 配下で進化版として運用中

詳細: [`MERGER_LOG.md`](./MERGER_LOG.md)

## リポジトリ・デプロイ構成（2 リモート系統）

| 項目 | 内容 |
|------|------|
| `origin` リモート | `RYUIYAMADA/masters-regatta-test` |
| `origin` 公開先 | https://masters-regatta-test.pages.dev (テスト環境) |
| `staging` リモート | `rowingishikawadev-del/masters-regatta-2026` |
| `staging` 公開先 | https://masters-regatta-2026-3ha.pages.dev (本番環境・3ha) |
| 統合前の旧リポジトリ | `RYUIYAMADA/rowing-live-results`（初代テスト・archive 移行済み） |
| 統合前の旧リポジトリ | `RYUIYAMADA/ishikawa-rowing-2026`（中間版・archive 移行済み） |

push 運用:
```bash
git push origin main      # テスト環境へデプロイ（masters-regatta-test.pages.dev）
git push staging main     # 本番環境へデプロイ（masters-regatta-2026-3ha.pages.dev）
```

## GitHub アカウント体制
- `RYUIYAMADA`（龍偉）: 開発オーナー・管理者・両リポジトリ管理
- `rowingishikawadev-del`（石川県ボート協会スタッフ用）: 本番リポジトリ管理・当日更新を担当

## 作業ログ（3 プロジェクト統合・時系列）

### 【Phase 1】rowing-live-results: 初代テストサイト構築（2026-04-05〜04-10）
- 2026-04-05: サイトクラッシュ修正・null 安全対応・モバイル UX 改善・実施中1レース限定・バッジ強化
- 2026-04-05: 二重描画解消・perf 改善
- 2026-04-06: 本番サイト初期構築・大会情報の二重表示削除・タブ整理
- 2026-04-06: 管理者ダッシュボード `/admin/9922/` 追加・全面刷新
- 2026-04-06: ページ幅 900px→1170px 拡大・日別タブ追加・1170pxレイアウト
- 2026-04-06: スケジュール表のクルー名切れ・確定バッジ縦文字修正
- 2026-04-06: 結果テーブルの列を「所属→クルー」順に変更
- 2026-04-06: 大会情報を tournament_sample から反映
- 2026-04-06: CSP に unsafe-inline 追加（onclick ブロック解除）
- 2026-04-06: テスト用 6/8 日程追加・isTournamentOver null 安全対応
- 2026-04-06: テスト CSV に 2025-09-15（2日目）スケジュール・エントリー追加
- 2026-04-06: ステータスバー表示内容を全削除（帯のみ残す）
- 2026-04-06: GAS ハートビート機能追加・管理者画面の定期実行監視を正確化
- 2026-04-06: JST 時計表示（Intl.DateTimeFormat 方式）・タイムライン復活
- 2026-04-06: エージェントチームレビュー反映・管理者ダッシュボード大幅改善
- 2026-04-08: 高齢者向けフォントサイズ切替 UI 実装
- 2026-04-08: フォントサイズトグルをヘッダー右上に移動・デザイン改善
- 2026-04-08: footer text 移動・extra footer 要素削除
- 2026-04-08: terminology consistency across all files
- 2026-04-08: セキュリティ・バグ修正・本番コードから console.log 除去
- 2026-04-08: next-race-info をステータスバーに表示
- 2026-04-08: **site-checklist.html 22 項目チェックリスト作成**
- 2026-04-10: グリーンテーマ磨き上げ（Noto Sans JP・ヘッダー深み・カード影・カテゴリーバッジ統一）

### 【Phase 2】ishikawa-rowing-2026: 石川県大会用コピー（2026-04-10）
- 2026-04-10: rowing-live-results をベースに石川県大会サイト構築開始
- 2026-04-10: 大会情報を第 17 回全日本マスターズレガッタ（石川県津幡）に更新

### 【Phase 3】masters-regatta-2026: 本番運用版（2026-04-06〜05-24）

#### 4月: 本番セットアップ・要項対応
- 2026-04-06: 本番サイト初期構築・管理画面・CSV テンプレート整備
- 2026-04-06: Google Drive フォルダ構成・GAS トリガー 2 分間隔設定
- 2026-04-06: システム引継ぎ資料作成
- 2026-04-07: 要項対応 4 項目実装（複数カテゴリー合同・全角半角正規化・年齢定義 A〜N）
- 2026-04-07: モバイル UI 全面刷新・フォントサイズ切替（高齢者向け）
- 2026-04-07: 仕様書 (spec.html/SPEC.md)・GAS 実行時間残量表示・バグ修正
- 2026-04-07: GitHub Actions 半自動ループ追加
- 2026-04-08: テストサイト改善を本番に反映（XSS 対策・日付自動選択等）
- 2026-04-08: LINE 公式アカウント導入提案書 (staff/x8f24k/line-proposal.html) 作成
- 2026-04-09: LINE 提案書をプレゼン資料に全面リデザイン
- 2026-04-10: CLAUDE.md 再開情報を整備
- 2026-04-19: YouTube 表示バグ修正（aspect-ratio・HTML 直書き・CSP 設定）
- 2026-04-19: GAS 本番設定完了（GITHUB_TOKEN 更新・runNow 動作確認済）
- 2026-04-19: テストデータ追加（race_001・race_002 CSV）
- 2026-04-19: マニュアル類 URL 更新（本番 URL 確定: masters-regatta-2026-3ha.pages.dev）
- 2026-04-19: 運用ドキュメント類を docs/ → staff/x8f24k/ に移動（URL 難読化）
- 2026-04-19: 種目別ソート・エントリーテーブル表示・モバイルでタブ表示・フォントサイズ差別化（11/14/19px）
- 2026-04-19: 所属を sub-line として表示・モバイル時の情報損失防止
- 2026-04-19: master.json リセット（schedule・tournament・age_categories クリア）
- 2026-04-19: YouTube 幅・max-height・レスポンシブ調整（複数イテレーション）
- 2026-04-19: フォントサイズ・行高を種目別表示に合わせて拡大
- 2026-04-19: footer-note 削除・footer gap 修正（body flex column min-height 100vh）
- 2026-04-20: **セキュリティ修正**（XSS エスケープ・エラーメッセージの情報漏洩防止）
- 2026-04-20: clipboard-write を YouTube iframe allow list から削除
- 2026-04-20: app.js バージョン bump（キャッシュリフレッシュ）

#### 5月前半: GAS 連携強化・本番展開
- 2026-05-04: clearAllResults を pre-race チェックリスト（section E）に追加
- 2026-05-09: GAS に checkTriggerStatus() 追加（2 分サイクル検証）
- 2026-05-09: 非エンジニア向け出力改善
- 2026-05-09: day-manual の Drive フォルダリンクを本番に更新
- 2026-05-09: 種目別ビューから「未実施／予定」バッジ削除
- 2026-05-10: admin パネルにブラウザキャッシュクリアボタン追加
- 2026-05-10: localStorage キープレフィックス修正
- 2026-05-10: `.cleared_at` push で Cloudflare 強制再デプロイ
- 2026-05-10: **大量の force redeploy**（Cloudflare キャッシュパージ対策・約 200 コミット）
- 2026-05-10: テスト結果データを大量削除（race_001〜019 など）
- 2026-05-10: 本番 URL を masters-regatta-2026-3ha.pages.dev に確定（pages.dev URL は immutable）
- 2026-05-11: **clearAllResults を tombstone 上書き方式 → master.json 1 コミット方式**に変更（Cloudflare ビルド過多対策）
- 2026-05-11: clearAllResults 実行時に processed CSV を削除済フォルダへ移動
- 2026-05-11: CSV ファイル名の任意プレフィックスに対応
- 2026-05-11: YouTube 埋め込みセクション削除（今大会は配信なし）

#### 5月後半: 本番直前データ確定・大会運用
- 2026-05-18: **発艇スケジュールを JARA 公式 PDF(0507) で完全再構築（123 レース）**
- 2026-05-18: `tournament.name` → `race_name` でヘッダー大会名を反映（キー名統一）
- 2026-05-18: site-checklist の旧キー名 tournament.name を race_name に修正
- 2026-05-18: master.json から youtube_url を削除（今大会は配信なし）
- 2026-05-18: 旧 schedule.csv backup を削除（不要）
- 2026-05-19: **entries.csv を JARA 公式 PDF (day1 ver5 / day2 ver3) で再構築・docs 数値修正**
- 2026-05-20: 全結果クリア（manual reset）・本番デプロイ準備
- 2026-05-21: **速報テーブルに区分列（カテゴリー）を全レース常時表示**（本番直前最終調整）
- **2026-05-23(土)〜05-24(日)**: **🏆 大会本番**（GAS heartbeat 2 分間隔で稼働・結果リアルタイム更新）

#### 大会後
- 2026-05-24: **3 プロジェクト統合**（rowing-live-results / ishikawa-rowing-2026 を本プロジェクトに統一）
- 2026-05-24: workspace 再構築（projects/rowing/ 配下に配置・カテゴリ階層化）

## 状態（大会完了後）

| 項目 | ステータス |
|---|---|
| Cloudflare Pages 本番デプロイ（masters-regatta-2026-3ha.pages.dev） | ✅ 稼働済 |
| GAS プロジェクト本番設定（GITHUB_TOKEN・GITHUB_REPO） | ✅ 設定済 |
| スケジュール・エントリー CSV 入稿 | ✅ JARA 公式 PDF 反映済（5/18-19） |
| rowingishikawadev-del コラボレーター権限 | ✅ 確認済 |
| 公開前チェックリスト 22 項目 | ✅ 実施済（5/22 大会2日前） |
| **🏆 第17回全日本マスターズレガッタ 本番運用** | ✅ **完了**（2026-05-23・24） |
| 3 プロジェクト統合 | ✅ 完了（2026-05-24） |

## 今後のロードマップ（大会後・継続開発候補）

- [ ] 大会振り返り・運用ログ整理（GAS ヒートマップ・エラー集計）
- [ ] 来年（2027 第 18 回）に向けた汎用化（地域名・大会名のパラメータ化）
- [ ] LINE 公式アカウント連携（line-proposal.html 提案済）の実装判断
- [ ] テスト環境（origin = masters-regatta-test）の役割明確化 or 統廃合

## ディレクトリ構成（統合後）
```
masters-regatta-2026/
├── CLAUDE.md              ← このファイル（3プロジェクト統合作業ログ・再開情報）
├── MERGER_LOG.md          ← 統合経緯ログ（rowing-live-results / ishikawa から）
├── index.html             ← メインページ（観客・参加者向け速報）
├── css/style.css
├── js/app.js              ← フィルタ・検索・レース表示ロジック
├── data/
│   ├── master.json        ← 大会マスタ・スケジュール・エントリー情報
│   └── results/           ← GASがPushするJSON（race_001.json等）
├── admin/9922/            ← 管理者ダッシュボード（URLを知る人のみ・難読化パス）
├── staff/x8f24k/          ← 運用ドキュメント一覧（URLを知る人のみ・難読化パス）
│   │                        旧プロジェクトの docs/*.html はこちらに進化済
│   ├── index.html              ← ドキュメント一覧ハブ
│   ├── line-proposal.html      ← LINE公式アカウント提案書
│   ├── day-manual.html         ← 当日担当者マニュアル（旧docs/から進化）
│   ├── schedule_input_guide.html ← スケジュール入力ガイド（旧docs/から進化）
│   ├── site-checklist.html     ← 公開前チェックリスト22項目（旧docs/から進化）
│   ├── db_structure.html       ← データベース構造説明（旧docs/から進化）
│   ├── handover.html           ← システム引継ぎ資料
│   ├── spec.html               ← システム仕様書（公開用）
│   ├── thursday-checklist.html ← 木曜チェックリスト
│   └── csv_naming_rules.html   ← CSVファイル名ルール
├── docs/                  ← 設計ドキュメント（.md のみ、非公開）
│   ├── SPEC.md / ARCHITECTURE.md
│   ├── hub-site-spec.md / operation-handover.md
│   ├── production-setup-guide.md / improvement-backlog.md
│   ├── RESEARCH_sports_results_systems.md
│   └── progression/
├── gas/
│   ├── Code.gs                 ← GAS自動連携スクリプト
│   ├── appsscript.json
│   ├── pdf_publisher/          ← PDF自動発行
│   ├── judge_form_publisher/   ← 審判フォーム
│   └── セットアップガイド.html
├── master/                ← マスタCSV（tournament/schedule/entries）
├── sample_csv/            ← CSVテンプレート・サンプル
├── test/                  ← テスト用データ
│   ├── csv/                    ← テスト用CSV
│   └── legacy-results/         ← ishikawa-rowing-2026 から救出した テストリザルト 4件
├── print_templates/       ← 印刷用テンプレート
├── progression-engine/    ← 進行管理エンジン
├── scripts/               ← 運用スクリプト
├── tools/                 ← 運用ツール群
└── _headers / _redirects / 404.html  ← Cloudflare Pages 設定
```

## 公開ページ一覧（テストサイトで確認可）
| 対象 | URL | 内容 |
|------|-----|------|
| 観客・参加者 | / | 速報トップ |
| 運営責任者 | /admin/9922/ | 管理者ダッシュボード |
| 運用スタッフ全員 | /staff/x8f24k/ | ドキュメント一覧ハブ |
| 計測担当 | /staff/x8f24k/day-manual.html | 当日マニュアル |
| 入稿担当 | /staff/x8f24k/schedule_input_guide.html | スケジュール入力ガイド |
| システム担当 | /staff/x8f24k/site-checklist.html | 公開前チェックリスト |
| システム担当 | /staff/x8f24k/db_structure.html | DB構造説明 |

## 技術スタック
- **フロントエンド**: HTML / CSS / JavaScript（静的サイト）
- **ホスティング**: Cloudflare Pages（GitHub連携自動デプロイ）
- **自動連携**: Google Apps Script（Drive監視 → CSV→JSON変換 → GitHub Push）
- **Google Drive**: フォルダID `1LA-9BOcZtxesmlY5V0BrMgotvEEB7eu3`（当日CSV投入フォルダ）

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
- Cloudflare Pages の `*.pages.dev` URL は作成時に固定（変更不可）→ 本番は `masters-regatta-2026-3ha.pages.dev` を継続使用
- 旧 URL `rowing-live-results.pages.dev`（初代テスト）はソース移行済みのため非推奨

## 統合プロジェクトとしての引継ぎ要点（再開時に最初に読む）

1. **本プロジェクトは「3 プロジェクト統合の正本」**。旧 2 つは `archive/rowing-legacy/` で読み取り専用。
2. **2 リモート構成**: `origin` = テスト環境、`staging` = 本番環境（rowingishikawadev-del）。両方への push を意識する。
3. **大会本番は完了済み**（2026-05-23・24）。今後の修正は「振り返り改善」or「来年へ向けた汎用化」が中心。
4. **公開 HTML の進化**: 旧版 `docs/*.html` → 本版 `staff/x8f24k/*.html`。古いリンクは差し替え済。
5. **clearAllResults の変遷**: tombstone 上書き方式 → master.json 1コミット方式（5/11 で Cloudflare ビルド過多対策）。今後の Phase はこの最新方式を維持する。
6. **JARA 公式 PDF**: スケジュール (0507 版) と entries (day1 ver5 / day2 ver3) が確定版。これより古い CSV は使わない。
