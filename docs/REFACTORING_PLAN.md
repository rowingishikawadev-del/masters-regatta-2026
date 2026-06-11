# 完全リファクタリング計画書 — masters-regatta-2026 → 汎用大会システム・プラグイン化

- 作成: 2026-06-12 / 設計: Claude Fable 5（メインセッション）
- 監査ソース: Sonnet サブエージェント4本による領域別監査（GAS / フロントエンド / Python・CI / データ・ドキュメント）
- 最終ゴール（龍偉指示 2026-06-12）:
  1. **公開プラグイン化** — 新規大会のシステム一式（速報サイト・GAS・帳票・運用ドキュメント）を一発生成できるプラグインを公開する
  2. **年間ハブ機能** — ボート協会が1年の複数大会の結果を次々アップし、大会を一覧表示できる機能を含める
  3. 順序: **コードレビューで安定化 → リファクタ → プラグイン化**

---

## 0. 現状診断サマリー（監査結果の要点）

| 領域 | 規模 | 主な無駄 |
|---|---|---|
| GAS 3プロジェクト | 約4,400行 | コア関数11種がコピペ重複 / 完全デッドコード約100行（pdf_publisher:1061-1160） / Drive・Sheet ID等が10箇所超に直書き |
| フロントエンド | app.js 1,627行 + admin 1,206行 | renderToggleView と renderTableView で約850行のコピペ重複 / 未使用CSS 200-300行 / admin が app.js のロジックを再実装 |
| Python tools | 9本+α | `class C`+log関数が5ファイルに複製 / import_entries.py は現スキーマ非互換で実行不能 / migration残骸 / Makefile `push-test` 壊れ |
| CI | 5 workflow | **heartbeat-watchdog が大会終了後も10分毎に稼働し続け Issue にコメントを積み続けている**（要即停止） |
| データ | 136 JSON + CSV 40本 | サンプルCSVが4ディレクトリ（sample_csv/test/csv/test/master/研修）に意味重複・乱立 / tools/ 直下に本番データ残骸 |
| progression-engine | TS 9ファイル | **完全孤立**。npm install すら未実行。どこからも参照されていない |
| docs | 8本 | SPEC.md・operation-handover.md が陳腐化（統合前の内容で停止） |
| 未コミット | 2ファイル | pdf_publisher v0.20-0.21（+126/-50）と CLAUDE.md スリム化（-261行）が浮いている |

汎用化の最大障害: 大会名・日付・リポジトリ名・Pages URL・Drive/Sheet ID が**全層に直書き**（GAS 10箇所超、staff HTML 30箇所超、CI の日付、localStorage キー、テストデータまで2026年で汚染）。

---

## 1. 設計原則

1. **挙動を変えるフェーズと変えないフェーズを分離する。** Phase 1-2 は挙動不変（リグレッションは e2e で機械検出）。Phase 3 以降で初めて仕様を動かす。
2. **2026大会の確定データは聖域。** リファクタ前に git tag で凍結し、以後 data/ は読み取り専用扱い。
3. **設定は一箇所。** 大会固有値はすべて `tournament.config.json`（単一ソース）に集約し、GAS・フロント・CI・ドキュメントへ展開する。
4. **公開前提のセキュリティ。** プラグイン公開時に Drive ID・Sheet ID・実名エントリーデータが混入しない構造を Phase 3 で作り込む（公開直前に慌てない）。
5. **実装は下位モデルへ委譲。** Codex（基本）/ Sonnet サブエージェント（Codex 不通時・並列時）。Fable は設計・Gate レビュー・難所実装のみ。
6. **運用者は git を使えない前提（龍偉決定 2026-06-12）。** 大会当日の日常運用（CSV 投入・結果アップ・帳票出力）は Google ツール（Drive / スプレッドシート / GAS）だけで完結する構成を絶対に維持する。git・GitHub に触るのは初期セットアップ時の技術担当者（またはプラグインのウィザード）だけ。
7. **計測距離は種目単位で可変（龍偉要件 2026-06-12）。** 500m / 1000m / 2000m に対応し、**同一大会内で種目によって距離・計測点が混在**してよいデータモデルにする。大会全体の固定値として持たない。

