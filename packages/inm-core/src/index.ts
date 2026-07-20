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

import { compileFactoryProject } from "./compiler";
import { loadFactoryProject, type ProjectSelection } from "./loader";

export async function openFactoryProject(projectDir: string, selection: ProjectSelection = {}) {
  return compileFactoryProject(await loadFactoryProject(projectDir, selection));
}
