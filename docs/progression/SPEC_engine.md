# プログレッション計算エンジン仕様書

| 項目 | 内容 |
|---|---|
| 文書ID | progression-engine-spec |
| 対象大会 | 全日本選手権・全日本マスターズレガッタ・その他ボート競技大会 |
| 想定実装 | TypeScript / Google Apps Script JavaScript |
| バージョン | 0.1.0 |
| 作成日 | 2026/05/23 |

---

## 1. 概要

### 1.1 目的

本仕様書は、ボート競技大会におけるプログレッション（次ラウンド進出、レーン割り当て、タイム順位による拾い上げ）を機械的に計算するためのエンジン仕様を定義する。既存の全日本マスターズレガッタ 2026 速報サイトは、`data/master.json` に大会スケジュールとエントリー、`data/results/race_NNN.json` に各レース結果を保持し、Google Drive にアップロードされた計測 CSV を Google Apps Script が JSON へ変換して GitHub に反映する構成である。本エンジンはこの既存構成を壊さず、進出計算だけを純粋関数として切り出す。

目的は次の4点である。

| 目的 | 内容 |
|---|---|
| テンプレート化 | 大会別・艇数別の進出方式を JSON テンプレートとして保持する |
| 自動計算 | レース結果から次ラウンド出場艇とレーンを自動算出する |
| 再現性 | 同じ入力から常に同じ出力を返す純粋関数として実装する |
| GAS 統合 | TypeScript 実装を Google Apps Script へ移植または transpile できる形にする |

### 1.2 スコープ

本エンジンのスコープは、レース結果が確定した後の進出判定と次ラウンド編成である。計測 CSV のパース、Web 表示 UI、Cloudflare Pages へのデプロイ、Drive 監視、GitHub API への Push は既存システムの責務とし、本エンジンはそれらのデータを入力として受け取る。

エンジンが扱う主な処理は次のとおりである。

| 処理 | 説明 |
|---|---|
| パターン選択 | エントリー数・レーン数に応じた進行パターンを選択する |
| 予選生成 | シード順から予選レースと初期レーンを生成する |
| 進出者決定 | 着順・タイム順位・DNS/DNF/DQ を考慮して次ラウンド進出者を決める |
| 識別子解決 | `1.HT` や `2.3.H` などの進出識別子から艇を取得する |
| レーン割当 | テンプレートの `lane_assignment` に従って各艇のレーンを決める |
| 監査情報生成 | どのルールで進出したかを説明できる補助情報を返す |

### 1.3 適用範囲

本仕様は以下の大会形式に適用する。

| 大会 | 適用方針 |
|---|---|
| 全日本選手権 | 予選、敗者復活、準決勝、順位決定、決勝など複数ラウンドを持つテンプレートを利用する |
| 全日本マスターズレガッタ | `masters-time-trial` テンプレートを利用し、原則としてタイム決勝または単一ラウンドとして扱う |
| その他大会 | レーン数、進出方式、ラウンド名称をテンプレート化すれば同じ API で扱う |

全日本マスターズでは既存の `round: "FA"` が多数存在する。これは「決勝A」または「タイム決勝」の表示ラウンドであり、プログレッション計算上は `final` または `time_trial_final` として扱える。既存画面との整合性のため、保存データの `round` 表記はそのまま維持し、エンジン内部では `round_code` に正規化する。

### 1.4 バージョン方針

テンプレートとエンジンは別々にバージョン管理する。

| 種別 | 例 | 方針 |
|---|---|---|
| engine_version | `0.1.0` | API 互換性を示す。破壊的変更はメジャーを上げる |
| template_version | `2026.1` | 大会要項・競漕規則に対応するテンプレート版を示す |
| ruleset | `world-rowing-2026` | 参照した競漕規則や進行表の版を示す |

---

## 2. ドメインモデル

### 2.1 基本インターフェース

```typescript
interface ProgressionTemplate {
  id: string;
  name: string;
  version: string;
  lanes: number;
  description?: string;
  patterns: Pattern[];
}

interface Pattern {
  id: string;
  entries_min: number;
  entries_max: number;
  rounds: Round[];
  notes?: string[];
}

interface Round {
  code: string;
  name: string;
  race_count: number;
  skip_if?: string;
  lane_assignment?: LaneAssignment[];
  advance_rules?: AdvanceRule[];
}

interface LaneAssignment {
  bn: number;
  source: SourceIdentifier;
}

interface AdvanceRule {
  to: string;
  spec: string;
}

interface Race {
  race_id: string;
  round_code: string;
  race_index: number;
  boats: Boat[];
  results?: Result[];
}

interface Boat {
  boat_id: string;
  bn: number;
  source: SourceIdentifier;
  crew_id: string;
  crew_name?: string;
  affiliation?: string;
  seed_rank?: number;
}

interface Result {
  boat_id: string;
  race_id: string;
  round_code: string;
  race_index: number;
  lane?: number;
  finish_time?: number;
  finish_rank?: number;
  status: ResultStatus;
  tie_group?: string;
  photo_flag?: boolean;
  note?: string;
}

type ResultStatus = "finish" | "DNS" | "DNF" | "DQ" | "EXC" | "unknown";
type SourceIdentifier = string;
```

### 2.2 既存データとの対応

