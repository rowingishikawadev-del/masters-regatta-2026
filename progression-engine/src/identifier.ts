import type { Identifier } from "./types";

/** Parsed representation of a progression source identifier. */
export interface IdentifierAST {
  kind: "time" | "rank_time" | "tail_time";
  time_rank: number;
  race_rank?: number;
  round_code: string;
  is_tail: boolean;
}

/** Parses identifiers such as `1.P`, `1.HT`, and `2.3.S`. */
export function parseIdentifier(str: Identifier): IdentifierAST {
  const parts = str.split(".");
  if (parts.length !== 2 && parts.length !== 3) {
    throw new Error(`Invalid progression identifier: ${str}`);
  }
  const timeRank = Number(parts[0]);
  if (!Number.isInteger(timeRank) || timeRank < 1) {
    throw new Error(`Invalid progression identifier rank: ${str}`);
  }
  if (parts.length === 2) {
    const roundCode = parts[1];
    if (!/^[A-Z][A-Z0-9]*$/.test(roundCode)) {
      throw new Error(`Invalid progression identifier round: ${str}`);
    }
    const isTail = roundCode.endsWith("T") && roundCode.length > 1;
    return {
      kind: isTail ? "tail_time" : "time",
      time_rank: timeRank,
      round_code: roundCode,
      is_tail: isTail
    };
  }
  const raceRank = Number(parts[1]);
  const roundCode = parts[2];
  if (!Number.isInteger(raceRank) || raceRank < 1 || !/^[A-Z][A-Z0-9]*$/.test(roundCode)) {
    throw new Error(`Invalid progression identifier: ${str}`);
  }
  return {
    kind: "rank_time",
    time_rank: timeRank,
    race_rank: raceRank,
    round_code: roundCode,
    is_tail: false
  };
}

/** Formats a parsed identifier back to the template DSL string form. */
export function formatIdentifier(ast: IdentifierAST): Identifier {
  if (ast.race_rank !== undefined) {
    return `${ast.time_rank}.${ast.race_rank}.${ast.round_code}`;
  }
  return `${ast.time_rank}.${ast.round_code}`;
}
