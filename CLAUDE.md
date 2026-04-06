# 全日本マスターズレガッタ 2026 速報サイト（本番）

## 概要
テストサイト（rowing-live-results）をベースにした本番用サイト。

## 対応大会
- 大会名: 全日本マスターズレガッタ 2026
- リポジトリ: RYUIYAMADA/masters-regatta-2026（作成予定）
- 本番URL: masters-regatta-2026-3ha.pages.dev（Cloudflare Pages 設定後）

## テストサイトとの違い
- data/master.json はこの大会専用の内容に書き換えて使う
- data/results/ は GAS が自動Push する（テストデータなし）
- GAS プロジェクトは本番用を別途作成し、GITHUB_REPO を本番リポジトリに向ける

## セットアップ手順（残作業）
1. GitHub でリポジトリ `masters-regatta-2026` を新規作成
2. このフォルダを push
3. Cloudflare Pages でデプロイ設定
4. GAS プロジェクトをコピーし GITHUB_REPO を変更
5. 大会情報確定後に master.json をスケジュール含めて更新

## ディレクトリ構成・技術スタックはテストサイトと同一
テストサイトの CLAUDE.md を参照:
/Users/ryuiyamada/projects/rowing-live-results/CLAUDE.md
