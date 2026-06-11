# SPEC: Phase 3 設定外部化・大会非依存化 — インターフェース契約書 v1.1

作成: 2026-06-12 Fable 5（PM）。Gate1 E-M2 に基づく **Phase 3B 並列ジョブの実装前提**。本 SPEC の承認なしに 3B 着手禁止。
v1.1: 独立SPEC審査（block・指摘 I-1〜I-8）を PM 裁定で全採用し改訂。**本版（v1.1）をもってスキーマ凍結**。3B-1〜4 は並列着手可。

## 0. 大原則（v1.1 で確定）

- **2026年大会の master.json / results は v2 のまま永久凍結。v3 へ移行しない。** v3 スキーマは新規大会（プラグイン生成）専用
- v3 フロントは v2 データも読める（下記互換チェーン）。逆方向（旧フロント×v3データ）は発生させない運用とする
- §5 config スキーマは本版で凍結。CSS 変数名は `--color-primary` / `--color-accent` で確定

## 1. master.json スキーマ v3（配信データ・サイトが読む正本）

<!-- Gate1-MUST: E-M2, D-M2 -->

```jsonc
{
  "schema_version": 3,                  // 新設。v2(現行)は無印
  "tournament": {
    "id": "2026-masters",               // 新設・必須。英数とハイフンのみ。LSキー/ハブ参照に使用
    "name": "第17回全日本マスターズレガッタ",
    "venue": "石川県津幡漕艇競技場",
    "dates": ["2026-05-23", "2026-05-24"],
    "hub_url": ""                        // 新設・任意。Phase 6 で使用（D-M3）
  },
  "default_course": {                    // 新設・必須
    "length_m": 1000,
    "measurement_points": [500, 1000]    // 昇順。最終要素 = ゴール
  },
  "categories": ["M", "W", "X"],         // 新設・必須。フロントのフィルタ選択肢はここから動的生成
  "races": [
    {
      "race_no": 1, "...": "（既存フィールド維持）",
      "course": {                        // 新設・任意。無ければ default_course を使う
        "length_m": 2000,
        "measurement_points": [500, 1000, 1500, 2000]
      }
    }
  ]
}
```

**後方互換（I-1/I-6 裁定で具体化）**: v3 フロントの解決チェーンを次の通り固定する。
- 計測点: `race.course.measurement_points`（数値配列）→ `master.default_course.measurement_points`（数値配列）→ **v2 の `master.measurement_points`（`["500m","1000m"]` 形式の文字列配列 → parseInt で数値化）** → `[500, 1000]`
- 大会名: `tournament.name || tournament.race_name`（v2 は race_name のみ存在）
- カテゴリ: `master.categories` → 無ければ全レースの entries.category をスキャンしユニーク抽出 → それも空ならカテゴリフィルタ UI を非表示（I-7 裁定）
- id: `tournament.id` → 無ければ `"legacy"`

## 2. 計測CSV命名規則（GAS・pipeline 共通）

推奨命名（新規大会向けドキュメント記載用）: `YYYYMMDD_HHMMSS_R{race_no}_{point}m.csv` — `{point}` は 3〜4桁の任意距離（500/1000/1500/2000）。

**実装ルール（I-3 裁定）**: GAS の受理正規表現は**現行 `/^(?:.+_)?R(\d{3})_(.+)\.csv$/i` を変更しない**（2026年に実運用した `管理001_R001_500m.csv` 等を受理し続ける）。変更点は距離トークンの解釈のみ:
- 第2キャプチャが `(\d{3,4})m` 形式に一致 → その距離がレースの `measurement_points` に含まれるか検証。含まれなければエラーフォルダへ移動しログ（黙殺禁止）
- 一致しない形式（旧来の任意サフィックス）→ 現行どおりの処理（挙動不変）

## 3. フロント表示仕様（D-M2 裁定・モバイル360px基準）

<!-- Gate1-MUST: D-M2 -->

- **列数は距離に依存させない（固定列）**。中間計測タイムは現行の「500m サブ行」パターンを一般化し、ゴールタイムセル内の**積み上げサブ行**で表示する: `<div class="time-500-sub">{point}m {time}</div>` を中間点ごとに出力（class 名は汎用化せず既存を流用、Phase 3 では改名しない）
- ゴールタイム = `measurement_points` 最終要素のタイム。中間点 = それ以外（昇順）
- 未計測の中間点はサブ行ごと省略（ハイフン表示はしない）
- a11y: 各サブ行に `aria-label="{point}m通過 {time}"` を付与
- 列ヘッダ「タイム」は固定文言（「500m/1000m」の直書きラベル4箇所を撤去）
- カテゴリフィルタの選択肢（index.html 直書き M/W/X）→ master.json `categories` から動的生成

## 4. localStorage キー（前年データ事故防止）

