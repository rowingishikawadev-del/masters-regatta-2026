# Progression Engine

TypeScript implementation of the rowing progression calculation engine for the 2026 All Japan templates.

## Commands

```bash
npm install
npm test
npm run build
npm run gas:bundle
```

## Public API

- `ProgressionEngine.selectPattern(entriesCount)`
- `ProgressionEngine.generateInitialRaces(seeds)`
- `ProgressionEngine.computeAdvancement(roundCode, results)`
- `ProgressionEngine.assignLanes(boats, rules)`
- `ProgressionEngine.resolveIdentifier(identifier, allResults)`

## GAS Porting

The compiler target is ES2019 and CommonJS for Google Apps Script compatibility. Run:

```bash
npm run gas:bundle
```

This creates `dist/bundle.gs` from compiled JavaScript. Copy that bundle into the GAS project, remove CommonJS wrapper lines if your GAS deployment does not use a bundler, and expose a thin GAS adapter that:

1. Loads the JSON progression template.
2. Normalizes spreadsheet or result JSON rows into `Result`.
3. Instantiates `ProgressionEngine`.
4. Calls `computeAdvancement` or `computeFromSources`.
5. Writes the returned race assignments back to the schedule/result store.

Core engine functions are pure and avoid filesystem, network, or date dependencies.
