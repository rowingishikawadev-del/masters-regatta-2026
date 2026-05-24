import allJapanA from "../../docs/progression/templates/alljapan-2026-A.json";
import allJapanB from "../../docs/progression/templates/alljapan-2026-B.json";
import {
  buildSourcesFromExplicit,
  buildSourcesFromHeatResults,
  buildSourcesFromPreliminary,
  buildSyntheticSources,
  buildTieGroups,
  computeAdvancementFromSources
} from "../src/advance";
import type { EngineOutput, ProgressionTemplate, RaceAssignments, Result } from "../src/types";
import { ProgressionEngine } from "../src/engine";

type TestInput = {
  entries_count: number;
  preliminary_results?: Result[];
  heat_results?: Record<string, Result[]>;
  source_results?: Record<string, string | string[]>;
  fixture?: string;
};

/** Loads a fixture template by test-case identifier. */
export function loadTemplate(id: string): ProgressionTemplate {
  if (id === "alljapan-2026-A") {
    return allJapanA as ProgressionTemplate;
  }
  if (id === "alljapan-2026-B") {
    return allJapanB as ProgressionTemplate;
  }
  throw new Error(`Unknown template fixture: ${id}`);
}

/** Runs the engine against the compact JSON test-case input shape. */
export function runEngine(engine: ProgressionEngine, input: TestInput): EngineOutput {
  const pattern = engine.selectPattern(input.entries_count);
  const sources = input.preliminary_results
    ? buildSourcesFromPreliminary(input.preliminary_results)
    : input.heat_results
      ? buildSourcesFromHeatResults(pattern, input.heat_results)
      : input.source_results
        ? buildSourcesFromExplicit(input.source_results)
        : buildSyntheticSources(pattern, input.entries_count);
  if (input.heat_results) {
    for (const [source, boat] of buildSyntheticSources(pattern, input.entries_count)) {
      if (!sources.has(source)) {
        sources.set(source, boat);
      }
    }
  }
  const output = computeAdvancementFromSources(pattern, sources);
  const tieGroups = buildTieGroups(sources);
  if (tieGroups && tieGroups.length > 0) {
    output.tie_groups = tieGroups;
  }
  return output;
}

/** Projects actual output to the exact expected shape used by a case. */
export function projectOutput(actual: EngineOutput, expected: unknown): unknown {
  const expectedObj = expected as { races: Record<string, unknown>; tie_groups?: unknown };
  const races: Record<string, unknown> = {};
  for (const [raceCode, raceExpectation] of Object.entries(expectedObj.races)) {
    const raceActual = actual.races[raceCode];
    races[raceCode] = projectRace(raceActual, raceExpectation);
  }
  const projected: { races: Record<string, unknown>; tie_groups?: unknown } = { races };
  if (expectedObj.tie_groups !== undefined) {
    projected.tie_groups = actual.tie_groups;
  }
  return projected;
}

/** Removes non-engine assertion notes from a raw test-case expected value. */
export function comparableExpected(expected: unknown): unknown {
  const expectedObj = expected as { races: unknown; tie_groups?: unknown };
  const comparable: { races: unknown; tie_groups?: unknown } = { races: expectedObj.races };
  if (expectedObj.tie_groups !== undefined) {
    comparable.tie_groups = expectedObj.tie_groups;
  }
  return comparable;
}

/** Projects a race to either source strings, specified object keys, or skipped metadata. */
function projectRace(actual: RaceAssignments | undefined, expected: unknown): unknown {
  if (!actual) {
    return actual;
  }
  if (Array.isArray(expected) && expected.every((item) => typeof item === "string")) {
    return Array.isArray(actual) ? actual.map((assignment) => assignment.source) : actual.assignments.map((assignment) => assignment.source);
  }
  if (Array.isArray(expected)) {
    const actualRows = Array.isArray(actual) ? actual : actual.assignments;
    return expected.map((item, index) => projectKeys(actualRows[index], item as Record<string, unknown>));
  }
  const expectedObj = expected as { assignments?: unknown[] };
  if (!Array.isArray(actual) && expectedObj.assignments) {
    return {
      skipped: actual.skipped,
      reason: actual.reason,
      assignments: expectedObj.assignments.map((item, index) => projectKeys(actual.assignments[index], item as Record<string, unknown>))
    };
  }
  return actual;
}

/** Picks only keys asserted by an expected assignment object. */
function projectKeys(actual: unknown, expected: Record<string, unknown>): unknown {
  const actualObj = actual as Record<string, unknown>;
  const projected: Record<string, unknown> = {};
  for (const key of Object.keys(expected)) {
    projected[key] = actualObj?.[key];
  }
  return projected;
}
