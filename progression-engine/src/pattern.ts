import type { Pattern, ProgressionTemplate } from "./types";

/** Selects the progression pattern that contains the provided entry count. */
export function selectPattern(template: ProgressionTemplate, entriesCount: number): Pattern {
  const pattern = template.patterns.find((candidate) => {
    return entriesCount >= candidate.entries_min && entriesCount <= candidate.entries_max;
  });
  if (!pattern) {
    throw new Error(`No progression pattern for ${entriesCount} entries in ${template.id}`);
  }
  return pattern;
}