---

## 2. フェーズ構成（全体図）

```
Phase 0  ベースライン固定（止血・凍結・テスト緑化）        ← 挙動不変・即日
Phase 1  デッドコード・ゴミ一掃                            ← 挙動不変
Phase 2  重複統合（DRY化）+ コードレビュー安定化           ← 挙動不変（龍偉指示の「安定化」完了点）
Phase 3  設定外部化・大会非依存化                          ← ここから仕様変更
Phase 4  構造再編（コード/テンプレ/大会データの分離）
Phase 5  プラグイン化・公開（一発生成 CLI）                 ← ゴール1
Phase 6  年間ハブ機能（協会→年→大会の一覧・逐次アップ）     ← ゴール2
```

各フェーズの終わりに Gate（Fable レビュー + e2e + 必要に応じ security-reviewer）を置く。フェーズ途中での次フェーズ着手は禁止。

---

## Phase 0 — ベースライン固定 【挙動不変・最優先】

目的: リファクタの土台を確定させる。これをやらないと以降の diff が全部濁る。

| # | タスク | 詳細 | 担当 |
|---|---|---|---|
| 0-1 | 未コミット変更の整理コミット | ① `gas/pdf_publisher/Code.gs`（v0.20-0.21: A4縦・6レーン固定・改ページ防止。動作確認済みロジック）② `CLAUDE.md` スリム化 ③ `references/spec-ref-2025-result-format-20260525.pdf` を**3つの別コミット**に分ける | Fable 直接（判断含むため） |
| 0-2 | 暴走 CI の停止 | `heartbeat-watchdog.yml`（10分毎・大会終了後も Issue にコメント蓄積中）と `daily-health.yml`・`pages-check.yml` を `workflow_dispatch` のみに変更。`validate.yml`（data 検証）と `issue-to-pr.yml` は存置 | Codex |
| 0-3 | GAS 側 heartbeat 停止確認 | git log の heartbeat コミットが 2026-05-25 で止まっているか確認。GAS トリガーが生きていれば無効化（龍偉のブラウザ操作が必要なら手順書を1枚出す） | Fable 確認 |
| 0-4 | 2026大会データの凍結 | `git tag v2026-final` を打ち、両リモート（origin/staging）へ push。「data/ master/ は以後読み取り専用」を CLAUDE.md に明記 | Codex |
| 0-5 | テスト緑化ベースライン | `make test`（フル）と `e2e_test.py --skip-pipeline` を実行し、現状の PASS/FAIL を記録。FAIL があれば**修正せず記録のみ**（後フェーズの受入基準の基準点にする） | Sonnet |

**Gate 0**: 両リモートのデプロイ（テスト/本番 Pages）が今と同じ表示であること。
**見積**: [CC] 約30分 / 実時間: 1〜2時間

---

## Phase 1 — デッドコード・ゴミ一掃 【挙動不変】

目的: 「読まなくていいコード」をリポジトリから消し、以降のレビュー対象を物理的に減らす。削除は全件 `grep` で参照ゼロを確認してから。歴史的価値があるものは削除でなく `archive/` へ移動。

### 1A. コード削除（Codex 委託・1ジョブ1領域）

- **GAS**: `pdf_publisher/Code.gs` 行1061-1160 の連鎖デッド9関数（findRaceMaster_ / collectNestedArrays_ / extractEntries_ / normalizeEntry_ / pickFirst_ / pickFirstArray_ / formatRaceTime_ / lookupCrewName_ / confirmTournamentName_）、宙ぶらりん JSDoc（行1268-1273）
- **app.js**: `formatTime`(1535) / `matchesFilter` 常true スタブ(1474) / 空関数 `sortDbTable`(1009)・`updateDbTableCount`(1149) / 未使用 `dbRows`(54)・`CONFIG.CATEGORY_NAMES`(20) / リテラル false で死んでいるカテゴリ順位ブロック2箇所(551-573, 893-913) / 未使用ローカル `roundName`(449)
- **CSS**: 未使用セレクタ群（.db-table系 / .error-card系 / .affiliation-cell / .time-split / .time-half / .sc-round / .sc-winner-lane / .col-time / .col-finish / .hide-sp / .bottom-nav / .race-event-name ほか監査リスト全件）。**削除前に admin・staff HTML 含む全 HTML と突き合わせ**
- **テスト専用関数の隔離**: GAS の createTest* 群・testGenerate* 群は削除せず、ファイル末尾の「TEST ONLY」セクションに集約（Phase 3 で外部化）

