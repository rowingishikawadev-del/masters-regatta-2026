# 進捗管理表 — 完全リファクタリング〜公開プラグイン化

- status: in_progress / 最終更新: 2026-06-12 02:48
- 正本計画: `docs/REFACTORING_PLAN.md` / 体制: PM=Fable 5（設計・監査・レビュー）、実装=Sonnet サブエージェント（PM裁定: リポジトリはMBPローカルのため。Codex bridge は重バッチ予備）
- 龍偉裁定: 配布=テンプレートrepo+CCプラグイン / 公開=新規クリーンrepo / GAS継続・git レス運用 / 年度ハブ必須 / 500・1000・2000m 種目ごと混在 / progression-engine 不使用（理解メモ済み）

## フェーズ進捗

| Phase | 内容 | 状態 |
|---|---|---|
| 0 | ベースライン固定 | ✅ 完了（CI停止 / v2026-final タグ / 未コミット整理 / GAS heartbeat トリガー停止確認 02:44 最終） |
| バグ修正 | xlsx 3件 + judge_form composeRaceTime_ | ✅ 完了・push 済（e2e 252/254、FAIL 2件は race_124 データ欠損で既存） |
| Gate 1 | 3者審査（engineer/security/designer） | ✅ 完了: 全員 concern→PM裁定で MUST 12件採用・計画書反映済み |
| 1 | デッドコード・ゴミ一掃 | ✅ 完了 02:57 push済（-347行+ファイル31件。e2e 252/254 + make test 16/16。R007/R008はadmin現役と判明し保持。カテゴリー内順位機能はPhase 3バックログへ） |
| 2 | 重複統合 + 安定化（v1-stable タグ） | 🔄 実行中（2A Python common.py / 2C GAS shared / D-M1差異一覧の3並列。2Bは差異一覧承認後） |
| 3 | 設定外部化（config / schema 先行確定が条件） | ⬜ |
| 4 | 構造再編（engine/template/events 分離） | ⬜ |
| 5 | プラグイン化・公開（新規クリーンrepo） | ⬜ |
| 6 | 年度ハブ | ⬜ |

## Gate 1 MUST（採用済み・詳細は REFACTORING_PLAN.md §Gate1審査結果）

E-M1 CI向けconfig展開(Repo Variables) / E-M2 schema確定→3B着手 / E-M3 Gate5受入分割 / S-M1 DEFAULT_CONFIG実ID除去+validateConfig_ / S-M2 新repoはgit履歴を持ち込まない(`git log -S`ゼロ確認) / S-M3 adminパスはscaffold時ランダム生成 / S-M4 template/に実名データ混入禁止(Gate4でgrep確認) / D-M1 ビュー間差異一覧をGate2受入に / D-M2 スプリット可変列のモバイル仕様(360px基準)先行確定 / D-M3 大会サイトにハブ戻りリンク(hub_url) / D-M4 staff完成HTML vs テンプレの2種分離 / D-M5 config brandセクション+CSS変数のみ

## 再開ガイド（コンパクト・別セッション時はここから）

1. このファイルと `docs/REFACTORING_PLAN.md` を読む
2. `git log --oneline -10` で最新状態確認（リモート: origin=テスト, staging=本番。push 前に必ず `git fetch staging && git merge staging/main`）
3. 未完了 Phase の先頭から再開。実装=Sonnet サブエージェント委譲、Fable はレビュー
4. 各 Phase 末 Gate: e2e（`python3 test/e2e_test.py --skip-pipeline`、基準=252/254 PASS）+ レビュー + 表示確認

## 作業ログ

- 2026-06-12 02:16 セッション開始。監査4本→計画書 v1 作成
- 2026-06-12 02:3x Phase 0 完了・バグ修正2件 push・龍偉裁定5件反映
- 2026-06-12 02:48 Gate 1 完了（concern→裁定）。Phase 1 着手