既存の `data/master.json` と `data/results/race_NNN.json` はそのまま入力に利用できる。ただし既存結果 JSON は `lane` と `rank` を中心に保持しており、`boat_id` や `crew_id` が明示されない場合がある。そのため統合層で次の正規化を行う。

```typescript
function normalizeExistingResult(
  raceNo: number,
  scheduleEntry: ExistingSchedule,
  rawResult: ExistingResult
): Result {
  const boat = scheduleEntry.entries.find(entry => entry.lane === rawResult.lane);
  if (!boat) {
    throw new ProgressionError("RESULT_LANE_NOT_FOUND", {
      raceNo,
      lane: rawResult.lane
    });
  }

  return {
    boat_id: `${raceNo}:${rawResult.lane}`,
    race_id: `race_${String(raceNo).padStart(3, "0")}`,
    round_code: normalizeRoundCode(scheduleEntry.round),
    race_index: inferRaceIndex(scheduleEntry),
    lane: rawResult.lane,
    finish_time: rawResult.finish?.time_ms,
    finish_rank: rawResult.rank,
    status: normalizeStatus(rawResult.status, rawResult.note),
    tie_group: rawResult.tie_group || undefined,
    photo_flag: Boolean(rawResult.photo_flag),
    note: rawResult.note || undefined
  };
}
```

既存マスターズでは `race_no` が主キーであり、同一レース内のレーンがエントリー識別子として機能する。全日本など複数ラウンドで同一クルーが別レースへ進む場合は、`crew_id` を永続識別子として保持する必要がある。`crew_id` はエントリー CSV から生成するか、主催者提供のクルー ID が存在する場合はそれを使う。

### 2.3 テンプレート例

6レーン、8艇、予選2組、各組1着が決勝へ進出し、残りはタイム上位4艇が決勝へ進む簡略例を示す。

```json
{
  "id": "sample-6lane-8entries",
  "name": "6レーン 8艇 予選2組",
  "version": "0.1.0",
  "lanes": 6,
  "patterns": [
    {
      "id": "entries-7-8",
      "entries_min": 7,
      "entries_max": 8,
      "rounds": [
        {
          "code": "H",
          "name": "予選",
          "race_count": 2,
          "advance_rules": [
            { "to": "FA", "spec": "1..1:H" },
            { "to": "FA", "spec": "1..4:HT" }
          ]
        },
        {
          "code": "FA",
          "name": "決勝A",
          "race_count": 1,
          "lane_assignment": [
            { "bn": 3, "source": "1.1.H" },
            { "bn": 4, "source": "1.2.H" },
            { "bn": 2, "source": "1.HT" },
            { "bn": 5, "source": "2.HT" },
            { "bn": 1, "source": "3.HT" },
            { "bn": 6, "source": "4.HT" }
          ]
        }
      ]
    }
  ]
}
```

`bn` は boat number ではなく lane assignment 上の「レーン番号」として扱う。World Rowing の資料で boat number と lane が別概念になる場合に備え、将来的には `lane` へ名称変更できるが、テンプレートの指定値としては当面 `bn` を維持する。

---

## 3. 進出識別子 DSL

### 3.1 基本方針

進出識別子 DSL は、テンプレート上で「どのレース結果からどの艇を拾うか」を短く表す記法である。進出判定ロジックをコードに直接書かず、JSON テンプレートに分離するために利用する。

| 記法 | 意味 |
|---|---|
| `N.P` | プレリミナリーまたは前段ラウンド全体の N位 |
| `N.HT` | 予選の下位タイム対象艇からタイム順 N位 |
| `N.M.H` | 予選 M組の N位。例: `1.2.H` は予選2組1着 |
| `N.M.R` | 敗者復活 M組の N位 |
| `N.M.SA` | 準決勝A系 M組の N位 |
| `N.M.SB` | 準決勝B系 M組の N位 |
| `N.FT` | 決勝または対象ラウンド全体のタイム N位 |
| `N.QT` | qualification time 対象艇のタイム N位 |
| `N.M.H.T` | 予選 M組で、着順 N位以下の艇をタイム評価対象にする拡張表現 |
| `...` | テンプレートで明示した追加コード。未定義コードはエラー |

### 3.2 パース文法

要求仕様の文法を基準にし、GAS JavaScript でも正規表現で安全に実装できる構文へ落とし込む。

```text
identifier := time_rank '.' race_rank? '.' round_code ('T'?)
time_rank  := positive_integer
race_rank  := positive_integer
round_code := uppercase_alpha (uppercase_alpha | digit)*
```

実装上は `1.HT` のように `race_rank` を持たない形式と、`1.2.H` のように `race_rank` を持つ形式を区別する。

```typescript
interface ParsedIdentifier {
  raw: string;
  rank: number;
  raceIndex?: number;
  roundCode: string;
  mode: "race_rank" | "round_time" | "lower_time" | "overall_rank";
  timeOnly: boolean;
}

function parseIdentifier(identifier: string): ParsedIdentifier {
  const parts = identifier.split(".");
  if (parts.length < 2 || parts.length > 4) {
    throw new ProgressionError("IDENTIFIER_SYNTAX", { identifier });
  }

  const rank = parsePositiveInt(parts[0], "rank", identifier);

  if (parts.length === 2) {
    const roundCode = parts[1];
    return {
      raw: identifier,
      rank,
      roundCode: stripTimeSuffix(roundCode),
      mode: inferIdentifierMode(roundCode),
      timeOnly: roundCode.endsWith("T")
    };
  }

  const raceIndex = parsePositiveInt(parts[1], "raceIndex", identifier);
  const roundCode = parts[2];
  return {
    raw: identifier,
    rank,
    raceIndex,
    roundCode: stripTimeSuffix(roundCode),
    mode: "race_rank",
    timeOnly: parts[3] === "T" || roundCode.endsWith("T")
  };
}
```

