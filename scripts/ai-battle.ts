import { runAiBattle } from "../src/engine/ai.ts";
import { DEFAULT_STAGE, fighterDefinition } from "../src/game/roster-config.ts";

const definition = {
  stage: DEFAULT_STAGE,
  fighters: [fighterDefinition("CPU-A"), fighterDefinition("CPU-B")] as const,
};
const seeds: readonly (readonly [number, number])[] = [
  [1, 2], [5, 19], [123, 456], [42, 999], [8765, 4321],
];
const reports = seeds.map(pair => runAiBattle(definition, pair));
for (const report of reports) {
  console.log(JSON.stringify(report));
}
const problemCount = reports.filter(report => report.diagnosticWarnings.length > 0).length;
console.log("AI battle diagnostics:", reports.length, "battles;", problemCount, "flagged");
if (problemCount > 0) process.exitCode = 1;
