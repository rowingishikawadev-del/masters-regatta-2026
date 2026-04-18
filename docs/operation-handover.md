# 第17回全日本マスターズレガッタ 運用引継書

**作成日:** 2026-04-18  
**対象:** 石川県ボート協会運用スタッフ  
**システム:** 本番速報サイト（masters-regatta-2026-live）

---

## 概要

このドキュメントは、本番速報サイトの日常運用・当日オペレーション・トラブル対応を引き継ぐための資料です。

**責任者：**
- **技術開発:** 龍偉（RYUIYAMADA）
- **本番運用:** 石川県ボート協会（rowingishikawadev-del）

---

## 1. システムアーキテクチャ概要

### 構成図
```
┌─────────────────┐
│  観客・参加者     │
└────────┬────────┘
         │
    HTTPS
         │
┌────────▼────────────────────────┐
│  本番サイト                       │
│  masters-regatta-2026-3ha       │
│  (Cloudflare Pages)             │
└────────┬────────────────────────┘
         │
         ├─ data/master.json
         ├─ data/results/race_XXX.json
         ├─ css/style.css
         └─ js/app.js
         │
┌────────▼────────────────────────┐
│  GitHub リポジトリ                │
│  RYUIYAMADA/masters-regatta-2026 │
└────────┬────────────────────────┘
         │
         ├◀─ GAS (Google Apps Script)
         │   CSV → JSON 変換
         │
┌────────▼────────────────────────┐
│  Google Drive                    │
│  masters-regatta-2026            │
├─ master/ (参考用)                │
├─ race_csv/500m/  (GAS 監視)     │
├─ race_csv/1000m/ (GAS 監視)     │
└─ results/ (確定結果)             │
```

---

## 2. アカウント・アクセス情報

### 2-1 重要なアカウント

| 用途 | アカウント | 権限レベル |
|------|-----------|---------|
| **GitHub（本運用）** | RYUIYAMADA | Owner |
| **GitHub（当日操作）** | rowingishikawadev-del | Collaborator |
| **Cloudflare Pages** | row2014.2015.k@gmail.com | Owner |
| **Google Drive** | 石川県ボート協会スタッフ | Editor |
| **Google Apps Script** | GAS プロジェクト内 | 実行権限 |

### 2-2 ログイン手順

**GitHub（rowingishikawadev-del）:**
```
https://github.com/login
ユーザー名: rowingishikawadev-del
パスワード: [石川県協会で管理]
```

**Google Drive:**
```
https://drive.google.com
アカウント: 石川県ボート協会の Google Workspace アカウント
```

**Cloudflare Pages（開発者用）:**
```
https://dash.cloudflare.com
メール: row2014.2015.k@gmail.com
パスワード: [龍偉が管理]
```

---

## 3. 本番サイト URL・リソース

### 本番サイト
```
https://masters-regatta-2026-3ha.pages.dev
```

### 関連 URL

| 名称 | URL | 用途 |
|------|-----|------|
| **本番速報サイト** | https://masters-regatta-2026-3ha.pages.dev | 観客・参加者向け |
| **GitHub リポジトリ** | https://github.com/RYUIYAMADA/masters-regatta-2026 | コード管理 |
| **Google Drive フォルダ** | https://drive.google.com/drive/folders/1sCKohwJK8DWjINLxEfe_eO9Nm-DBshop | データ入力 |
| **Cloudflare Dashboard** | https://dash.cloudflare.com | デプロイ管理（開発者用） |

---

## 4. 当日オペレーション（大会当日の手順）

### 4-1 朝の準備（大会開始 1 時間前）

**チェックリスト：**
- [ ] 本番サイト https://masters-regatta-2026-3ha.pages.dev にアクセス確認
- [ ] スケジュールが 124 レース全て表示されているか確認
- [ ] 時刻が正しく表示されているか確認
- [ ] Google Drive フォルダへのアクセス確認
- [ ] race_csv/500m/, race_csv/1000m/ フォルダが存在するか確認
- [ ] GAS トリガーが有効か確認（Google Apps Script → トリガー）

### 4-2 レース中の運用（計測時）

