# staff-templates/ — スタッフ向けドキュメント テンプレート集

Phase 5 の scaffold ツールが tournament config.yaml の値でプレースホルダーを置換し、
実際の `staff/<STAFF_PATH>/` 配下に完成版を生成する。
**プレースホルダーが残存したまま直接スタッフに渡さないこと（D-M4）。**

## テンプレート一覧

| ファイル | 用途 | 対象読者 |
|---|---|---|
| `csv_naming_rules.html` | CSVファイル命名ルール | 計測スタッフ |
| `schedule_input_guide.html` | スケジュール・エントリー入力定義書 | 大会事務局 |
| `db_structure.html` | DBデータ構造・リレーション図 | システム担当 |
| `day-manual.html` | 当日担当者マニュアル | 計測スタッフ |
| `spec.html` | システム仕様書 | システム担当 |
| `handover.html` | システム引継ぎ資料 | 大会担当者 |
| `shared.css` | 共通CSS（テンプレート間で共有） | — |

## 対象外ファイル（テンプレート化しない）

以下の3ファイルは2026年大会に限定した内容のため、テンプレート化の対象外。
Phase 4 でアーカイブへ移動する。

| ファイル | 理由 |
|---|---|
| `site-checklist.html` | 2026年大会固有のチェックリスト |
| `thursday-checklist.html` | 2026年大会固有の前日チェックリスト |
| `line-proposal.html` | 2026年大会固有のLINE配信原稿 |

## プレースホルダー辞書

| 変数名 | 意味 | 例 |
|---|---|---|
| `{{TOURNAMENT_NAME}}` | 大会の正式名称 | 第17回全日本マスターズレガッタ |
| `{{YEAR}}` | 開催年 | 2026 |
| `{{VENUE}}` | 会場名（コース含む） | 石川県津幡漕艇競技場 |
| `{{DATE_DAY1}}` | 1日目の日付（YYYY-MM-DD） | 2026-05-23 |
| `{{DATE_DAY2}}` | 2日目の日付（YYYY-MM-DD） | 2026-05-24 |
| `{{DATE_DAY1_JA}}` | 1日目の日付（日本語） | 2026年5月23日(土) |
| `{{DATE_DAY2_JA}}` | 2日目の日付（日本語） | 2026年5月24日(日) |
| `{{SITE_URL}}` | 速報サイトのホスト名（https:// なし） | masters-regatta-2026-3ha.pages.dev |
| `{{GITHUB_REPO}}` | GitHubリポジトリ（オーナー/リポジトリ名） | RYUIYAMADA/masters-regatta-2026 |
| `{{ADMIN_PATH}}` | 管理者パス（URLセキュリティ用の数字列） | 9922 |
| `{{STAFF_PATH}}` | スタッフパス（URLセキュリティ用の文字列） | x8f24k |
| `{{CREATED_DATE}}` | ドキュメント作成日（YYYY-MM-DD） | 2026-04-07 |
| `{{GAS_PROJECT_NAME}}` | GASプロジェクト名 | マスターズ石川県大会2026 |
| `{{DRIVE_FOLDER_URL}}` | Google DriveフォルダURL | https://drive.google.com/drive/folders/... |

## 生成フロー（Phase 5 scaffold）

```
tournament_config.yaml
  ↓
scaffold generate --template staff-templates/ --config tournament_config.yaml
  ↓
staff/{{STAFF_PATH}}/ (完成版HTMLを配置)
```

scaffold は各テンプレートのプレースホルダーを tournament_config.yaml の値で一括置換して出力する。

## 重要な注意事項
- `staff/` ディレクトリ（`staff/x8f24k/` 配下）は **読み取り専用**。コピー元として参照するのみ。編集禁止。
- `git commit` は行わない（コミット禁止の指示あり）
- サンプルデータ内の `全日本マスターズレガッタ 第100回大会`、`2025-09-14` 等はチュートリアル例のため置換しない
