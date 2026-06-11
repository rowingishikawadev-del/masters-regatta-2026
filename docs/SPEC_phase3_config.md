# SPEC: Phase 3 設定外部化・大会非依存化 — インターフェース契約書 v1

作成: 2026-06-12 Fable 5（PM）。Gate1 E-M2 に基づく **Phase 3B 並列ジョブの実装前提**。本 SPEC の承認なしに 3B 着手禁止。

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

**後方互換**: `schema_version` 無し（v2）の master.json を読んだ場合、フロントは `default_course={1000,[500,1000]}`・`categories=["M","W","X"]`・`id="legacy"` を補完して動作する（2026アーカイブを壊さない）。

## 2. 計測CSV命名規則（GAS・pipeline 共通）

`YYYYMMDD_HHMMSS_R{race_no}_{point}m.csv` — `{point}` は **3〜4桁の任意距離**（500/1000/1500/2000）。
正規表現: `^\d{8}_\d{6}_R(\d+)_(\d{3,4})m\.csv$`。`point` がそのレースの `measurement_points` に含まれない場合、GAS はエラーフォルダへ移動しログを残す（黙殺禁止）。

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
- **検証ルール**: フォールバック読込時、保存 master の `tournament.id` と取得 master の `id` が不一致なら **保存データ全破棄**（v2 キーは初回ロード時に削除）

## 5. tournament.config.json（生成器レベル設定・**配信しない**）

<!-- Gate1-MUST: D-M5, S-M1, E-M1 -->

```jsonc
{
  "tournament": { "id", "name", "venue", "dates": [] },
  "default_course": { "length_m", "measurement_points": [] },
  "categories": [],
  "brand": { "primary_color": "#2D4F2C", "accent_color": "#C9A227", "font_family": "Noto Sans JP, sans-serif" },
  "deploy": { "github_repo": "", "pages_url": "", "test_pages_url": "" },
  "gas": { "pdf_template_sheet_id": "", "judge_template_sheet_id": "",
            "output_folder_id": "", "archive_folder_id": "", "booklet_folder_id": "" }
}
```

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
