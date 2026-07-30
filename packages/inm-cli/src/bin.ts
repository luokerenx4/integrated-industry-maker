#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { resolveProjectDirectory, type ProjectSelection } from "@inm/core";
import {
  analyzeCommand, benchmarkCommand, candidateCommand, compareCommand, compareRunsCommand, designCommand, formatCliError, helpCommand, inspectCommand, investigateCommand, isCliCancellationError, isCliUsageError, observeCommand, planCommand, projectCreateCommand, projectDefaultCommand, projectListCommand,
  researchCommand, runsCommand, schemaCommand, simulateCommand, synthesizeCommand, testCommand, validateCommand, workspaceInitCommand,
} from "./commands";
import { projectSessionCommand, studioLifecycleCommand, type StudioLifecycleAction } from "./studio-lifecycle";

const HELP = `inm — Integrated Industry Maker

One engine workspace contains many self-contained projects.

USAGE
  inm workspace init <workspace-dir> [--name NAME]
  inm project <create|list|default> <workspace-dir> [...]
  inm <command> <project-or-workspace-dir> [--project ID] [options]

WORKSPACE COMMANDS
  workspace init <dir>        Create a multi-project engine workspace
  project create <ws> <id>    Create an isolated project from the starter template
  project list <ws>           List projects and the current default
  project default <ws> <id>   Select the workspace default project

PROJECT COMMANDS
  schema [kind]               List or emit project artifact JSON Schemas
  validate <path>             Parse, resolve, and compile a blueprint
  inspect <path>              Show assets, topology, objective, hashes, and runs
  observe <path>              Bind exact run evidence to required Factory views
  investigate <path>          Preserve or resume a project-local industrial inquiry
  analyze <path>              Compile nominal process rates and material balance
  plan <path>                 Size the factory for the objective target rate
  compare <path>              Diff and evaluate two Blueprint files
  benchmark <path>            Score one editable Blueprint on a locked case suite
  candidate <path>            Preview or explicitly apply a project-local change set
  design <path>               Inspect or run a bounded project-local Design Program
  synthesize <path>           Generate a complete blueprint from the objective
  simulate <path>             Run deterministic discrete-event simulation
  test <path>                 Run scenario fixture benchmarks
  runs <path>                 List immutable run artifacts
  research <path>             Optimize a blueprint with JSON Patch experiments
  session <path>              Enter a project action, Investigation, or Experiment
  studio <action> <path>      Manage the local Studio workbench

COMMON OPTIONS
  --project <id>              Project inside a workspace (default from workspace)
  --world <id>                World name (default from project inm.json)
  --blueprint <id>            Blueprint name (default from project inm.json)
  --production-plan <id>      Production Plan name (default from project inm.json)
  --from-blueprint <id>       Comparison baseline Blueprint
  --to-blueprint <id>         Comparison candidate Blueprint
  --from-run <id>             Immutable Run comparison baseline
  --to-run <id>               Immutable Run comparison result
  --scenario <id>             Scenario name (default from project inm.json)
  --objective <id>            Objective name (default from project inm.json)
  --seed <n>                  Deterministic seed (default 42)
  --agent-command <command>   External proposal process; receives JSON on stdin
  --benchmark <id>            Locked Blueprint benchmark id (default autoresearch)
  --candidate <id>            Project-local candidates/<id>.candidate.json
  --program <id>              Project-local design-programs/<id>.design.json
  --run-id <hash>             Reopen one immutable Design Run
  --investigation <id>        Project-local investigations/<id>/
  --continue                  Continue --run-id with an additional Candidate budget
  --promote <candidate-id>    Promote a Design Run leader to a Candidate
  --progress <mode>           Design run progress: off, human, or ndjson
  --json                      Machine-readable JSON output
  --section <name>            Select one machine-readable result section
`;

