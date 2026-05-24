/** String alias for progression source identifiers such as `1.HT`. */
export type Identifier = string;

/** Result status values understood by the progression engine. */
export type Status = "finish" | "DNS" | "DNF" | "DQ" | "dns" | "dnf" | "dq";

/** Root template for one competition progression table. */
export interface ProgressionTemplate {
  id: string;
  name: string;
  version: string;
  lanes: number;
  patterns: Pattern[];
}

/** Entry-count scoped progression pattern. */
export interface Pattern {
  id?: string;
  entries_min: number;
  entries_max: number;
  description?: string;
  rounds: Round[];
}

/** One progression round and its lane assignment rules. */
export interface Round {
  code: string;
  name: string;
  race_count: number;
  lane_assignment?: LaneAssignment[];
  lane_assignments?: Record<string, LaneAssignment[]>;
  advance_rules?: AdvanceRule[];
  skip_if?: string;
}

/** Lane assignment rule for a target race. */
export interface LaneAssignment {
  bn: number;
  source: Identifier;
}

/** Declarative advancement rule placeholder for future templates. */
export interface AdvanceRule {
  to: string;
  spec: string;
}

/** Boat or crew assigned to a race lane. */
export interface Boat {
  boat_id: string;
  crew_id: string;
  bn: number;
  source: Identifier;
  crew_name?: string;
  affiliation?: string;
  seed_rank?: number;
  tie_group?: string;
}

/** Race with assigned boats and optional results. */
export interface Race {
  race_id: string;
  round_code: string;
  race_index: number;
  boats: Boat[];
  skipped?: boolean;
  reason?: string;
}

/** Normalized result row. */
export interface Result {
  boat_id?: string;
  crew_id: string;
  race_id?: string;
  round_code?: string;
  race_index?: number;
  lane?: number;
  bn?: number;
  time_ms?: number | null;
  finish_time?: number | null;
  finish_rank?: number;
  status: Status;
  tie_group?: string;
  input_order?: number;
}

/** Seed row used to generate initial races. */
export interface Seed {
  crew_id: string;
  crew_name?: string;
  affiliation?: string;
  seed_rank: number;
}

/** A source result map keyed by source identifier. */
export type SourceMap = Map<Identifier, Boat>;

/** Results grouped by source race key such as `H1`. */
export type RoundResults = Record<string, Result[]>;

/** Races produced for the next round. */
export type NextRoundRaces = Record<string, Race | Race[]>;

/** Boat to lane map returned by `assignLanes`. */
export type BoatLaneMapping = Array<{ bn: number; boat: Boat; source: Identifier }>;

/** Test-facing assignment shape. */
export interface Assignment {
  bn: number;
  crew_id?: string;
  source: Identifier;
  tie_group?: string;
}

/** Test-facing skipped race shape. */
export interface SkippedRace {
  skipped: true;
  reason: "only_one_crew";
  assignments: Assignment[];
}

/** Test-facing race output. */
export type RaceAssignments = Assignment[] | SkippedRace;

/** Test-facing engine output. */
export interface EngineOutput {
  races: Record<string, RaceAssignments>;
  tie_groups?: Array<{ tie_group: string; sources: Identifier[]; crew_ids: string[] }>;
}