### 1B. ファイル削除・アーカイブ（Codex 委託）

| 対象 | 処置 | 理由 |
|---|---|---|
| `tools/entries.csv` `tools/schedule.csv` | 削除 | build_csv_from_pdf の生成残骸。本番フローは参照していない |
| `tools/migration/`（3ファイル） | 削除 | どこからも参照されない移行作業の残骸 |
| `scripts/import_entries.py` | archive/ へ | `race_num` 等、現スキーマ非互換で実行すると KeyError。修正でなく廃棄（機能は generate_master.py が担う） |
| `test/legacy-results/`（4ファイル） | archive/ へ | 旧フォーマット・テスト未参照 |
| `test/csv/R007_*` `R008_*` | 削除 | 命名規則（タイムスタンプ prefix）に合わず simulate_pipeline が全スキップするデッドファイル |
| `test/csv/20260523_070800_R002_*` | 削除 | 2025系テストデータと race_no 衝突し dict 上書きを起こす |
| `研修/` 一式 | archive/ へ | 研修終了済み。テストデータは test/csv に一本化 |
| `print_templates/1.pdf` `1.xlsx` `TEST_判定員帳票_Race1のみ.pdf` | 削除 | 無名サンプル・テスト生成物 |
| `sample_csv/entries.csv` `schedule.csv` | 削除 | 旧フォーマット（crew_name 列なし）。*_sample.csv と役割重複 |
| `gas/セットアップガイド.html`（3箇所重複） | 1本化 | 同一ガイドが3箇所にコピーされている |

**Gate 1**: e2e（フル + --skip-pipeline）が Phase 0 記録と同一結果。`git grep` で削除対象への参照ゼロ。サイト表示無変化（スクリーンショット比較）。
**見積**: [CC] 約1時間 / 実時間: 2〜4時間（Codex 並列3ジョブ）

---

## Phase 2 — 重複統合（DRY化）+ コードレビュー安定化 【挙動不変】

目的: 龍偉指示の「コードレビューを行って安定化」の完了点。同じロジックの二重管理を解消し、レビュー済みの単一実装に寄せる。

### 2A. Python: `tools/common.py` 新設（Codex）

- `class C` + `log_*`（5ファイルに複製）→ common.py に統合
- `ms_to_formatted`（simulate_pipeline:77 / e2e_test:29）→ 1本化
- `find_race`（generate_race_pdf:53 / generate_race_xlsx:34、例外型も統一）
- `format_race_datetime` → pdf 側の None 安全版に統一（xlsx 側は `"-"` 区切り日付でクラッシュするバグあり = **これはバグ修正**）
- `generate_race_xlsx.py` の `ROUND_LABELS`（FA のみ）→ pdf 側の12種に統一 / `tournament.race_name` 参照を `name` に修正（スキーマ不一致バグ）
- CSV パース（read_csv_as_dicts / parse_csv）の共通化
- Makefile `push-test` の `--repo` 欠落修正、`make master` のプレースホルダー大会名を解消

### 2B. フロントエンド: 描画ロジック統合（Codex、難所は Fable）

- **app.js 最大の重複**: renderToggleView / renderTableView の約850行コピペ → `buildResultRows()` + `buildTableHTML()` 共通ヘルパーに抽出。⚠️ ここはタイ順位・DNS/DNF・スプリット表示の分岐が絡む**難所**。実装は Codex、ロジック等価性レビューは Fable が行い、必要なら Fable が直接書く
- 初回ロードで全ビューが2回描画される問題（loadAll と renderAll の二重呼び出し、175-181 / 295-303）を解消
- admin/9922 と app.js の重複（h() / パス定義 / ROUND_NAMES / 期間判定 / 並列 fetch）→ `js/shared.js` に抽出して両方から読む。±20分 vs ±15分のような**暗黙の仕様差は表にして龍偉に1回だけ確認**
- `window.__offlineListenerAdded` 等の不要ガード除去、IIFE でのグローバル汚染解消（onclick インライン呼び出しの整理を含む）

