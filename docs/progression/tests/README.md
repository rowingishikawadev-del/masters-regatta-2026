# Progression Test Cases

## テスト設計の方針

このディレクトリは、2026年全日本ローイング選手権大会のプログレッション計算エンジンを検証するための入力と期待出力をまとめる。

- A版とB版の各パターン1-7を基本ケースとして網羅する。
- パターンごとの差分はPDF上の進出条件とBN割当をそのまま期待値にする。
- `source` はPDFの表記を正規化した進出元で、例として `1.HT` は予選の非自動進出艇タイム1位、`1.1.H` は予選タイム1位かつ着順1位、`2.3.S` は準決勝タイム2位かつ着順3位を表す。
- DNS/DNF/DQ、同タイム、1艇だけのレース、最大値ではない中間人数をエッジケースに含める。
- 同タイムは `tie_group` を保持し、公式のタイブレーク情報がない場合は `input_order` による決定的順序を期待する。
- 1艇だけのFB/FC/FD/FE/FF/FGはPDF注記の `1艇である場合はレースは実施しない` を `skipped: true` で表す。

## テストケース一覧

| id | 検証内容 |
|---|---|
| alljapan-A-pattern1-basic | A版パターン1、PからFへのBN割当 |
| alljapan-B-pattern1-basic | B版パターン1、PからFへのBN割当 |
| alljapan-A-pattern2-basic | A版パターン2、HからFA/FBへの割当 |
| alljapan-B-pattern2-basic | B版パターン2、HからFA/FBへの割当 |
| alljapan-A-pattern3-basic | A版パターン3、HからS/FC、SからFA/FBへの割当 |
| alljapan-B-pattern3-basic | B版パターン3、H上位2艇方式でのS/FC割当 |
| alljapan-A-pattern4-basic | A版パターン4、HからS/FC/FDへの割当 |
| alljapan-B-pattern4-basic | B版パターン4、H上位2艇方式でのS/FC/FD割当 |
| alljapan-A-pattern5-basic | A版パターン5、HからQ/FE、QからS/FC/FDへの割当 |
| alljapan-B-pattern5-basic | B版パターン5、H上位2艇方式でのQ/FE割当 |
| alljapan-A-pattern6-basic | A版パターン6、HからQ/FE/FFへの割当 |
| alljapan-B-pattern6-basic | B版パターン6、H上位2艇方式でのQ/FE/FF割当 |
| alljapan-A-pattern7-basic | A版パターン7、HからQ/FE/FF/FGへの割当 |
| alljapan-B-pattern7-basic | B版パターン7、H上位2艇方式でのQ/FE/FF/FG割当 |
| edge-A-pattern2-dns-dnf-dq | DNS/DNF/DQを含む予選結果の分類順 |
| edge-B-pattern3-tie-group | 同タイムを `tie_group` として保持する動作 |
| edge-B-pattern2-skip-fb-one-crew | FBが1艇だけの場合のskip_if発動 |
| edge-A-pattern2-intermediate-9-crews | 9艇の中間人数でFBが3艇になる動作 |
| edge-B-pattern3-intermediate-15-crews | 15艇の中間人数でFCが3艇になる動作 |
| edge-A-pattern4-intermediate-22-crews | 22艇の中間人数でFDが4艇になる動作 |
| edge-B-pattern5-intermediate-27-crews | 27艇の中間人数でFEが3艇になる動作 |
| edge-A-pattern7-intermediate-39-crews | 39艇の中間人数でFGが3艇になる動作 |

## テスト実行方法

実装言語には依存しない。テストランナーは次の流れで `test_cases.json` を処理する。

1. `test_cases` を1件ずつ読み込む。
2. `template` と `pattern` から対象プログレッション定義を選ぶ。
3. `input` の `entries_count`、`preliminary_results`、`heat_results`、または `source_results` をエンジンへ渡す。
4. エンジンが返す各レースのBN順割当を `expected.races` と比較する。
5. 配列形式の期待値はBN 1から順に並ぶ `source` のリストとして扱う。
6. オブジェクト形式の期待値は `bn`、`crew_id`、`source`、`skipped` など指定されたフィールドを完全一致で比較する。
7. `tie_groups` があるケースでは、同タイム艇のグループ保持と順序決定を検証する。
8. `skipped: true` があるケースでは、レースが生成されないこと、かつ対象艇の割当情報が保持されることを検証する。

## 期待値の出典

期待値は以下のPDF表を直接参照して作成した。

- `~/Downloads/2026alljapan_progression0420a.pdf`、2026/04/17、6レーン運用、順位上がり変更版
- `~/Downloads/2026alljapan_progression0420b.pdf`、2026/04/19、6レーン運用

各ケースの `source` とBN順は、PDF内の各パターンの表に記載されたファイナル、準決勝、準々決勝のBN欄をそのまま転記している。
