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

const exitCodes = (command: string) => ({
  success: 0 as const,
  failure: ["benchmark", "candidate", "design"].includes(command) ? [1, 130] : [1],
  usage: 2 as const,
});

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
    const outputSections = id === "inspect" ? ["summary", "next-action", "objective", "diagnostics", "losses", "dispositions", "catalog", "runs", "experiments", "candidates", "operations", "all"]
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
    id: "observe", usage: "inm observe <path> [selection] [--run ID] [--json]", description: "Bind exact run evidence to stable Factory views and a human/Agent design handoff.",
    effect: "read-only", supportsJson: true, arguments: [path, project, ...selection,
      { name: "run", form: "option", value: "string", required: false, description: "Compatible immutable run id; defaults to the newest exact matching run." },
      json],
    outputSections: [],
  },
  {
    id: "investigate",
    usage: "inm investigate <path> [--investigation ID [--create | --entry ID]] [options] [--json]",
    description: "Create, inspect, or append to one persistent project-local industrial Investigation.",
    effect: "mode-dependent",
    supportsJson: true,
    arguments: [
      path,
      project,
      ...selection,
      { name: "investigation", form: "option", value: "string", required: false, description: "Project-local Investigation id; omit to list Investigations." },
      { name: "create", form: "option", value: "boolean", required: false, description: "Create the Investigation from the exact current Workbench diagnostic and operating Run.", default: false },
      { name: "name", form: "option", value: "string", required: false, description: "Display name required by --create." },
      { name: "question", form: "option", value: "string", required: false, description: "Human/Agent industrial question required by --create." },
      { name: "entry", form: "option", value: "string", required: false, description: "Append one immutable reasoning entry with this id." },
      { name: "kind", form: "option", value: "string", required: false, description: "Entry kind.", choices: ["observation", "hypothesis", "decision"] },
      { name: "author", form: "option", value: "string", required: false, description: "Entry author kind.", choices: ["human", "agent"] },
      { name: "statement", form: "option", value: "string", required: false, description: "Authored observation, hypothesis, or decision statement." },
      { name: "expected-effect", form: "option", value: "string", required: false, description: "Required falsifiable measured/visual effect for a hypothesis." },
      { name: "disposition", form: "option", value: "string", required: false, description: "Required explicit judgment for a decision.", choices: ["keep", "revise", "defer", "discard"] },
      { name: "evidence", form: "option", value: "string", required: false, description: "Comma-separated available evidence-anchor ids, including one introduced by this entry." },
      { name: "attach-candidate", form: "option", value: "string", required: false, description: "Resolve and introduce this Candidate's exact immutable review receipt." },
      { name: "anchor-id", form: "option", value: "string", required: false, description: "Stable Investigation-local id for evidence introduced by --attach-candidate." },
      sectionArgument(["summary", "anchors", "entries", "all"]),
      json,
    ],
    outputSections: ["summary", "anchors", "entries", "all"],
  },
  {
    id: "compare", usage: "inm compare <path> --from-blueprint ID --to-blueprint ID [selection] [--seed N] [--json]", description: "Compare and evaluate two Blueprints without writing.",
    effect: "read-only", supportsJson: true, arguments: [path, project, ...selection.filter((item) => item.name !== "blueprint"),
      { name: "from-blueprint", form: "option", value: "string", required: true, description: "Baseline Blueprint id." },
      { name: "to-blueprint", form: "option", value: "string", required: true, description: "Candidate Blueprint id." },
      { name: "seed", form: "option", value: "integer", required: false, description: "Deterministic seed.", default: 42 }, sectionArgument(["summary", "changes", "evaluation", "all"]), json], outputSections: ["summary", "changes", "evaluation", "all"],
  },
  {
    id: "benchmark", usage: "inm benchmark <path> [--benchmark ID] [--lock] [--progress MODE] [--json]", description: "Evaluate a locked Benchmark or deliberately replace its lock.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "benchmark", form: "option", value: "string", required: false, description: "Benchmark id.", default: "autoresearch" },
      { name: "lock", form: "option", value: "boolean", required: false, description: "Write reviewed fixed-input hashes.", default: false },
      { name: "progress", form: "option", value: "string", required: false, description: "Evaluation progress on stderr: off, human, or one machine-readable NDJSON envelope per Core event." },
      sectionArgument(["summary", "cases", "changes", "all"]), json],
    outputSections: ["summary", "cases", "changes", "all"],
  },
  {
    id: "candidate", usage: "inm candidate <path> --candidate ID [--review | --apply] [--progress MODE] [--json]", description: "Inspect, explicitly review, or guardedly apply a Candidate Change Set.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "candidate", form: "option", value: "string", required: true, description: "Candidate Change Set id." },
      { name: "review", form: "option", value: "boolean", required: false, description: "Explicitly evaluate and record this exact proposal.", default: false },
      { name: "apply", form: "option", value: "boolean", required: false, description: "Re-evaluate and apply an exact reviewed KEEP proposal.", default: false },
      { name: "progress", form: "option", value: "string", required: false, description: "Evaluation progress on stderr: off, human, or one machine-readable NDJSON envelope per Core event." },
      sectionArgument(["summary", "proposal", "revision", "evaluation", "all"]), json],
    outputSections: ["summary", "proposal", "revision", "evaluation", "all"],
  },
  {
    id: "design", usage: "inm design <path> [--program ID] [--run | --run-id HASH [--continue | --promote ID]] [--max-candidates N] [--progress MODE] [--json]", description: "Discover, inspect, execute, continue, reopen, or promote a bounded project-local Design Program.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "program", form: "option", value: "string", required: false, description: "Project-local Design Program id; omit to list programs." },
      { name: "run", form: "option", value: "boolean", required: false, description: "Execute bounded search and write/reuse an immutable design run.", default: false },
      { name: "run-id", form: "option", value: "string", required: false, description: "Reopen an immutable Design Run by content hash." },
      { name: "continue", form: "option", value: "boolean", required: false, description: "Continue the exact searchable frontier from --run-id into a new immutable run.", default: false },
      { name: "promote", form: "option", value: "string", required: false, description: "Create this Candidate id from the reopened run's exact leading design." },
      { name: "max-candidates", form: "option", value: "integer", required: false, description: "New Candidate budget for --run or --continue, bounded per invocation by the Design Program manifest." },
      { name: "progress", form: "option", value: "string", required: false, description: "Run progress on stderr: off, human, or one machine-readable NDJSON envelope per Core event." },
      sectionArgument(["summary", "static", "iterations", "frontier", "best", "runs", "all"]), json],
    outputSections: ["summary", "static", "iterations", "frontier", "best", "runs", "all"],
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
    id: "session", usage: "inm session <path> --experiment ID [--run] [--project ID] [--port N] [--no-open] [--json]",
    description: "Ensure a source-current Studio and enter one exact reconnectable Experiment session.",
    effect: "mode-dependent", supportsJson: true, arguments: [path, project,
      { name: "experiment", form: "option", value: "string", required: true, description: "Project-local Benchmark id to open as an Experiment." },
      { name: "run", form: "option", value: "boolean", required: false, description: "Start the locked evaluation as a reconnectable Studio operation and return immediately.", default: false },
      { name: "port", form: "option", value: "integer", required: false, description: "Strict local HTTP port. Omit to discover the target service or allocate a bounded fallback." },
      { name: "no-open", form: "option", value: "boolean", required: false, description: "Do not open the Experiment route in a browser.", default: false },
      json],
    outputSections: [],
  },
  ...(["start", "status", "restart", "stop", "serve"] as const).map((action): Omit<CliCommandDescriptor, "exitCodes"> => ({
    id: `studio.${action}`,
    usage: `inm studio ${action} <path> [--project ID] [--port N]${action === "start" || action === "restart" || action === "serve" ? " [--no-open]" : ""}${action === "serve" ? "" : " [--json]"}`,
    description: ({
      start: "Start, retry, or idempotently reuse a managed local Studio server.",
      status: "Discover and inspect the exact managed Studio project, URL, PIDs, source-adoption state, and log.",
      restart: "Discover and restart the verified managed Studio from current source.",
      stop: "Discover and stop only the verified managed Studio for this target.",
      serve: "Run Studio directly in the foreground for debugging and tests.",
    })[action],
    effect: action === "status" ? "read-only" : "long-running-server",
    supportsJson: action !== "serve",
    arguments: [path, project,
      {
        name: "port", form: "option", value: "integer", required: false,
        description: action === "serve"
          ? "Foreground HTTP port; defaults to 4176."
          : "Strict local HTTP port. Omit to discover the target service or allocate 4176 plus a bounded fallback.",
        ...(action === "serve" ? { default: 4176 } : {}),
      },
      ...((action === "start" || action === "restart" || action === "serve")
        ? [{ name: "no-open", form: "option" as const, value: "boolean" as const, required: false, description: "Do not open a browser.", default: false }]
        : []),
      ...(action === "serve" ? [] : [json])],
    outputSections: [],
  })),
];

export const CLI_COMMANDS: CliCommandDescriptor[] = COMMANDS.map((command) => ({
  ...command,
  exitCodes: exitCodes(command.id),
}));
