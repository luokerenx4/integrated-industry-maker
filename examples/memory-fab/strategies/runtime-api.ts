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

export type FabLossBucketId =
  | "delivery-portfolio"
  | "release-admission"
  | "queue-starvation"
  | "batch-formation"
  | "setup-campaign"
  | "maintenance-qualification"
  | "tooling-contention"
  | "facility-contention"
  | "equipment-failure"
  | "power-interruption"
  | "transport-blocking"
  | "q-time"
  | "yield-quality";

export interface FabLossProfile {
  version: 2;
  family: string;
  outcome: Record<string, number>;
  primary: FabLossBucket | null;
  chain: FabLossBucketId[];
  buckets: FabLossBucket[];
  caveat: string;
}

export interface FabLossBucket {
  id: FabLossBucketId;
  label: string;
  score: number;
  summary: string;
  subjects: Array<{ kind: "project" | "device" | "connection" | "route"; id: string }>;
  evidence: Record<string, number>;
}

export interface ProjectProposalContext {
  apiVersion: 5;
  iteration: number;
  branch: {
    nodeId: string;
    parentNodeId?: string;
    role: "leader" | "alternative";
    depth: number;
    leaderNodeId: string;
  };
  promotionBoundary: {
    leaderNodeId: string;
    selectedNodeId: string;
    promotable: boolean;
    aggregate: { leaderScore: number; selectedScore: number; scoreDelta: number };
    cases: Array<{
      id: string;
      name: string;
      leaderScore: number;
      selectedScore: number;
      scoreDelta: number;
      maximumScoreRegression: number | null;
      guardrailPassed: boolean;
    }>;
    limitingCase: string | null;
    guardrail: { kind: "unrestricted" | "uniform" | "case-specific"; passed: boolean; violations: string[] };
  };
  blueprint: Blueprint;
  metrics: Record<string, unknown>;
  fabLoss: FabLossProfile | null;
  production: Record<string, unknown>;
  capacityPlan: Record<string, unknown>;
  history: Array<{ iteration: number; strategy: string; hypothesis: string; addressedLoss?: FabLossBucketId; addressedCase?: string; decision: "KEEP" | "BRANCH" | "REVERT"; score: number; scoreDelta: number }>;
}

export interface ProjectProposalProvider {
  apiVersion: 5;
  propose(context: Readonly<ProjectProposalContext>): {
    strategy: string;
    hypothesis: string;
    expectedEffect?: string;
    addressedLoss?: FabLossBucketId;
    addressedCase?: string;
    patch: JsonPatchOperation[];
  } | null;
}