- master: `regatta_master_v3`（固定キー・保存値に tournament.id を含む）
- results: `regatta_result_v3_{race_no}`
- **検証ルール（I-2 裁定で具体化）**:
  - 保存 master の `tournament.id` と**fetch 成功した** master の id が不一致 → v3 保存データ全破棄（保存側に id が無い場合も破棄）
  - 旧 v2 キー（`regatta_master_v2` / `regatta_result_v2_*`）の削除は「master.json の **fetch 成功後**」に限る。オフライン・fetch 失敗時は**何も削除しない**（フォールバック喪失防止）。v2 キーが無ければ何もしない
  - 複数タブ競合は許容リスクとする（fetch 成功タブしか削除しないため、削除時点でネットは生きている）

## 5. tournament.config.json（生成器レベル設定・**配信しない**）

<!-- Gate1-MUST: D-M5, S-M1, E-M1 -->

```jsonc
{
  "tournament": { "id", "name", "venue", "dates": [] },
  "default_course": { "length_m", "measurement_points": [] },
  "categories": [],
  "brand": { "primary_color": "#2D4F2C", "accent_color": "#C9A227", "font_family": "Noto Sans JP, sans-serif" },
  "deploy": { "github_repo": "", "pages_url": "", "test_pages_url": "" },
  "gas": { "pdf_template_sheet_id": "", "pdf_output_folder_id": "", "pdf_archive_folder_id": "",
            "booklet_folder_id": "", "booklet_template_gid": "",
            "judge_template_sheet_id": "", "prep_folder_id": "" }
}
```

**gas.* → GAS 定数マッピング（I-4 裁定・凍結）**:

| config フィールド | 注入先プロジェクト | 対応する現行定数 |
|---|---|---|
| pdf_template_sheet_id | pdf_publisher | TEMPLATE_SHEET_ID |
| pdf_output_folder_id | pdf_publisher | PDF_OUTPUT_FOLDER_ID |
| pdf_archive_folder_id | pdf_publisher | PDF_ARCHIVE_FOLDER_ID |
| booklet_folder_id | pdf_publisher | PRE_RACE_BOOKLET_FOLDER_ID |
| booklet_template_gid | pdf_publisher | BOOKLET_TEMPLATE_GID |
| judge_template_sheet_id | judge_form_publisher | TEMPLATE_SHEET_ID |
| prep_folder_id | judge_form_publisher | 準備資料フォルダID（pdf 側 PRE_RACE と同一値を共有している現状を継承） |

- `.gitignore` に `tournament.config.json` を追加。`tournament.config.example.json`（全フィールド空＋コメント）をコミット
- **brand**: css/style.css の主要色を CSS カスタムプロパティ（`:root` の `--color-primary` / `--color-accent`）に集約し、HEX 直書きを変数参照へ置換（Phase 3 では :root 定義と参照置換のみ。scaffold での上書きは Phase 5）

## 6. GAS 設定（S-M1）

<!-- Gate1-MUST: S-M1 -->

- 全 DEFAULT_CONFIG / DEFAULT_SETUP の実 ID・実 repo 名を `''` に置換
- `validateConfig_(config)` を Shared.gs に新設: 必須キー欠落時は処理開始前に `throw new Error('Script Properties 未設定: ...')`（Drive 書き込み・GitHub API 到達前に停止）
- `setupFromConfig(jsonString)` を各 Setup.gs に新設: tournament.config.json の `gas` セクション JSON を貼り付け一発で Script Properties に投入
- 既存の本番 Script Properties は設定済みのため挙動不変

## 7. CI ↔ config マッピング（E-M1）

<!-- Gate1-MUST: E-M1 -->

| config | GitHub 側 | 用途 |
|---|---|---|
| tournament.dates 先頭/末尾 | Repository Variables `TOURNAMENT_START` / `TOURNAMENT_END` | heartbeat-watchdog の期間判定（日付直書き撤去） |
| deploy.pages_url | Secrets `SITE_URL`（既存運用踏襲） | daily-health / pages-check |
| deploy.github_repo | 自明（checkout 先） | — |

投入は当面手動（Settings→Variables）。手順を production-setup-guide に追記。scaffold 自動化は Phase 5。

## 8. Phase 3B ジョブ分割（本 SPEC 承認後に並列発火）

| ジョブ | 範囲 | 主対象 |
|---|---|---|
| 3B-1 GAS | §2 CSV正規表現・§6 設定外部化・テストデータの2026固有値を fixtures 化 | gas/* |
| 3B-2 フロント | §1 読込互換・§3 表示・§4 LSキー・§5 brand 変数化 | js/ css/ index.html admin/ |
| 3B-3 CI/Python | §7・build_csv_from_pdf の argparse 化・init_tournament を config 生成ウィザード化 | .github/ tools/ |
| 3B-4 staff | 共通 shared.css 抽出・プレースホルダー化（D-M4 の2種分離） | staff/ |

受入: e2e 252/254 維持（v2互換）+ ダミー config/master(v3) での表示デモ + security-reviewer の §5/§6 確認。

**注（I-5/I-8 裁定）**: 現リポジトリの git 履歴に残る実 ID は除去しない（本リポジトリは非公開維持）。公開は Gate1 S-M2 のとおり履歴を持ち込まない新規リポジトリで行い、公開前に `git log -S` ゼロ件確認を必須とする。§5 スキーマは v1.1 で凍結済みのため 3B-1〜3B-4 は並列着手可。