### 3.3 識別子の意味解決

`N.M.H` は「H ラウンド M組の着順 N位」を指す。着順は `finish_rank` を使い、`DNS`、`DNF`、`DQ`、`EXC` は通常の着順対象から除外する。`tie_group` が設定されている場合は同順位として扱うが、テンプレートの進出枠を超える同着が発生した場合は `TIE_OVERFLOW` を返し、統合層または審判長承認フローで確定する。

`N.HT` は「予選下位タイム N位」である。下位タイム対象の定義はテンプレートの `advance_rules` から決まる。たとえば `1..1:H` で各組1着が直接進出し、`1..4:HT` でタイム上位4艇を拾う場合、各予選の1着は `HT` の対象から除外する。残った完漕艇を `finish_time` 昇順、同タイムは `tie_group` または `photo_flag` 判定順で並べ、N番目を選ぶ。

### 3.4 AdvanceRule spec

`AdvanceRule.spec` は進出枠の集合を表す。

```text
advance_spec := range ':' source_code
range        := integer | integer '..' integer
source_code  := round_code | round_code 'T' | 'HT' | 'RT' | 'QT'
```

例:

| spec | 意味 |
|---|---|
| `1:H` | 各予選1着を対象にする |
| `1..2:H` | 各予選1着から2着を対象にする |
| `1..4:HT` | 予選の下位タイム対象から上位4艇を拾う |
| `1..6:FT` | 対象ラウンド全体のタイム上位6艇 |
| `1..2:R` | 敗者復活各組1着から2着 |

`AdvanceRule.to` は進出先ラウンドコードである。1つのラウンドから複数の進出先が存在する場合、`advance_rules` の順番で直接進出、次にタイム拾い上げ、最後に順位決定戦という順序を明示する。

---

## 4. エンジン API

### 4.1 クラス定義

```typescript
class ProgressionEngine {
  constructor(options?: ProgressionEngineOptions);

  selectPattern(entriesCount: number, lanes: number): Pattern;

  generateInitialRaces(seeds: Seed[], pattern: Pattern): Race[];

  computeAdvancement(
    round: Round,
    results: Result[],
    template: ProgressionTemplate
  ): NextRoundRaces[];

  assignLanes(
    advancingBoats: Boat[],
    rules: LaneAssignment[]
  ): BoatLaneMapping;

  resolveIdentifier(
    identifier: string,
    allResults: Map<string, Result[]>
  ): Boat;
}

interface ProgressionEngineOptions {
  strict?: boolean;
  statusPolicy?: StatusPolicy;
  tiePolicy?: TiePolicy;
  laneOrder?: number[];
}

interface Seed {
  crew_id: string;
  crew_name?: string;
  affiliation?: string;
  seed_rank: number;
}

interface NextRoundRaces {
  round_code: string;
  races: Race[];
  audit: AdvancementAudit[];
}

interface BoatLaneMapping {
  [lane: number]: Boat;
}
```

### 4.2 selectPattern

`selectPattern(entriesCount: number, lanes: number): Pattern`

入力:

| 引数 | 型 | 説明 |
|---|---|---|
| entriesCount | number | 対象種目の有効エントリー数。大会当日 DNS を除外する場合は除外後の数 |
| lanes | number | 使用可能レーン数。戸田6レーン、会場により5・7・8もあり得る |

出力:

| 型 | 説明 |
|---|---|
| Pattern | `entries_min <= entriesCount <= entries_max` かつ `template.lanes == lanes` に合致するパターン |

例外:

| code | 条件 |
|---|---|
| `INVALID_ENTRIES_COUNT` | `entriesCount < 1` |
| `LANE_MISMATCH` | テンプレートのレーン数と入力レーン数が一致しない |
| `PATTERN_NOT_FOUND` | 対応するエントリー数範囲が存在しない |
| `PATTERN_OVERLAP` | 複数パターンが同じエントリー数に一致する |

実装例:

```typescript
selectPattern(entriesCount: number, lanes: number): Pattern {
  if (!Number.isInteger(entriesCount) || entriesCount < 1) {
    throw new ProgressionError("INVALID_ENTRIES_COUNT", { entriesCount });
  }
  if (this.template.lanes !== lanes) {
    throw new ProgressionError("LANE_MISMATCH", {
      expected: this.template.lanes,
      actual: lanes
    });
  }

  const matches = this.template.patterns.filter(pattern =>
    pattern.entries_min <= entriesCount && entriesCount <= pattern.entries_max
  );

  if (matches.length === 0) {
    throw new ProgressionError("PATTERN_NOT_FOUND", { entriesCount, lanes });
  }
  if (matches.length > 1) {
    throw new ProgressionError("PATTERN_OVERLAP", {
      entriesCount,
      patternIds: matches.map(pattern => pattern.id)
    });
  }
  return matches[0];
}
```

### 4.3 generateInitialRaces

`generateInitialRaces(seeds: Seed[], pattern: Pattern): Race[]`

入力:

