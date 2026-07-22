export * from "./types";
export * from "./schema";
export * from "./loader";
export * from "./compiler";
export * from "./simulator";
export * from "./evaluator";
export * from "./artifacts";
export * from "./research";
export * from "./frontend";
export * from "./utils";
export * from "./rng";
export * from "./state";
export * from "./device-runtime";
export * from "./dispatch-priority";
export * from "./workspace";
export * from "./production-analysis";
export * from "./capacity-plan";
export * from "./synthesis";
export * from "./project-synthesis";
export * from "./routing";
export * from "./logistics-capacity";
export * from "./production-demand";
export * from "./blueprint-comparison";
export * from "./power-envelope";
export * from "./benchmark";
export * from "./candidate-change-set";
export * from "./candidate-review";
export * from "./design-program";
export * from "./design-run";
export * from "./design-proposal-provider";
export * from "./fab-loss-analysis";
export * from "./workbench";
export * from "./artifact-schema";
export * from "./operation";

import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";

export async function openFactoryProject(projectDir: string, selection: ProjectSelection = {}) {
  return compileFactoryProject(await loadFactoryProject(projectDir, selection));
}
