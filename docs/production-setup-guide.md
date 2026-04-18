# 本番サイト（masters-regatta-2026-live）セットアップ手順書

## 概要
テストサイト（rowing-live-results）をベースに、新しい本番プロジェクト `masters-regatta-2026-live` を立ち上げる手順です。

**実行者：**
- 龍偉（RYUIYAMADA）：Cloudflare Pages 作成・リポジトリ管理
- 石川県協会（rowingishikawadev-del）：GAS 設定・Google Drive 管理

---

## ステップ 1：Cloudflare Pages リセット（石川県協会）

### 1-1 古いプロジェクトの削除
1. 石川県アカウント（row...@gmail.com）で Cloudflare にログイン
2. **Workers & Pages** → **Pages** → **masters-regatta-2026** を開く
3. **Settings** → **Danger zone** → **"Delete project"**
4. 確認メッセージで **"Delete"** をクリック
5. ✅ プロジェクト削除完了

---

## ステップ 2：新規プロジェクト作成（龍偉が実行）

### 2-1 Cloudflare Pages で新規作成
1. 龍偉のアカウント（row2014.2015.k@gmail.com）で Cloudflare にログイン
2. **Workers & Pages** → **Pages** → **Create application**
3. **"Connect to Git"** をクリック
4. GitHub の認可ダイアログ → **Authorize** をクリック

### 2-2 リポジトリ選択
1. **Repository:** `RYUIYAMADA/masters-regatta-2026` を選択
2. **"Connect"** をクリック

### 2-3 プロジェクト設定
| 項目 | 設定値 |
|------|--------|
| **Project name** | `masters-regatta-2026-live` |
| **Framework preset** | None |
| **Build command** | （空のまま） |
| **Build output directory** | `/` （ルート） |
| **Root directory** | （空のまま） |
| **Production branch** | `main` |

4. **"Save and Deploy"** をクリック
5. ✅ デプロイ開始（3-5分待機）

---

## ステップ 3：テストサイトからのコード準備

### 3-1 テストサイトのコードをコピー
```bash
# テストサイトリポジトリをクローン
git clone https://github.com/RYUIYAMADA/rowing-live-results.git /tmp/rowing-live-results

# 必要なファイル・フォルダをコピー
cp -r /tmp/rowing-live-results/css /Users/ryuiyamada/projects/masters-regatta-2026/css
cp -r /tmp/rowing-live-results/js /Users/ryuiyamada/projects/masters-regatta-2026/js
cp /tmp/rowing-live-results/index.html /Users/ryuiyamada/projects/masters-regatta-2026/index.html
```

### 3-2 コミット & プッシュ
```bash
cd /Users/ryuiyamada/projects/masters-regatta-2026
git add -A
git commit -m "Copy base code from rowing-live-results (test site)"
git push origin main
```

✅ Cloudflare Pages が自動的にビルド・デプロイ開始

---

## ステップ 4：本番データ準備

### 4-1 master.json の確認
- **ファイル:** `data/master.json`
- **内容確認項目：**
  - ✅ `schedule[]` に全124レースのデータが含まれているか
  - ✅ 各レースに `race_num`, `date`, `scheduled_time`, `event_name`, `entries[]` が含まれているか
  - ✅ entries に `lane`, `affiliation`, `category` が含まれているか

### 4-2 schedule.csv の確認
- **ファイル:** `sample_csv/schedule.csv`
- **内容：** race_num, date, scheduled_time, event_name（124レース分）
- **用途：** Google Drive へアップロード（参考用）

### 4-3 entries.csv の確認
- **ファイル:** `sample_csv/entries.csv`
- **内容：** race_no, lane, affiliation, category（539エントリー分）
- **用途：** Google Drive へアップロード（参考用）

---

## ステップ 5：Google Drive セットアップ（石川県協会）

### 5-1 Google Drive フォルダ確認
- **フォルダID:** `1sCKohwJK8DWjINLxEfe_eO9Nm-DBshop`
- **URL:** https://drive.google.com/drive/folders/1sCKohwJK8DWjINLxEfe_eO9Nm-DBshop

### 5-2 フォルダ構成の確認
```
masters-regatta-2026/
├── master/                  ← スケジュール・エントリーの参考用
│   ├── schedule.csv
│   └── entries.csv
├── race_csv/
│   ├── 500m/               ← GAS が監視（500m ラップデータ）
│   └── 1000m/              ← GAS が監視（1000m ラップデータ）
└── results/                ← 確定結果の保管
```

---

## ステップ 6：GAS（Google Apps Script）設定