### 2C. GAS: 共通ユーティリティの単一ソース化（設計 Fable / 実装 Codex)

- 重複11関数（getConfig_ / fetchMasterData_ / buildRawUrl_ / fetchText_ / composeRaceTime_ ほか）を `gas/shared/` に単一ソース化し、**ビルドスクリプトで各プロジェクトへ連結コピー**する方式を採る（GAS ライブラリ方式はデプロイ依存が増えプラグイン配布に不向きなため不採用）
- `composeRaceTime_` は pdf_publisher 版（日付パース付き・堅牢）に統一。judge_form 側は簡素版でデグレ済みの疑い = **バグ修正を兼ねる**
- Code.gs / Setup.gs の DEFAULT_CONFIG 二重定義を Setup 側1箇所に集約

### 2D. クロスレビュー（安定化の締め）

- Codex 実装分を **js-ts-reviewer / python-reviewer / security-reviewer** で並列レビュー
- 監査で見つかった実バグ3件（xlsx 日付クラッシュ / xlsx スキーマキー不一致 / composeRaceTime_ デグレ疑い）の修正を確認
- e2e に「タイ順位」「DNS/DNF」「マルチカテゴリ」の回帰ケースが足りなければ Sonnet にテスト追加させる

**Gate 2**: e2e 全緑 + レビュー3者 approve + サイト表示のピクセル比較一致。ここで**「安定化」完了をタグ `v1-stable` で記録**。
**見積**: [CC] 約2〜3時間 / 実時間: 1〜2日（Codex 並列 + レビュー往復）

---

## Phase 3 — 設定外部化・大会非依存化 【ここから仕様変更】

目的: 「第18回大会を立ち上げる＝設定ファイルを1枚書く」状態にする。プラグイン化の心臓部。

### 3A. 単一設定ファイル `tournament.config.json` の設計（Fable）

```json
{
  "tournament": { "id": "2026-masters", "name": "第17回全日本マスターズレガッタ",
                   "venue": "石川県津幡漕艇競技場", "dates": ["2026-05-23", "2026-05-24"] },
  "course":     { "lanes": 6,
                   "default_distance": { "length_m": 1000, "measurement_points": [500, 1000] } },
  "categories": ["M", "W", "X"],
  "deploy":     { "github_repo": "...", "pages_url": "...", "test_pages_url": "..." },
  "gas":        { "pdf_template_sheet_id": "...", "judge_template_sheet_id": "...",
                   "output_folder_id": "...", "archive_folder_id": "...", "booklet_folder_id": "..." }
}
```

※ gas セクションの ID 類は**コミットしない**（`.gitignore` + `tournament.config.example.json` を配布）。公開プラグインの要件。

※ **距離の混在対応（設計原則7）**: `default_distance` は大会の既定値にすぎない。schedule（種目/レース）側に `length_m` と `measurement_points` を持たせ、レースごとに 500/1000/2000 を上書きできるようにする。フロントのスプリット列・GAS の CSV 命名（`_500m` `_1000m` `_2000m`）・帳票テンプレートはすべてレースの measurement_points から動的に組み立てる。

### 3B. 各層への展開（Codex 並列4ジョブ）

| 層 | 変更内容 |
|---|---|
| GAS | 全ハードコード ID（Drive 4種 / Sheet 2種 / repo 5箇所 / BOOKLET_TEMPLATE_GID / 印刷範囲 r2=34&c2=13 等）→ Script Properties 化。`setupFromConfig(json)` 関数を新設し config 貼り付け一発でプロパティ投入。テストデータの2026固有値を fixtures に外部化 |
| フロント | カテゴリ選択肢（index.html 91-93 直書き）→ master.json から動的生成 / `'500m'` 文字列リテラル4箇所 → measurement_points 由来に / localStorage キーに tournament.id を含めバージョン管理（前年データ表示事故の防止）/ `?v=20260420a` 手動キャッシュバスティング → ビルド時に config から生成 / admin 内の URL 直書き → config 読み込み |
| CI | heartbeat-watchdog の大会日付直書き → リポジトリ変数（vars.TOURNAMENT_START/END）化 |
| Python | build_csv_from_pdf の絶対パス直書き（/Users/ryuiyamada/Downloads/...）→ argparse 化 / init_tournament.py を config 生成ウィザードに改修（プラグインの `init` コマンドの原型） |