| 引数 | 型 | 説明 |
|---|---|---|
| seeds | Seed[] | シード順に並んだクルー配列。`seed_rank` は1始まり |
| pattern | Pattern | `selectPattern` で選択されたパターン |

出力:

| 型 | 説明 |
|---|---|
| Race[] | 最初のラウンド、通常は `H` または `P` のレース配列 |

例外:

| code | 条件 |
|---|---|
| `SEED_DUPLICATED` | 同じ `crew_id` または `seed_rank` が重複 |
| `INITIAL_ROUND_NOT_FOUND` | パターンに初期ラウンドが存在しない |
| `LANE_CAPACITY_EXCEEDED` | 1レースの艇数がレーン数を超える |

シード配置は FISA 標準のジグザグ配置を基本とする。レース数が2であれば、シード1をH1、シード2をH2、シード3をH2、シード4をH1のように蛇行させる方式と、シード1をH1、シード2をH2、シード3をH1、シード4をH2のように単純交互にする方式が大会資料により異なる。本エンジンではテンプレートに `seeding_policy` を追加できる前提とし、未指定時は `snake_by_seed` を採用する。

```typescript
function distributeSeeds(seeds: Seed[], raceCount: number): Seed[][] {
  const buckets = Array.from({ length: raceCount }, () => [] as Seed[]);
  seeds
    .slice()
    .sort((a, b) => a.seed_rank - b.seed_rank)
    .forEach((seed, index) => {
      const block = Math.floor(index / raceCount);
      const offset = index % raceCount;
      const raceIndex = block % 2 === 0 ? offset : raceCount - 1 - offset;
      buckets[raceIndex].push(seed);
    });
  return buckets;
}
```

### 4.4 computeAdvancement

`computeAdvancement(round: Round, results: Result[], template: ProgressionTemplate): NextRoundRaces[]`

入力:

| 引数 | 型 | 説明 |
|---|---|---|
| round | Round | 完了したラウンド |
| results | Result[] | 当該ラウンドの全結果。全組が含まれている必要がある |
| template | ProgressionTemplate | 進出先ラウンドとレーン割当を含むテンプレート |

出力:

| 型 | 説明 |
|---|---|
| NextRoundRaces[] | 次ラウンドごとの Race 配列と監査情報 |

例外:

| code | 条件 |
|---|---|
| `ROUND_INCOMPLETE` | 必須レースの結果が不足 |
| `ADVANCE_RULE_NOT_FOUND` | `advance_rules` がないのに次ラウンドが必要 |
| `ADVANCER_COUNT_MISMATCH` | レーン割当数と進出艇数が一致しない |
| `TIE_OVERFLOW` | 同着により進出枠を超過し、ルールだけで決着できない |
| `RESULT_STATUS_INVALID` | 不明な status が存在 |

このメソッドは「完了済みラウンドの結果を読み、次ラウンドの艇リストを組み立てる」だけを行う。結果の保存や `master.json` の更新は呼び出し側が担当する。

### 4.5 assignLanes

`assignLanes(advancingBoats: Boat[], rules: LaneAssignment[]): BoatLaneMapping`

入力:

| 引数 | 型 | 説明 |
|---|---|---|
| advancingBoats | Boat[] | 識別子が付与済みの進出艇 |
| rules | LaneAssignment[] | `bn` と `source` の対応表 |

出力:

| 型 | 説明 |
|---|---|
| BoatLaneMapping | レーン番号をキー、艇を値にしたマップ |

例外:

| code | 条件 |
|---|---|
| `LANE_DUPLICATED` | 同じ `bn` が複数指定 |
| `LANE_OUT_OF_RANGE` | `bn` が 1 から `lanes` の範囲外 |
| `SOURCE_NOT_FOUND` | `source` に対応する艇が存在しない |
| `BOAT_ASSIGNED_TWICE` | 同じ艇が複数レーンへ割り当てられる |

```typescript
function assignLanes(
  advancingBoats: Boat[],
  rules: LaneAssignment[]
): BoatLaneMapping {
  const bySource = new Map(advancingBoats.map(boat => [boat.source, boat]));
  const mapping: BoatLaneMapping = {};
  const usedBoatIds = new Set<string>();

  for (const rule of rules) {
    if (mapping[rule.bn]) {
      throw new ProgressionError("LANE_DUPLICATED", { lane: rule.bn });
    }

    const boat = bySource.get(rule.source);
    if (!boat) {
      throw new ProgressionError("SOURCE_NOT_FOUND", { source: rule.source });
    }
    if (usedBoatIds.has(boat.boat_id)) {
      throw new ProgressionError("BOAT_ASSIGNED_TWICE", {
        boat_id: boat.boat_id
      });
    }

    mapping[rule.bn] = boat;
    usedBoatIds.add(boat.boat_id);
  }

  return mapping;
}
```

### 4.6 resolveIdentifier

`resolveIdentifier(identifier: string, allResults: Map<string, Result[]>): Boat`

入力:

| 引数 | 型 | 説明 |
|---|---|---|
| identifier | string | `1.HT`、`1.2.H` などの DSL |
| allResults | Map<string, Result[]> | round_code をキーにした結果集合 |

出力:

| 型 | 説明 |
|---|---|
| Boat | 識別子が指す艇 |

例外:

