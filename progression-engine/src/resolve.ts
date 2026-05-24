import { parseIdentifier } from "./identifier";
import type { Boat, Identifier, Result } from "./types";

/** Resolves a source identifier against a map of source keys to ordered result rows. */
export function resolveIdentifier(identifier: Identifier, allResults: Map<string, Result[]>): Boat | null {
  const ast = parseIdentifier(identifier);
  const rows = allResults.get(identifier) ?? allResults.get(ast.round_code) ?? [];
  const row = rows[ast.time_rank - 1];
  if (!row) {
    return null;
  }
  return {
    boat_id: row.boat_id ?? row.crew_id,
    crew_id: row.crew_id,
    bn: row.bn ?? row.lane ?? ast.time_rank,
    source: identifier,
    tie_group: row.tie_group
  };
}
