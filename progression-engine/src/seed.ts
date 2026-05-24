import type { Race, Seed } from "./types";

/** Generates balanced initial races from seed order using round-robin distribution. */
export function generateInitialRaces(seeds: Seed[], lanes = 6, roundCode = "H"): Race[] {
  const raceCount = Math.max(1, Math.ceil(seeds.length / lanes));
  const races: Race[] = Array.from({ length: raceCount }, (_, index) => ({
    race_id: `${roundCode}${index + 1}`,
    round_code: roundCode,
    race_index: index + 1,
    boats: []
  }));
  seeds
    .slice()
    .sort((a, b) => a.seed_rank - b.seed_rank)
    .forEach((seed, index) => {
      const race = races[index % raceCount];
      const bn = Math.floor(index / raceCount) + 1;
      race.boats.push({
        boat_id: seed.crew_id,
        crew_id: seed.crew_id,
        crew_name: seed.crew_name,
        affiliation: seed.affiliation,
        seed_rank: seed.seed_rank,
        bn,
        source: `${seed.seed_rank}.SEED`
      });
    });
  return races;
}