### 3C. staff/ ドキュメント HTML の脱・直書き

- 共通 CSS を `staff/shared.css` に抽出（推定500-800行削減）
- 大会名・URL・日付（30箇所超）→ `{{SITE_URL}}` 等のプレースホルダー化し、config から生成するスクリプトを用意
- 仕分け: 汎用6本（csv_naming_rules / schedule_input_guide / db_structure / day-manual / spec / handover）はテンプレ化。大会限り3本（site-checklist / thursday-checklist / line-proposal）は archive/ へ

**Gate 3**: 「config の値を全部ダミーに差し替えてもシステムが成立する」ことをデモ（= 第18回大会のドライラン）。security-reviewer が「公開しても秘密が漏れない」ことを確認。
**見積**: [CC] 約3〜4時間 / 実時間: 2〜3日

---

## Phase 4 — 構造再編（コード / テンプレ / 大会データの分離）

目的: プラグインとして配布できるディレクトリ構造に組み替える。

```
（新構造）
engine/      ← 再利用コア: js/ css/ gas/ tools/ admin/ staff-templates/
template/    ← 新大会ひな型: master テンプレCSV・sample_csv・print_templates・config.example
test/        ← 大会非依存テストデータ（重複排除済み・命名規則統一）
events/
  └ 2026-masters/   ← 第17回の確定データ凍結置き場（data/ master/ 帳票PDF/ references/）
docs/        ← ARCHITECTURE.md に SPEC.md・operation-handover.md を統合。setup-guide は年次テンプレ化
```

- サンプルCSV 4ディレクトリ分散（sample_csv / test/csv / test/master / 研修）→ template/ と test/ の2箇所に統合
- **progression-engine は今回対象外（龍偉決定 2026-06-12）**: 全日本級大会用のため本プラグインには統合しない。理解メモを `docs/progression/system-notes.md` に作成済み。リポジトリ内に現状のまま温存（archive 不要・変更禁止）
- docs 統廃合（SPEC.md / operation-handover.md → ARCHITECTURE.md へ。improvement-backlog の未着手項目 A〜L はプラグイン backlog へ移管）
- ⚠️ Cloudflare Pages のビルド設定・`_headers`・`_redirects` のパス前提が変わるため、**テスト環境（origin）で先行検証 → 本番（staging）反映**の順を厳守

**Gate 4**: テスト Pages・本番 Pages 両方で2026大会アーカイブが従来 URL 構造のまま閲覧できること（公開済み URL を壊さない）。
**見積**: [CC] 約3時間 / 実時間: 2〜3日

---

## Phase 5 — プラグイン化・公開 【ゴール1】

目的: 「新規大会システムを一発生成」を実物にする。

### 5A. 生成 CLI（仮称 `create-regatta`）

- `init`: 対話ウィザード（init_tournament.py の進化形）→ tournament.config.json 生成
- `scaffold`: config から ①静的サイト一式 ②GAS 3プロジェクト（clasp push 可能な形）③CI ④staff ドキュメント を生成
- `deploy`: Pages 設定ガイド + GAS セットアップ手順の自動出力（完全自動化が難しい箇所は手順書生成で代替）

### 5B. 公開準備

- LICENSE 選定 / README（日本語正・英語併記）/ クイックスタート
- 秘密情報スキャン（Drive ID・Sheet ID・実名エントリー・トークンが履歴に残らないか。**必要なら新規リポジトリとして切り出し、本リポジトリは2026大会アーカイブとして残す**）→ security-reviewer 必須 Gate
- サンプル大会データ（フィクション名）同梱

### 5C. 配布形態 — 龍偉に要確認（下記「確認すべき質問」参照）

**Gate 5**: クリーンな環境で `init → scaffold → ローカル表示` が30分以内に完走するデモ。security-reviewer approve。
**見積**: [CC] 約4〜6時間 / 実時間: 3〜5日

