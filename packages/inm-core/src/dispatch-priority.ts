import type { CompiledConnection, CompiledFactoryProject, DispatchPolicy, ResourceId } from "./types";

export type DispatchTargetKind = "objective" | "process" | "fuel" | "buffer";

export interface ConnectionDispatchProfile {
  resource: ResourceId;
  targetKind: DispatchTargetKind;
  /** Resident plus inbound units are divided by this value to compare downstream coverage. */
  coverageUnit: number;
  /** Zero is closest to target delivery; null means outside the selected production dependency graph. */
  criticalDepth: number | null;
}

export function effectiveDispatchPolicy(project: CompiledFactoryProject, connection: CompiledConnection): DispatchPolicy {
  return connection.fromDevice.policy?.dispatch ?? project.blueprint.policies?.dispatch ?? "fifo";
}

export function resourceCriticalDepth(project: CompiledFactoryProject): Record<ResourceId, number> {
  const depths: Record<ResourceId, number> = { [project.objective.targetResource]: 0 };
  const processDevices = Object.values(project.devices).filter((device) => device.processPlan).sort((a, b) => a.id.localeCompare(b.id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const device of processDevices) {
      const plan = device.processPlan!;
      const downstreamDepth = Math.min(...plan.outputs.flatMap((amount) => depths[amount.resource] === undefined ? [] : [depths[amount.resource]!]));
      if (!Number.isFinite(downstreamDepth)) continue;
      for (const input of plan.inputs) {
        const nextDepth = downstreamDepth + 1;
        if (depths[input.resource] === undefined || nextDepth < depths[input.resource]!) {
          depths[input.resource] = nextDepth;
          changed = true;
        }
      }
    }
  }
  return depths;
}

export function connectionDispatchProfiles(
  project: CompiledFactoryProject,
  connection: CompiledConnection,
  depths = resourceCriticalDepth(project),
): ConnectionDispatchProfile[] {
  const target = connection.toDevice;
  const buffer = target.buffers[connection.toPort.buffer]!;
  return connection.resources.map((resource) => {
    const objective = resource === project.objective.targetResource && target.region === project.objective.targetRegion
      && target.assetDef.capabilities.includes("consume");
    const processInput = target.processPlan?.inputs.find((amount) => amount.buffer === connection.toPort.buffer && amount.resource === resource);
    const fuel = target.generationPlan?.kind === "fuel" && target.generationPlan.fuelBuffer === connection.toPort.buffer
      && target.generationPlan.fuels.some((item) => item.resource === resource);
    const targetKind: DispatchTargetKind = objective ? "objective" : processInput ? "process" : fuel ? "fuel" : "buffer";
    const downstreamDepth = processInput
      ? Math.min(...target.processPlan!.outputs.flatMap((amount) => depths[amount.resource] === undefined ? [] : [depths[amount.resource]!] as number[]))
      : Number.POSITIVE_INFINITY;
    const criticalDepth = objective || fuel ? 0
      : Number.isFinite(downstreamDepth) ? downstreamDepth
        : depths[resource] ?? null;
    const coverageUnit = objective || fuel ? 1
      : processInput ? processInput.count
        : buffer.resourceCapacities?.[resource] ?? buffer.capacity;
    return { resource, targetKind, coverageUnit: Math.max(1, coverageUnit), criticalDepth };
  });
}
