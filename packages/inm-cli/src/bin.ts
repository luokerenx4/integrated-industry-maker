#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { resolveProjectDirectory, type ProjectSelection } from "@inm/core";
import {
  analyzeCommand, formatCliError, inspectCommand, planCommand, projectCreateCommand, projectDefaultCommand, projectListCommand,
  researchCommand, runsCommand, simulateCommand, testCommand, validateCommand, workspaceInitCommand,
} from "./commands";

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
  validate <path>             Parse, resolve, and compile a blueprint
  inspect <path>              Show assets, topology, objective, hashes, and runs
  analyze <path>              Compile nominal process rates and material balance
  plan <path>                 Size the factory for the objective target rate
  simulate <path>             Run deterministic discrete-event simulation
  test <path>                 Run scenario fixture benchmarks
  runs <path>                 List immutable run artifacts
  research <path>             Optimize a blueprint with JSON Patch experiments
  studio <path>               Launch the read-only 3D visual debugger

COMMON OPTIONS
  --project <id>              Project inside a workspace (default from workspace)
  --world <id>                World name (default from project inm.json)
  --blueprint <id>            Blueprint name (default from project inm.json)
  --scenario <id>             Scenario name (default from project inm.json)
  --objective <id>            Objective name (default from project inm.json)
  --seed <n>                  Deterministic seed (default 42)
  --agent-command <command>   External proposal process; receives JSON on stdin
  --json                      Machine-readable JSON output
`;

const args = process.argv.slice(2); const subcommand = args.shift();
const wantsJson = args.includes("--json");
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
  ...projectOption, world: { type: "string" as const }, blueprint: { type: "string" as const }, scenario: { type: "string" as const }, objective: { type: "string" as const }, json: { type: "boolean" as const, default: false },
};
const selectionOf = (values: { world?: string; blueprint?: string; scenario?: string; objective?: string }): ProjectSelection => ({ world: values.world, blueprint: values.blueprint, scenario: values.scenario, objective: values.objective });
async function selectedProject(positionals: string[], usage: string, project?: string): Promise<string> {
  return resolveProjectDirectory(oneArg(positionals, usage), project);
}

async function main(): Promise<void> {
  if (!subcommand || subcommand === "--help" || subcommand === "-h") { process.stdout.write(HELP); return; }
  if (subcommand === "workspace") {
    const action = args.shift();
    if (action !== "init") throw new Error(`Usage: inm workspace init <workspace-dir> [--name NAME] [--json]`);
    const { values, positionals } = parseArgs({ args, options: { name: { type: "string" }, json: common.json }, allowPositionals: true });
    return workspaceInitCommand(oneArg(positionals, "inm workspace init <workspace-dir>"), { name: values.name, json: values.json });
  }
  if (subcommand === "project") {
    const action = args.shift();
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
  if (subcommand === "validate" || subcommand === "inspect" || subcommand === "analyze" || subcommand === "plan") {
    const { values, positionals } = parseArgs({ args, options: common, allowPositionals: true });
    const projectDir = await selectedProject(positionals, `inm ${subcommand} <project-or-workspace-dir> [--project ID]`, values.project);
    if (subcommand === "validate") return validateCommand(projectDir, selectionOf(values), values);
    if (subcommand === "inspect") return inspectCommand(projectDir, selectionOf(values), values);
    if (subcommand === "plan") return planCommand(projectDir, selectionOf(values), values);
    return analyzeCommand(projectDir, selectionOf(values), values);
  }
  if (subcommand === "simulate") {
    const { values, positionals } = parseArgs({ args, options: { ...common, seed: { type: "string", default: "42" }, "until-tick": { type: "string" }, "max-events": { type: "string" } }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm simulate <project-or-workspace-dir> [--project ID]", values.project);
    return simulateCommand(projectDir, selectionOf(values), { seed: Number(values.seed), untilTick: values["until-tick"] ? Number(values["until-tick"]) : undefined, maxEvents: values["max-events"] ? Number(values["max-events"]) : undefined, json: values.json });
  }
  if (subcommand === "test" || subcommand === "runs") {
    const { values, positionals } = parseArgs({ args, options: { ...projectOption, json: common.json }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, `inm ${subcommand} <project-or-workspace-dir> [--project ID]`, values.project);
    return subcommand === "test" ? testCommand(projectDir, values) : runsCommand(projectDir, values);
  }
  if (subcommand === "research") {
    const { values, positionals } = parseArgs({ args, options: { ...common, iterations: { type: "string", default: "5" }, seed: { type: "string", default: "42" }, "agent-command": { type: "string" } }, allowPositionals: true });
    const projectDir = await selectedProject(positionals, "inm research <project-or-workspace-dir> [--project ID]", values.project);
    return researchCommand(projectDir, selectionOf(values), { iterations: Number(values.iterations), seed: Number(values.seed), json: values.json, agentCommand: values["agent-command"] });
  }
  if (subcommand === "studio") {
    const { values, positionals } = parseArgs({ args, options: { ...projectOption, port: { type: "string", default: "4175" }, "no-open": { type: "boolean", default: false } }, allowPositionals: true });
    const inputDir = oneArg(positionals, "inm studio <project-or-workspace-dir> [--project ID]");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["packages/inm-studio/src/server.ts", inputDir, "--port", values.port!, ...(values.project ? ["--project", values.project] : []), ...(values["no-open"] ? ["--no-open"] : [])], { cwd: new URL("../../..", import.meta.url), stdio: "inherit" });
      child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Studio exited with code ${code}`)));
    });
    return;
  }
  throw new Error(`Unknown command '${subcommand}'\n\n${HELP}`);
}

main().catch((error) => { process.stderr.write(formatCliError(error, wantsJson)); process.exitCode = error instanceof Error && error.message.startsWith("Usage:") ? 2 : 1; });