---

## Phase 6 — 年間ハブ機能 【ゴール2】

目的: 協会 → 年 → 大会 の階層で、複数大会の結果を逐次アップ・一覧表示できるようにする。

- **土台**: `docs/hub-site-spec.md`（2026-05-11 作成・未着手）をベースに仕様改訂
- データモデル: `association.json`（協会情報）+ `events/<year>-<slug>/`（大会単位、Phase 4 の構造をそのまま流用）+ ハブ index が events/ を走査して年別一覧を生成
- ハブトップページ: 年タブ → 大会カード（開催日・会場・ステータス: 開催前/速報中/確定）→ 各大会サイトへ
- 「次々と結果をアップ」は既存の CSV→GAS→JSON フローを大会ディレクトリ単位に多重化（GAS 側は config 切替）
- improvement-backlog の項目 K（過去大会アーカイブ一覧）がこれに該当 = 既存構想と整合
- ホスティング方式（1 Pages プロジェクトに全大会 vs 大会ごとに分離）は Phase 6 冒頭で設計判断

**Gate 6**: 2026 マスターズ + ダミー大会2件で「1協会・1年・3大会」の一覧と各大会閲覧が動くデモ。
**見積**: [CC] 約5〜8時間 / 実時間: 1〜2週間

---

## 体制・運用ルール

| 役割 | 担当 |
|---|---|
| 設計・Gate レビュー・難所実装（2B のロジック統合等） | Fable 5（このセッション） |
| 実装 | Codex（基本）。不通時は Sonnet サブエージェント代行（automation-routing 確定ルール） |
| 領域監査・テスト追加・軽作業 | Sonnet サブエージェント |
| 品質 Gate | js-ts-reviewer / python-reviewer / security-reviewer（Phase 2・3・5 は security 必須） |
| 進捗管理 | `/dev-track` で進捗管理表を作成し本計画のフェーズ表を背骨にする。コンパクト前は必ず update |

- ブランチ: フェーズごとに `refactor/phase-N` ブランチ → テスト Pages（origin）で検証 → main → staging
- コミット粒度: 1コミット=1論点。削除と修正を混ぜない

## リスクと対策

1. **公開済み URL（*-3ha.pages.dev）は変更不可** → Phase 4 の再編でも従来パスを `_redirects` で維持
2. **GAS は手元で自動テストできない** → 変更は必ずテスト用スプレッドシート+テスト repo で素振りしてから本番プロパティへ
3. **e2e がカバーしない視覚回帰** → Gate ごとにスクリーンショット比較（機械検査、目視のみ禁止）
4. **実名データの公開混入** → Phase 5 で新規リポジトリ切り出しを既定路線として検討

## 決定事項（龍偉裁定 2026-06-12）

1. **配布形態**: GitHub テンプレートリポジトリ + Claude Code プラグイン（ウィザード役）の併用で確定
2. **公開リポジトリ**: 新設で確定（実名エントリーデータを含む本リポジトリは2026大会アーカイブとして非公開維持）
3. **GAS 継続**: 確定。さらに**使用者は git を使えない可能性大 → Google ツールだけで日常運用が完結する構成**を必須要件とする（設計原則6）
4. **年度管理**: 「年度」を大会の上位概念としてまとめる機能を Phase 6 に正式採用（協会 → 年 → 大会の階層）
5. **計測距離**: 500/1000/2000m 対応・同一大会内で種目ごとの混在可（設計原則7）
6. **progression-engine**: 今回は使わない（全日本用）。理解メモのみ作成
7. admin ±20分 vs フロント ±15分 等の暗黙仕様差は Phase 2 で一覧表にして裁定をもらう（未決・唯一の残課題）

## 進捗記録

- 2026-06-12 Phase 0 ほぼ完了: 未コミット3件整理 / CI 定期実行3本停止 / `v2026-final` タグ凍結 / 両リモート push 済み
- 2026-06-12 バグ修正2件完了（Phase 2 前倒し・龍偉指示）: generate_race_xlsx の3バグ / judge_form の composeRaceTime_ 堅牢化。e2e 252/254 PASS（既存 FAIL 2件は race_124 のデータ欠損で今回と無関係）
- **残: GAS の heartbeat トリガー停止（龍偉の Apps Script 操作が必要）** — 手順: script.google.com で本体プロジェクトを開く → エディタで関数 `deleteTriggers` を選択 → 実行。これで2分毎の自動コミットが止まる