| code | 条件 |
|---|---|
| `IDENTIFIER_SYNTAX` | DSL の構文が不正 |
| `ROUND_RESULT_NOT_FOUND` | 対象ラウンドの結果がない |
| `RACE_RESULT_NOT_FOUND` | 対象組の結果がない |
| `RANK_NOT_FOUND` | 指定順位の艇が存在しない |
| `TIME_MISSING` | タイム順位を要求されたが `finish_time` がない |

---

## 5. 計算アルゴリズム

### 5.1 進出識別子の解決

`N.M.H` は、ラウンド `H` の M組から着順 N位の艇を探す。処理手順は次のとおりである。

1. `identifier` を `rank=N`、`raceIndex=M`、`roundCode=H` に分解する。
2. `allResults.get("H")` から `race_index === M` の結果だけを抽出する。
3. `status === "finish"` の結果だけを対象にする。
4. `finish_rank` 昇順で並べる。
5. `finish_rank === N` の艇を返す。

```typescript
function resolveRaceRank(
  rank: number,
  raceIndex: number,
  roundCode: string,
  allResults: Map<string, Result[]>
): Result {
  const roundResults = allResults.get(roundCode);
  if (!roundResults) {
    throw new ProgressionError("ROUND_RESULT_NOT_FOUND", { roundCode });
  }

  const raceResults = roundResults
    .filter(result => result.race_index === raceIndex)
    .filter(isCompletedFinish)
    .sort(compareByFinishRank);

  const found = raceResults.find(result => result.finish_rank === rank);
  if (!found) {
    throw new ProgressionError("RANK_NOT_FOUND", {
      rank,
      raceIndex,
      roundCode
    });
  }
  return found;
}
```

`N.HT` は、予選で直接進出した艇を除いた残りからタイム N位を探す。ここでいう「下位」は全艇の下位ではなく、テンプレート上で直接進出対象から外れた艇である。たとえば各組2着まで直接準決勝、残りタイム上位2艇が準決勝の場合、各組1着・2着を除いた完漕艇だけが HT 対象である。

```typescript
function resolveHeatTimeRank(
  rank: number,
  heatResults: Result[],
  directAdvancers: Set<string>
): Result {
  const candidates = heatResults
    .filter(isCompletedFinish)
    .filter(result => !directAdvancers.has(result.boat_id))
    .filter(result => typeof result.finish_time === "number")
    .sort(compareByTimeWithTie);

  const found = candidates[rank - 1];
  if (!found) {
    throw new ProgressionError("RANK_NOT_FOUND", { rank, source: "HT" });
  }
  return found;
}
```

### 5.2 シードから予選レースへの割り当て

予選レース割り当ては、競技公平性のためにシード上位艇が同一組へ偏らないようにする。基本はジグザグ配置である。

6レーン、12艇、予選3組の例:

| seed | heat |
|---:|---:|
| 1 | H1 |
| 2 | H2 |
| 3 | H3 |
| 4 | H3 |
| 5 | H2 |
| 6 | H1 |
| 7 | H1 |
| 8 | H2 |
| 9 | H3 |
| 10 | H3 |
| 11 | H2 |
| 12 | H1 |

レーンは中央から外側へ割り当てる。6レーンの場合の推奨順は `[3, 4, 2, 5, 1, 6]`、5レーンの場合は `[3, 2, 4, 1, 5]`、7レーンの場合は `[4, 3, 5, 2, 6, 1, 7]` とする。

```typescript
const DEFAULT_LANE_ORDER: Record<number, number[]> = {
  5: [3, 2, 4, 1, 5],
  6: [3, 4, 2, 5, 1, 6],
  7: [4, 3, 5, 2, 6, 1, 7],
  8: [4, 5, 3, 6, 2, 7, 1, 8]
};

function assignInitialLanes(seedsInRace: Seed[], lanes: number): Boat[] {
  const laneOrder = DEFAULT_LANE_ORDER[lanes];
  if (!laneOrder) {
    throw new ProgressionError("LANE_ORDER_NOT_DEFINED", { lanes });
  }

  return seedsInRace.map((seed, index) => ({
    boat_id: seed.crew_id,
    crew_id: seed.crew_id,
    crew_name: seed.crew_name,
    affiliation: seed.affiliation,
    seed_rank: seed.seed_rank,
    bn: laneOrder[index],
    source: `S${seed.seed_rank}`
  }));
}
```

既存マスターズでは発艇表がすでに決定済みであり、初期レース生成を使わないことが多い。その場合は `generateInitialRaces` を呼ばず、`master.json` の `schedule.entries` を正規化して `Race` として扱う。

### 5.3 進出計算

進出計算は次の順序で実行する。

1. ラウンドの全レース結果が揃っていることを確認する。
2. `status` を正規化し、`finish` 以外を通常順位対象から除外する。
3. `advance_rules` の直接進出ルールを先に評価する。
4. 直接進出艇を除外し、タイム拾い上げルールを評価する。
5. 各進出艇へ `source` 識別子を付与する。
6. 次ラウンドの `lane_assignment` を参照してレースを生成する。
7. 監査ログとして、進出理由、元レース、元レーン、タイム、着順を返す。

