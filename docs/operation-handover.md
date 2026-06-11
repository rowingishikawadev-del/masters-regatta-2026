⚠️ 本書は 2026-06-12 に ARCHITECTURE.md へ統合され廃止。最新は `docs/ARCHITECTURE.md` と `docs/SPEC_phase3_config.md` を参照。

---

## 旧内容 要約（参照用・10行）

- **作成**: 2026-04-18。対象: 石川県ボート協会運用スタッフ
- **構成**: 観客 → Cloudflare Pages → GitHub（data/*.json）← GAS ← Google Drive（CSV）
- **アカウント**: RYUIYAMADA（GitHub Owner）/ rowingishikawadev-del（Collaborator）/ row2014.2015.k@gmail.com（Cloudflare Owner）
- **本番URL**: https://masters-regatta-2026-3ha.pages.dev / Drive: https://drive.google.com/drive/folders/1sCKohwJK8DWjINLxEfe_eO9Nm-DBshop
- **朝の準備**: 本番サイト疎通確認・全レース表示確認・Drive フォルダ確認・GAS トリガー確認
- **レース中**: 500m/1000m の CSV を Drive にアップ → 2分待機で GAS 自動処理 → 合計約3分で反映
- **トラブル**: runNow() 手動実行 / Cloudflare キャッシュパージ / GitHub Token 再生成
- **禁止**: Token を GitHub に push しない / master.json を直接手で編集しない / data/results/ を手で削除しない
- **大会後**: GAS トリガーをOFF / race_csv/processed/ を清掃 / データバックアップ（GitHub clone + Drive ZIP）
- **来年度向け**: tools/init_tournament.py で新大会設定を生成。テンプレートは template/master/ を使う
