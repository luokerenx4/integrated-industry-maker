export interface CliArgumentDescriptor {
  name: string;
  form: "positional" | "option";
  value: "string" | "integer" | "boolean";
  required: boolean;
  description: string;
  default?: string | number | boolean;
  choices?: string[];
}

export interface CliCommandDescriptor {
  id: string;
  usage: string;
  description: string;
  effect: "read-only" | "creates-artifact" | "mutates-workspace" | "mutates-project" | "mode-dependent" | "long-running-server";
  supportsJson: boolean;
  exitCodes: { success: 0; failure: number[]; usage: 2 };
  arguments: CliArgumentDescriptor[];
  outputSections: string[];
}

const exitCodes = { success: 0 as const, failure: [1], usage: 2 as const };

const path: CliArgumentDescriptor = {
  name: "path", form: "positional", value: "string", required: true,
  description: "Direct project directory or engine workspace directory.",
};
const project: CliArgumentDescriptor = {
  name: "project", form: "option", value: "string", required: false,
  description: "Project id inside a workspace.", default: "workspace default",
};
const selection: CliArgumentDescriptor[] = ["world", "blueprint", "scenario", "objective"].map((name) => ({
  name, form: "option", value: "string", required: false,
  description: `Explicit ${name} id.`, default: `project default ${name}`,
}));
const json: CliArgumentDescriptor = {
  name: "json", form: "option", value: "boolean", required: false,
  description: "Emit one versioned machine-readable JSON envelope.", default: false,
};
const sectionArgument = (choices: string[]): CliArgumentDescriptor => ({
  name: "section", form: "option", value: "string", required: false,
  description: "Select one machine-readable result section.", default: "summary", choices,
});

