export interface Blueprint {
  version: 1;
  revision?: string;
  devices: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  logisticsNetworks: Array<Record<string, unknown>>;
  policies: { dispatch?: "fifo" | "round-robin" | "shortage-first"; powerAllocation: "proportional" | "priority-load-shedding" };
}

export interface ProjectSynthesisContext {
  apiVersion: 1;
  project: { id: string; name: string };
  selection: { world: string; blueprint: string; scenario: string; objective: string };
  seedBlueprint: Blueprint;
  catalogs: {
    resources: string[];
    processes: string[];
    routes: Array<{ id: string; family: string; steps: Array<{ id: string; operations: string[] }> }>;
    deviceAssets: string[];
  };
  world: { regions: Array<{ id: string; bounds: { width: number; height: number } }> };
  scenario: { id: string; lotReleases?: Array<{ id: string }> };
  objective: { id: string; targetResource: string; targetRatePerMinute: number };
}

export interface ProjectSynthesisStrategy {
  apiVersion: 1;
  synthesize(context: Readonly<ProjectSynthesisContext>): {
    blueprint: Blueprint;
    summary: { title: string; trackedRoute?: string; notes: string[] };
  };
}

export interface JsonPatchOperation {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

export interface ProjectProposalContext {
  apiVersion: 1;
  iteration: number;
  blueprint: Blueprint;
  metrics: Record<string, unknown>;
  production: Record<string, unknown>;
  capacityPlan: Record<string, unknown>;
  history: Array<{ iteration: number; strategy: string; hypothesis: string; decision: "KEEP" | "REVERT"; score: number; scoreDelta: number }>;
}

export interface ProjectProposalProvider {
  apiVersion: 1;
  propose(context: Readonly<ProjectProposalContext>): {
    strategy: string;
    hypothesis: string;
    expectedEffect?: string;
    patch: JsonPatchOperation[];
  } | null;
}
