⚠️ 本書は 2026-06-12 に ARCHITECTURE.md へ統合され廃止。最新は `docs/ARCHITECTURE.md` と `docs/SPEC_phase3_config.md` を参照。

---

## 旧内容 要約（参照用・10行）

- **作成**: 2026-04-07。対象: 全日本マスターズレガッタ 2026 速報サイト
- **アーキテクチャ**: Drive CSV → GAS（2分ポーリング）→ GitHub JSON → Cloudflare Pages。サーバーレス・ゼロコスト
- **CSV命名規則**: `R001_500m.csv`（3桁ゼロ埋め必須）。旧形式 `YYYYMMDD_HHMMSS_R001_500m.csv` も互換
- **schedule.csv**: race_no / event_code / event_name / category / age_group / round / date / time / course_length
- **entries.csv**: race_no / lane / crew_name / affiliation / category（複数カテゴリー合同レースで必須）
- **GAS フロー**: LockService → レート制限確認 → processPendingCSVs → ハートビート更新 → ロック解放
- **セキュリティ**: GitHub Token / DriveフォルダID は GAS スクリプトプロパティに暗号化保存
- **管理者画面**: URL秘匿によるアクセス制御。パイプライン監視・当日チェックリスト・CSVファイル名チェッカー
- **既知のリスク**: GitHub Token 失効（前日確認必須）、GAS 90分/日 制限（実績32〜40分で余裕あり）
- **障害対処**: runNow() で手動即時実行、Cloudflare キャッシュパージ、誤CSV上書き対応
