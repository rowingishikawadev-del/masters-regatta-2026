import { describe, expect, it } from "vitest";
import testCases from "../../docs/progression/tests/test_cases.json";
import { ProgressionEngine } from "../src/engine";
import { comparableExpected, loadTemplate, projectOutput, runEngine } from "./helpers";

describe("Progression Engine - all test cases", () => {
  for (const tc of testCases.test_cases) {
    it(`${tc.id}: ${tc.description}`, () => {
      const template = loadTemplate(tc.template);
      const engine = new ProgressionEngine(template);
      const result = runEngine(engine, tc.input);
      expect(projectOutput(result, tc.expected)).toEqual(comparableExpected(tc.expected));
    });
  }
});
