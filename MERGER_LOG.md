# 3 プロジェクト統合ログ

## 統合日: 2026-05-24

## 統合の経緯
このプロジェクト `masters-regatta-2026` は、以下 3 つのプロジェクトを
統一したものです：

| 元プロジェクト | 役割 | 統合後の扱い |
|---|---|---|
| rowing-live-results | 初代テストサイト（ソースベース） | archive/rowing-legacy/ |
| ishikawa-rowing-2026 | 石川県大会用コピー（中間バージョン） | archive/rowing-legacy/ |
| **masters-regatta-2026** | 本番運用版（最新・正本） | **このプロジェクト** |

## 取り込み済みデータ
- `test/legacy-results/` ← ishikawa-rowing-2026/テストリザルト/ から救出した CSV

## GitHub リモート（2 系統）
- `origin`: RYUIYAMADA/masters-regatta-test (テスト環境: masters-regatta-test.pages.dev)
- `staging`: rowingishikawadev-del/masters-regatta-2026 (本番環境: masters-regatta-2026-3ha.pages.dev)

## 公開 HTML（旧版 docs/ 配下から進化）
旧版の `docs/day-manual.html`, `docs/db_structure.html`,
`docs/schedule_input_guide.html`, `docs/site-checklist.html` は、
本プロジェクトでは `staff/x8f24k/` 配下に進化版として配置済み。