## Gate 1 審査結果（2026-06-12・senior-engineer / security-reviewer / senior-designer・全員 concern → PM 裁定で全 MUST 採用）

### MUST（フェーズ受入条件に組み込み）

| ID | 内容 | 反映先 |
|---|---|---|
| E-M1 | CI が必要とする値（Pages URL・repo名・大会日付）は GitHub Repository Variables へ投入するフローと config とのマッピング表を作る | Phase 3A |
| E-M2 | **レース単位 schema（measurement_points 含む全フィールド・型・GAS/フロント/帳票の参照箇所）を Fable が確定承認してから Phase 3B 並列ジョブ開始**。未承認での 3B 着手禁止 | Phase 3A 完了条件 |
| E-M3 | Gate 5 受入を分割: 静的サイトは init→scaffold→http.server 表示まで30分以内（macOS/Node20/Py3.11）。GAS は clasp push + Script Properties 投入の手順書出力まで（完全自動化は対象外と明記） | Gate 5 |
| S-M1 (P0) | GAS の DEFAULT_CONFIG から実 Drive/Sheet ID・実 repo 名を除去し空文字に。`validateConfig_()` で未設定時は起動エラー（Drive 書き込み前に停止） | Phase 3（Gate 3 受入条件） |
| S-M2 (P0) | 公開用新規リポジトリは **git 履歴を持ち込まない**（orphan 転送 or filter-repo）。公開前に `git log -S "<実ID>"` ゼロ件確認 | Phase 5 Gate |
| S-M3 (P1) | admin/staff の隠しパスは scaffold 時にランダム生成（`admin/__ADMIN_PATH__/` テンプレ + 置換）。配布物に固定パスを残さない | Phase 5 |
| S-M4 (P1) | template/ に実名データ混入禁止。Gate 4 で「template/ 以下に実クルー名 grep ゼロ件」を確認基準に追加 | Phase 4 Gate |
| D-M1 | ビュー統合前に「トグル vs テーブルで意図的に異なる表現」の差異一覧を Fable が作成し、保持/廃棄を明示（Gate 2 受入条件） | Phase 2B |
| D-M2 | スプリット可変列のモバイル仕様を実装前に確定: 360px 基準・距離混在時の列方式（共通列+ハイフン vs 種目ごと可変）・aria-label 更新方針 | Phase 3 着手前 |
| D-M3 | 各大会サイトのヘッダーに「ハブへ戻る」リンク（association.json の hub_url から取得・ハードコード禁止） | Phase 6 |
| D-M4 | staff HTML は「完成済み HTML（scaffold が生成・スタッフ目線にプレースホルダー露出ゼロ）」と「テンプレート」の2種を明確分離 | Phase 3C / 5 |
| D-M5 | config に `brand` セクション（primary/accent/font）。CSS はカスタムプロパティのみ・HEX 直書き禁止 | Phase 3A |

### SHOULD（採用・優先度低）

`make build-gas` ターゲット定義（2C）/ `wrangler pages dev` での _redirects ローカル検証 + 公開URL一覧（Gate 4）/ Phase 6 ホスティング判断基準の事前記載 / スプリット列タップ展開 / 過去大会セクション分離 / staff HTML の PDF 自動出力 / PAT は fine-grained（Contents: RW・対象repo限定・90日）をガイドに明記 / ステータスバッジは色+テキスト

## 更新履歴
- 2026-06-12 — 初版（監査4本 + 新ゴール2件を反映）
- 2026-06-12 — 龍偉裁定5件を反映（配布形態/新リポジトリ/GAS+gitレス運用/年度管理/距離混在）。progression-engine 対象外化。Phase 0・バグ修正の進捗記録
- 2026-06-12 — Gate 1 審査結果（MUST 12件・SHOULD 8件）を PM 裁定で採用・反映
