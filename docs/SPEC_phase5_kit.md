# SPEC: Phase 5 公開プラグイン「regatta-results-kit」 v1

作成: 2026-06-12 Fable 5（PM）。Gate1 S-M2/S-M3/E-M3/D-M4 と龍偉裁定（テンプレrepo+CCプラグイン併用 / 新規クリーンrepo / GAS継続・gitレス運用）準拠。

## 1. 配布モデル

- **GitHub テンプレートリポジトリ**（実体）: `RYUIYAMADA/regatta-results-kit`。**git 履歴ゼロで新規作成**（S-M2: masters-regatta-2026 の履歴は一切持ち込まない）。当面 private、公開（public化・Template repository 設定）は security 最終 Gate + 龍偉 GO 後
- **Claude Code プラグイン**（ウィザード）: kit 内 `.claude/commands/regatta-setup.md`（スラッシュコマンド）が対話で config 作成→scaffold 実行→GAS/Pages 手順書提示まで誘導
- 役割分担: 初期構築 = 技術担当（or Claude Code）が kit で実施 / **日常運用 = Google ツールのみ**（CSV を Drive に入れる→GAS が自動処理。git 接触ゼロ）

## 2. リポジトリ構成（新規 repo のレイアウト）

```
regatta-results-kit/
├ site/                  ← 配信テンプレ（**Cloudflare Pages の Build output directory = `site`**。GAS・ツール・CIのデータパスも site/data/ に統一）
│   └ admin/__ADMIN_PATH__/index.html   ← S-M3: scaffold がランダムパスに置換
├ staff/__STAFF_PATH__/  ← staff-templates/ 6本+shared.css を移植（プレースホルダー形式のまま）
├ gas/                   ← 3 GAS プロジェクト（クリーン版）+ shared/ + build_gas.py 連携
├ template/              ← CSVテンプレ・sample（フィクションデータのみ）+ tournament.config.example.json
├ tools/                 ← common.py / generate_master / simulate_pipeline / watch / check_status /
│                          init_tournament（ウィザード）/ build_gas / **scaffold.py（新規）**
├ test/                  ← e2e_test.py + フィクションfixture（masters の test/ を移植）
├ docs/                  ← ARCHITECTURE（汎用化版）/ SETUP_GUIDE.md（E-M3: GAS手順書）/ SPEC_phase3_config.md（スキーマ正本）
├ .claude/commands/regatta-setup.md
├ .github/workflows/validate.yml（+ watchdog テンプレ・schedule停止状態）
├ Makefile / VERSION(0.1.0) / LICENSE(MIT) / README.md（日本語正・英語サマリ）/ .gitignore
```

## 3. scaffold.py（一発生成の心臓・E-M3 準拠）

`python3 tools/scaffold.py --config tournament.config.json [--out <dir>]`（デフォルト out = リポジトリ自身 = テンプレrepoから作った新repoを上書き整形）

処理: ①config 検証（必須フィールド・色形式）②`__ADMIN_PATH__`→ランダム8hex / `__STAFF_PATH__`→ランダム6hex に**ディレクトリ名ごと**置換 ③staff テンプレの `{{...}}` を config 値で全置換（置換漏れ grep ゼロを自己検査・残存なら exit 1）④site/ の brand CSS 変数を config.brand で上書き ⑤master.json 雛形（v3・schema_version:3）を site/data/ に生成 ⑥`docs/SETUP_GUIDE.generated.md` を出力（GAS clasp push・setupFromConfig 用 JSON スニペット・Pages 接続・GitHub Variables の手順。**完全自動化はしない**=E-M3）⑦実行サマリ表示

受入（Gate 5・E-M3 分割）: クリーン環境（macOS/Node20/Py3.11）で「テンプレから新repo作成→init_tournament→scaffold→`python3 -m http.server` で表示」**30分以内**。GAS は手順書出力まで。

## 4. セキュリティ Gate（公開前必須）

- `git log --all -S` で実ID・実トークン・実名クルー名ゼロ件 / サンプルデータは全てフィクション
- 固定の隠しパス残存ゼロ（`9922` / `x8f24k` が kit 内に存在しない）
- PAT ガイドは fine-grained（Contents RW・対象repo限定・90日）で記載
- 個人情報ガイダンス（選手名掲載の注意・compliance 文言）を README に含める
- public 化は龍偉の明示 GO が条件（PM は private 作成まで）

## 5. Phase 6 連携（年度ハブ・本 SPEC に含む）

- kit に `hub/` を追加: 協会ハブのテンプレ。`hub/association.json`（協会名・hub_url・tournaments[]: {id,name,year,dates,**venue(任意)**,status: upcoming|live|final,url}）+ `hub/index.html`（年タブ→大会カード一覧。final は「過去大会」セクション分離。バッジは色+テキスト）
- site/ テンプレのヘッダに「ハブへ戻る」リンク（master.json `tournament.hub_url` が非空のときのみ表示・D-M3）
- ハブ自体も静的1ページ＝任意の Pages で配信可。大会追加 = association.json に1エントリ追記（将来 CC プラグインが代行）
