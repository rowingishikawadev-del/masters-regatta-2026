# 第17回全日本マスターズレガッタ 速報サイト

## Obsidian Brain 連携
**Vault**: `~/Desktop/ryui-workspace/projects/obsidian-brain/`
**本 PJ Sessions**: `Sessions/Masters Regatta.md`
**本 PJ Projects**: `Projects/masters-regatta-2026.md` / `Projects/masters-pdf-publisher.md`
**詳細ルール**: `~/.claude/rules/on-demand/obsidian-brain-detail.md`

## 起動コマンド
```bash
cd ~/Desktop/ryui-workspace/projects/rowing/masters-regatta-2026 && claude
```

## 大会情報
- **大会名**: 第17回全日本マスターズレガッタ
- **日程**: 2026年5月23日(土)〜24日(日)
- **会場**: 石川県津幡漕艇競技場
- **コース**: 1000m（500m・1000m計測）
- **ステータス**: ✅ 大会完了・統合済（2026-05-24）

## プロジェクト統合
統合（2026-05-24）:
- Phase 1: `rowing-live-results` → archive/rowing-legacy
- Phase 2: `ishikawa-rowing-2026` → archive/rowing-legacy
- Phase 3: `masters-regatta-2026` ← **正本（このプロジェクト）**

詳細: `MERGER_LOG.md` 参照

## デプロイ構成
| リモート | 環境 | URL |
|---|---|---|
| `origin` | テスト | https://masters-regatta-test.pages.dev |
| `staging` | 本番 | https://masters-regatta-2026-3ha.pages.dev |

Push: `git push origin main` / `git push staging main`

## 重要な制約・前提
- Google Oneアカウント: API制限は無料アカウント同等
- GAS実行時間: 6分/回、トリガー総: 90分/日
- Cloudflare Pages URL（`*-3ha.pages.dev`）は不変・変更不可
- clearAllResults は「master.json 1コミット方式」を維持（5/11以降）

## 再開時の要点（先に読む）
1. **本プロジェクト = 3統合の正本**。旧版は archive/ で読み取り専用
2. **大会本番完了** (2026-05-23・24)。今後は改善・来年汎用化が中心
3. **2リモート**: `origin` (test) ＆ `staging` (prod)。両方への push を意識
4. **JARA公式PDF確定版**: schedule (0507版) / entries (day1 ver5 / day2 ver3)

## 引継書（最新）
→ `Sessions/Masters Regatta.md` の「## 引継書（最新）」セクション参照
