import type { Boat, BoatLaneMapping, LaneAssignment } from "./types";

/** Assigns boats to lane numbers according to lane assignment rules. */
export function assignLanes(boats: Boat[], rules: LaneAssignment[]): BoatLaneMapping {
  return rules.flatMap((rule) => {
    const boat = boats.find((candidate) => candidate.source === rule.source);
    return boat ? [{ bn: rule.bn, boat: { ...boat, bn: rule.bn }, source: rule.source }] : [];
  });
}