### 6-1 GAS プロジェクトの確認
1. Google Drive で **masters-regatta-2026** フォルダを開く
2. **「Apps Script」プロジェクト**を作成（まだない場合）
3. または既存の GAS プロジェクトを開く

### 6-2 GAS スクリプト設定
**ファイル:** `/Users/ryuiyamada/projects/masters-regatta-2026/gas/Code.gs`

**重要な設定値を確認：**
```javascript
// GitHub リポジトリ設定
const GITHUB_REPO = 'RYUIYAMADA/masters-regatta-2026';  // ← ここを確認
const GITHUB_TOKEN = '[YOUR_GITHUB_TOKEN]';             // ← GitHub PAT
const GITHUB_OWNER = 'RYUIYAMADA';
const GITHUB_BRANCH = 'main';

// Google Drive フォルダ設定
const MASTER_FOLDER_ID = '1sCKohwJK8DWjINLxEfe_eO9Nm-DBshop';
const CSV_500M_FOLDER_ID = '[500m フォルダID]';  // 実際の ID に変更
const CSV_1000M_FOLDER_ID = '[1000m フォルダID]'; // 実際の ID に変更
```

### 6-3 トリガー設定
1. GAS Editor で **「トリガー」** ボタンをクリック
2. **新しいトリガーを作成：**
   - 関数：`checkAndPushResults`
   - イベントのソース：**時間ベースのトリガー**
   - トリガーのタイプ：**2分ごと**
   - 時間帯：**毎日（大会日時に応じて調整）**
3. **保存** をクリック

✅ GAS が 2 分ごとに Google Drive を監視し、CSV → JSON → GitHub Push を実行

---

## ステップ 7：カスタムドメイン設定（龍偉が実行）

### 7-1 Cloudflare Pages でドメイン設定
1. Cloudflare Dashboard → **Pages** → **masters-regatta-2026-live**
2. **Custom domains** タブを開く
3. **"Add a custom domain"** をクリック
4. **ドメイン名：** `masters-regatta-2026-3ha.pages.dev`
5. **Add domain** をクリック
6. CNAME レコード設定を確認（自動で設定される場合が多い）

✅ 本番 URL `https://masters-regatta-2026-3ha.pages.dev` にアクセス可能

---

## ステップ 8：デプロイ・動作確認

### 8-1 本番サイトへのアクセス
```
https://masters-regatta-2026-3ha.pages.dev
```

### 8-2 確認項目
- ✅ サイトが表示される
- ✅ スケジュール表示（124レース）
- ✅ 時刻・種目名が正しく表示
- ✅ ラウンド列がない（今回は採用しない）
- ✅ Race No. が 1～124 で表示

### 8-3 GAS の動作確認
1. Google Drive の `race_csv/500m/` フォルダにテスト CSV をアップロード
2. GAS 実行ログで「成功」を確認
3. GitHub の `data/results/race_001.json` が更新されたか確認
4. 本番サイトに結果が反映されたか確認

---

## トラブルシューティング

### Q: Cloudflare Pages でビルドが失敗する
- ✅ Build log を確認
- ✅ リポジトリの権限確認（RYUIYAMADA が RYUIYAMADA/masters-regatta-2026 にアクセス可能か）
- ✅ GitHub webhook が正しく動作しているか確認

### Q: GAS が GitHub に push できない
- ✅ GitHub Token の有効期限確認
- ✅ Token に write 権限があるか確認
- ✅ GAS スクリプトプロパティの設定値を確認

### Q: Google Drive の CSV が反映されない
- ✅ CSV が正しい場所（race_csv/500m/, race_csv/1000m/）に保存されているか
- ✅ ファイル名が正しいか確認
- ✅ GAS が 2 分ごとに実行されているか確認（トリガーログ）

---

## 最終確認チェックリスト

- [ ] 古い Cloudflare Pages プロジェクト削除
- [ ] 新規プロジェクト `masters-regatta-2026-live` 作成完了
- [ ] RYUIYAMADA/masters-regatta-2026 リポジトリにコードコピー完了
- [ ] master.json に schedule + entries データ完備
- [ ] カスタムドメイン設定完了
- [ ] GAS 設定完了（トリガー有効）
- [ ] 本番サイト https://masters-regatta-2026-3ha.pages.dev にアクセス確認
- [ ] スケジュール・結果表示の動作確認

---

## サポート連絡先

問題が発生した場合：
- GitHub Issues: https://github.com/RYUIYAMADA/masters-regatta-2026/issues
- メール: row2014.2015.k@gmail.com
