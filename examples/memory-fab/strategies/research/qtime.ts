import { resolve } from "node:path";
// Project-local exhaustive search retained for focused operator research.
import { compileFactoryProject, loadBlueprintBenchmark, loadFactoryProject, runUntil } from "../../../../packages/inm-core/src/index";

const projectDir = resolve(import.meta.dir, "../..");
const benchmark = await loadBlueprintBenchmark(projectDir, "dispatch-research");
const json = process.argv.includes("--json");

const report: Record<string, {
  aggregateScore: number;
  cases: Record<string, {
    score: number;
    completed: number;
    scrapped: number;
    qTimeViolations: number;
    violatedLots: number;
    steps: Record<string, {
      windowTicks: number;
      starts: number;
      meanQueueTicks: number;
      maximumQueueTicks: number;
      violations: number;
    }>;
  }>;
}> = {};

for (const blueprint of [benchmark.baselineBlueprint, benchmark.candidateBlueprint]) {
  let weightedScore = 0;
  let totalWeight = 0;
  const cases: (typeof report)[string]["cases"] = {};
  for (const item of benchmark.cases) {
    const project = compileFactoryProject(await loadFactoryProject(projectDir, {
      world: item.world, blueprint, scenario: item.scenario, objective: item.objective,
    }));
    const metrics = runUntil(project, undefined, { seed: item.seed }).metrics;
    const route = metrics.routeFlow["dram-front-end"]!;
    cases[item.id] = {
      score: metrics.finalScore,
      completed: route.completed,
      scrapped: route.scrapped,
      qTimeViolations: route.queueTimeViolations,
      violatedLots: route.violatedLots,
      steps: Object.fromEntries(Object.entries(route.steps)
        .filter(([, step]) => step.queueTimeMaximumTicks !== null)
        .map(([stepId, step]) => [stepId, {
          windowTicks: step.queueTimeMaximumTicks!, starts: step.starts,
          meanQueueTicks: step.meanQueueTicks, maximumQueueTicks: step.maximumQueueTicks,
          violations: step.queueTimeViolations,
        }])),
    };
    weightedScore += metrics.finalScore * item.weight;
    totalWeight += item.weight;
  }
  report[blueprint] = { aggregateScore: weightedScore / totalWeight, cases };
}

if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
else {
  for (const [blueprint, result] of Object.entries(report)) {
    process.stdout.write(`\n${blueprint} · aggregate score ${result.aggregateScore.toFixed(6)}\n`);
    for (const [caseId, item] of Object.entries(result.cases)) {
      process.stdout.write(`  ${caseId}: score ${item.score.toFixed(6)} · ${item.completed} complete / ${item.scrapped} scrap · ${item.qTimeViolations} violations across ${item.violatedLots} lots\n`);
      for (const [stepId, step] of Object.entries(item.steps)) process.stdout.write(
        `    ${stepId}: ${(step.meanQueueTicks / 1000).toFixed(3)} s mean · ${(step.maximumQueueTicks / 1000).toFixed(3)} s max / ${(step.windowTicks / 1000).toFixed(3)} s window · ${step.violations}/${step.starts} late\n`,
      );
    }
  }
  const baseline = report[benchmark.baselineBlueprint]!.aggregateScore;
  const candidate = report[benchmark.candidateBlueprint]!.aggregateScore;
  process.stdout.write(`\nscore delta: ${(candidate - baseline >= 0 ? "+" : "")}${(candidate - baseline).toFixed(6)}\n`);
}
