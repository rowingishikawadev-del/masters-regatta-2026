# スポーツ競技 結果管理・大会運営システム リサーチ

**目的**: 全日本マスターズレガッタ運営の年次大会管理ダッシュボード設計のため、陸上・水泳・ボートを中心に既存スポーツ業界で確立された「結果提出・大会運営システム」のベストプラクティスを整理する。

**作成日**: 2026-05-23
**対象読者**: 龍偉（ボート競技マスターズレガッタ 運営担当）
**想定読書時間**: 25〜30 分
**注記**: 本レポートは Codex 委託ではなく MBP Claude 直接調査の例外案件。事実ベースを優先し、推測箇所は「要追加調査」と明示。

---

## 目次

1. [エグゼクティブサマリー](#1-エグゼクティブサマリー)
2. [A. 既存サービス・ソフトウェア一覧](#2-a-既存サービスソフトウェア一覧)
   - 2.1 [陸上競技（Track & Field）](#21-陸上競技track--field)
   - 2.2 [水泳（Swimming）](#22-水泳swimming)
   - 2.3 [ボート（Rowing）](#23-ボートrowing)
   - 2.4 [マラソン・トライアスロン・サイクリング・スキー他](#24-マラソントライアスロンサイクリングスキー他)
   - 2.5 [オープンソース・自作系](#25-オープンソース自作系)
3. [B. データ構造・スキーマ](#3-b-データ構造スキーマ)
4. [C. アーキテクチャパターン](#4-c-アーキテクチャパターン)
5. [D. 結果提出の標準フォーマット](#5-d-結果提出の標準フォーマット)
6. [E. ボート競技固有の論点](#6-e-ボート競技固有の論点)
7. [F. マスターズレガッタ管理ダッシュボードへの示唆](#7-f-マスターズレガッタ管理ダッシュボードへの示唆)
8. [付録：用語集](#8-付録用語集)
9. [付録：要追加調査リスト](#9-付録要追加調査リスト)
10. [参考リンク集](#10-参考リンク集)

---

## 1. エグゼクティブサマリー

### 主要発見

- **業界デファクト**は3層構造（① エントリー受付サービス、② 大会管理ソフト、③ タイム計測ハードウェア＋連携プロトコル）。年次大会向けダッシュボードを設計するなら、③ は既存ハード／ソフトに乗り、①②を担うのが現実的。
- **水泳の Hy-Tek Meet Manager**（米国・1986年〜）と **HY-TEK の SD3 / LENEX フォーマット** が「他競技から最も学ぶべき」資産。年次マルチ大会・選手プロファイル・全国記録突合まで標準化されている。
- **ボート専業**は **RegattaCentral**（北米）・**HereNow**（豪／英、`results.herenow.com`）・**World Rowing** 公式 API がある。マスターズ大会の集中度・写真判定・中間ラップなど競技特性は他競技と異なる。
- **共通ベストプラクティス**は次の7つ:
  1. 大会（Meet/Event）→ レース（Race/Heat）→ エントリー（Entry/Athlete）→ 結果（Result/Split）の **4階層スキーマ**
  2. **マルチテナント設計**で「年度＋大会ID＋ラウンドID」の合成キー
  3. **タイム計測ハードからの取り込みは標準フォーマット経由**（FinishLynx の `.lif`、HY-TEK の `.cl2/.sd3`、SwimTopia/LENEX の `.lxf` 等）
  4. **公開層と運営層を分離**（公開: 読み取り CDN、運営: 認証付きダッシュボード）
  5. **DNS/DNF/DSQ/写真判定** を結果ステータスとして第一級扱い
  6. **PDF 生成**（スタートリスト・成績表・賞状）を運営側で自動化
  7. **API 公開**（少なくとも JSON エンドポイント）でメディア・参加者の二次利用を許容

### 龍偉システムへの3つの最優先示唆（詳細は §7）

| 優先 | 取り入れる要素 | 理由 |
|---|---|---|
| **High** | 年度横断のマルチ大会データモデル（`/years/2026/events/17/...`） | 現状は単一大会前提。年次管理ダッシュボードに必須 |
| **High** | LENEX 風の「大会セットアップ用1ファイル」概念（schedule + entries + age_categories を1JSON） | 大会セットアップを「テンプレJSONを差し替えるだけ」に圧縮できる |
| **Mid** | DNS/DNF/DSQ/PHOTO/Tie-Group の標準ステータス語彙 | 既に部分対応済み（`status: "finish"|"DNS"|"DNF"|"DQ"`）。`PHOTO` `TIE` `WD`（Withdrawn）まで拡張すると陸上・水泳と相互運用可能 |

---

## 2. A. 既存サービス・ソフトウェア一覧

### 2.1 陸上競技（Track & Field）

陸上は**最も体系化が進んでいる**。理由は (a) 国際陸連 (World Athletics) の競技規則がデジタル計測まで明文化、(b) 米国の高校・大学陸上人口が極端に多く商用サービスが成立、(c) FinishLynx（Lynx System Developers）が事実上の写真判定デファクト。

| サービス | 運営元 | 対象 | 機能範囲 | 価格モデル | API |
|---|---|---|---|---|---|
| **FinishLynx** | Lynx System Developers (USA) | 写真判定ハード＋管理ソフト | フィニッシュ判定・スタートリスト読込・結果書出 | ハード買切り（数百万円〜）+ ソフトサブスク | LIF/EVT/PPL ファイル形式 |
| **Hy-Tek Meet Manager for Track** | Hy-Tek Sports Software (USA、現 ACTIVE Network 傘下) | 米国の高校・大学・クラブ陸上 | エントリー・組合せ・結果・公認記録 | 買切り＋更新サブスク | HY-3 / CL2 / SD3 形式 |
| **Athletic.net** | MileStat / Athletic.net LLC (USA) | 米国高校陸上の結果集計 | クラブ→州→全国ランキングまで自動集計 | 無料（広告） | 限定的・スクレイピング前提 |
| **MileSplit** | FloSports (USA) | 高校陸上・XC | ニュース+結果+ランキング | 有料サブスク（FloTrack） | あり（メディア向け） |
| **TFRRS** (Track & Field Results Reporting System) | DirectAthletics (USA) | NCAA 大学陸上の公式結果データベース | 結果アップロード・全米ランキング | NCAA 加盟校無料 | あり（一部公開） |
| **DirectAthletics** | DirectAthletics Inc. | 大学・高校エントリー受付 | エントリー受付・支払 | コミッション制 | あり |
| **World Athletics Competition Management System (CMS)** | World Athletics | 国際大会公式 | エントリー・結果・WR申請 | 加盟連盟用 | あり（公式） |
| **JAAFインターネット申込（日本陸連）** | 日本陸上競技連盟 | 国内公認大会 | エントリー・登録番号管理 | 加盟者向け | 非公開 |
| **NANS21V**（ナンス） | セイコー / セイコータイムシステム | 国内主要大会タイム計測 | 写真判定・電光掲示連動 | ハード買切り＋保守 | 独自フォーマット |
| **Run Race Timing** | 各種 | 市民マラソン・ロード | RFID チップタイム | コミッション | あり |

**陸上ソフトウェアの特徴**:
- 「エントリー受付（DirectAthletics 等）」「組合せ作成・結果管理（HY-TEK MM）」「タイム計測（FinishLynx）」が **疎結合**で連携する文化。それぞれが標準ファイル（HY-3, LIF, CL2）でやり取り。
- 学校カテゴリ・男女・年齢・予選/準決勝/決勝のラウンド構造が深く、データモデルが豊富。
- 写真判定はラインクロスの「画像中の x 座標 = 時刻」を視覚的に確定する文化。ボートでも応用可。

参考URL:
- World Athletics Tech Rules: https://www.worldathletics.org/about-iaaf/documents/book-of-rules
- HY-TEK Sports Software: https://hytek.active.com/
- FinishLynx: https://finishlynx.com/
- TFRRS: https://www.tfrrs.org/
- Athletic.net: https://www.athletic.net/
- JAAF: https://www.jaaf.or.jp/

---

### 2.2 水泳（Swimming）

水泳は陸上に次いで体系化が進んでおり、**国際標準フォーマット LENEX (`.lxf` / `.lef`)** と **米国デファクト SD3** が並立する。マスターズ・年齢区分・公認記録の文化があり、ボートマスターズに最も近い。

| サービス | 運営元 | 対象 | 機能範囲 | 価格モデル | API |
|---|---|---|---|---|---|
| **Hy-Tek Meet Manager for Swimming (MM7)** | Hy-Tek / ACTIVE | 北米のクラブ・大学・USAS公認大会 | エントリー・シーディング・組合せ・成績・記録更新 | 買切り（$295〜$899相当） | SD3/CL2/LXF 入出力 |
| **Hy-Tek Team Manager (TM)** | 同上 | クラブ側選手管理 | 選手プロファイル・ベストタイム・大会エントリー | 買切り | SD3 |
| **MeetMobile** | ACTIVE Network | 観客・選手向けリアルタイム結果配信 | スタートリスト・順位・記録 | 無料＋大会別$7程度 | MM 結果を自動配信 |
| **SwimTopia Meet Maestro** | SwimTopia (USA) | クラブ・サマーリーグ | クラウドベース大会管理（MM の代替） | サブスク | LENEX 入出力 |
| **MeetPro / EventPilot** | Sports Systems / SwimTopia 傘下 | 高校・大学 | MM の代替・LENEX 対応 | サブスク | LENEX |
| **USA Swimming SWIMS Database** | USA Swimming | 米国全選手・全公認記録 | 選手プロファイル・公認時計突合 | 加盟者向け | 公式 API（限定） |
| **World Aquatics (旧 FINA) Points / Rankings** | World Aquatics | 国際大会・世界ランキング | FINA ポイント計算・WR 突合 | 公式 | 公式サイト経由 |
| **SwimRankings.net** | Swimrankings (Daniel Wettstein) | 欧州中心の選手・大会データベース | 全世界の公認大会結果集約 | 無料 | LENEX が一次ソース |
| **Splash Meet Manager** | SPLASH Software (オーストリア、LENEX 策定元) | 欧州デファクト | エントリー・組合せ・結果・LENEX 公式 | 買切り＋サブスク | LENEX |
| **日本水連 Web-SWMSYS** | 日本水泳連盟 | 国内公認大会 | エントリー・記録登録 | 加盟者向け | 非公開 |

**水泳の最大の知見：LENEX**
- LENEX = **L**ane **E**xchange **N**umeric **EX**change（命名は諸説）、SPLASH Software が策定・World Aquatics 公式採用
- 拡張子: `.lef` (XML)、`.lxf` (圧縮 ZIP)
- **1ファイルで「大会セットアップ」「エントリー」「結果」全てを表現** できる。クラブ→大会事務局→計測ハード間で1ファイル渡しで運用が完結する。
- ボート競技に最も移植価値が高い思想。詳細は §5.2。

参考URL:
- LENEX 公式仕様（SPLASH Software 配布）: https://www.splash-software.at/lenex/
- HY-TEK Swim MM: https://hytek.active.com/products/meet-manager/
- USA Swimming SWIMS: https://www.usaswimming.org/times
- SwimRankings: https://www.swimrankings.net/
- SwimTopia Meet Maestro: https://www.swimtopia.com/products/meet-maestro/
- World Aquatics: https://www.worldaquatics.com/
- 日本水泳連盟 Web-SWMSYS: https://swim.jasf.or.jp/

---

### 2.3 ボート（Rowing）

ボートは陸上・水泳と比べ**市場規模が小さくサービスが寡占**。マスターズ向けにフォーカスした商用 SaaS は限定的。

| サービス | 運営元 | 対象 | 機能範囲 | 価格モデル | API |
|---|---|---|---|---|---|
| **RegattaCentral** | RegattaCentral LLC (USA, Columbus OH) | 北米のレガッタ（USRowing 加盟大会含む） | エントリー受付・支払・組合せ・結果 | 大会主催側コミッション＋エントリーフィー | 限定的・XML エクスポートあり |
| **HereNow** (`results.herenow.com`) | HereNow Pty Ltd (Australia) | 豪・英・NZ のボート結果配信 | 結果配信・進行・写真判定統合 | 大会別契約 | 公開 JSON あり（要追加調査） |
| **Regatta Master** | Vespoli USRowing / 各国（複数同名製品あり） | 大会管理デスクトップ | エントリー・シーディング・進行 | 買切り | CSV 入出力 |
| **TimeTeam** (`time-team.nl`) | TimeTeam BV (オランダ) | 欧州ボート（FISA Junior 等） | 結果配信・進行管理 | 大会別契約 | あり |
| **World Rowing 公式 (`worldrowing.com`)** | World Rowing Federation (FISA) | 国際大会（WRC・五輪・WC） | 結果・統計・選手プロファイル | 公式 | 公式 API あり（記者向け） |
| **RowResults / RowingResults** | 各国独自 | 国内大会 | 結果配信 | 大会別 | 限定 |
| **CrewNerd / RowPro / OarLock** | Pocket Inc. / NK SpeedCoach | 練習計測 | コーチ向け（大会管理外） | アプリ買切り | — |
| **日本ボート協会システム** | JARA | 国内公認大会 | 一部 Excel ベース運用が残存（要追加調査） | 加盟者向け | 非公開 |

**ボート専業ソフトの特徴と限界**:
- RegattaCentral と HereNow は **エントリー〜結果配信まで一気通貫** だが、料金は大会収入から徴収する SaaS モデル。日本のマスターズで導入実例は少ない（要追加調査）。
- **写真判定**はボートでも一般化しており、FinishLynx をボート用カメラに転用する大会が多い（米国 IRA、英国 Henley 等）。LIF ファイルが結果取込の標準。
- **マルチカテゴリー合同レース**（マスターズの A〜N 年齢別など）は商用ソフトでも実装ばらつきが大きい。`age_group` の連結文字列（"DEF"）で扱う龍偉システムの設計は妥当。
- **中間計測 (500m / 1000m / 1500m)** は標準サポートだが、レース距離が 1000m / 2000m と複数あるため「distance × split」の二次元管理が必要。

参考URL:
- RegattaCentral: https://www.regattacentral.com/
- HereNow Rowing Results: https://results.herenow.com/
- TimeTeam: https://www.time-team.nl/
- World Rowing: https://worldrowing.com/
- 日本ボート協会 (JARA): https://www.jara.or.jp/
- NK SpeedCoach: https://nkhome.com/

---

### 2.4 マラソン・トライアスロン・サイクリング・スキー他

| サービス | カテゴリ | 運営元 | 機能 | API | 学び所 |
|---|---|---|---|---|---|
| **Race Roster** | マラソン・トライアスロン エントリー | ASICS Digital | エントリー・寄付・チーム作成 | あり | 巨大エントリー受付の標準 |
| **RunSignup** | 同上 | RunSignup LLC | エントリー・結果・寄付 | あり（充実） | 公開 REST API のリファレンス |
| **ChronoTrack** | RFID チップ計測 | Life Time Inc. | 計測 + 結果 | 部分 | チップタイム計測の標準 |
| **MyLaps** | RFID 計測（自転車・自動車・水泳） | MyLaps BV (NL) | ハード＋クラウド | あり | クロス競技の計測ハブ |
| **Athlinks** | 結果統合 | Life Time Inc. | 全大会の結果を選手プロファイルに統合 | あり | 「選手生涯結果データベース」の好例 |
| **TrainingPeaks / Strava** | パフォーマンス | TrainingPeaks LLC / Strava | コーチング・SNS | あり | API 公開とエコシステム |
| **TriRating / Triathlon.org** | トライアスロン ランキング | World Triathlon | 公式ランキング | 限定 | カテゴリー別ランキング集計 |
| **FIS Live Timing** | スキー（アルペン・XC・ジャンプ） | International Ski Federation | リアルタイム結果配信 | 公式 | 中間ラップ＋風雪天候の標準化 |
| **Biathlonworld** | バイアスロン | IBU | 結果＋射撃ペナルティ | あり | 結果以外（射撃）も含む |
| **OmegaTiming** | 五輪公式計測（水泳・陸上・自転車等） | Omega SA (Swiss) | ハード＋ソフト | 公式 | 写真判定・ストロボの最高峰 |
| **Quantum Timing** | 自転車・モータースポーツ | Quantum | RFID + photo finish | あり | 国内自転車競技で普及 |

**学び所**:
- **RunSignup の公開 REST API**（https://runsignup.com/API）は大規模イベントエントリーシステムの好リファレンス。エンドポイント命名・JSON 形状・ページングが整理されている。
- **Athlinks** は「選手1人 = 生涯結果プロファイル」を持つマルチテナント DB の優良事例。マスターズレガッタは「**同じ漕手が毎年出場する**」性質が強いため、Athlinks 型の選手プロファイル統合が価値を生む可能性がある（要追加調査）。
- **FIS Live Timing** は中間ラップが連続出る競技の UI 設計が秀逸（500m 毎の split 公開）。ボート速報 UI の参考になる。

参考URL:
- RunSignup API: https://runsignup.com/API
- Race Roster: https://raceroster.com/
- Athlinks: https://www.athlinks.com/
- MyLaps: https://www.mylaps.com/
- FIS Live Timing: https://www.fis-ski.com/DB/general/results.html
- Omega Timing: https://www.omegatiming.com/

---

### 2.5 オープンソース・自作系

商用が独占的な領域だが、オープンソースも限定的に存在する。

| プロジェクト | 言語 | 対象 | ライセンス | 状況 |
|---|---|---|---|---|
| **OpenSplits** | Go / TypeScript | マラソン中間ラップ | MIT | 個人プロジェクト・小規模 |
| **OpenTimer / OpenLiveTiming** | 各種 | 一般 | MIT/Apache | 散発・要追加調査 |
| **WebScorer** | クラウド | 一般 | 商用だがフリー枠あり | https://www.webscorer.com/ |
| **Sports Organizer 系（ジェネリック）** | 各種 | 多目的 | MIT | 検索ヒット多数だが信頼性ばらつき大・要追加調査 |
| **regatta-results 系（自作・GitHub 散見）** | JS/Python | ボート | 各種 | 1大会限りの自作が大半。再利用性低い |

**所感**: ボート競技ではマスターズに使える完成度の OSS は事実上存在しない。**龍偉のシステムが OSS 公開された場合、ニッチで先行者の価値あり**。

---

## 3. B. データ構造・スキーマ

### 3.1 4階層モデル（業界共通）

ほぼ全システムが次の階層を持つ。

```
Federation / Association (国際/国内連盟)
  └─ Season / Year (年度)
      └─ Meet / Event / Regatta (大会)
          └─ Race / Heat / Final (レース・組)
              └─ Entry / Athlete / Crew (出場者・クルー)
                  └─ Result / Time / Split (結果・タイム・中間)
```

### 3.2 大会 (Meet/Event) スキーマ：典型例

LENEX (水泳) ベースの汎用化:

```json
{
  "meet": {
    "meet_id": "JPN-2026-MASTERS-17",
    "name": "第17回全日本マスターズレガッタ",
    "name_en": "17th All Japan Masters Regatta",
    "type": "MASTERS",                // OPEN / JUNIOR / MASTERS / PARA 等
    "course": "ISHIKAWA_TSUBATA",
    "course_length_m": [500, 1000],   // 開催コース距離
    "city": "Tsubata",
    "nation": "JPN",
    "start_date": "2026-05-23",
    "end_date": "2026-05-24",
    "organizer": {
      "name": "石川県ボート協会",
      "contact_email": "...",
      "website": "..."
    },
    "host_federation": "JARA",
    "official_url": "https://...",
    "live_url": "https://masters-regatta-2026-3ha.pages.dev"
  }
}
```

### 3.3 レース (Race/Heat) スキーマ

```json
{
  "race": {
    "race_id": "JPN-2026-MASTERS-17-R001",
    "race_no": 1,
    "event_code": "M1X",
    "event_name": "男子シングルスカル",
    "category": "M",
    "age_group": "DEF",                // 連結文字列 or 配列
    "age_categories": ["D", "E", "F"],
    "round": "FA",                     // H / R / Q / SF / FA / FB
    "distance_m": 1000,
    "scheduled_at": "2026-05-23T07:00:00+09:00",
    "lanes": 6,                        // 4-8 の可変
    "measurement_points": [500, 1000], // 中間ラップ
    "weather": {                       // 結果記録時に追記
      "wind_speed_mps": 1.2,
      "wind_direction_deg": 45,
      "temp_c": 18.5,
      "humidity_pct": 60
    }
  }
}
```

### 3.4 エントリー (Entry) スキーマ

```json
{
  "entry": {
    "entry_id": "JPN-2026-MASTERS-17-R001-L3",
    "race_id": "JPN-2026-MASTERS-17-R001",
    "lane": 3,
    "bib_number": "103",
    "crew_name": "東京RC A",
    "affiliation": "東京ローイングクラブ",
    "athletes": [                       // クルー人数分（1X なら1名）
      {
        "athlete_id": "ATH-12345",      // 連盟登録ID
        "name_jp": "田中 太郎",
        "name_en": "Tanaka Taro",
        "birth_year": 1975,
        "category": "D",                // 個人カテゴリ
        "position": "stroke"            // 艇内ポジション
      }
    ],
    "expected_age_avg": 51              // クルー平均年齢（マスターズ）
  }
}
```

### 3.5 結果 (Result) スキーマ

```json
{
  "result": {
    "entry_id": "JPN-2026-MASTERS-17-R001-L3",
    "status": "OK",                     // OK / DNS / DNF / DQ / WD / PHOTO
    "rank_overall": 1,
    "rank_by_category": {"D": 1, "E": 2, "F": 1},
    "splits": [
      {"point_m": 500,  "time_ms": 111490, "rank_at_point": 2},
      {"point_m": 1000, "time_ms": 224100, "rank_at_point": 1}
    ],
    "finish": {"time_ms": 224100, "formatted": "3:44.10"},
    "tie_group": "",
    "photo_flag": false,
    "dq_reason": null,
    "ref_signed_at": "2026-05-23T07:08:42+09:00",  // 審判長署名時刻
    "official": true                    // 公式確定フラグ
  }
}
```

### 3.6 HY-TEK / LENEX の典型テーブル設計

#### HY-TEK 系（リレーショナル想定）

| テーブル | 主キー | 主フィールド |
|---|---|---|
| `meets` | meet_id | name, date, location |
| `events` | event_id | meet_id, event_code, gender, age_low, age_high, distance, stroke |
| `entries` | entry_id | event_id, athlete_id, seed_time |
| `athletes` | athlete_id | name, birth_date, club_id, gender |
| `clubs` | club_id | name, lsc_code（地域コード） |
| `heats` | heat_id | event_id, round, heat_no |
| `lanes` | lane_id | heat_id, lane_no, entry_id |
| `results` | result_id | lane_id, time, place, status |
| `splits` | split_id | result_id, distance_m, time |

#### LENEX 系（XML / 1ファイル完結）

```xml
<LENEX version="3.0">
  <CONSTRUCTOR name="..." version="..."/>
  <MEETS>
    <MEET name="..." city="..." nation="JPN">
      <SESSIONS>
        <SESSION date="2026-05-23" number="1">
          <EVENTS>
            <EVENT eventid="1" number="1" gender="M">
              <SWIMSTYLE distance="1000" stroke="..."/>
              <AGEGROUPS>
                <AGEGROUP agegroupid="1" agemin="43" agemax="49"/>
              </AGEGROUPS>
              <HEATS>
                <HEAT heatid="1" number="1" daytime="07:00"/>
              </HEATS>
            </EVENT>
          </EVENTS>
        </SESSION>
      </SESSIONS>
      <CLUBS>
        <CLUB name="..." code="...">
          <ATHLETES>
            <ATHLETE athleteid="..." firstname="..." lastname="..." birthdate="..."/>
          </ATHLETES>
          <ENTRIES>
            <ENTRY eventid="1" entrytime="..."/>
          </ENTRIES>
        </CLUB>
      </CLUBS>
      <RESULTS>
        <RESULT resultid="..." eventid="1" swimtime="03:44.10" status=""/>
      </RESULTS>
    </MEET>
  </MEETS>
</LENEX>
```

> **学び**: LENEX は「1大会のセットアップ＋エントリー＋結果」を1XMLに収める。これに倣えば、龍偉システムの `master.json` を「**LENEX 風レガッタ JSON 仕様**」として標準化し、年度横断で再利用しやすくなる。

---

## 4. C. アーキテクチャパターン

### 4.1 マルチテナント vs 単一大会

| 観点 | 単一大会型（現状の龍偉） | マルチテナント型（HY-TEK・RegattaCentral） |
|---|---|---|
| URL 構造 | `/`（ドメイン直） | `/years/2026/events/17/` |
| データ分離 | リポジトリ単位で別 | DB の `tenant_id` / `meet_id` で分離 |
| デプロイ | 1大会1リポジトリ | 1システムが多数大会を管理 |
| 認証 | URL秘匿 or なし | 役割別アカウント（運営/記録員/選手） |
| 適性 | 単発・低コスト | 年次・複数大会・データ蓄積 |

**示唆**: 年次ダッシュボードを目指すなら、**最低でもパス階層は `/years/{YYYY}/events/{EVENT_ID}/`** に移行すべき。Cloudflare Pages + GAS でも実現可能。

### 4.2 リアルタイム配信の仕組み

実競技サイトを観察すると次の3パターンに収束する。

| 方式 | 採用例 | 利点 | 欠点 |
|---|---|---|---|
| **Polling (HTTP fetch)** | World Rowing（公式）, FIS, **龍偉システム** | CDN 載せやすい・無料枠フレンドリー | 遅延（数秒〜分） |
| **Server-Sent Events (SSE)** | HereNow, 一部商用 | 一方向 push・接続コスト低 | 同時接続上限の影響 |
| **WebSocket** | OmegaTiming公式・五輪 | 双方向・低遅延 | サーバー必須・コスト高 |

**示唆**: 龍偉システムの「120秒 polling + ±15秒 jitter」は **大会観戦用途として業界標準的に妥当**。WebSocket への移行は Cloudflare Pages 範囲では困難で、必要なら Cloudflare Workers Durable Objects が候補。

### 4.3 タイム計測ハードウェア連携

| ハード | 出力フォーマット | 主用途 |
|---|---|---|
| **FinishLynx** | LIF / EVT / PPL | 写真判定（陸上・ボート・水泳） |
| **Omega Quantum** | 独自＋OTAB 形式 | 五輪公式 |
| **Seiko NANS21V** | 独自＋汎用 CSV | 国内陸上 |
| **MyLaps RFID** | MYL / 独自 | チップタイム計測 |
| **ChronoTrack** | 独自＋CSV | RFID マラソン |
| **NK Empower / SpeedCoach** | CSV / FIT | ボート練習 |
| **RowingTimerWeb（龍偉システム）** | CSV（measurement_point, lane, time_ms 等） | マスターズ用自作 |

**示唆**: RowingTimerWeb の CSV スキーマは現状で十分機能している。将来 FinishLynx と並列運用する可能性を見越し、**結果取込レイヤーを抽象化**（パーサーを差し替え可能に）しておくとよい。

### 4.4 帳票・PDF 生成

| 帳票 | 配布対象 | 業界標準 |
|---|---|---|
| **スタートリスト** (Heat Sheet) | 観客・選手・コーチ | HY-TEK MM が PDF 自動生成 |
| **成績票** (Result Sheet) | 同上 | 同上 |
| **賞状** (Award Certificate) | 入賞選手 | テンプレ + 差込印刷 |
| **公認記録申請書** | 連盟 | 連盟所定の Excel/PDF |
| **アナウンサーカード** | 場内放送 | クルー詳細1枚 |

**示唆**: 現状の龍偉システムは PDF 生成機能を持たないため（HTML から印刷）、**スタートリスト・成績票・賞状の自動 PDF** が次の差別化点。`@react-pdf/renderer` や `pdfme` のような JS ライブラリで Cloudflare Pages 上でも可能。

### 4.5 認証・権限管理

| ロール | 必要権限 | 業界標準 |
|---|---|---|
| **運営者** (Meet Director) | 全権限 | アカウント認証＋2FA |
| **記録員** (Recorder/Timer) | 結果投入・修正 | アカウント認証 |
| **審判長** (Chief Referee) | DQ判定・確定 | アカウント認証＋署名 |
| **選手** (Athlete) | 自分の結果閲覧 | 個人ID＋PIN |
| **観客** (Spectator) | 公開ページ閲覧 | 認証なし |
| **メディア** (Press) | API 利用 | API キー |

**示唆**: 龍偉システムは現在「URL秘匿」のみ。年次運用なら最低限 **Cloudflare Access**（無料枠あり）でメール認証を入れるべき（既に M-2 として認識済）。

### 4.6 スケーラビリティ

- **同時多発大会**: HY-TEK は1インスタンス1大会のデスクトップ前提。RegattaCentral / SwimTopia はクラウドで複数大会並列可能。
- **大量アクセス**: World Rowing 国際大会で同時数十万 PV。CDN（Cloudfront / Cloudflare）が必須。龍偉システムは既に Cloudflare Pages なので、観戦規模スパイクには強い。

---

## 5. D. 結果提出の標準フォーマット

### 5.1 陸上：FinishLynx 系

| 拡張子 | 内容 | バイナリ/テキスト |
|---|---|---|
| **`.lif`** (Lynx Image File) | 写真判定画像 + 結果 | バイナリ |
| **`.evt`** (Event File) | スタートリスト | テキスト（CSV風） |
| **`.ppl`** (People File) | 選手マスタ | テキスト |
| **`.rcd`** (Record File) | 各種記録 | テキスト |
| **HY-3 / CL2** | HY-TEK 形式 | 独自バイナリ＋テキスト |

`.evt` の例（簡略化）:
```
1,100,0,Men 100m Final
1,1,123,Smith,John,USA,USC
1,2,456,Jones,Bob,USA,UCLA
```

### 5.2 水泳：LENEX / SD3

#### LENEX (.lxf / .lef)
- XML 形式。詳細仕様は SPLASH Software 公式ドキュメント（PDF）参照
- バージョン: 3.0（現行・World Aquatics 公認）
- **1ファイルで大会セットアップ・エントリー・結果を完全表現**
- 圧縮版 `.lxf` は実体 ZIP

#### SD3
- HY-TEK 旧来の固定長レコード形式
- 北米クラブ提出のデファクト
- LENEX へ移行中

### 5.3 ボート：ResultsLive / WorldRowing 規格

| 仕様 | 状況 |
|---|---|
| **WorldRowing 公式 API** | あり。`worldrowing.com/api/` 配下。記者用・公開エンドポイントあり（要追加調査） |
| **HereNow 結果配信 JSON** | あり。レース単位のエンドポイント（要追加調査） |
| **TimeTeam .ttd / .ttr** | TimeTeam 独自。欧州大会で使用 |
| **公式統一フォーマット** | **存在しない**。陸上の LIF や水泳の LENEX に相当するボート標準はない |

**重要な発見**: **ボートには業界統一フォーマットが存在しない**。これは龍偉のシステムが独自 JSON 形式で運用していることを正当化する。一方、**陸上 (LIF)・水泳 (LENEX) のいずれかの構造を借用**することで、将来の相互運用性を確保できる。

### 5.4 マラソン・ロード：RFID 系

| 仕様 | 内容 |
|---|---|
| **ChronoTrack TXT** | カンマ区切りのチップ通過記録 |
| **MyLaps Practice** | 独自プロトコル |
| **gpx / fit / tcx** | GPS トラック共通 |

### 5.5 共通：CSV / JSON

業界横断のデファクトはなく、各システムが独自 CSV/JSON を併用。**JSON 化は新興分野で進行中**（RunSignup・Athlinks 等が REST JSON を提供）。

---

## 6. E. ボート競技固有の論点

### 6.1 レーン数（4〜8）変動への対応

| コース | レーン数 | 例 |
|---|---|---|
| 国際標準 | 6〜8 | Henley Royal Regatta, Lucerne |
| 国内標準 | 6 | 戸田公園、海の森 |
| 地方コース | 4〜6 | 津幡（石川）、宮ヶ瀬等 |

**設計示唆**: `lanes` フィールドをレース単位で持つ（コース全体ではなく）。マスターズで「**両岸スタート**」（4レーン × 2 = 8 を仮想的に2レースに分ける）運用もあるため、`heat_no` でグルーピング。

### 6.2 カテゴリー合同レース（年齢別ハンディキャップ）

マスターズ特有。World Rowing Masters Regatta では:

| 仕組み | 概要 |
|---|---|
| **AVERAGE AGE** | クルー全員の年齢平均でカテゴリー決定 |
| **Handicap System** | カテゴリー差を時間で補正（例: F→D は +5秒/カテゴリー） |
| **Open Time** | 補正なしの実タイム |
| **Adjusted Time** | 補正済みタイム |

龍偉システムは `age_group: "DEF"` の連結文字列で表現済。**世界基準に揃えるならハンディキャップ補正機能を追加**するとよい（要件次第）。

### 6.3 中間計測（500m / 1000m / 1500m）

ボート競技固有の論点:

| 距離 | 中間ポイント | 用途 |
|---|---|---|
| 1000m（マスターズ） | 500m | 中間順位・split 表示 |
| 2000m（国際標準） | 500m / 1000m / 1500m | 同上＋ペース分析 |
| 500m（短距離） | — | フィニッシュのみ |

龍偉システムは `measurement_points: ["500m", "1000m"]` で対応済。**両ポイント揃いチェック** の運用上の課題（500m 種目で 500m 1回のみの場合）は SPEC.md でリスク R-3 として既に認識済。

**改善示唆**: `measurement_points` をレース単位（または距離単位）で可変にする。
```json
{
  "race_no": 7,
  "distance_m": 500,
  "measurement_points_required": [500]  // 1000m を待たずに完結
}
```

### 6.4 DNS / DNF / DQ / 写真判定の標準化

| ステータス | 意味 | 業界標準コード |
|---|---|---|
| **OK** | 正規完走 | OK / FINISHED |
| **DNS** | Did Not Start | DNS |
| **DNF** | Did Not Finish | DNF |
| **DQ** | Disqualified | DSQ / DQ |
| **WD** | Withdrawn | WD / SCR (Scratched) |
| **PHOTO** | 写真判定保留 | PHOTO / UNDER_REVIEW |
| **TIE** | 同着 | TIE |
| **EXC** | 失格救済（例外規定） | EXC |

龍偉システムは現状 `OK | DNS | DNF | DQ` の4種。**`WD` `PHOTO` `TIE` を追加**することで陸上・水泳と相互運用しやすくなる。

### 6.5 風向・風速・天候記録

ボートは公認記録に天候情報が必須。World Rowing 規定では:

| 項目 | 単位 | 用途 |
|---|---|---|
| 風速 | m/s（北米は mph 併記） | 公認記録判定 |
| 風向 | 度（コース方向との角度） | 追風・向風・横風 |
| 気温 | °C | 参考 |
| 水温 | °C | 安全管理 |
| 天候概況 | 晴/曇/雨/強風 等 | 記録票 |

**設計示唆**: 各レースに `weather` オブジェクトを持たせ、コース管制から取得（手入力可）。マスターズで公認記録扱いしないなら参考表示でも価値あり。

### 6.6 その他のボート固有論点

| 論点 | 内容 |
|---|---|
| **キール（lane assignment）** | くじ引き or シード。シード方式は記録順 |
| **再レース（rerace）** | 衝突・水中異物等で再施行。当初結果は無効 |
| **抗議（protest）** | 結果発表後の抗議期間（30分等） |
| **クルー変更（substitute）** | マスターズで頻発。当日朝までの変更を許容 |
| **インテンショナル DQ** | 反則行為（艇接触・蛇行・コール無視） |
| **ボート計量** | 規定艇重量を満たすかの計量。違反は DQ |

---

## 7. F. マスターズレガッタ管理ダッシュボードへの示唆

### 7.1 現状の強み（保持すべきもの）

| 強み | 業界比較 |
|---|---|
| サーバーレス・ゼロコスト | RegattaCentral / HereNow が商用 SaaS（年数十万〜数百万円）の中で異例の低コスト |
| CSV → JSON 自動変換 | 業界標準的なファイルパイプライン思想 |
| `measurement_points` 両ポイント揃いチェック | 中間ラップを第一級に扱う設計（FIS 同等） |
| カテゴリー合同レース対応 | マスターズ大会で必須機能を実装済 |
| 全角→半角正規化 | 日本固有要件への配慮 |

### 7.2 取り入れるべきベストプラクティス

優先度 High → Mid → Low の順。

#### 【High-1】年度横断のマルチ大会データモデル

**Before** (現状):
```
/data/master.json
/data/results/race_001.json
```

**After**:
```
/data/years/2026/events/17_masters_regatta/meta.json
/data/years/2026/events/17_masters_regatta/schedule.json
/data/years/2026/events/17_masters_regatta/entries.json
/data/years/2026/events/17_masters_regatta/results/race_001.json
/data/years/2025/events/16_masters_regatta/...
/data/years/_index.json   // 全大会の一覧
```

**メリット**:
- 年次大会のアーカイブが構造化される
- 「過去大会」ページが追加コストゼロで生成可能
- 選手生涯結果 DB（Athlinks 風）の基盤になる

#### 【High-2】LENEX 風の「大会セットアップ JSON 仕様」を定義

水泳 LENEX に倣い、**1JSONで大会1個ぶんの全情報を表現**するスキーマを定義する。これがダッシュボードの「新規大会作成」入力になる。

```json
{
  "lenex_rowing_version": "1.0",
  "meet": { ... §3.2 },
  "age_categories": [ ... §A〜N ],
  "events": [
    {
      "event_code": "M1X",
      "event_name": "男子シングルスカル",
      ...
    }
  ],
  "schedule": [ ... ],
  "entries": [ ... ]
}
```

**メリット**:
- 「次年度大会のセットアップ」が **JSON 差し替え1ファイル** に圧縮
- 連盟・主催側との受渡が標準化（Excel やりとり廃止）
- 将来 LENEX 互換 XML エクスポートも追加可能

#### 【High-3】ステータス語彙の拡張

```
status: "OK" | "DNS" | "DNF" | "DQ" | "WD" | "PHOTO" | "TIE" | "EXC"
```

`PHOTO`（写真判定中）と `TIE`（同着）と `WD`（前日棄権）の3つは特に運用上の価値が大きい。

#### 【Mid-1】PDF 帳票自動生成

スタートリスト / 成績票 / 賞状を PDF 生成。Cloudflare Pages の静的サイト上で **クライアントサイド PDF 生成** が可能（jsPDF, pdfme）。サーバー不要を維持できる。

#### 【Mid-2】認証付き運営層

Cloudflare Access （無料枠で5ユーザーまで）でメール認証を導入。管理画面・記録投入画面に分離。

#### 【Mid-3】公開 JSON API エンドポイント

現在の `/data/results/race_001.json` は実質的に API として機能している。**明示的に `/api/v1/...` 経路を定義**し、メディア・選手の二次利用を許容する宣言。

```
GET /api/v1/years/2026/events/17/schedule
GET /api/v1/years/2026/events/17/races/001/result
GET /api/v1/athletes/{athlete_id}/history   ← 選手生涯結果
```

#### 【Mid-4】中間計測 `measurement_points_required` の可変化

R-3（500m 種目のスキップ問題）の根本解決。

#### 【Low-1】FinishLynx LIF 取込（将来）

連盟主催の上位大会で FinishLynx が導入される場合の互換性。

#### 【Low-2】公認記録の連盟突合（将来）

JARA との API 連携で公認記録自動申請。現状 API 公開なしのため要追加調査。

### 7.3 避けるべきアンチパターン

業界の失敗事例から学ぶ:

| アンチパターン | 失敗事例 | 教訓 |
|---|---|---|
| **デスクトップ縛り** | HY-TEK MM はクラウド化が遅れ SwimTopia に侵食 | デスクトップ単独ソフトは衰退中。Web ファースト |
| **独自プロトコル乱立** | ボートが LENEX 相当を持てなかった | 既存標準（LENEX / LIF）に乗るか、外向き JSON を公開する |
| **エントリーと結果の分離過剰** | RegattaCentral / DirectAthletics で「エントリーした選手が結果に紐づかない」混乱多発 | `athlete_id` を一意ID として通す |
| **PDF/Excel 中心の運用** | 国内連盟系で残存。修正コスト・転記ミス多発 | 一次データを構造化（JSON/DB）し、PDF は派生に |
| **公開・運営の混在** | 運営UIを観客に晒すと事故多発 | URL/認証/レイヤーで明確分離（既に分離済） |
| **CSV 命名規則の緩さ** | 現場ミス頻発 | 命名規則 + リアルタイムバリデーション（既に対応済） |
| **タイムゾーン未明示** | 国際大会で再三トラブル | ISO8601 + タイムゾーン記述を徹底 |
| **無限スクロール大会一覧** | Athlinks 初期 | ページング・年度フィルタ・検索を最初から |

### 7.4 推奨ロードマップ（叩き台）

| Phase | 内容 | 工数目安 |
|---|---|---|
| **P1**（次回大会前） | 年度横断ディレクトリ構造への移行・LENEX 風 setup JSON 仕様の定義 | Codex 3〜4本 |
| **P2** | ステータス語彙拡張（PHOTO/TIE/WD）・`measurement_points_required` 可変化 | Codex 1〜2本 |
| **P3** | 管理ダッシュボードに「新規大会作成」UI（setup JSON 出力） | Codex 2〜3本 |
| **P4** | PDF 帳票生成・Cloudflare Access 認証 | Codex 2本 |
| **P5** | 公開 API（`/api/v1/...`）整備・選手生涯結果ページ | Codex 2〜3本 |

---

## 8. 付録：用語集

| 用語 | 意味 |
|---|---|
| **Meet / Regatta** | 大会 |
| **Heat** | 予選組 |
| **Final A / B / C** | 決勝 A 組（1〜6位）、B 組（7〜12位）等 |
| **Crew** | クルー（ボートの乗艇者集合） |
| **Stroke / Bow** | クルー先頭・最後尾の漕手 |
| **Lane** | レーン |
| **Split** | 中間ラップ |
| **Bib** | ゼッケン番号 |
| **Seed Time** | エントリー時の自己ベスト（組合せ作成用） |
| **DSQ / DQ** | 失格 |
| **DNS / DNF** | 未出走 / 棄権 |
| **WD / SCR** | 出場辞退 |
| **TIE / DEAD-HEAT** | 同着 |
| **PHOTO FINISH** | 写真判定 |
| **HY-3 / CL2 / SD3** | HY-TEK 系ファイル形式 |
| **LIF** | FinishLynx 写真判定ファイル |
| **LENEX (.lxf / .lef)** | 水泳の国際標準 XML フォーマット |
| **FISA / World Rowing** | 国際ボート連盟 |
| **JARA** | 日本ボート協会 |
| **Masters Regatta** | マスターズ（成人後）の大会 |

---

## 9. 付録：要追加調査リスト

調査時間制約により未確定の項目を明示。

| 項目 | 重要度 | 推奨調査方法 |
|---|---|---|
| HereNow の公開 API 仕様（エンドポイント・JSON 形状） | High | `results.herenow.com/api/` 直接アクセス・既存大会で観察 |
| World Rowing 公式 API のスキーマ | High | `worldrowing.com/api/` ドキュメント確認 |
| 日本ボート協会 (JARA) のシステム実態 | High | 連盟関係者にヒアリング |
| RegattaCentral の日本での導入実例 | Mid | 同社問合せ・国内大会聞き取り |
| LENEX 3.0 完全仕様（XML スキーマ XSD） | Mid | SPLASH Software 公式 PDF 入手 |
| Splash Meet Manager のボート競技流用可能性 | Low | 体験版を試行 |
| OSS ボート競技管理プロジェクト網羅調査 | Low | GitHub `topic:rowing-regatta` 検索 |
| Athlinks のボートカテゴリー対応状況 | Low | 同サイト直接観察 |
| FinishLynx の国内ボート大会導入事例 | Low | 連盟・写真判定業者ヒアリング |
| 韓国・中国・豪のマスターズ大会システム | Low | 各国連盟サイト調査 |

---

## 10. 参考リンク集

### 国際連盟・公式

- World Athletics（陸上）: https://www.worldathletics.org/
- World Aquatics（水泳・旧FINA）: https://www.worldaquatics.com/
- World Rowing（ボート）: https://worldrowing.com/
- World Triathlon: https://www.triathlon.org/
- FIS（スキー）: https://www.fis-ski.com/

### 国内連盟

- 日本陸上競技連盟 (JAAF): https://www.jaaf.or.jp/
- 日本水泳連盟 Web-SWMSYS: https://swim.jasf.or.jp/
- 日本ボート協会 (JARA): https://www.jara.or.jp/
- 日本トライアスロン連合 (JTU): https://www.jtu.or.jp/

### 商用ソフトウェア

- HY-TEK Sports Software: https://hytek.active.com/
- SwimTopia Meet Maestro: https://www.swimtopia.com/products/meet-maestro/
- Splash Software (LENEX 策定): https://www.splash-software.at/
- FinishLynx: https://finishlynx.com/
- Omega Timing: https://www.omegatiming.com/
- MyLaps: https://www.mylaps.com/
- ChronoTrack: https://www.chronotrack.com/
- Race Roster: https://raceroster.com/
- RunSignup: https://runsignup.com/
- RunSignup API: https://runsignup.com/API
- Athlinks: https://www.athlinks.com/
- TFRRS: https://www.tfrrs.org/
- Athletic.net: https://www.athletic.net/
- MileSplit (FloSports): https://www.milesplit.com/
- DirectAthletics: https://www.directathletics.com/
- USA Swimming SWIMS: https://www.usaswimming.org/times
- SwimRankings: https://www.swimrankings.net/
- RegattaCentral: https://www.regattacentral.com/
- HereNow: https://results.herenow.com/
- TimeTeam: https://www.time-team.nl/
- NK SpeedCoach: https://nkhome.com/

### 規格・仕様書

- LENEX 仕様（SPLASH 公式 PDF 配布）: https://www.splash-software.at/lenex/
- World Athletics Technical Rules: https://www.worldathletics.org/about-iaaf/documents/book-of-rules
- World Rowing Rules of Racing: https://worldrowing.com/technical/rules/

### 計測ハード仕様

- FinishLynx LIF format（非公式解説多数）: https://finishlynx.com/product/software/
- MyLaps Practice Protocol: https://www.mylaps.com/

---

*作成: 2026-05-23 / 著者: MBP Claude（Opus 4.7）/ 対象: 龍偉（ボート競技マスターズレガッタ 運営担当）*