const args = process.argv.slice(2); const subcommand = args.shift();
const wantsJson = args.includes("--json");
let commandId = subcommand ?? "help";
function oneArg(positionals: string[], usage: string): string {
  if (positionals.length !== 1 || !positionals[0]) throw new Error(`Usage: ${usage}`);
  return positionals[0];
}
function twoArgs(positionals: string[], usage: string): [string, string] {
  if (positionals.length !== 2 || !positionals[0] || !positionals[1]) throw new Error(`Usage: ${usage}`);
  return [positionals[0], positionals[1]];
}
const projectOption = { project: { type: "string" as const } };
const common = {
  ...projectOption, world: { type: "string" as const }, blueprint: { type: "string" as const }, "production-plan": { type: "string" as const }, scenario: { type: "string" as const }, objective: { type: "string" as const }, json: { type: "boolean" as const, default: false },
};
const section = { section: { type: "string" as const } };
const selectionOf = (values: { world?: string; blueprint?: string; "production-plan"?: string; scenario?: string; objective?: string }): ProjectSelection => ({
  world: values.world,
  blueprint: values.blueprint,
  productionPlan: values["production-plan"],
  scenario: values.scenario,
  objective: values.objective,
});
async function selectedProject(positionals: string[], usage: string, project?: string): Promise<string> {
  return resolveProjectDirectory(oneArg(positionals, usage), project);
}