const COMMANDS: Omit<CliCommandDescriptor, "exitCodes">[] = [
  {
    id: "help", usage: "inm help [--json]", description: "Describe every public command and argument.",
    effect: "read-only", supportsJson: true, arguments: [json], outputSections: [],
  },
  {
    id: "schema", usage: "inm schema [kind] [--json]", description: "List or emit project artifact JSON Schemas.",
    effect: "read-only", supportsJson: true,
    arguments: [{ name: "kind", form: "positional", value: "string", required: false, description: "Artifact schema kind; omit to list kinds." }, json],
    outputSections: [],
  },
  {
    id: "workspace.init", usage: "inm workspace init <workspace-dir> [--name NAME] [--json]", description: "Create an empty multi-project workspace.",
    effect: "creates-artifact", supportsJson: true,
    arguments: [
      { name: "workspace-dir", form: "positional", value: "string", required: true, description: "New empty workspace directory." },
      { name: "name", form: "option", value: "string", required: false, description: "Workspace display name.", default: "directory name" }, json,
    ], outputSections: [],
  },
  {
    id: "project.create", usage: "inm project create <workspace-dir> <project-id> [--name NAME] [--json]", description: "Copy a complete self-contained starter project.",
    effect: "creates-artifact", supportsJson: true,
    arguments: [
      { name: "workspace-dir", form: "positional", value: "string", required: true, description: "Existing workspace directory." },
      { name: "project-id", form: "positional", value: "string", required: true, description: "New project kebab-case id." },
      { name: "name", form: "option", value: "string", required: false, description: "Project display name.", default: "project id" }, json,
    ], outputSections: [],
  },
  {
    id: "project.list", usage: "inm project list <workspace-dir> [--json]", description: "List immediate self-contained workspace projects.",
    effect: "read-only", supportsJson: true,
    arguments: [{ name: "workspace-dir", form: "positional", value: "string", required: true, description: "Workspace directory." }, json], outputSections: [],
  },
  {
    id: "project.default", usage: "inm project default <workspace-dir> <project-id> [--json]", description: "Change the workspace default project.",
    effect: "mutates-workspace", supportsJson: true,
    arguments: [
      { name: "workspace-dir", form: "positional", value: "string", required: true, description: "Workspace directory." },
      { name: "project-id", form: "positional", value: "string", required: true, description: "Existing project id." }, json,
    ], outputSections: [],
  },
  ...(["validate", "inspect", "analyze", "plan"] as const).map((id): Omit<CliCommandDescriptor, "exitCodes"> => {
    const outputSections = id === "inspect" ? ["summary", "next-action", "diagnostics", "losses", "catalog", "runs", "experiments", "candidates", "operations", "all"]
      : id === "analyze" ? ["summary", "diagnostics", "devices", "contracts", "logistics", "power", "all"]
        : id === "plan" ? ["summary", "gaps", "processes", "materials", "logistics", "power", "all"] : [];
    return {
      id, usage: `inm ${id} <path> [selection] [--json]`,
      description: id === "validate" ? "Compile and validate the selected industrial project."
        : id === "inspect" ? "Read the shared project workbench snapshot."
          : id === "analyze" ? "Analyze nominal production, contracts, logistics, and power."
            : "Plan installed capacity against the Objective and Scenario.",
      effect: "read-only", supportsJson: true, arguments: [path, project, ...selection, ...(outputSections.length ? [sectionArgument(outputSections)] : []), json],
      outputSections,
    };
  }),
  {
    id: "compare", usage: "inm compare <path> --from-blueprint ID --to-blueprint ID [selection] [--seed N] [--json]", description: "Compare and evaluate two Blueprints without writing.",
    effect: "read-only", supportsJson: true, arguments: [path, project, ...selection.filter((item) => item.name !== "blueprint"),
      { name: "from-blueprint", form: "option", value: "string", required: true, description: "Baseline Blueprint id." },
      { name: "to-blueprint", form: "option", value: "string", required: true, description: "Candidate Blueprint id." },
      { name: "seed", form: "option", value: "integer", required: false, description: "Deterministic seed.", default: 42 }, sectionArgument(["summary", "changes", "evaluation", "all"]), json], outputSections: ["summary", "changes", "evaluation", "all"],
  },
  {
    id: "benchmark", usage: "inm benchmark <path> [--benchmark ID] [--lock] [--json]", description: "Evaluate a locked Benchmark or deliberately replace its lock.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "benchmark", form: "option", value: "string", required: false, description: "Benchmark id.", default: "autoresearch" },
      { name: "lock", form: "option", value: "boolean", required: false, description: "Write reviewed fixed-input hashes.", default: false }, sectionArgument(["summary", "cases", "changes", "all"]), json],
    outputSections: ["summary", "cases", "changes", "all"],
  },
  {
    id: "candidate", usage: "inm candidate <path> --candidate ID [--apply] [--json]", description: "Preview or guardedly apply a Candidate Change Set.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "candidate", form: "option", value: "string", required: true, description: "Candidate Change Set id." },
      { name: "apply", form: "option", value: "boolean", required: false, description: "Re-evaluate and apply an exact reviewed KEEP proposal.", default: false }, sectionArgument(["summary", "proposal", "evaluation", "all"]), json],
    outputSections: ["summary", "proposal", "evaluation", "all"],
  },
  {
    id: "design", usage: "inm design <path> [--program ID] [--run | --run-id HASH [--promote ID]] [--max-candidates N] [--json]", description: "Discover, inspect, execute, reopen, or promote a bounded project-local Design Program.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "program", form: "option", value: "string", required: false, description: "Project-local Design Program id; omit to list programs." },
      { name: "run", form: "option", value: "boolean", required: false, description: "Execute bounded search and write/reuse an immutable design run.", default: false },
      { name: "run-id", form: "option", value: "string", required: false, description: "Reopen an immutable Design Run by content hash." },
      { name: "promote", form: "option", value: "string", required: false, description: "Create this Candidate id from the reopened run's exact leading design." },
      { name: "max-candidates", form: "option", value: "integer", required: false, description: "Candidate budget, bounded by the Design Program manifest." },
      sectionArgument(["summary", "static", "iterations", "best", "runs", "all"]), json],
    outputSections: ["summary", "static", "iterations", "best", "runs", "all"],
  },
  {
    id: "synthesize", usage: "inm synthesize <path> [selection] [--output ID] [--json]", description: "Generate a complete Blueprint with the project strategy or fungible-flow solver.",
    effect: "creates-artifact", supportsJson: true, arguments: [path, project, ...selection,
      { name: "output", form: "option", value: "string", required: false, description: "New Blueprint id.", default: "synthesized" }, sectionArgument(["summary", "topology", "optimization", "all"]), json], outputSections: ["summary", "topology", "optimization", "all"],
  },
  {
    id: "simulate", usage: "inm simulate <path> [selection] [--seed N] [--until-tick N] [--max-events N] [--json]", description: "Run deterministic simulation and write/reuse an immutable run.",
    effect: "creates-artifact", supportsJson: true, arguments: [path, project, ...selection,
      { name: "seed", form: "option", value: "integer", required: false, description: "Deterministic seed.", default: 42 },
      { name: "until-tick", form: "option", value: "integer", required: false, description: "Optional simulation stop tick." },
      { name: "max-events", form: "option", value: "integer", required: false, description: "Optional event safety limit." }, sectionArgument(["summary", "artifact", "metrics", "all"]), json], outputSections: ["summary", "artifact", "metrics", "all"],
  },
  {
    id: "test", usage: "inm test <path> [--project ID] [--json]", description: "Execute all deterministic project fixtures.",
    effect: "read-only", supportsJson: true, arguments: [path, project, json], outputSections: [],
  },
  {
    id: "runs", usage: "inm runs <path> [--project ID] [--json]", description: "List completed immutable run artifacts.",
    effect: "read-only", supportsJson: true, arguments: [path, project, json], outputSections: [],
  },
  {
    id: "research", usage: "inm research <path> [selection] [--iterations N] [--seed N] [--agent-command COMMAND] [--json]", description: "Run bounded Blueprint optimization experiments.",
    effect: "mutates-project", supportsJson: true, arguments: [path, project, ...selection,
      { name: "iterations", form: "option", value: "integer", required: false, description: "Proposal iterations.", default: 5 },
      { name: "seed", form: "option", value: "integer", required: false, description: "Deterministic seed.", default: 42 },
      { name: "agent-command", form: "option", value: "string", required: false, description: "External proposal process command." }, sectionArgument(["summary", "iterations", "all"]), json], outputSections: ["summary", "iterations", "all"],
  },
  {
    id: "studio", usage: "inm studio <path> [--project ID] [--port N] [--no-open]", description: "Launch the local Studio server.",
    effect: "long-running-server", supportsJson: false, arguments: [path, project,
      { name: "port", form: "option", value: "integer", required: false, description: "Local HTTP port.", default: 4175 },
      { name: "no-open", form: "option", value: "boolean", required: false, description: "Do not open a browser.", default: false }], outputSections: [],
  },
];

export const CLI_COMMANDS: CliCommandDescriptor[] = COMMANDS.map((command) => ({ ...command, exitCodes }));
