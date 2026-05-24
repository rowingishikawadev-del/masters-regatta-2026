import { describe, expect, it } from "vitest";
import { formatIdentifier, parseIdentifier } from "../src/identifier";

describe("identifier DSL", () => {
  it("parses time identifiers", () => {
    expect(parseIdentifier("5.P")).toEqual({
      kind: "time",
      time_rank: 5,
      round_code: "P",
      is_tail: false
    });
  });

  it("parses tail-time identifiers", () => {
    expect(parseIdentifier("3.HT")).toEqual({
      kind: "tail_time",
      time_rank: 3,
      round_code: "HT",
      is_tail: true
    });
  });

  it("round-trips race-rank identifiers", () => {
    const ast = parseIdentifier("2.3.S");
    expect(ast).toEqual({
      kind: "rank_time",
      time_rank: 2,
      race_rank: 3,
      round_code: "S",
      is_tail: false
    });
    expect(formatIdentifier(ast)).toBe("2.3.S");
  });
});
