# template/ — 新大会立ち上げ時の正本テンプレ置き場

新大会のセットアップに使うテンプレートファイルを一元管理する。
`tournament.config.example.json`（リポジトリルート）および `staff-templates/` と併用すること。

## ディレクトリ構成

```
template/
├── master/
│   ├── schedule_template.csv  # レーススケジュール入力用テンプレート
│   └── entries_template.csv   # エントリー情報入力用テンプレート
└── sample_csv/
    ├── README.md              # カラム仕様・年齢カテゴリー一覧
    ├── tournament.csv         # 大会基本情報サンプル
    ├── schedule_sample.csv    # スケジュールサンプル
    └── entries_sample.csv     # エントリーサンプル
```

## 使い方

1. `python3 tools/init_tournament.py` を実行すると `template/master/` に CSV テンプレートが生成される
2. `template/master/schedule_template.csv` と `entries_template.csv` を編集して大会データを入力
3. 編集済み CSV を Google Drive の `master/` フォルダにアップロード

## 注意

- `master/` ディレクトリは本番凍結データ（v2026-final）。**このディレクトリには書かない**
- テンプレートの編集・更新はこの `template/` 配下のファイルに対して行う