async function main(signal: AbortSignal): Promise<void> {
  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    if (!subcommand) { process.stdout.write(HELP); return; }
    const { values, positionals } = parseArgs({ args, options: { json: common.json }, allowPositionals: true });
    if (positionals.length) throw new Error("Usage: inm help [--json]");
    commandId = "help";
    if (values.json) helpCommand(values); else process.stdout.write(HELP);
    return;
  }
  if (subcommand === "schema") {
    const { values, positionals } = parseArgs({ args, options: { json: common.json }, allowPositionals: true });
    if (positionals.length > 1) throw new Error("Usage: inm schema [kind] [--json]");
    commandId = "schema";
    schemaCommand(positionals[0], values);
    return;
  }
  if (subcommand === "workspace") {
    const action = args.shift();
    commandId = `workspace.${action ?? "unknown"}`;
    if (action !== "init") throw new Error(`Usage: inm workspace init <workspace-dir> [--name NAME] [--json]`);
    const { values, positionals } = parseArgs({ args, options: { name: { type: "string" }, json: common.json }, allowPositionals: true });
    return workspaceInitCommand(oneArg(positionals, "inm workspace init <workspace-dir>"), { name: values.name, json: values.json });
  }
  if (subcommand === "project") {
    const action = args.shift();
    commandId = `project.${action ?? "unknown"}`;
    if (action === "create") {
      const { values, positionals } = parseArgs({ args, options: { name: { type: "string" }, json: common.json }, allowPositionals: true });
      const [workspaceDir, id] = twoArgs(positionals, "inm project create <workspace-dir> <project-id>");
      return projectCreateCommand(workspaceDir, id, { name: values.name, json: values.json });
    }
    if (action === "list") {
      const { values, positionals } = parseArgs({ args, options: { json: common.json }, allowPositionals: true });
      return projectListCommand(oneArg(positionals, "inm project list <workspace-dir>"), values);
    }
    if (action === "default") {
      const { values, positionals } = parseArgs({ args, options: { json: common.json }, allowPositionals: true });
      const [workspaceDir, id] = twoArgs(positionals, "inm project default <workspace-dir> <project-id>");
      return projectDefaultCommand(workspaceDir, id, values);
    }
    throw new Error("Usage: inm project <create|list|default> ...");
  }
  if (subcommand === "validate" || subcommand === "inspect" || subcommand === "observe" || subcommand === "analyze" || subcommand === "plan") {
    const { values, positionals } = parseArgs({ args, options: { ...common, ...section, ...(subcommand === "observe" ? { run: { type: "string" as const } } : {}) }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, `inm ${subcommand} <project-or-workspace-dir> [--project ID]`, values.project);
    if (subcommand === "validate") return validateCommand(projectDir, selectionOf(values), values);
    if (subcommand === "inspect") return inspectCommand(projectDir, selectionOf(values), values);
    if (subcommand === "observe") return observeCommand(projectDir, selectionOf(values), {
      json: values.json,
      section: values.section,
      run: typeof values.run === "string" ? values.run : undefined,
    });
    if (subcommand === "plan") return planCommand(projectDir, selectionOf(values), values);
    return analyzeCommand(projectDir, selectionOf(values), values);
  }
  if (subcommand === "synthesize") {
    const { values, positionals } = parseArgs({ args, options: { ...common, ...section, output: { type: "string", default: "synthesized" } }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm synthesize <project-or-workspace-dir> [--project ID] [--output ID]", values.project);
    return synthesizeCommand(projectDir, selectionOf(values), { output: values.output!, json: values.json, section: values.section });
  }
  if (subcommand === "investigate") {
    const { values, positionals } = parseArgs({ args, options: {
      ...common,
      ...section,
      investigation: { type: "string" },
      create: { type: "boolean", default: false },
      name: { type: "string" },
      question: { type: "string" },
      entry: { type: "string" },
      kind: { type: "string" },
      author: { type: "string" },
      statement: { type: "string" },
      intervention: { type: "string" },
      "expected-effect": { type: "string" },
      disposition: { type: "string" },
      evidence: { type: "string" },
      "attach-candidate": { type: "string" },
      "capture-observation": { type: "string" },
      "capture-comparison": { type: "string" },
      "from-run": { type: "string" },
      "to-run": { type: "string" },
      "anchor-id": { type: "string" },
      "create-candidate": { type: "string" },
      "create-production-plan": { type: "string" },
      "hypothesis-entry": { type: "string" },
      benchmark: { type: "string" },
      "candidate-name": { type: "string" },
      "patch-file": { type: "string" },
      "production-plan-file": { type: "string" },
    }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm investigate <project-or-workspace-dir> [--project ID] [--investigation ID]", values.project);
    return investigateCommand(projectDir, {
      selection: selectionOf(values),
      investigationId: values.investigation,
      create: values.create,
      name: values.name,
      question: values.question,
      entryId: values.entry,
      kind: values.kind,
      author: values.author,
      statement: values.statement,
      intervention: values.intervention,
      expectedEffect: values["expected-effect"],
      disposition: values.disposition,
      evidence: values.evidence,
      attachCandidate: values["attach-candidate"],
      captureObservation: values["capture-observation"],
      captureComparison: values["capture-comparison"],
      fromRun: values["from-run"],
      toRun: values["to-run"],
      anchorId: values["anchor-id"],
      createCandidate: values["create-candidate"],
      createProductionPlan: values["create-production-plan"],
      hypothesisEntry: values["hypothesis-entry"],
      benchmark: values.benchmark,
      candidateName: values["candidate-name"],
      patchFile: values["patch-file"],
      productionPlanFile: values["production-plan-file"],
      json: values.json,
      section: values.section,
    });
  }
  if (subcommand === "compare") {
    const { values, positionals } = parseArgs({ args, options: {
      ...projectOption, world: common.world, "production-plan": common["production-plan"], scenario: common.scenario, objective: common.objective, json: common.json, ...section,
      "from-blueprint": { type: "string" }, "to-blueprint": { type: "string" },
      "from-run": { type: "string" }, "to-run": { type: "string" },
      seed: { type: "string", default: "42" },
    }, allowPositionals: true });
    const blueprintMode = Boolean(values["from-blueprint"] && values["to-blueprint"]);
    const runMode = Boolean(values["from-run"] && values["to-run"]);
    const hasPartialBlueprint = Boolean(values["from-blueprint"] || values["to-blueprint"]) && !blueprintMode;
    const hasPartialRun = Boolean(values["from-run"] || values["to-run"]) && !runMode;
    const usage = "Usage: inm compare <project-or-workspace-dir> (--from-blueprint ID --to-blueprint ID [--seed N] | --from-run ID --to-run ID)";
    if (blueprintMode === runMode || hasPartialBlueprint || hasPartialRun) throw new Error(usage);
    if (runMode && (values.world || values["production-plan"] || values.scenario || values.objective || values.seed !== "42")) {
      throw new Error(`${usage}\nRun comparison uses the immutable Runs' own selection and seed.`);
    }
    const projectDir = await selectedProject(positionals, usage, values.project);
    if (runMode) return compareRunsCommand(projectDir, {
      fromRun: values["from-run"]!,
      toRun: values["to-run"]!,
      json: values.json,
      section: values.section,
    });
    return compareCommand(projectDir, { world: values.world, productionPlan: values["production-plan"], scenario: values.scenario, objective: values.objective }, {
      fromBlueprint: values["from-blueprint"]!, toBlueprint: values["to-blueprint"]!, seed: Number(values.seed), json: values.json, section: values.section,
    });
  }
  if (subcommand === "benchmark") {
    const { values, positionals } = parseArgs({ args, options: {
      ...projectOption, benchmark: { type: "string", default: "autoresearch" }, lock: { type: "boolean", default: false }, progress: { type: "string" }, json: common.json, ...section,
    }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm benchmark <project-or-workspace-dir> [--project ID] [--benchmark ID] [--lock]", values.project);
    return benchmarkCommand(projectDir, values.benchmark!, { json: values.json, lock: values.lock, progress: values.progress, section: values.section, signal });
  }
  if (subcommand === "candidate") {
    const { values, positionals } = parseArgs({ args, options: {
      ...projectOption, candidate: { type: "string" }, review: { type: "boolean", default: false }, apply: { type: "boolean", default: false }, progress: { type: "string" }, json: common.json, ...section,
    }, allowPositionals: true });
    if (!values.candidate) throw new Error("Usage: inm candidate <project-or-workspace-dir> --candidate ID [--review | --apply] [--json]");
    if (values.review && values.apply) throw new Error("Candidate --review and --apply are mutually exclusive");
    const projectDir = await selectedProject(positionals, "inm candidate <project-or-workspace-dir> --candidate ID [--review | --apply]", values.project);
    return candidateCommand(projectDir, values.candidate, { json: values.json, review: values.review, apply: values.apply, progress: values.progress, section: values.section, signal });
  }
  if (subcommand === "design") {
    const { values, positionals } = parseArgs({ args, options: {
      ...projectOption, program: { type: "string" }, run: { type: "boolean", default: false }, "run-id": { type: "string" }, continue: { type: "boolean", default: false }, promote: { type: "string" }, "max-candidates": { type: "string" }, progress: { type: "string" }, json: common.json, ...section,
    }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm design <project-or-workspace-dir> [--project ID] [--program ID] [--run]", values.project);
    return designCommand(projectDir, values.program, {
      run: values.run,
      runId: values["run-id"],
      continue: values.continue,
      promote: values.promote,
      progress: values.progress,
      ...(values["max-candidates"] !== undefined ? { maxCandidates: Number(values["max-candidates"]) } : {}),
      json: values.json,
      section: values.section,
      signal,
    });
  }
  if (subcommand === "simulate") {
    const { values, positionals } = parseArgs({ args, options: { ...common, ...section, seed: { type: "string", default: "42" }, "until-tick": { type: "string" }, "max-events": { type: "string" } }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm simulate <project-or-workspace-dir> [--project ID]", values.project);
    return simulateCommand(projectDir, selectionOf(values), { seed: Number(values.seed), untilTick: values["until-tick"] ? Number(values["until-tick"]) : undefined, maxEvents: values["max-events"] ? Number(values["max-events"]) : undefined, json: values.json, section: values.section });
  }
  if (subcommand === "test" || subcommand === "runs") {
    const { values, positionals } = parseArgs({ args, options: { ...projectOption, json: common.json }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, `inm ${subcommand} <project-or-workspace-dir> [--project ID]`, values.project);
    return subcommand === "test" ? testCommand(projectDir, values) : runsCommand(projectDir, values);
  }
  if (subcommand === "research") {
    const { values, positionals } = parseArgs({ args, options: { ...common, ...section, iterations: { type: "string", default: "5" }, seed: { type: "string", default: "42" }, "agent-command": { type: "string" } }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm research <project-or-workspace-dir> [--project ID]", values.project);
    return researchCommand(projectDir, selectionOf(values), { iterations: Number(values.iterations), seed: Number(values.seed), json: values.json, section: values.section, agentCommand: values["agent-command"] });
  }
  if (subcommand === "session") {
    commandId = "session";
    const { values, positionals } = parseArgs({ args, options: {
      ...projectOption,
      experiment: { type: "string" },
      investigation: { type: "string" },
      run: { type: "boolean", default: false },
      port: { type: "string" },
      "no-open": { type: "boolean", default: false },
      json: common.json,
    }, allowPositionals: true });
    if (values.run && !values.experiment) throw new Error("Usage: --run requires --experiment ID");
    if (values.experiment && values.investigation) throw new Error("Usage: --experiment and --investigation are mutually exclusive");
    const inputDir = oneArg(positionals, "inm session <project-or-workspace-dir> [--experiment ID [--run] | --investigation ID]");
    return projectSessionCommand(inputDir, {
      ...(values.experiment ? { experiment: values.experiment } : {}),
      ...(values.investigation ? { investigation: values.investigation } : {}),
      run: values.run,
      ...(values.port !== undefined ? { port: Number(values.port) } : {}),
      project: values.project,
      noOpen: values["no-open"],
      json: values.json,
    });
  }
  if (subcommand === "studio") {
    const action = args.shift() as StudioLifecycleAction | undefined;
    if (!action || !["start", "status", "restart", "stop", "serve"].includes(action)) throw new Error("Usage: inm studio <start|status|restart|stop|serve> <project-or-workspace-dir> [options]");
    commandId = `studio.${action}`;
    const { values, positionals } = parseArgs({ args, options: {
      ...projectOption,
      port: { type: "string" },
      ...((action === "start" || action === "restart" || action === "serve")
        ? { "no-open": { type: "boolean" as const, default: false } }
        : {}),
      json: common.json,
    }, allowPositionals: true });
    const inputDir = oneArg(positionals, `inm studio ${action} <project-or-workspace-dir> [--project ID]`);
    return studioLifecycleCommand(action, inputDir, {
      ...(values.port !== undefined ? { port: Number(values.port) } : {}),
      project: values.project,
      noOpen: "no-open" in values && values["no-open"] === true,
      json: values.json,
    });
  }
  throw new Error(`Unknown command '${subcommand}'\n\n${HELP}`);
}

const operationController = new AbortController();
let receivedSignals = 0;
const requestCancellation = (signalName: NodeJS.Signals) => {
  receivedSignals += 1;
  if (receivedSignals > 1) process.exit(130);
  operationController.abort(new DOMException(`Received ${signalName}`, "AbortError"));
};
const onSigint = () => requestCancellation("SIGINT");
const onSigterm = () => requestCancellation("SIGTERM");
process.on("SIGINT", onSigint);
process.on("SIGTERM", onSigterm);

void main(operationController.signal)
  .catch((error) => {
    process.stderr.write(formatCliError(error, wantsJson, commandId));
    process.exitCode = isCliCancellationError(error) ? 130 : isCliUsageError(error) ? 2 : 1;
  })
  .finally(() => {
    process.off("SIGINT", onSigint);
    process.off("SIGTERM", onSigterm);
  });
