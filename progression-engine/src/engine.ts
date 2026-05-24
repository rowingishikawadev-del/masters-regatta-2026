import { computeAdvancement, computeAdvancementFromSources } from "./advance";
import { assignLanes as assignLaneRules } from "./lanes";
import { selectPattern as choosePattern } from "./pattern";
import { resolveIdentifier as resolveSourceIdentifier } from "./resolve";
import { generateInitialRaces as generateRacesFromSeeds } from "./seed";
import type {
  Boat,
  BoatLaneMapping,
  LaneAssignment,
  NextRoundRaces,
  Pattern,
  ProgressionTemplate,
  Race,
  Result,
  RoundResults,
  Seed
} from "./types";

/** Facade class that exposes the progression engine public API. */
export class ProgressionEngine {
  private readonly template: ProgressionTemplate;

  /** Creates an engine bound to one progression template. */
  constructor(template: ProgressionTemplate) {
    this.template = template;
  }

  /** Selects a pattern for the given entry count. */
  selectPattern(entriesCount: number): Pattern {
    return choosePattern(this.template, entriesCount);
  }

  /** Generates the first round races from seed rows. */
  generateInitialRaces(seeds: Seed[]): Race[] {
    const pattern = this.selectPattern(seeds.length);
    const firstRound = pattern.rounds[0];
    return generateRacesFromSeeds(seeds, this.template.lanes, firstRound?.code ?? "H");
  }

  /** Computes target race assignments for a completed round. */
  computeAdvancement(roundCode: string, results: RoundResults): NextRoundRaces {
    const count = Object.values(results).reduce((sum, rows) => sum + rows.length, 0);
    const output = computeAdvancement(this.template, count, results);
    const converted: NextRoundRaces = {};
    for (const [raceCode, value] of Object.entries(output.races)) {
      if (!Array.isArray(value)) {
        converted[raceCode] = {
          race_id: raceCode,
          round_code: roundCode,
          race_index: 1,
          boats: value.assignments.map((assignment) => ({
            boat_id: assignment.crew_id ?? assignment.source,
            crew_id: assignment.crew_id ?? "",
            bn: assignment.bn,
            source: assignment.source,
            tie_group: assignment.tie_group
          })),
          skipped: true,
          reason: value.reason
        };
      } else {
        converted[raceCode] = {
          race_id: raceCode,
          round_code: raceCode.replace(/\d+$/, ""),
          race_index: Number(raceCode.match(/\d+$/)?.[0] ?? "1"),
          boats: value.map((assignment) => ({
            boat_id: assignment.crew_id ?? assignment.source,
            crew_id: assignment.crew_id ?? "",
            bn: assignment.bn,
            source: assignment.source,
            tie_group: assignment.tie_group
          }))
        };
      }
    }
    return converted;
  }

  /** Assigns lane numbers to source boats. */
  assignLanes(boats: Boat[], rules: LaneAssignment[]): BoatLaneMapping {
    return assignLaneRules(boats, rules);
  }

  /** Resolves one identifier from an ordered result map. */
  resolveIdentifier(identifier: string, allResults: Map<string, Result[]>): Boat | null {
    return resolveSourceIdentifier(identifier, allResults);
  }

  /** Applies assignment rules directly to an already-built source map. */
  computeFromSources(entriesCount: number, sources: Map<string, Boat>) {
    return computeAdvancementFromSources(this.selectPattern(entriesCount), sources);
  }
}