```typescript
interface AdvancementAudit {
  boat_id: string;
  crew_id: string;
  from_round: string;
  from_race_index: number;
  from_lane?: number;
  to_round: string;
  source: SourceIdentifier;
  rule: string;
  finish_rank?: number;
  finish_time?: number;
  status: ResultStatus;
}

function computeAdvancementForRule(
  rule: AdvanceRule,
  roundResults: Result[],
  directAdvancers: Set<string>
): AdvancementAudit[] {
  const spec = parseAdvanceSpec(rule.spec);
  if (spec.sourceCode === "HT") {
    return resolveTimeAdvancers(spec, roundResults, directAdvancers, rule.to);
  }
  return resolveDirectAdvancers(spec, roundResults, rule.to);
}
```

`skip_if` は次ラウンドの実施要否に使う。たとえば1艇のみのレースは実施せず、前段結果をそのまま次へ進める場合がある。

```typescript
function shouldSkipRound(round: Round, boats: Boat[]): boolean {
  if (!round.skip_if) return false;
  if (round.skip_if === "boats_count<=1") return boats.length <= 1;
  throw new ProgressionError("UNSUPPORTED_SKIP_CONDITION", {
    skip_if: round.skip_if
  });
}
```

### 5.4 同タイムと tie_group

同タイムは `tie_group` を最優先する。`tie_group` が同じ艇は同順位として扱う。`tie_group` が空で `finish_time` が同一の場合、`photo_flag` が立っていれば写真判定待ちとして `TIE_REQUIRES_REVIEW` を返し、写真判定後の `finish_rank` 更新を待つ。`photo_flag` がなく完全同タイムの場合は、テンプレートの `tiePolicy` に従う。

| tiePolicy | 処理 |
|---|---|
| `error` | 同着が進出枠境界にかかる場合は例外 |
| `include_all` | 同着全艇を進出させる。レーン不足時は例外 |
| `finish_rank` | `finish_rank` を信頼して順位を確定する |
| `manual_review` | 監査情報に保留状態を返す |

推奨は `manual_review` である。公式記録に基づく判断を人間が確定し、確定後に再計算する。

---

## 6. エッジケース

| ケース | 処理 |
|---|---|
| DNS | 出漕していないためタイム順位対象外。直接進出・タイム拾い上げとも対象外 |
| DNF | 完漕していないためタイム順位対象外。順位が付いていても進出対象外 |
| DQ | 失格。進出対象外。監査ログには除外理由を残す |
| EXC | 除外または棄権扱い。大会ルールにより DNS または DQ 相当として設定する |
| 1艇のみ | `skip_if='boats_count<=1'` の場合はレース非実施とし、次段へ自動進出可能 |
| 同タイム | `tie_group` で同順位扱い。進出枠境界では `tiePolicy` を適用 |
| 当日DNS | 進出計算時に skip。`entriesCount` を再評価するか、元パターンを維持するかは大会設定で決める |
| 結果未入力 | `ROUND_INCOMPLETE`。次ラウンドは生成しない |
| タイム欠損 | タイム順位対象から除外し、必要枠が埋まらない場合は `TIME_MISSING` |
| レーン不足 | `ADVANCER_COUNT_MISMATCH` または `LANE_CAPACITY_EXCEEDED` |
| 予選組数変更 | テンプレート選択を再実行し、既存スケジュールとの差分を監査する |

DNS/DNF/DQ の繰り上げ例:

```typescript
function isEligibleForAdvancement(result: Result): boolean {
  return result.status === "finish"
    && typeof result.finish_rank === "number"
    && typeof result.finish_time === "number";
}

function takeTimeAdvancers(results: Result[], count: number): Result[] {
  return results
    .filter(isEligibleForAdvancement)
    .sort(compareByTimeWithTie)
    .slice(0, count);
}
```

「進出枠は時間順位 N+1 で繰り上げ」とは、対象外艇を除外した後に上から N 艇を取るという意味である。たとえばタイム拾い上げ4枠で、全体タイム3位が DQ の場合、1位、2位、4位、5位が進出する。

---

## 7. データ永続化

### 7.1 Drive Sheets からエンジンへの入力

既存運用では計測スタッフが Google Drive に CSV をアップロードし、GAS が2分間隔で監視して `data/results/race_NNN.json` を生成する。プログレッション計算では、GAS が生成した結果 JSON を入力として利用する。将来的に Google Sheets で審判確定結果を管理する場合も、エンジン入力は同じ `Result[]` へ正規化する。

推奨入力パイプライン:

```text
Google Drive CSV
  -> GAS CSV parser
  -> race_NNN.json
  -> normalizeExistingResult()
  -> ProgressionEngine.computeAdvancement()
  -> next round schedule draft
  -> master.json update or review queue
```

### 7.2 master.json 拡張

`data/master.json` には大会単位で `progression_template_id` を保持する。

```json
{
  "tournament": {
    "race_name": "第17回全日本マスターズレガッタ",
    "dates": ["2026-05-23", "2026-05-24"],
    "venue": "石川県津幡漕艇競技場 1000m"
  },
  "progression": {
    "template_id": "masters-time-trial",
    "template_version": "2026.1",
    "engine_version": "0.1.0",
    "mode": "time_trial"
  },
  "schedule": []
}
```

種目ごとにテンプレートが異なる大会では、`schedule` または `event_groups` に `progression_template_id` を持たせる。

```json
{
  "event_code": "M1X",
  "round": "H",
  "progression_template_id": "alljapan-2026-A",
  "progression_group_id": "M1X-open"
}
```

### 7.3 race_NNN.json

