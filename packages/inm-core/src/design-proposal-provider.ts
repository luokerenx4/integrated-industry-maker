import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import type { ProductionCapacityPlan } from "./capacity-plan";
import type { ProductionAnalysis } from "./production-analysis";
import type { FabLossProfile } from "./fab-loss-analysis";
import type { BlueprintResearchAgent, ResearchHistoryEntry, ResearchInput, ResearchProposal } from "./research";
import type { Blueprint, FactoryMetrics } from "./types";
import { stableStringify } from "./utils";

export interface ProjectProposalContext {
  apiVersion: 3;
  iteration: number;
  blueprint: Blueprint;
  metrics: FactoryMetrics;
  fabLoss: FabLossProfile | null;
  production: ProductionAnalysis;
  capacityPlan: ProductionCapacityPlan;
  history: ResearchHistoryEntry[];
}

export interface ProjectProposalProvider {
  apiVersion: 3;
  propose(context: Readonly<ProjectProposalContext>): ResearchProposal | null;
}

export class ProjectProposalExhaustedError extends Error {
  constructor(public readonly entry: string) {
    super(`Project proposal provider '${entry}' has no unused proposal`);
    this.name = "ProjectProposalExhaustedError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function freezeDeep<T>(value: T): Readonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}

function proposalOf(value: unknown, entry: string): ResearchProposal | null {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.hypothesis !== "string" || !value.hypothesis
    || typeof value.strategy !== "string" || !value.strategy || !Array.isArray(value.patch)
    || (value.expectedEffect !== undefined && typeof value.expectedEffect !== "string")
    || (value.addressedLoss !== undefined && typeof value.addressedLoss !== "string")) {
    throw new Error(`Project proposal provider '${entry}' must return null or { strategy, hypothesis, expectedEffect?, addressedLoss?, patch[] }`);
  }
  return {
    strategy: value.strategy,
    hypothesis: value.hypothesis,
    patch: value.patch as ResearchProposal["patch"],
    ...(value.expectedEffect === undefined ? {} : { expectedEffect: value.expectedEffect }),
    ...(value.addressedLoss === undefined ? {} : { addressedLoss: value.addressedLoss as NonNullable<ResearchProposal["addressedLoss"]> }),
  };
}

export class ProjectStrategyResearchAgent implements BlueprintResearchAgent {
  private readonly provider: Promise<ProjectProposalProvider>;

  constructor(private readonly projectDir: string, private readonly entry: string) {
    this.provider = this.load();
  }

  private async load(): Promise<ProjectProposalProvider> {
    const root = resolve(this.projectDir);
    const entryPath = resolve(root, this.entry);
    if (entryPath !== root && !entryPath.startsWith(`${root}${sep}`)) throw new Error(`Design proposal strategy escapes the project directory: ${this.entry}`);
    let module: Record<string, unknown>;
    try {
      const source = await readFile(entryPath);
      const sourceHash = createHash("sha256").update(source).digest("hex");
      module = await import(`${pathToFileURL(entryPath).href}?proposal=${sourceHash}`) as Record<string, unknown>;
    } catch (error) {
      throw new Error(`Cannot load project proposal provider '${this.entry}': ${error instanceof Error ? error.message : String(error)}`);
    }
    const provider = module.default;
    if (!isRecord(provider) || provider.apiVersion !== 3 || typeof provider.propose !== "function") {
      throw new Error(`Project proposal provider '${this.entry}' default export must define apiVersion: 3 and synchronous propose(context)`);
    }
    return provider as unknown as ProjectProposalProvider;
  }

  async propose(input: ResearchInput): Promise<ResearchProposal> {
    const provider = await this.provider;
    const context = (): Readonly<ProjectProposalContext> => freezeDeep({
      apiVersion: 3,
      iteration: input.iteration,
      blueprint: structuredClone(input.blueprint),
      metrics: structuredClone(input.metrics),
      fabLoss: structuredClone(input.fabLoss),
      production: structuredClone(input.production),
      capacityPlan: structuredClone(input.capacityPlan),
      history: structuredClone(input.history),
    });
    const invoke = (): ResearchProposal | null => {
      const value = provider.propose(context());
      if (value && typeof (value as unknown as PromiseLike<unknown>).then === "function") throw new Error(`Project proposal provider '${this.entry}' must be synchronous and deterministic`);
      return proposalOf(value, this.entry);
    };
    const first = invoke();
    const second = invoke();
    if (stableStringify(first) !== stableStringify(second)) throw new Error(`Project proposal provider '${this.entry}' returned different proposals for the same frozen input`);
    if (!first) throw new ProjectProposalExhaustedError(this.entry);
    const observedLosses = input.fabLoss?.chain ?? [];
    if (observedLosses.length && !first.addressedLoss) throw new Error(
      `Project proposal provider '${this.entry}' must name addressedLoss from the measured loss chain: ${observedLosses.join(", ")}`,
    );
    if (first.addressedLoss && !observedLosses.includes(first.addressedLoss)) throw new Error(
      `Project proposal provider '${this.entry}' addressed unobserved loss '${first.addressedLoss}'; expected one of: ${observedLosses.join(", ") || "none"}`,
    );
    return first;
  }
}