**3つのレースごと:**
1. 計測担当者が **race_csv/500m/** に CSV ファイルをアップロード
2. 計測担当者が **race_csv/1000m/** に CSV ファイルをアップロード
3. **2 分待機** → GAS が自動的に処理（CSV → JSON → GitHub Push）
4. **約 1 分後** → 本番サイトに結果が反映される
5. 合計 3 分程度で反映完了

**CSV ファイル形式:**
```
race_XXX_500m.csv  （500m ラップデータ）
race_XXX_1000m.csv （1000m ラップデータ）
```

### 4-3 結果確定後

- [ ] 全 124 レースの結果が表示されているか確認
- [ ] レース結果が正確か（計測データと一致）確認
- [ ] Google Drive の `results/` フォルダに確定結果をバックアップ

---

## 5. 日常運用タスク

### 日次タスク（運用期間中）

毎朝 8:00（大会開始前）:
1. 本番サイトの疎通確認
2. スケジュール・エントリーが正しく表示されているか確認
3. 前日の結果が正しく保存されているか確認

### 週次タスク（運用開始後）

毎週月曜：
1. GitHub リポジトリのコミット履歴を確認
2. GAS 実行ログを確認（Google Apps Script → 実行ログ）
3. キャッシュクリア（必要に応じて）

### 月次タスク（長期運用の場合）

毎月末：
1. Google Drive のストレージ使用量を確認
2. GitHub の API 使用額を確認
3. GAS の実行時間制限を確認（90 分/日）

---

## 6. データ管理

### 6-1 master.json

**ファイル位置:** `data/master.json`

**内容:**
```json
{
  "tournament": { "race_name", "dates", "venue" },
  "schedule": [
    {
      "race_num": 1,
      "date": "2026/5/23",
      "scheduled_time": "7:00",
      "event_name": "女子舵手付きクォドルプル",
      "entries": [
        { "lane": 1, "affiliation": "E.R.C.C", "category": "D" }
      ]
    }
  ],
  "age_categories": [ ... ]
}
```

**更新が必要な場合:**
1. GitHub で直接編集するか
2. Python スクリプトで自動生成

### 6-2 CSV ファイル

**位置:** `sample_csv/`

| ファイル | 説明 | 用途 |
|---------|------|------|
| `schedule.csv` | スケジュール一覧（124 レース） | 参考・バックアップ |
| `entries.csv` | エントリー一覧（539 エントリー） | 参考・バックアップ |

### 6-3 レース結果 JSON

**位置:** `data/results/race_001.json`, `race_002.json` 等

**自動生成:** GAS により race_csv の CSV から自動変換

---

## 7. トラブルシューティング

### Q: 本番サイトが表示されない

**原因と対応:**

| 症状 | 原因 | 対応 |
|------|------|------|
| 404 エラー | DNS 設定の遅延 | 15 分待機後リトライ |
| 真っ白 | ブラウザキャッシュ | Cmd+Shift+Delete でキャッシュクリア |
| 真っ白（全員） | Cloudflare Pages ダウン | Cloudflare Status ページ確認 |
| スケジュール表示されない | master.json が欠損 | GitHub で master.json を確認 |

### Q: GAS が CSV を処理しない

**確認項目:**

1. **CSV が正しい場所にあるか**
   - `race_csv/500m/race_001_500m.csv` ← 正しい形式
   - `race_csv/1000m/race_001_1000m.csv` ← 正しい形式

2. **GAS トリガーが有効か**
   ```
   Google Drive → 右クリック → Google Apps Script を開く
   → 左メニュー "トリガー" → 2分ごとのトリガーが有効か確認
   ```

3. **GAS 実行ログを確認**
   ```
   Google Apps Script → 実行ログ → エラーメッセージを確認
   ```

4. **GitHub Token が有効か**
   ```
   GAS → スクリプトプロパティ → GITHUB_TOKEN の有効期限確認
   ```

### Q: レース結果が本番に反映されない（5 分以上）

**確認順序:**

1. ✅ GitHub の `data/results/race_XXX.json` が更新されているか確認
2. ✅ Cloudflare Pages が自動デプロイされたか確認（Deployments タブ）
3. ✅ ブラウザキャッシュをクリア（Cmd+Shift+Delete）
4. ✅ Cloudflare CDN キャッシュをクリア
   ```
   Cloudflare Dashboard → Caching → Purge Cache → Purge Everything
   ```

### Q: サイトが遅い・反応が悪い

**原因と対応:**

| 症状 | 原因 | 対応 |
|------|------|------|
| 初回ロード遅い | master.json の重さ | ブラウザの開発者ツール → Network で確認 |
| 連続リロード遅い | キャッシュなし設定 | ブラウザキャッシュ有効化確認 |
| サイト全体遅い | Cloudflare CDN 遅延 | 15 分待機、または 別の地域からアクセス試行 |

---

## 8. セキュリティ・権限管理

### 重要な認証情報

| 項目 | 保管方法 | アクセス権限 |
|------|--------|-----------|
| **GitHub PAT** | GAS スクリプトプロパティ | 龍偉のみ |
| **Cloudflare API Token** | 不要（Web UI のみ使用） | - |
| **Google OAuth** | GAS の認可済みスクリプト | スタッフ全員 |

### 禁止事項

- ❌ GitHub Token を GitHub に push しない
- ❌ master.json を直接手で編集しない（Python スクリプト使用）
- ❌ data/results/ フォルダを手で削除しない
- ❌ GAS スクリプトを無断で変更しない

---

## 9. バックアップ・リカバリ

### 定期バックアップ

**大会終了後:**

1. **GitHub をバックアップ**
   ```bash
   git clone --mirror https://github.com/RYUIYAMADA/masters-regatta-2026.git
   ```

2. **Google Drive をバックアップ**
   - 全フォルダを ZIP でダウンロード
   - 石川県協会のローカルストレージに保存

3. **本番データをエクスポート**
   - `data/results/` の全 JSON をダウンロード
   - CSV にエクスポート（参考用）

### リカバリ手順

万が一、data/results/ が削除された場合：

1. Google Drive の `results/` フォルダを確認
2. または GitHub の古いコミットから復元
   ```bash
   git checkout <commit-hash> -- data/results/
   ```

---

## 10. サポート連絡先

### 技術サポート

| 対応内容 | 連絡先 | 対応時間 |
|---------|--------|---------|
| **緊急（本番ダウン）** | 龍偉（携帯） | 24/7 |
| **GAS トラブル** | 龍偉 メール | 営業時間 |
| **GitHub 操作** | 龍偉 Slack | 営業時間 |
| **一般質問** | GitHub Issues | 翌営業日 |

### 連絡方法

```
電話: [龍偉携帯番号]
メール: row2014.2015.k@gmail.com
GitHub Issues: https://github.com/RYUIYAMADA/masters-regatta-2026/issues
```

---

## 11. 運用ログテンプレート

### 日次運用ログ

```
【日付】2026-05-23
【担当者】[名前]
【疎通確認】○ / ×
【本番サイト状態】正常 / 要確認 / エラー
【実施内容】
- CSV アップロード：race_001, race_002, ...
- トラブル：なし / あり（詳細：...）
【備考】
```

### 週次報告

```
【週】第 X 週（5月 XX 日〜 YY 日）
【総レース数】XXX 件
【トラブル件数】0 件
【システム稼働率】100%
【次週予定】
```

---

## 12. 大会後の整理

### 大会終了後 1 週間以内

- [ ] 全レース結果が本番サイトに反映されているか最終確認
- [ ] データバックアップ実施（GitHub, Google Drive）
- [ ] 本番サイトをアーカイブモードに切り替え（オプション）

### 大会終了後 1 ヶ月以内

- [ ] 運用ログを集約して報告書作成
- [ ] トラブル対応の記録をまとめる
- [ ] 改善提案を龍偉に報告

### 来年度の準備

- [ ] システムコードを新年度用にカスタマイズ
- [ ] Google Drive フォルダを新しく作成
- [ ] GAS を新リポジトリに対応させる

---

## 付録 A：よく使うコマンド

### Git コマンド

```bash
# 最新コード取得
git pull origin main

# ファイル状態確認
git status

# ログ確認
git log --oneline -10

# ブランチ確認
git branch -a
```

### Google Drive CLI（オプション）

```bash
# Google Drive にアクセス（gdrive コマンド使用時）
gdrive list --query "name contains 'masters-regatta'"
```

---

## 付録 B：連絡先チェックリスト

運用開始前に以下の情報を確認：

- [ ] 龍偉の携帯番号
- [ ] 龍偉のメールアドレス
- [ ] Slack チャンネル（ある場合）
- [ ] 石川県協会の緊急連絡先
- [ ] 計測担当者の連絡先
- [ ] 当番表（誰が何時に担当か）

---

## 引継完了署名

**システム引継人:**
- 開発者：龍偉（RYUIYAMADA）
- 署名日：2026-04-18
- 確認：[龍偉署名]

**運用引継人:**
- 石川県ボート協会：[担当者名]
- 署名日：[日付]
- 確認：[担当者署名]

---

**このドキュメントは定期的に更新してください。**  
最終更新：2026-04-18