各レース結果は既存どおり `data/results/race_NNN.json` に保存する。プログレッション用には、呼び出し時に `race_no`、`schedule.entries`、`result.lane` を結合して `boat_id` と `crew_id` を復元する。複数ラウンド大会では、同一クルーが別レースへ進むため、`race_NNN.json` 側にも `crew_id` を保存できると望ましい。

互換性を保つための追加例:

```json
{
  "race_no": 12,
  "round_code": "H",
  "race_index": 2,
  "results": [
    {
      "lane": 3,
      "crew_id": "M1X-crew-004",
      "rank": 1,
      "finish": { "time_ms": 421230, "formatted": "7:01.23" },
      "status": "finish"
    }
  ]
}
```

### 7.4 出力データ

エンジンの出力は、直接 `master.json` を更新する形式ではなく、次ラウンド案として返す。

```typescript
interface ProgressionOutput {
  generated_at: string;
  template_id: string;
  pattern_id: string;
  from_round: string;
  next_rounds: NextRoundRaces[];
  warnings: ProgressionWarning[];
}
```

GAS 統合では、この出力を確認用 JSON として保存し、審判長または競技運営が承認した後に `master.json` の `schedule` へ反映する設計が安全である。自動反映が必要な大会でも、`warnings.length > 0` の場合は自動更新を止める。

---

## 8. 既存システムとの統合

### 8.1 マスターズ

マスターズでは `masters-time-trial` テンプレートを利用する。1パターンのみ、原則として既存スケジュールに登録されたレースをそのまま決勝またはタイム決勝として扱う。

```json
{
  "id": "masters-time-trial",
  "name": "全日本マスターズ タイム決勝",
  "version": "2026.1",
  "lanes": 6,
  "patterns": [
    {
      "id": "masters-default",
      "entries_min": 1,
      "entries_max": 999,
      "rounds": [
        {
          "code": "FA",
          "name": "決勝",
          "race_count": 1,
          "skip_if": "boats_count<=1"
        }
      ]
    }
  ]
}
```

既存の `docs/SPEC.md` では、`schedule.csv` の `round` は `FA` として説明されている。本仕様でも `FA` を有効なラウンドコードとして扱う。マスターズは年齢カテゴリー別順位を表示するため、プログレッションとは別に `age_group` と `category` による順位分けが必要である。この処理は既存 UI の責務であり、エンジンはクルー進出の有無だけを扱う。

### 8.2 全日本

全日本では `alljapan-2026-A` または `alljapan-2026-B` テンプレートを設定ファイルで指定する。大会要項の進行表が複数パターンを持つ場合、エントリー数により `selectPattern` が自動選択する。

```json
{
  "progression": {
    "template_id": "alljapan-2026-A",
    "template_path": "docs/progression/templates/alljapan-2026-A.json",
    "engine_version": "0.1.0",
    "strict": true,
    "tie_policy": "manual_review"
  }
}
```

### 8.3 GAS 統合

GAS では ES2019 相当の JavaScript へ変換して利用する。TypeScript の型はビルド時だけに使い、実行時はプレーンオブジェクトで動作させる。`Map` は GAS でも利用可能だが、ログ出力や JSON 化を考慮して、境界では通常オブジェクトへ変換する。

```javascript
function runProgressionForRace(raceNo) {
  const master = fetchMasterJson_();
  const result = fetchRaceResultJson_(raceNo);
  const template = loadProgressionTemplate_(master.progression.template_id);
  const engine = new ProgressionEngine(template, {
    strict: true,
    tiePolicy: "manual_review"
  });

  const normalized = normalizeResultsForRace_(master, result);
  const round = findRoundByRaceNo_(master, raceNo, template);
  const output = engine.computeAdvancement(round, normalized, template);

  saveProgressionDraft_(raceNo, output);
  return output;
}
```

### 8.4 フロントエンド統合

公開ページは確定済みの `master.json` と `race_NNN.json` だけを読む。進出計算中のドラフトや警告は管理画面に表示する。観客向け画面に未確定の進出案を表示する場合は、明確に「未確定」とする必要がある。

---

## 9. 実装手順

1. TypeScript エンジンを純粋関数として実装する。I/O、Drive、GitHub、DOM 操作を含めない。
2. `docs/progression/templates/*.json` にテンプレートを作成する。最低限 `masters-time-trial`、`alljapan-2026-A`、`alljapan-2026-B` を用意する。
3. `docs/progression/tests/*.json` にテストケースを作成する。通常進出、DNS、DNF、DQ、同タイム、レーン不足を含める。
4. ユニットテストを実装する。TypeScript 側では Vitest または Jest を想定し、GAS 側では同じ JSON ケースを読み込む簡易テスト関数を用意する。
5. GAS 用に transpile するか、エンジンのロジックを直接 JS 化する。Date、Map、Array sort の安定性など GAS 差分を確認する。
6. 既存 GAS へ統合する。CSV 取り込み後、該当ラウンドが完了したタイミングで進出計算を実行し、ドラフト JSON を保存する。
7. 管理画面でドラフト確認と承認を行えるようにする。警告がある場合は自動反映しない。
8. 承認後に `master.json` のスケジュールを更新し、必要な `race_NNN.json` の空ファイルまたは予定データを生成する。

推奨テストケース:

