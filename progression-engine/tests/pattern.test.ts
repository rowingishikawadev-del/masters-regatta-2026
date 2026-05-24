import { describe, expect, it } from "vitest";
import { ProgressionEngine } from "../src/engine";
import { loadTemplate } from "./helpers";

describe("pattern selection", () => {
  it("selects the matching alljapan pattern", () => {
    const engine = new ProgressionEngine(loadTemplate("alljapan-2026-A"));
    expect(engine.selectPattern(5).entries_min).toBe(1);
    expect(engine.selectPattern(12).entries_min).toBe(7);
    expect(engine.selectPattern(42).entries_min).toBe(37);
  });

  it("throws when no pattern matches", () => {
    const engine = new ProgressionEngine(loadTemplate("alljapan-2026-A"));
    expect(() => engine.selectPattern(99)).toThrow(/No progression pattern/);
  });
});
