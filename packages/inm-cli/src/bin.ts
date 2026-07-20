#!/usr/bin/env bun
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { formatCliError, initCommand, inspectCommand, researchCommand, runsCommand, simulateCommand, testCommand, validateCommand } from "./commands";

const HELP = `inm — Integrated Industry Maker

A factory is a folder. Blueprints are programs. Scenarios are tests.

USAGE
  inm <command> [project-dir] [options]

COMMANDS
  init <dir>                  Create a complete factory project
  validate <project-dir>      Parse, resolve, and compile a blueprint
  inspect <project-dir>       Show assets, topology, objective, hashes, and runs
  simulate <project-dir>      Run deterministic discrete-event simulation
  test <project-dir>          Run scenario fixture benchmarks
  runs <project-dir>          List immutable run artifacts
  research <project-dir>      Optimize a blueprint with JSON Patch experiments
  studio <project-dir>        Launch the read-only 3D visual debugger

COMMON OPTIONS
  --blueprint <id>            Blueprint name (default from inm.json)
  --scenario <id>             Scenario name (default from inm.json)
  --objective <id>            Objective name (default from inm.json)
  --seed <n>                  Deterministic seed (default 42)
  --agent-command <command>   External proposal process; receives JSON on stdin
  --json                      Machine-readable JSON output
`;

const args = process.argv.slice(2); const subcommand = args.shift();
const wantsJson = args.includes("--json");
function projectArg(positionals: string[], usage: string): string {
  if (positionals.length !== 1 || !positionals[0]) throw new Error(`Usage: ${usage}`);
  return positionals[0];
}
const common = {
  blueprint: { type: "string" as const }, scenario: { type: "string" as const }, objective: { type: "string" as const }, json: { type: "boolean" as const, default: false },
};

async function main(): Promise<void> {
  if (!subcommand || subcommand === "--help" || subcommand === "-h") { process.stdout.write(HELP); return; }
  if (subcommand === "init") {
    const { values, positionals } = parseArgs({ args, options: { force: { type: "boolean", default: false }, json: common.json }, allowPositionals: true });
    return initCommand(projectArg(positionals, "inm init <dir> [--force] [--json]"), { force: values.force, json: values.json });
  }
  if (subcommand === "validate" || subcommand === "inspect") {
    const { values, positionals } = parseArgs({ args, options: common, allowPositionals: true });
    const projectDir = projectArg(positionals, `inm ${subcommand} <project-dir>`);
    const selection = { blueprint: values.blueprint, scenario: values.scenario, objective: values.objective };
    return subcommand === "validate" ? validateCommand(projectDir, selection, values) : inspectCommand(projectDir, selection, values);
  }
  if (subcommand === "simulate") {
    const { values, positionals } = parseArgs({ args, options: { ...common, seed: { type: "string", default: "42" }, "until-tick": { type: "string" }, "max-events": { type: "string" } }, allowPositionals: true });
    return simulateCommand(projectArg(positionals, "inm simulate <project-dir>"), values, { seed: Number(values.seed), untilTick: values["until-tick"] ? Number(values["until-tick"]) : undefined, maxEvents: values["max-events"] ? Number(values["max-events"]) : undefined, json: values.json });
  }
  if (subcommand === "test" || subcommand === "runs") {
    const { values, positionals } = parseArgs({ args, options: { json: common.json }, allowPositionals: true });
    const projectDir = projectArg(positionals, `inm ${subcommand} <project-dir>`);
    return subcommand === "test" ? testCommand(projectDir, values) : runsCommand(projectDir, values);
  }
  if (subcommand === "research") {
    const { values, positionals } = parseArgs({ args, options: { ...common, iterations: { type: "string", default: "5" }, seed: { type: "string", default: "42" }, "agent-command": { type: "string" } }, allowPositionals: true });
    return researchCommand(projectArg(positionals, "inm research <project-dir> [--iterations N]"), values, { iterations: Number(values.iterations), seed: Number(values.seed), json: values.json, agentCommand: values["agent-command"] });
  }
  if (subcommand === "studio") {
    const { values, positionals } = parseArgs({ args, options: { port: { type: "string", default: "4175" }, "no-open": { type: "boolean", default: false } }, allowPositionals: true });
    const projectDir = projectArg(positionals, "inm studio <project-dir> [--port N] [--no-open]");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, ["packages/inm-studio/src/server.ts", projectDir, "--port", values.port!, ...(values["no-open"] ? ["--no-open"] : [])], { cwd: new URL("../../..", import.meta.url), stdio: "inherit" });
      child.once("error", reject); child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`Studio exited with code ${code}`)));
    });
    return;
  }
  throw new Error(`Unknown command '${subcommand}'\n\n${HELP}`);
}

main().catch((error) => { process.stderr.write(formatCliError(error, wantsJson)); process.exitCode = error instanceof Error && error.message.startsWith("Usage:") ? 2 : 1; });
