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
export * from "./routing";
export * from "./logistics-capacity";
export * from "./production-demand";
export * from "./blueprint-comparison";

import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";

export async function openFactoryProject(projectDir: string, selection: ProjectSelection = {}) {
  return compileFactoryProject(await loadFactoryProject(projectDir, selection));
}
