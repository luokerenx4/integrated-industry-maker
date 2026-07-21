import { join, resolve } from "node:path";
import {
  atomicWriteJson,
  compileFactoryProject,
  loadFactoryProject,
  planProductionCapacity,
  synthesizeFactoryBlueprint,
  type ProjectSelection,
} from "../packages/inm-core/src/index";

const projectDir = resolve(process.argv[2] ?? join(import.meta.dir, "..", "examples", "ironworks"));
const targets: Array<{ output: string; selection: ProjectSelection }> = [
  { output: "synthesized", selection: { world: "main", blueprint: "blank", scenario: "cold-start", objective: "default" } },
  { output: "scaled-factory", selection: { world: "scaled", blueprint: "blank", scenario: "cold-start", objective: "scaled-production" } },
  { output: "chemical-factory", selection: { world: "chemical", blueprint: "blank", scenario: "chemical-cold-start", objective: "plastic-production" } },
  { output: "xray-cracking-factory", selection: { world: "chemical", blueprint: "blank", scenario: "chemical-cold-start", objective: "hydrogen-production" } },
];

for (const target of targets) {
  const loaded = await loadFactoryProject(projectDir, target.selection);
  const synthesis = synthesizeFactoryBlueprint(loaded);
  const project = compileFactoryProject({ ...loaded, blueprint: synthesis.blueprint });
  const plan = planProductionCapacity(project);
  if (!plan.ready) throw new Error(`Generated '${target.output}' has ${plan.gaps.length} target-rate capacity gaps`);
  await atomicWriteJson(join(projectDir, "blueprints", `${target.output}.blueprint.json`), synthesis.blueprint);
  process.stdout.write(`Regenerated ${target.output}: ${synthesis.blueprint.devices.length} devices, ${synthesis.blueprint.connections.length} connections\n`);
}
