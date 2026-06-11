# progression-engine システム理解メモ

- 作成: 2026-06-12（龍偉指示「全日本用なので今回は使わない。システム理解だけ」）
- 結論: **今回のプラグイン化では統合しない**。全日本級大会で使う時にこのメモから再開する。

## 1. 何をするものか（3行）

予選の結果を入れると「次のラウンド（準決勝・決勝）に誰が何レーンで出るか」を自動計算する純粋計算ライブラリ。画面表示や Drive 操作は一切しない。エントリー数に応じた進行パターン（何艇なら何組予選か）を JSON テンプレートで持ち、同じコードで任意の大会形式に対応する。

## 2. 入力と出力

- 入力: ① `ProgressionTemplate`（JSON。レーン数・エントリー数範囲別パターン・レーン割当ルール）② `RoundResults`（ラウンドコード→ `Result[]`。crew_id / status 必須、time_ms / tie_group 等は任意）
- 出力: `EngineOutput` — レースごと（FA, FB1 等）の `{bn, crew_id, source}` 配列。1艇のみなら `{skipped:true}`

## 3. モジュール構成（src/）

| ファイル | 役割 |
|---|---|
| types.ts | 全型定義 |
| identifier.ts | `"1.HT"` `"2.3.H"` 等の進出元 DSL のパース |
| pattern.ts | エントリー数 → パターン選択（範囲線形検索、0/2件以上はエラー） |
| seed.ts | シード順クルーの初期レース振り分け（ラウンドロビン） |
| advance.ts | 中核。結果→SourceMap→レーン割当計算 |
| lanes.ts | レーン割当ルール → レーン番号マッピング |
| resolve.ts | 識別子→艇の解決ユーティリティ |
| engine.ts / index.ts | ファサード `ProgressionEngine` / 公開 API |

## 4. GAS 接続方法

`npm run gas:bundle`（= tsc + cat → dist/bundle.gs）→ CommonJS ラッパー行を手動除去 → GAS に貼り、アダプタ（master.json の template_id 読込 → race_NNN.json を Result[] に正規化 → computeAdvancement 呼び出し → ドラフト JSON 保存）を書く。

## 5. 現状の完成度

- npm install 未実行・ビルド未実行・どこからも参照されていない孤立パッケージ
- テストは Vitest 22ケース設計（docs/progression/tests/test_cases.json）だが未実行
- 既知の穴: resolve.ts が敗者復活 `N.M.R` の race_rank 解決未対応 / computeAdvancement の roundCode 引数が未使用 / 承認フロー・master.json 自動更新は未実装

## 6. 全日本で使う時の作業リスト（推定）

1. `npm install && npm test`（22ケース全通過確認）
2. 全日本テンプレート JSON（A版/B版）を大会要項と突き合わせ
3. resolve.ts の敗者復活解決を実装
4. master.json に progression.template_id を追加
5. GAS 側に結果正規化 + アダプタ `runProgressionForRace(raceNo)` を実装
6. bundle 手順の自動化（CommonJS ラッパー除去のスクリプト化）
7. 同着（tie_group）の審判長承認フロー整備
8. 当日 DNS 時のパターン再評価ルールを大会設定に明記