| ケース | 目的 |
|---|---|
| `masters_time_trial_6boats.json` | マスターズ単一決勝で進出計算が何もしないこと |
| `heats_2x_direct_and_time.json` | 各組1着とタイム拾い上げの混在 |
| `dns_in_heat_time.json` | DNS が HT 対象外になり繰り上げること |
| `dq_direct_place.json` | 直接進出枠の DQ が次順位へ繰り上がること |
| `tie_on_boundary.json` | 進出枠境界の同着で警告または例外になること |
| `lane_assignment_missing_source.json` | テンプレート不整合を検出すること |

---

## 10. 参考リンク

| 種別 | 参照 |
|---|---|
| テンプレート | `docs/progression/templates/*.json` |
| テストケース | `docs/progression/tests/*.json` |
| 既存システム仕様 | `docs/SPEC.md` |
| 既存大会データ | `data/master.json` |
| 既存結果データ | `data/results/race_NNN.json` |
| 競漕規則 | World Rowing Rules of Racing |
| 進行表 | FISA Progression System 公式資料 |

World Rowing / FISA の公式進行表は版により進出枠やラウンド名称が変わる可能性があるため、テンプレート作成時は必ず大会年度の要項と照合する。本エンジンは公式資料そのものを内蔵しない。公式資料を JSON テンプレートへ転記し、テストケースで検証することで、実装と大会運営ルールを分離する。

---

## 付録 A. エラー定義

```typescript
class ProgressionError extends Error {
  readonly code: ProgressionErrorCode;
  readonly details: Record<string, unknown>;

  constructor(code: ProgressionErrorCode, details: Record<string, unknown> = {}) {
    super(code);
    this.name = "ProgressionError";
    this.code = code;
    this.details = details;
  }
}

type ProgressionErrorCode =
  | "INVALID_ENTRIES_COUNT"
  | "LANE_MISMATCH"
  | "PATTERN_NOT_FOUND"
  | "PATTERN_OVERLAP"
  | "SEED_DUPLICATED"
  | "INITIAL_ROUND_NOT_FOUND"
  | "LANE_CAPACITY_EXCEEDED"
  | "ROUND_INCOMPLETE"
  | "ADVANCE_RULE_NOT_FOUND"
  | "ADVANCER_COUNT_MISMATCH"
  | "TIE_OVERFLOW"
  | "TIE_REQUIRES_REVIEW"
  | "RESULT_STATUS_INVALID"
  | "IDENTIFIER_SYNTAX"
  | "ROUND_RESULT_NOT_FOUND"
  | "RACE_RESULT_NOT_FOUND"
  | "RANK_NOT_FOUND"
  | "TIME_MISSING"
  | "LANE_DUPLICATED"
  | "LANE_OUT_OF_RANGE"
  | "SOURCE_NOT_FOUND"
  | "BOAT_ASSIGNED_TWICE"
  | "UNSUPPORTED_SKIP_CONDITION";
```

---

## 付録 B. 完整性チェック

テンプレート読み込み時には次の静的検証を実行する。

| チェック | 内容 |
|---|---|
| パターン範囲 | `entries_min` と `entries_max` が正で、重複しない |
| ラウンドコード | 同一パターン内で `code` が重複しない |
| レース数 | `race_count` が1以上 |
| レーン | `lane_assignment.bn` が 1 から `lanes` の範囲内 |
| source | `lane_assignment.source` が DSL としてパース可能 |
| advance | `advance_rules.to` が同一パターン内のラウンドコードを指す |
| skip_if | サポート済み条件だけを使う |

```typescript
function validateTemplate(template: ProgressionTemplate): void {
  const ranges: Array<[number, number, string]> = [];

  for (const pattern of template.patterns) {
    if (pattern.entries_min < 1 || pattern.entries_max < pattern.entries_min) {
      throw new ProgressionError("PATTERN_NOT_FOUND", {
        pattern_id: pattern.id,
        entries_min: pattern.entries_min,
        entries_max: pattern.entries_max
      });
    }
    ranges.push([pattern.entries_min, pattern.entries_max, pattern.id]);

    const roundCodes = new Set(pattern.rounds.map(round => round.code));
    for (const round of pattern.rounds) {
      for (const rule of round.advance_rules || []) {
        if (!roundCodes.has(rule.to)) {
          throw new ProgressionError("ADVANCE_RULE_NOT_FOUND", {
            pattern_id: pattern.id,
            from: round.code,
            to: rule.to
          });
        }
      }
    }
  }
}
```

---

## 付録 C. 実装上の注意

Array の sort は比較関数を必ず指定し、数値を文字列として比較しない。タイムはミリ秒の number で保持し、表示用 `formatted` は比較に使わない。GAS は実行時間制限があるため、大会全体を毎回再計算するのではなく、結果が更新されたラウンド単位で計算する。ただし全日本のように後続ラウンドが連鎖する場合は、更新されたラウンド以降のドラフトを無効化して再生成する。

セキュリティ上、テンプレートの `skip_if` は任意 JavaScript として評価してはならない。`"boats_count<=1"` のような許可済み文字列だけを if 文で処理する。`AdvanceRule.spec` と `SourceIdentifier` も正規表現で検証し、未知の形式は例外にする。

既存システムとの互換性では、`round` 表記、`race_no`、`lane`、`status` の扱いが重要である。既存 `race_NNN.json` の `status` は `"finish" | "DNS" | "DNF" | "DQ"` を想定し、空欄や `note` のみで状態が示される場合は正規化層で補完する。プログレッション計算エンジン本体は、正規化済みデータだけを受け取る。
