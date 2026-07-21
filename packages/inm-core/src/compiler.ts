import { planDeviceTransport, validateDeviceConfig } from "./device-runtime";
import type {
  BlueprintLogisticsNetwork, WorldRegion, CompiledConnection, CompiledDevice, CompiledFactoryProject, CompiledLogisticsNetwork, CompiledPowerGrid, CompiledTransportCell, DeviceAsset,
  DispatchPolicy, IndustrialProcess, ProductRoute, ProjectHashes, ResourceAsset, ResourceBufferQuantity, ResourceId, ValidationIssue, WorldResourceNode,
} from "./types";
import { InmValidationError } from "./types";
import type { LoadedFactoryProject } from "./loader";
import { ENGINE_VERSION, hashValue } from "./utils";
import { externalPortCellAtDistance, rotatePortSide, rotatedFootprint, transportCellId, transportEndpointRotation } from "./routing";
import { compileProductionAmounts, productionDurationTicks, productionPowerMilliWatts } from "./production-mode";

function acceptsResource(accepts: readonly string[], resource: ResourceId): boolean {
  return accepts.includes("*") || accepts.includes(resource);
}

function maximumDriftPower(asset: DeviceAsset, nominalMilliWatts: number): number {
  return Math.max(nominalMilliWatts, ...(asset.production?.maintenance?.drift ?? []).map((stage) =>
    Math.ceil(nominalMilliWatts * stage.powerMultiplier.numerator / stage.powerMultiplier.denominator)));
}

function intersectResourceContracts(left: readonly string[], right: readonly string[]): Array<ResourceId | "*"> {
  if (left.includes("*") && right.includes("*")) return ["*"];
  if (left.includes("*")) return [...right];
  if (right.includes("*")) return [...left];
  return left.filter((resource) => right.includes(resource)).sort();
}

function narrowDevicePortsToBuffers(device: Pick<CompiledDevice, "ports" | "buffers">): void {
  for (const port of device.ports) {
    port.accepts = intersectResourceContracts(port.accepts, device.buffers[port.buffer]?.accepts ?? []) as ResourceId[] | ["*"];
  }
}

function partitionRecipeBuffer(capacity: number, amounts: Array<{ resource: ResourceId; count: number }>): Record<ResourceId, number> {
  const totals: Record<ResourceId, number> = {};
  for (const amount of amounts) totals[amount.resource] = (totals[amount.resource] ?? 0) + amount.count;
  const ordered = Object.entries(totals).map(([resource, count]) => ({ resource, count }))
    .sort((left, right) => left.resource.localeCompare(right.resource));
  const minimum = ordered.reduce((sum, amount) => sum + amount.count, 0);
  if (!ordered.length || minimum > capacity) return {};
  const remaining = capacity - minimum;
  const quotas = Object.fromEntries(ordered.map((amount) => [
    amount.resource,
    amount.count + Math.floor(remaining * amount.count / minimum),
  ]));
  let unassigned = capacity - Object.values(quotas).reduce((sum, value) => sum + value, 0);
  for (const amount of ordered) {
    if (unassigned-- <= 0) break;
    quotas[amount.resource]! += 1;
  }
  return quotas;
}

function recipeBufferRequirements(
  buffer: string,
  inputs: Array<{ buffer: string; resource: ResourceId; count: number }>,
  outputs: Array<{ buffer: string; resource: ResourceId; count: number }>,
): Array<{ resource: ResourceId; count: number }> {
  const sideTotals = (amounts: typeof inputs): Record<ResourceId, number> => {
    const totals: Record<ResourceId, number> = {};
    for (const amount of amounts.filter((candidate) => candidate.buffer === buffer)) {
      totals[amount.resource] = (totals[amount.resource] ?? 0) + amount.count;
    }
    return totals;
  };
  const inputTotals = sideTotals(inputs); const outputTotals = sideTotals(outputs);
  return [...new Set([...Object.keys(inputTotals), ...Object.keys(outputTotals)])].sort()
    .map((resource) => ({ resource, count: Math.max(inputTotals[resource] ?? 0, outputTotals[resource] ?? 0) }));
}

function validateAssets(resources: Record<string, ResourceAsset>, processes: Record<string, IndustrialProcess>, devices: Record<string, DeviceAsset>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const [id, resource] of Object.entries(resources)) if (resource.tracking && resource.unit.kind !== "discrete") {
    issues.push({ path: `assets/resources/${id}/asset.json/tracking`, code: "lot.discrete-required", message: `Tracked Resource '${id}' must use a discrete unit` });
  }
  for (const [id, process] of Object.entries(processes)) {
    for (const side of ["inputs", "outputs"] as const) {
      const seen = new Set<string>();
      for (const [index, amount] of process[side].entries()) {
        const path = `processes/${id}.process.json/${side}/${index}/resource`;
        if (seen.has(amount.resource)) issues.push({ path, code: "process.duplicate-resource", message: `Process '${id}' lists '${amount.resource}' more than once in ${side}` });
        seen.add(amount.resource);
        if (!resources[amount.resource]) issues.push({ path, code: "reference.resource", message: `Unknown resource '${amount.resource}'` });
      }
    }
    const processResources = new Set([...process.inputs, ...process.outputs].map((amount) => amount.resource));
    const seenTooling = new Set<string>();
    for (const [index, amount] of (process.tooling ?? []).entries()) {
      const path = `processes/${id}.process.json/tooling/${index}/resource`;
      const resource = resources[amount.resource];
      if (seenTooling.has(amount.resource)) issues.push({ path, code: "process.duplicate-tooling", message: `Process '${id}' lists reusable tooling '${amount.resource}' more than once` });
      seenTooling.add(amount.resource);
      if (!resource) issues.push({ path, code: "reference.resource", message: `Unknown reusable tooling Resource '${amount.resource}'` });
      else if (resource.unit.kind !== "discrete" || resource.tracking) issues.push({ path, code: "tooling.discrete-untracked", message: `Reusable tooling '${amount.resource}' must be a discrete, non-lot Resource` });
      if (processResources.has(amount.resource)) issues.push({ path, code: "tooling.material-overlap", message: `Reusable tooling '${amount.resource}' cannot also be a consumed input or produced output of Process '${id}'` });
    }
    const trackedInputs = process.inputs.filter((amount) => resources[amount.resource]?.tracking);
    const trackedOutputs = process.outputs.filter((amount) => resources[amount.resource]?.tracking);
    const families = new Set([...trackedInputs, ...trackedOutputs].map((amount) => resources[amount.resource]!.tracking!.family));
    for (const family of [...families].sort()) {
      const inputs = trackedInputs.filter((amount) => resources[amount.resource]!.tracking!.family === family);
      const outputs = trackedOutputs.filter((amount) => resources[amount.resource]!.tracking!.family === family);
      if (inputs.length !== 1 || outputs.length !== 1) issues.push({
        path: `processes/${id}.process.json`, code: "lot.identity-flow",
        message: `Process '${id}' must transform exactly one tracked '${family}' Resource input into exactly one tracked '${family}' Resource output`,
      });
      else if (inputs[0]!.count !== outputs[0]!.count) issues.push({
        path: `processes/${id}.process.json`, code: "lot.identity-count",
        message: `Process '${id}' cannot create or destroy '${family}' lot identities (${inputs[0]!.count} in, ${outputs[0]!.count} out)`,
      });
    }
    if (process.quality?.kind === "inspection") {
      const path = `processes/${id}.process.json/quality`;
      const input = process.inputs[0]; const output = process.outputs[0];
      const inputTracking = input ? resources[input.resource]?.tracking : undefined;
      const outputTracking = output ? resources[output.resource]?.tracking : undefined;
      if (process.inputs.length !== 1 || process.outputs.length !== 1 || input?.count !== 1 || output?.count !== 1 || !inputTracking || !outputTracking) {
        issues.push({ path, code: "quality.inspection-lot-shape", message: `Inspection Process '${id}' must transform exactly one tracked lot input into one declared pass output` });
      }
      const alternatives = [process.quality.rejectResource, ...(process.quality.scrapResource ? [process.quality.scrapResource] : [])];
      if (new Set([output?.resource, ...alternatives]).size !== 1 + alternatives.length) issues.push({
        path, code: "quality.inspection-output-distinct", message: `Inspection Process '${id}' pass, reject, and scrap Resources must be distinct`,
      });
      for (const resourceId of alternatives) {
        const resource = resources[resourceId];
        if (!resource) issues.push({ path, code: "reference.resource", message: `Inspection Process '${id}' references unknown disposition Resource '${resourceId}'` });
        else if (!resource.tracking || resource.tracking.family !== inputTracking?.family) issues.push({
          path, code: "quality.inspection-family", message: `Inspection disposition Resource '${resourceId}' must track the same lot family as '${input?.resource}'`,
        });
      }
      if (process.quality.maxReworkCycles !== undefined && !process.quality.scrapResource) issues.push({
        path, code: "quality.scrap-output-required", message: `Inspection Process '${id}' needs scrapResource when maxReworkCycles is configured`,
      });
      if (new Set(process.quality.detects).size !== process.quality.detects.length) issues.push({
        path: `${path}/detects`, code: "quality.duplicate-defect", message: `Inspection Process '${id}' declares a defect class more than once`,
      });
    } else if (process.quality?.kind === "rework" && new Set(process.quality.repairs).size !== process.quality.repairs.length) {
      issues.push({ path: `processes/${id}.process.json/quality/repairs`, code: "quality.duplicate-defect", message: `Rework Process '${id}' declares a defect class more than once` });
    }
  }
  for (const [id, asset] of Object.entries(devices)) {
    if (asset.power.idleMilliWatts > asset.power.activeMilliWatts) issues.push({
      path: `assets/devices/${id}/asset.json/power/idleMilliWatts`, code: "power.idle-exceeds-active",
      message: `Idle power ${asset.power.idleMilliWatts} mW cannot exceed active power ${asset.power.activeMilliWatts} mW`,
    });
    if (asset.production?.changeover && asset.production.changeover.powerMilliWatts < asset.power.idleMilliWatts) issues.push({
      path: `assets/devices/${id}/asset.json/production/changeover/powerMilliWatts`, code: "production.changeover-power",
      message: `Changeover power ${asset.production.changeover.powerMilliWatts} mW cannot be below connected standby ${asset.power.idleMilliWatts} mW`,
    });
    if (asset.production?.maintenance && asset.production.maintenance.powerMilliWatts < asset.power.idleMilliWatts) issues.push({
      path: `assets/devices/${id}/asset.json/production/maintenance/powerMilliWatts`, code: "production.maintenance-power",
      message: `Maintenance power ${asset.production.maintenance.powerMilliWatts} mW cannot be below connected standby ${asset.power.idleMilliWatts} mW`,
    });
    if (asset.production?.maintenance && asset.production.maintenance.qualification.powerMilliWatts < asset.power.idleMilliWatts) issues.push({
      path: `assets/devices/${id}/asset.json/production/maintenance/qualification/powerMilliWatts`, code: "production.qualification-power",
      message: `Qualification power ${asset.production.maintenance.qualification.powerMilliWatts} mW cannot be below connected standby ${asset.power.idleMilliWatts} mW`,
    });
    const driftStages = asset.production?.maintenance?.drift ?? [];
    let previousDriftThreshold = 0;
    let previousDurationMultiplier = { numerator: 1, denominator: 1 };
    let previousPowerMultiplier = { numerator: 1, denominator: 1 };
    let previousDriftDefects = new Set<string>();
    for (const [driftIndex, drift] of driftStages.entries()) {
      const path = `assets/devices/${id}/asset.json/production/maintenance/drift/${driftIndex}`;
      if (drift.afterJobs <= previousDriftThreshold) issues.push({
        path: `${path}/afterJobs`, code: "production.drift-order",
        message: `Equipment drift thresholds must be strictly increasing; ${drift.afterJobs} follows ${previousDriftThreshold}`,
      });
      previousDriftThreshold = drift.afterJobs;
      if (drift.afterJobs >= asset.production!.maintenance!.maximumJobs) issues.push({
        path: `${path}/afterJobs`, code: "production.drift-threshold",
        message: `Equipment drift after ${drift.afterJobs} jobs is unreachable before mandatory maintenance at ${asset.production!.maintenance!.maximumJobs}`,
      });
      if (new Set(drift.defects).size !== drift.defects.length) issues.push({
        path: `${path}/defects`, code: "production.drift-duplicate-defect",
        message: `Equipment drift stage after ${drift.afterJobs} jobs declares a defect class more than once`,
      });
      const durationImproves = drift.durationMultiplier.numerator < drift.durationMultiplier.denominator;
      const powerImproves = drift.powerMultiplier.numerator < drift.powerMultiplier.denominator;
      if (durationImproves || powerImproves) issues.push({
        path, code: "production.drift-improvement",
        message: `Equipment degradation cannot improve duration or power below the clean-state 1/1 multiplier`,
      });
      const durationRegresses = drift.durationMultiplier.numerator * previousDurationMultiplier.denominator
        < previousDurationMultiplier.numerator * drift.durationMultiplier.denominator;
      const powerRegresses = drift.powerMultiplier.numerator * previousPowerMultiplier.denominator
        < previousPowerMultiplier.numerator * drift.powerMultiplier.denominator;
      if (durationRegresses || powerRegresses) issues.push({
        path, code: "production.drift-regression",
        message: `Later equipment degradation stages cannot reduce an earlier duration or power multiplier`,
      });
      const missingPreviousDefects = [...previousDriftDefects].filter((defect) => !drift.defects.includes(defect));
      if (missingPreviousDefects.length) issues.push({
        path: `${path}/defects`, code: "production.drift-defect-loss",
        message: `Later equipment degradation stages must retain earlier defects: ${missingPreviousDefects.join(", ")}`,
      });
      const changesDuration = drift.durationMultiplier.numerator !== drift.durationMultiplier.denominator;
      const changesPower = drift.powerMultiplier.numerator !== drift.powerMultiplier.denominator;
      if (!changesDuration && !changesPower && !drift.defects.length) issues.push({
        path, code: "production.drift-no-effect", message: `Equipment drift stage after ${drift.afterJobs} jobs has no physical effect`,
      });
      previousDurationMultiplier = drift.durationMultiplier;
      previousPowerMultiplier = drift.powerMultiplier;
      previousDriftDefects = new Set(drift.defects);
    }
    const bufferIds = new Set<string>();
    for (const [index, buffer] of asset.buffers.entries()) {
      if (bufferIds.has(buffer.id)) issues.push({ path: `assets/devices/${id}/asset.json/buffers/${index}/id`, code: "asset.duplicate-buffer", message: `Duplicate buffer '${buffer.id}'` });
      bufferIds.add(buffer.id);
      for (const [resourceIndex, resource] of buffer.accepts.entries()) if (resource !== "*" && !resources[resource]) {
        issues.push({ path: `assets/devices/${id}/asset.json/buffers/${index}/accepts/${resourceIndex}`, code: "reference.resource", message: `Unknown resource '${resource}'` });
      }
    }
    const portIds = new Set<string>();
    for (const [index, port] of asset.geometry.ports.entries()) {
      if (portIds.has(port.id)) issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/id`, code: "asset.duplicate-port", message: `Duplicate port '${port.id}'` });
      portIds.add(port.id);
      const buffer = asset.buffers.find((item) => item.id === port.buffer);
      if (!buffer) issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/buffer`, code: "reference.buffer", message: `Unknown buffer '${port.buffer}'` });
      else if (port.direction === "input" && buffer.role === "output") issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/buffer`, code: "port.buffer-role", message: "Input port cannot target an output-only buffer" });
      else if (port.direction === "output" && buffer.role === "input") issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/buffer`, code: "port.buffer-role", message: "Output port cannot read an input-only buffer" });
      const edgeLength = port.side === "north" || port.side === "south" ? asset.geometry.footprint.width : asset.geometry.footprint.height;
      if (port.offset >= edgeLength) issues.push({ path: `assets/devices/${id}/asset.json/geometry/ports/${index}/offset`, code: "geometry.port-offset", message: `Port offset ${port.offset} is outside edge length ${edgeLength}` });
    }
    for (const [phase, service] of asset.production?.maintenance ? [
      ["service", asset.production.maintenance.service],
      ["qualification/service", asset.production.maintenance.qualification.service],
    ] as const : []) {
      const seenInputs = new Set<string>();
      for (const [inputIndex, input] of service.inputs.entries()) {
        const path = `assets/devices/${id}/asset.json/production/maintenance/${phase}/inputs/${inputIndex}`;
        if (seenInputs.has(input.resource)) issues.push({ path, code: "maintenance.duplicate-input", message: `Maintenance ${phase} consumes '${input.resource}' more than once` });
        seenInputs.add(input.resource);
        if (!resources[input.resource]) issues.push({ path: `${path}/resource`, code: "reference.resource", message: `Unknown maintenance ${phase} consumable '${input.resource}'` });
      }
    }
    if (asset.maintenanceProvider) {
      const providerPath = `assets/devices/${id}/asset.json/maintenanceProvider`;
      if (!asset.capabilities.includes("maintain")) issues.push({ path: providerPath, code: "capability.not-maintain", message: "Maintenance provider specification requires maintain capability" });
      if (new Set(asset.maintenanceProvider.skills).size !== asset.maintenanceProvider.skills.length) issues.push({
        path: `${providerPath}/skills`, code: "maintenance.duplicate-skill", message: `Maintenance provider '${id}' declares a skill more than once`,
      });
      const inventory = asset.buffers.find((buffer) => buffer.id === asset.maintenanceProvider!.inventoryBuffer);
      if (!inventory) issues.push({ path: `${providerPath}/inventoryBuffer`, code: "reference.buffer", message: `Unknown maintenance inventory buffer '${asset.maintenanceProvider.inventoryBuffer}'` });
      else if (inventory.role === "output") issues.push({ path: `${providerPath}/inventoryBuffer`, code: "maintenance.inventory-role", message: "Maintenance inventory cannot be output-only" });
    } else if (asset.capabilities.includes("maintain")) issues.push({
      path: `assets/devices/${id}/asset.json/capabilities`, code: "maintenance.provider-required", message: "Maintain capability requires a maintenanceProvider specification",
    });
    if (asset.toolingProvider) {
      const providerPath = `assets/devices/${id}/asset.json/toolingProvider`;
      if (!asset.capabilities.includes("tooling")) issues.push({ path: providerPath, code: "capability.not-tooling", message: "Tooling provider specification requires tooling capability" });
      const inventory = asset.buffers.find((buffer) => buffer.id === asset.toolingProvider!.inventoryBuffer);
      if (!inventory) issues.push({ path: `${providerPath}/inventoryBuffer`, code: "reference.buffer", message: `Unknown tooling inventory buffer '${asset.toolingProvider.inventoryBuffer}'` });
      else if (inventory.role !== "input") issues.push({ path: `${providerPath}/inventoryBuffer`, code: "tooling.inventory-role", message: "Tooling inventory must use a dedicated input-only buffer" });
    } else if (asset.capabilities.includes("tooling")) issues.push({
      path: `assets/devices/${id}/asset.json/capabilities`, code: "tooling.provider-required", message: "Tooling capability requires a toolingProvider specification",
    });
    if (asset.production) {
      if (!asset.capabilities.includes("process")) issues.push({ path: `assets/devices/${id}/asset.json/production`, code: "capability.not-process", message: "Production specification requires process capability" });
      const qualifiedProcesses = new Set<string>();
      for (const [processIndex, processId] of asset.production.processes.entries()) {
        const path = `assets/devices/${id}/asset.json/production/processes/${processIndex}`;
        if (qualifiedProcesses.has(processId)) issues.push({ path, code: "production.duplicate-process", message: `Production qualification lists '${processId}' more than once` });
        qualifiedProcesses.add(processId);
        const process = processes[processId];
        if (!process) issues.push({ path, code: "reference.process", message: `Unknown qualified Process '${processId}'` });
        else if (!asset.production.categories.includes(process.category)) issues.push({
          path, code: "production.qualification-category",
          message: `Qualified Process '${processId}' has category '${process.category}', which Device '${asset.id}' does not support`,
        });
      }
      for (const [side, portIds, direction] of [
        ["inputPorts", asset.production.inputPorts, "input"],
        ["outputPorts", asset.production.outputPorts, "output"],
      ] as const) {
        const seen = new Set<string>();
        for (const [portIndex, portId] of portIds.entries()) {
          const path = `assets/devices/${id}/asset.json/production/${side}/${portIndex}`;
          if (seen.has(portId)) issues.push({ path, code: "production.duplicate-port", message: `Production ${side} lists '${portId}' more than once` });
          seen.add(portId);
          const port = asset.geometry.ports.find((item) => item.id === portId);
          if (!port) issues.push({ path, code: "reference.port", message: `Unknown production port '${portId}'` });
          else if (port.direction !== direction) issues.push({ path, code: "production.port-direction", message: `Production ${side} port '${portId}' must be an ${direction} port` });
        }
      }
      const modeIds = new Set<string>();
      for (const [modeIndex, mode] of asset.production.modes.entries()) {
        const modePath = `assets/devices/${id}/asset.json/production/modes/${modeIndex}`;
        if (modeIds.has(mode.id)) issues.push({ path: `${modePath}/id`, code: "production-mode.duplicate", message: `Production mode '${mode.id}' is declared more than once` });
        modeIds.add(mode.id);
        const auxiliaryResources = new Set<string>();
        for (const [inputIndex, input] of mode.auxiliaryInputs.entries()) {
          const inputPath = `${modePath}/auxiliaryInputs/${inputIndex}`;
          if (auxiliaryResources.has(input.resource)) issues.push({ path: inputPath, code: "production-mode.duplicate-input", message: `Production mode '${mode.id}' declares auxiliary Resource '${input.resource}' more than once` });
          auxiliaryResources.add(input.resource);
          if (!resources[input.resource]) issues.push({ path: `${inputPath}/resource`, code: "reference.resource", message: `Unknown auxiliary Resource '${input.resource}'` });
          else if (resources[input.resource]!.tracking) issues.push({ path: `${inputPath}/resource`, code: "lot.auxiliary-input", message: `Tracked Resource '${input.resource}' cannot be a mode auxiliary input` });
          const port = asset.geometry.ports.find((item) => item.id === input.port);
          const buffer = port ? asset.buffers.find((item) => item.id === port.buffer) : undefined;
          if (!port) issues.push({ path: `${inputPath}/port`, code: "reference.port", message: `Unknown auxiliary input port '${input.port}'` });
          else {
            if (!asset.production.inputPorts.includes(input.port)) issues.push({ path: `${inputPath}/port`, code: "production-mode.port-role", message: `Auxiliary input port '${input.port}' is not a production input port` });
            if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(input.resource)) issues.push({ path: `${inputPath}/resource`, code: "production-mode.resource-contract", message: `Port '${input.port}' does not accept auxiliary Resource '${input.resource}'` });
          }
        }
      }
    }
    if (asset.treatment) {
      const treatmentPath = `assets/devices/${id}/asset.json/treatment`;
      if (!asset.capabilities.includes("treat")) issues.push({ path: treatmentPath, code: "capability.not-treat", message: "Treatment specification requires treat capability" });
      const roleChecks = [
        ["inputBuffer", asset.treatment.inputBuffer, "input", "output"],
        ["outputBuffer", asset.treatment.outputBuffer, "output", "input"],
        ["agentBuffer", asset.treatment.agentBuffer, "input", "output"],
      ] as const;
      for (const [field, bufferId, direction, forbiddenRole] of roleChecks) {
        const buffer = asset.buffers.find((candidate) => candidate.id === bufferId);
        if (!buffer) issues.push({ path: `${treatmentPath}/${field}`, code: "reference.buffer", message: `Unknown treatment buffer '${bufferId}'` });
        else if (buffer.role === forbiddenRole) issues.push({ path: `${treatmentPath}/${field}`, code: "treatment.buffer-role", message: `Treatment ${field} '${bufferId}' cannot be ${forbiddenRole}-only` });
        if (!asset.geometry.ports.some((port) => port.direction === direction && port.buffer === bufferId)) {
          issues.push({ path: `${treatmentPath}/${field}`, code: "treatment.buffer-port", message: `Treatment ${field} '${bufferId}' requires a matching ${direction} port` });
        }
      }
      if (asset.treatment.inputBuffer === asset.treatment.outputBuffer || asset.treatment.inputBuffer === asset.treatment.agentBuffer
        || asset.treatment.outputBuffer === asset.treatment.agentBuffer) {
        issues.push({ path: treatmentPath, code: "treatment.distinct-buffers", message: "Treatment input, output, and agent buffers must be distinct" });
      }
      const modeIds = new Set<string>();
      for (const [modeIndex, mode] of asset.treatment.modes.entries()) {
        const modePath = `${treatmentPath}/modes/${modeIndex}`;
        if (modeIds.has(mode.id)) issues.push({ path: `${modePath}/id`, code: "treatment-mode.duplicate", message: `Treatment mode '${mode.id}' is declared more than once` });
        modeIds.add(mode.id);
        const resource = resources[mode.agent.resource];
        if (!resource) issues.push({ path: `${modePath}/agent/resource`, code: "reference.resource", message: `Unknown treatment agent Resource '${mode.agent.resource}'` });
        const agentBuffer = asset.buffers.find((buffer) => buffer.id === asset.treatment!.agentBuffer);
        if (agentBuffer && !agentBuffer.accepts.includes("*") && !agentBuffer.accepts.includes(mode.agent.resource)) {
          issues.push({ path: `${modePath}/agent/resource`, code: "treatment.agent-contract", message: `Agent buffer '${agentBuffer.id}' does not accept '${mode.agent.resource}'` });
        }
      }
    }
    if (asset.capabilities.includes("treat") && !asset.treatment) issues.push({ path: `assets/devices/${id}/asset.json/treatment`, code: "treatment.spec-required", message: "Treat capability requires a treatment specification" });
    if (asset.extraction) {
      if (!asset.capabilities.includes("extract")) issues.push({ path: `assets/devices/${id}/asset.json/extraction`, code: "capability.not-extract", message: "Extraction specification requires extract capability" });
      const output = asset.buffers.find((buffer) => buffer.id === asset.extraction!.outputBuffer);
      if (!output) issues.push({ path: `assets/devices/${id}/asset.json/extraction/outputBuffer`, code: "reference.buffer", message: `Unknown buffer '${asset.extraction.outputBuffer}'` });
      else if (output.role === "input") issues.push({ path: `assets/devices/${id}/asset.json/extraction/outputBuffer`, code: "extraction.buffer-role", message: "Extraction output buffer cannot be input-only" });
      const seen = new Set<string>();
      for (const [index, resource] of asset.extraction.resources.entries()) {
        if (seen.has(resource)) issues.push({ path: `assets/devices/${id}/asset.json/extraction/resources/${index}`, code: "extraction.duplicate-resource", message: `Extraction resource '${resource}' is duplicated` });
        seen.add(resource);
        if (!resources[resource]) issues.push({ path: `assets/devices/${id}/asset.json/extraction/resources/${index}`, code: "reference.resource", message: `Unknown resource '${resource}'` });
        else if (output && !output.accepts.includes("*") && !output.accepts.includes(resource)) issues.push({ path: `assets/devices/${id}/asset.json/extraction/resources/${index}`, code: "extraction.resource-contract", message: `Output buffer '${output.id}' does not accept '${resource}'` });
      }
    }
    if (asset.capabilities.includes("extract") && !asset.extraction) issues.push({ path: `assets/devices/${id}/asset.json/extraction`, code: "extraction.spec-required", message: "Extract capability requires an extraction specification" });
    if (asset.power.distribution && !asset.capabilities.includes("power")) {
      issues.push({ path: `assets/devices/${id}/asset.json/power/distribution`, code: "capability.not-power", message: "Power distribution requires power capability" });
    }
    if (asset.power.generation) {
      if (!asset.capabilities.includes("power")) issues.push({ path: `assets/devices/${id}/asset.json/power/generation`, code: "capability.not-power", message: "Power generation requires power capability" });
      if (!asset.power.distribution) issues.push({ path: `assets/devices/${id}/asset.json/power/distribution`, code: "power.distribution-required", message: "Power-generating devices must declare grid connection and coverage ranges" });
      if (asset.power.generation.kind === "fuel") {
        const generation = asset.power.generation;
        const buffer = asset.buffers.find((item) => item.id === generation.fuelBuffer);
        if (!buffer) issues.push({ path: `assets/devices/${id}/asset.json/power/generation/fuelBuffer`, code: "reference.buffer", message: `Unknown fuel buffer '${asset.power.generation.fuelBuffer}'` });
        else if (buffer.role === "output") issues.push({ path: `assets/devices/${id}/asset.json/power/generation/fuelBuffer`, code: "power.fuel-buffer-role", message: "Fuel buffer cannot be output-only" });
        const seenFuels = new Set<string>();
        for (const [fuelIndex, fuel] of asset.power.generation.fuels.entries()) {
          const fuelPath = `assets/devices/${id}/asset.json/power/generation/fuels/${fuelIndex}`;
          if (seenFuels.has(fuel)) issues.push({ path: fuelPath, code: "power.duplicate-fuel", message: `Fuel '${fuel}' is duplicated` });
          seenFuels.add(fuel);
          const resource = resources[fuel];
          if (!resource) issues.push({ path: fuelPath, code: "reference.resource", message: `Unknown fuel resource '${fuel}'` });
          else if (!resource.fuel) issues.push({ path: fuelPath, code: "power.resource-not-fuel", message: `Resource '${fuel}' has no fuel energy value` });
          else if (resource.tracking) issues.push({ path: fuelPath, code: "lot.fuel", message: `Tracked Resource '${fuel}' cannot be consumed as fuel` });
          if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(fuel)) issues.push({ path: fuelPath, code: "power.fuel-contract", message: `Fuel buffer '${buffer.id}' does not accept '${fuel}'` });
        }
      }
    }
    if (asset.power.storage) {
      if (!asset.capabilities.includes("power")) issues.push({ path: `assets/devices/${id}/asset.json/power/storage`, code: "capability.not-power", message: "Power storage requires power capability" });
      if (!asset.power.distribution) issues.push({ path: `assets/devices/${id}/asset.json/power/distribution`, code: "power.distribution-required", message: "Power-storage devices must declare grid connection and coverage ranges" });
      if (asset.power.generation) issues.push({ path: `assets/devices/${id}/asset.json/power`, code: "power.storage-generation-exclusive", message: "One Device asset cannot declare both generation and storage" });
    }
    if (asset.logistics && !asset.capabilities.includes("transport")) issues.push({ path: `assets/devices/${id}/asset.json/logistics`, code: "capability.not-transport", message: "Logistics roles require transport capability" });
    if (asset.logistics && new Set(asset.logistics.roles).size !== asset.logistics.roles.length) issues.push({ path: `assets/devices/${id}/asset.json/logistics/roles`, code: "logistics.duplicate-role", message: "Logistics roles must be unique" });
    if (asset.logistics?.roles.includes("carrier") && !asset.logistics.carrierKinds) issues.push({ path: `assets/devices/${id}/asset.json/logistics/carrierKinds`, code: "logistics.carrier-kinds-required", message: "Carrier role requires supported network kinds" });
    if (asset.logistics?.roles.includes("carrier") && !asset.logistics.missionEnergy) issues.push({ path: `assets/devices/${id}/asset.json/logistics/missionEnergy`, code: "logistics.carrier-energy-required", message: "Carrier role requires an explicit mission-energy model" });
    if (asset.logistics?.carrierKinds && !asset.logistics.roles.includes("carrier")) issues.push({ path: `assets/devices/${id}/asset.json/logistics/carrierKinds`, code: "logistics.carrier-role-required", message: "Carrier kinds require carrier role" });
    if (asset.logistics?.missionEnergy && !asset.logistics.roles.includes("carrier")) issues.push({ path: `assets/devices/${id}/asset.json/logistics/missionEnergy`, code: "logistics.carrier-role-required", message: "Mission energy requires the carrier role" });
    if (asset.logistics?.highSpeedMission && !asset.logistics.roles.includes("carrier")) issues.push({ path: `assets/devices/${id}/asset.json/logistics/highSpeedMission`, code: "logistics.carrier-role-required", message: "High-speed mission capability requires the carrier role" });
    if (asset.logistics?.highSpeedMission) {
      const highSpeed = asset.logistics.highSpeedMission;
      if (highSpeed.durationMultiplier.numerator >= highSpeed.durationMultiplier.denominator) issues.push({
        path: `assets/devices/${id}/asset.json/logistics/highSpeedMission/durationMultiplier`, code: "logistics.high-speed-duration",
        message: "High-speed mission duration multiplier must be below one",
      });
      if (highSpeed.energyMultiplier.numerator <= highSpeed.energyMultiplier.denominator) issues.push({
        path: `assets/devices/${id}/asset.json/logistics/highSpeedMission/energyMultiplier`, code: "logistics.high-speed-energy",
        message: "High-speed mission energy multiplier must be above one",
      });
    }
    const endpointRoles = asset.logistics?.roles.some((role) => role === "loader" || role === "unloader") ?? false;
    if (endpointRoles && !asset.logistics?.endpointRange) issues.push({ path: `assets/devices/${id}/asset.json/logistics/endpointRange`, code: "logistics.endpoint-range-required", message: "Loader and unloader roles require an explicit physical endpoint range" });
    if (!endpointRoles && asset.logistics?.endpointRange) issues.push({ path: `assets/devices/${id}/asset.json/logistics/endpointRange`, code: "logistics.endpoint-role-required", message: "Endpoint range requires a loader or unloader role" });
    if (asset.logistics?.endpointRange && asset.logistics.endpointRange.minimum > asset.logistics.endpointRange.maximum) issues.push({ path: `assets/devices/${id}/asset.json/logistics/endpointRange`, code: "logistics.endpoint-range-order", message: "Endpoint range minimum must not exceed maximum" });
    if (asset.capabilities.includes("transport") && !asset.logistics) issues.push({ path: `assets/devices/${id}/asset.json/logistics`, code: "logistics.roles-required", message: "Transport capability requires explicit logistics roles" });
    if (asset.capabilities.includes("transport") && !asset.program.planTransport) issues.push({ path: `assets/devices/${id}/${asset.runtime.entry}`, code: "runtime.missing-transport-hook", message: "Transport capability requires planTransport(context)" });
    if (asset.logisticsStation) {
      if (!asset.capabilities.includes("station")) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation`, code: "capability.not-station", message: "Logistics station specification requires station capability" });
      if (new Set(asset.logisticsStation.networkKinds).size !== asset.logisticsStation.networkKinds.length) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation/networkKinds`, code: "station.duplicate-kind", message: "Station network kinds must be unique" });
      const buffer = asset.buffers.find((item) => item.id === asset.logisticsStation!.buffer);
      if (!buffer) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation/buffer`, code: "reference.buffer", message: `Unknown station buffer '${asset.logisticsStation.buffer}'` });
      else if (buffer.role !== "internal") issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation/buffer`, code: "station.buffer-role", message: "Station buffer must use internal role for local input and output" });
      const chargingEnvelope = asset.power.activeMilliWatts - asset.power.idleMilliWatts;
      if (asset.logisticsStation.maximumChargeMilliWatts > chargingEnvelope) issues.push({
        path: `assets/devices/${id}/asset.json/logisticsStation/maximumChargeMilliWatts`, code: "station.charge-power-envelope",
        message: `Station maximum charge ${asset.logisticsStation.maximumChargeMilliWatts} mW exceeds its ${chargingEnvelope} mW active-minus-idle power envelope`,
      });
    }
    if (asset.capabilities.includes("station") && !asset.logisticsStation) issues.push({ path: `assets/devices/${id}/asset.json/logisticsStation`, code: "station.spec-required", message: "Station capability requires logisticsStation specification" });
  }
  return issues;
}

function validateRoutes(resources: Record<string, ResourceAsset>, processes: Record<string, IndustrialProcess>, routes: Record<string, ProductRoute>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const operationOwners = new Map<string, { route: string; step: string }>();
  for (const [routeId, route] of Object.entries(routes)) {
    const routePath = `routes/${routeId}.route.json`;
    const steps = new Map(route.steps.map((step) => [step.id, step]));
    if (steps.size !== route.steps.length) issues.push({ path: `${routePath}/steps`, code: "route.duplicate-step", message: `Route '${routeId}' has duplicate step ids` });
    const entry = resources[route.entry.resource];
    if (!entry?.tracking || entry.tracking.route !== routeId || entry.tracking.family !== route.family) issues.push({
      path: `${routePath}/entry/resource`, code: "route.entry-resource", message: `Route entry '${route.entry.resource}' must be a tracked '${route.family}' Resource assigned to '${routeId}'`,
    });
    if (!steps.has(route.entry.step)) issues.push({ path: `${routePath}/entry/step`, code: "route.entry-step", message: `Unknown entry step '${route.entry.step}'` });
    const inputsByStep = new Map<string, Set<string>>();
    const entryInputs = inputsByStep.get(route.entry.step) ?? new Set<string>(); entryInputs.add(route.entry.resource); inputsByStep.set(route.entry.step, entryInputs);
    let hasComplete = false;
    for (const [stepIndex, step] of route.steps.entries()) {
      const stepPath = `${routePath}/steps/${stepIndex}`;
      if (step.queueTime && new Set(step.queueTime.violationDefects).size !== step.queueTime.violationDefects.length) issues.push({
        path: `${stepPath}/queueTime/violationDefects`, code: "route.queue-time-duplicate-defect", message: `Step '${step.id}' declares a queue-time defect more than once`,
      });
      const declaredOutputs = new Set(step.operations.flatMap((operationId) => {
        const operation = processes[operationId];
        if (!operation) return [];
        return [...operation.outputs.map((amount) => amount.resource), ...(operation.quality?.kind === "inspection"
          ? [operation.quality.rejectResource, ...(operation.quality.scrapResource ? [operation.quality.scrapResource] : [])] : [])];
      }));
      if (new Set(step.operations).size !== step.operations.length) issues.push({ path: `${stepPath}/operations`, code: "route.duplicate-operation", message: `Step '${step.id}' lists an operation more than once` });
      if (new Set(step.transitions.map((transition) => transition.resource)).size !== step.transitions.length) issues.push({ path: `${stepPath}/transitions`, code: "route.duplicate-transition", message: `Step '${step.id}' has duplicate output transitions` });
      for (const [transitionIndex, transition] of step.transitions.entries()) {
        const path = `${stepPath}/transitions/${transitionIndex}`;
        const resource = resources[transition.resource];
        if (!declaredOutputs.has(transition.resource)) issues.push({ path: `${path}/resource`, code: "route.transition-output", message: `No operation in step '${step.id}' can output '${transition.resource}'` });
        if (!resource?.tracking || resource.tracking.route !== routeId || resource.tracking.family !== route.family) issues.push({
          path: `${path}/resource`, code: "route.transition-resource", message: `Transition Resource '${transition.resource}' must track '${route.family}' on Route '${routeId}'`,
        });
        if (transition.to) {
          if (!steps.has(transition.to)) issues.push({ path: `${path}/to`, code: "route.transition-step", message: `Unknown next step '${transition.to}'` });
          const inputs = inputsByStep.get(transition.to) ?? new Set<string>(); inputs.add(transition.resource); inputsByStep.set(transition.to, inputs);
        } else if (transition.terminal === "complete") hasComplete = true;
      }
      for (const [operationIndex, operationId] of step.operations.entries()) {
        const operation = processes[operationId];
        if (!operation) { issues.push({ path: `${stepPath}/operations/${operationIndex}`, code: "reference.process", message: `Unknown Process '${operationId}'` }); continue; }
        const previous = operationOwners.get(operationId);
        if (previous) issues.push({ path: `${stepPath}/operations/${operationIndex}`, code: "route.operation-owner", message: `Process '${operationId}' already belongs to '${previous.route}/${previous.step}'` });
        else operationOwners.set(operationId, { route: routeId, step: step.id });
        for (const amount of [...operation.inputs, ...operation.outputs]) {
          const tracking = resources[amount.resource]?.tracking;
          if (tracking && (tracking.route !== routeId || tracking.family !== route.family)) issues.push({
            path: `${stepPath}/operations/${operationIndex}`, code: "route.operation-family", message: `Process '${operationId}' touches tracked Resource '${amount.resource}' outside Route '${routeId}' family '${route.family}'`,
          });
        }
        const actualOutputs = [...operation.outputs.map((amount) => amount.resource)];
        if (operation.quality?.kind === "inspection") actualOutputs.push(operation.quality.rejectResource, ...(operation.quality.scrapResource ? [operation.quality.scrapResource] : []));
        for (const output of actualOutputs.filter((resource) => resources[resource]?.tracking?.family === route.family)) if (!step.transitions.some((transition) => transition.resource === output)) issues.push({
          path: `${stepPath}/transitions`, code: "route.output-transition", message: `Process '${operationId}' can output '${output}', but step '${step.id}' has no matching transition`,
        });
      }
    }
    if (!hasComplete) issues.push({ path: `${routePath}/steps`, code: "route.complete-terminal", message: `Route '${routeId}' has no complete terminal` });
    for (const [stepIndex, step] of route.steps.entries()) for (const operationId of step.operations) {
      const operation = processes[operationId]; if (!operation) continue;
      const allowedInputs = inputsByStep.get(step.id) ?? new Set<string>();
      for (const input of operation.inputs.filter((amount) => resources[amount.resource]?.tracking?.family === route.family)) if (!allowedInputs.has(input.resource)) issues.push({
        path: `${routePath}/steps/${stepIndex}/operations`, code: "route.input-resource", message: `Process '${operationId}' consumes '${input.resource}', which cannot enter step '${step.id}'`,
      });
    }
    const reachable = new Set<string>(); const pending = [route.entry.step];
    while (pending.length) { const id = pending.pop()!; if (reachable.has(id)) continue; reachable.add(id); for (const transition of steps.get(id)?.transitions ?? []) if (transition.to) pending.push(transition.to); }
    for (const step of route.steps) if (!reachable.has(step.id)) issues.push({ path: `${routePath}/steps`, code: "route.unreachable-step", message: `Step '${step.id}' is unreachable from '${route.entry.step}'` });
  }
  for (const [resourceId, resource] of Object.entries(resources)) if (resource.tracking) {
    const route = routes[resource.tracking.route];
    if (!route) issues.push({ path: `assets/resources/${resourceId}/asset.json/tracking/route`, code: "reference.route", message: `Unknown Route '${resource.tracking.route}'` });
    else if (route.family !== resource.tracking.family) issues.push({ path: `assets/resources/${resourceId}/asset.json/tracking`, code: "route.family", message: `Resource family '${resource.tracking.family}' does not match Route family '${route.family}'` });
  }
  for (const [processId, process] of Object.entries(processes)) if ([...process.inputs, ...process.outputs].some((amount) => resources[amount.resource]?.tracking) && !operationOwners.has(processId)) issues.push({
    path: `processes/${processId}.process.json`, code: "route.process-unassigned", message: `Tracked Process '${processId}' must belong to exactly one Route step`,
  });
  return issues;
}

function centerDistance(left: CompiledDevice, right: CompiledDevice): number {
  const lx = left.position.x + left.footprint.width / 2; const ly = left.position.y + left.footprint.height / 2;
  const rx = right.position.x + right.footprint.width / 2; const ry = right.position.y + right.footprint.height / 2;
  return Math.hypot(lx - rx, ly - ry);
}

function compilePowerGrids(devices: Record<string, CompiledDevice>): Record<string, CompiledPowerGrid> {
  const distributors = Object.values(devices).filter((device) => device.assetDef.power.distribution).sort((a, b) => a.id.localeCompare(b.id));
  const parent = new Map(distributors.map((device) => [device.id, device.id]));
  const find = (id: string): string => {
    const current = parent.get(id)!;
    if (current === id) return current;
    const root = find(current); parent.set(id, root); return root;
  };
  const union = (left: string, right: string): void => {
    const a = find(left); const b = find(right);
    if (a === b) return;
    if (a.localeCompare(b) < 0) parent.set(b, a); else parent.set(a, b);
  };
  for (let i = 0; i < distributors.length; i++) for (let j = i + 1; j < distributors.length; j++) {
    const left = distributors[i]!; const right = distributors[j]!;
    if (left.region !== right.region) continue;
    const reach = Math.min(left.assetDef.power.distribution!.connectionRange, right.assetDef.power.distribution!.connectionRange);
    if (centerDistance(left, right) <= reach) union(left.id, right.id);
  }

  const components = new Map<string, CompiledDevice[]>();
  for (const distributor of distributors) {
    const members = components.get(find(distributor.id)) ?? [];
    members.push(distributor); components.set(find(distributor.id), members);
  }
  const grids: Record<string, CompiledPowerGrid> = {};
  const gridDistributors = [...components.values()].map((members) => {
    members.sort((a, b) => a.id.localeCompare(b.id));
    const region = members[0]!.region;
    const id = `grid-${region}-${members[0]!.id}`;
    grids[id] = {
      id, region, distributors: members.map((device) => device.id), members: [], transportStages: [], productionMilliWatts: 0,
      idleConsumptionMilliWatts: 0, ratedConsumptionMilliWatts: 0,
      storageDevices: [], storageCapacityMilliJoules: 0, storageChargeMilliWatts: 0, storageDischargeMilliWatts: 0,
    };
    return { id, members };
  }).sort((a, b) => a.id.localeCompare(b.id));

  for (const device of Object.values(devices).sort((a, b) => a.id.localeCompare(b.id))) {
    if (device.transportEndpoint) continue;
    const candidates = gridDistributors.flatMap((grid) => {
      if (grids[grid.id]!.region !== device.region) return [];
      const distances = grid.members.map((distributor) => ({
        distributor,
        distance: centerDistance(device, distributor),
      })).filter((candidate) => candidate.distance <= candidate.distributor.assetDef.power.distribution!.coverageRange);
      if (!distances.length) return [];
      distances.sort((a, b) => a.distance - b.distance || a.distributor.id.localeCompare(b.distributor.id));
      return [{ grid: grid.id, distance: distances[0]!.distance }];
    }).sort((a, b) => a.distance - b.distance || a.grid.localeCompare(b.grid));
    if (!candidates.length) continue;
    const grid = grids[candidates[0]!.grid]!;
    device.powerGrid = grid.id;
    grid.members.push(device.id);
    grid.productionMilliWatts += device.assetDef.power.generation?.outputMilliWatts ?? 0;
    grid.idleConsumptionMilliWatts += device.assetDef.power.idleMilliWatts;
    grid.ratedConsumptionMilliWatts += device.processPlans.length
      ? Math.max(device.assetDef.production?.maintenance?.powerMilliWatts ?? 0,
        device.assetDef.production?.maintenance?.qualification.powerMilliWatts ?? 0,
        ...device.processPlans.map((plan) => Math.max(maximumDriftPower(device.assetDef, plan.powerMilliWatts), plan.changeoverPowerMilliWatts ?? 0)))
      : device.stationEnergyPlan ? device.assetDef.power.idleMilliWatts + device.stationEnergyPlan.chargeMilliWatts : device.assetDef.power.activeMilliWatts;
    if (device.storagePlan) {
      grid.storageDevices.push(device.id);
      grid.storageCapacityMilliJoules += device.storagePlan.capacityMilliJoules;
      grid.storageChargeMilliWatts += device.storagePlan.chargeMilliWatts;
      grid.storageDischargeMilliWatts += device.storagePlan.dischargeMilliWatts;
    }
  }
  return grids;
}

function powerGridAtPosition(
  powerGrids: Record<string, CompiledPowerGrid>, devices: Record<string, CompiledDevice>, region: string, position: { x: number; y: number },
): string | undefined {
  return Object.values(powerGrids).filter((grid) => grid.region === region).flatMap((grid) => grid.distributors.flatMap((id) => {
    const distributor = devices[id]!;
    const distance = Math.hypot(position.x + .5 - (distributor.position.x + distributor.footprint.width / 2), position.y + .5 - (distributor.position.y + distributor.footprint.height / 2));
    return distance <= distributor.assetDef.power.distribution!.coverageRange ? [{ grid: grid.id, distributor: id, distance }] : [];
  })).sort((a, b) => a.distance - b.distance || a.distributor.localeCompare(b.distributor) || a.grid.localeCompare(b.grid))[0]?.grid;
}

function compileStationSlotContracts(
  definitions: BlueprintLogisticsNetwork[], devices: Record<string, CompiledDevice>, resources: Record<string, ResourceAsset>, issues: ValidationIssue[],
): void {
  const configured = new Map<string, {
    device: CompiledDevice;
    buffer: string;
    resources: Map<string, { capacity: number; path: string }>;
  }>();
  for (const [networkIndex, network] of definitions.entries()) for (const [stationIndex, station] of network.stations.entries()) {
    const device = devices[station.device];
    const spec = device?.assetDef.logisticsStation;
    if (!device || !spec?.networkKinds.includes(network.kind)) continue;
    const stationPath = `blueprint/logisticsNetworks/${networkIndex}/stations/${stationIndex}`;
    const buffer = device.buffers[spec.buffer];
    if (!buffer) continue;
    const contract = configured.get(device.id) ?? { device, buffer: spec.buffer, resources: new Map() };
    configured.set(device.id, contract);
    for (const [slotIndex, slot] of station.slots.entries()) {
      const path = `${stationPath}/slots/${slotIndex}`;
      if (!resources[slot.resource]) continue;
      if (!buffer.accepts.includes("*") && !buffer.accepts.includes(slot.resource)) continue;
      const existing = contract.resources.get(slot.resource);
      if (existing && existing.capacity !== slot.capacity) {
        issues.push({
          path: `${path}/capacity`, code: "station.slot-capacity-conflict",
          message: `Station '${device.id}' configures '${slot.resource}' with conflicting capacities ${existing.capacity} and ${slot.capacity}`,
        });
        continue;
      }
      if (!existing) contract.resources.set(slot.resource, { capacity: slot.capacity, path });
    }
  }
  for (const contract of [...configured.values()].sort((left, right) => left.device.id.localeCompare(right.device.id))) {
    const spec = contract.device.assetDef.logisticsStation!;
    const buffer = contract.device.buffers[contract.buffer]!;
    if (contract.resources.size > spec.slots) issues.push({
      path: `blueprint/devices/${contract.device.id}`, code: "station.slot-count",
      message: `Station '${contract.device.id}' exposes ${spec.slots} slots but configures ${contract.resources.size} unique Resources across logistics networks`,
    });
    const allocated = [...contract.resources.values()].reduce((sum, slot) => sum + slot.capacity, 0);
    if (allocated > buffer.capacity) issues.push({
      path: `blueprint/devices/${contract.device.id}`, code: "station.buffer-capacity",
      message: `Station '${contract.device.id}' allocates ${allocated} items across Resource slots, exceeding buffer '${buffer.id}' capacity ${buffer.capacity}`,
    });
    buffer.accepts = [...contract.resources.keys()].sort();
    buffer.resourceCapacities = Object.fromEntries([...contract.resources.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([resource, slot]) => [resource, slot.capacity]));
  }
}

function compileLogisticsNetworks(
  definitions: BlueprintLogisticsNetwork[], devices: Record<string, CompiledDevice>, assets: Record<string, DeviceAsset>,
  resources: Record<string, ResourceAsset>, regions: Record<string, WorldRegion>, defaultDispatch: DispatchPolicy, issues: ValidationIssue[],
): Record<string, CompiledLogisticsNetwork> {
  const networks: Record<string, CompiledLogisticsNetwork> = {};
  const ids = new Set<string>();
  for (const [networkIndex, definition] of definitions.entries()) {
    const path = `blueprint/logisticsNetworks/${networkIndex}`;
    if (ids.has(definition.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate logistics network '${definition.id}'` });
    ids.add(definition.id);
    const stationIds = new Set<string>();
    const validStations: Array<{ definition: BlueprintLogisticsNetwork["stations"][number]; device: CompiledDevice; buffer: string; fleetAsset?: DeviceAsset }> = [];
    for (const [stationIndex, station] of definition.stations.entries()) {
      const stationPath = `${path}/stations/${stationIndex}`;
      if (stationIds.has(station.device)) issues.push({ path: `${stationPath}/device`, code: "station.duplicate-device", message: `Station '${station.device}' is listed more than once` });
      stationIds.add(station.device);
      const device = devices[station.device];
      if (!device) { issues.push({ path: `${stationPath}/device`, code: "reference.device-instance", message: `Unknown station device '${station.device}'` }); continue; }
      if (!regions[device.region]) continue;
      const spec = device.assetDef.logisticsStation;
      if (!spec || !spec.networkKinds.includes(definition.kind)) { issues.push({ path: `${stationPath}/device`, code: "station.network-kind", message: `Device '${station.device}' does not support '${definition.kind}' logistics` }); continue; }
      if (!station.fleet) {
        issues.push({ path: `${stationPath}/fleet`, code: "station.fleet-required", message: `Station '${station.device}' must explicitly configure its home fleet` });
        continue;
      }
      const fleetAsset = assets[station.fleet.deviceAsset];
      if (!fleetAsset) issues.push({ path: `${stationPath}/fleet/deviceAsset`, code: "reference.device", message: `Unknown carrier asset '${station.fleet.deviceAsset}'` });
      else if (!fleetAsset.logistics?.roles.includes("carrier") || !fleetAsset.logistics.carrierKinds?.includes(definition.kind)) {
        issues.push({ path: `${stationPath}/fleet/deviceAsset`, code: "logistics.carrier-kind", message: `Device '${fleetAsset.id}' cannot carry '${definition.kind}' traffic from station '${station.device}'` });
      }
      if (station.slots.length > spec.slots) issues.push({ path: `${stationPath}/slots`, code: "station.slot-capacity", message: `Station '${station.device}' exposes ${spec.slots} slots but configures ${station.slots.length}` });
      const slotResources = new Set<string>();
      for (const [slotIndex, slot] of station.slots.entries()) {
        const slotPath = `${stationPath}/slots/${slotIndex}`;
        if (slotResources.has(slot.resource)) issues.push({ path: `${slotPath}/resource`, code: "station.duplicate-resource", message: `Station '${station.device}' configures '${slot.resource}' more than once` });
        slotResources.add(slot.resource);
        if (!resources[slot.resource]) issues.push({ path: `${slotPath}/resource`, code: "reference.resource", message: `Unknown resource '${slot.resource}'` });
        const buffer = device.buffers[spec.buffer];
        if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(slot.resource)) issues.push({ path: `${slotPath}/resource`, code: "station.resource-contract", message: `Station buffer '${spec.buffer}' does not accept '${slot.resource}'` });
        if (slot.mode === "storage" && (slot.minimumBatch !== undefined || slot.priority !== undefined || slot.supplyReserve !== undefined || slot.demandTarget !== undefined)) issues.push({
          path: slotPath, code: "station.storage-policy",
          message: `Storage slot '${slot.resource}' on '${station.device}' cannot configure dispatch policy`,
        });
        if (slot.supplyReserve !== undefined && slot.mode !== "supply") issues.push({
          path: `${slotPath}/supplyReserve`, code: "station.supply-reserve-mode",
          message: `supplyReserve is valid only for a supply slot`,
        });
        if (slot.demandTarget !== undefined && slot.mode !== "demand") issues.push({
          path: `${slotPath}/demandTarget`, code: "station.demand-target-mode",
          message: `demandTarget is valid only for a demand slot`,
        });
        if (slot.mode === "supply" && (slot.supplyReserve ?? 0) >= slot.capacity) issues.push({
          path: `${slotPath}/supplyReserve`, code: "station.supply-reserve",
          message: `Supply reserve ${slot.supplyReserve ?? 0} must be below '${slot.resource}' slot capacity ${slot.capacity}`,
        });
        if (slot.mode === "demand" && (slot.demandTarget ?? slot.capacity) > slot.capacity) issues.push({
          path: `${slotPath}/demandTarget`, code: "station.demand-target",
          message: `Demand target ${slot.demandTarget} exceeds '${slot.resource}' slot capacity ${slot.capacity}`,
        });
        const policyCapacity = slot.mode === "supply" ? slot.capacity - (slot.supplyReserve ?? 0)
          : slot.mode === "demand" ? (slot.demandTarget ?? slot.capacity) : 0;
        if (slot.mode !== "storage" && slot.minimumBatch !== undefined && slot.minimumBatch > policyCapacity) issues.push({
          path: `${slotPath}/minimumBatch`, code: "station.minimum-batch-slot",
          message: `Station '${station.device}' minimum batch ${slot.minimumBatch} exceeds '${slot.resource}' dispatchable capacity ${policyCapacity}`,
        });
      }
      validStations.push({ definition: station, device, buffer: spec.buffer, fleetAsset });
    }
    const stationRegions = new Set(validStations.map((station) => station.device.region));
    if (definition.kind === "local" && stationRegions.size > 1) issues.push({ path: `${path}/stations`, code: "station.local-cross-region", message: `Local network '${definition.id}' cannot cross industrial zones` });
    if (definition.kind === "inter-zone" && stationRegions.size < 2) issues.push({ path: `${path}/stations`, code: "station.inter-zone-single-region", message: `Inter-zone network '${definition.id}' must include stations in at least two industrial zones` });
    const routes: CompiledLogisticsNetwork["routes"] = [];
    for (const supply of validStations) for (const supplySlot of supply.definition.slots.filter((slot) => slot.mode === "supply")) {
      const fleetAsset = supply.fleetAsset;
      if (!fleetAsset?.logistics?.roles.includes("carrier") || !fleetAsset.logistics.carrierKinds?.includes(definition.kind) || !fleetAsset.logistics.missionEnergy) continue;
      for (const demand of validStations) for (const demandSlot of demand.definition.slots.filter((slot) => slot.mode === "demand" && slot.resource === supplySlot.resource)) {
        if (supply.device.id === demand.device.id) continue;
        const crossesRegions = supply.device.region !== demand.device.region;
        if ((definition.kind === "local" && crossesRegions) || (definition.kind === "inter-zone" && !crossesRegions)) continue;
        const id = `${definition.id}:${supplySlot.resource}:${supply.device.id}->${demand.device.id}`;
        const supplyRegion = regions[supply.device.region]!;
        const demandRegion = regions[demand.device.region]!;
        const distance = Math.max(1,
          Math.abs(supplyRegion.coordinates.x + supply.device.position.x - demandRegion.coordinates.x - demand.device.position.x)
          + Math.abs(supplyRegion.coordinates.y - demandRegion.coordinates.y)
          + Math.abs(supplyRegion.coordinates.z + supply.device.position.y - demandRegion.coordinates.z - demand.device.position.y),
        );
        const plan = planDeviceTransport(fleetAsset.id, fleetAsset.program, { apiVersion: 1, connection: id, stage: "carrier", distance });
        const minimumBatch = Math.max(supplySlot.minimumBatch ?? 1, demandSlot.minimumBatch ?? 1);
        if (minimumBatch > plan.capacity) issues.push({ path, code: "station.minimum-batch", message: `Route '${id}' minimum batch ${minimumBatch} exceeds carrier capacity ${plan.capacity}` });
        const supplyReserve = supplySlot.supplyReserve ?? 0;
        const demandTarget = demandSlot.demandTarget ?? demandSlot.capacity;
        const capacity = Math.max(0, Math.min(plan.capacity, supplySlot.capacity - supplyReserve, demandTarget));
        const standardMissionEnergyMilliJoules = fleetAsset.logistics.missionEnergy!.baseMilliJoules
          + distance * fleetAsset.logistics.missionEnergy!.milliJoulesPerDistance;
        const highSpeedSpec = fleetAsset.logistics.highSpeedMission;
        const highSpeedPolicy = supply.device.policy?.highSpeedTransport;
        const highSpeedEnabled = Boolean(highSpeedSpec && highSpeedPolicy?.enabled && distance >= highSpeedPolicy.minimumDistance);
        if (highSpeedPolicy?.enabled && !highSpeedSpec) issues.push({
          path, code: "station.high-speed-unsupported",
          message: `Source station '${supply.device.id}' enables high-speed transport, but carrier '${fleetAsset.id}' has no high-speed mission envelope`,
        });
        const highSpeed = highSpeedSpec ? {
          enabled: highSpeedEnabled,
          travelTicks: Math.max(1, Math.ceil(plan.durationTicks * highSpeedSpec.durationMultiplier.numerator / highSpeedSpec.durationMultiplier.denominator)),
          roundTripTicks: Math.max(2, Math.ceil(plan.durationTicks * highSpeedSpec.durationMultiplier.numerator / highSpeedSpec.durationMultiplier.denominator) * 2),
          missionEnergyMilliJoules: Math.max(1, Math.ceil(standardMissionEnergyMilliJoules * highSpeedSpec.energyMultiplier.numerator / highSpeedSpec.energyMultiplier.denominator)),
        } : undefined;
        routes.push({
          id, network: definition.id, resource: supplySlot.resource,
          from: supply.device.id, to: demand.device.id, fromRegion: supply.device.region, toRegion: demand.device.region,
          fromBuffer: supply.buffer, toBuffer: demand.buffer,
          fromSlotCapacity: supplySlot.capacity, toSlotCapacity: demandSlot.capacity,
          supplyReserve, demandTarget,
          supplyPriority: supplySlot.priority ?? 0, demandPriority: demandSlot.priority ?? 0,
          minimumBatch, distance, carrierCapacity: plan.capacity, carrierAsset: fleetAsset.id, fleetSize: supply.definition.fleet.count, capacity,
          standardTravelTicks: plan.durationTicks,
          standardRoundTripTicks: plan.durationTicks * 2,
          standardMissionEnergyMilliJoules,
          travelTicks: highSpeedEnabled ? highSpeed!.travelTicks : plan.durationTicks,
          roundTripTicks: highSpeedEnabled ? highSpeed!.roundTripTicks : plan.durationTicks * 2,
          missionEnergyMilliJoules: highSpeedEnabled ? highSpeed!.missionEnergyMilliJoules : standardMissionEnergyMilliJoules,
          ...(highSpeed ? { highSpeed } : {}),
        });
      }
    }
    networks[definition.id] = {
      id: definition.id, kind: definition.kind, dispatchPolicy: definition.dispatch ?? defaultDispatch,
      fleets: validStations.filter((station): station is typeof station & { fleetAsset: DeviceAsset } => Boolean(station.fleetAsset)).map((station) => ({
        station: station.device.id, region: station.device.region, asset: station.fleetAsset, count: station.definition.fleet.count,
      })).sort((a, b) => a.station.localeCompare(b.station)),
      stations: structuredClone(definition.stations), routes,
    };
  }
  return networks;
}

export function compileFactoryProject(loaded: LoadedFactoryProject): CompiledFactoryProject {
  const issues = [...validateAssets(loaded.resources, loaded.processes, loaded.deviceAssets), ...validateRoutes(loaded.resources, loaded.processes, loaded.routes)];
  const regions: Record<string, WorldRegion> = {};
  for (const [index, region] of loaded.world.regions.entries()) {
    if (regions[region.id]) issues.push({ path: `world/regions/${index}/id`, code: "reference.duplicate", message: `Duplicate region '${region.id}'` });
    regions[region.id] = structuredClone(region);
  }
  const resourceNodes: Record<string, WorldResourceNode> = {};
  for (const [index, node] of loaded.world.resourceNodes.entries()) {
    const path = `world/resourceNodes/${index}`;
    if (resourceNodes[node.id]) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate resource node '${node.id}'` });
    resourceNodes[node.id] = structuredClone(node);
    const region = regions[node.region];
    if (!region) issues.push({ path: `${path}/region`, code: "reference.region", message: `Unknown region '${node.region}'` });
    else if (node.position.x >= region.bounds.width || node.position.y >= region.bounds.height) issues.push({ path: `${path}/position`, code: "geometry.out-of-bounds", message: `Resource node '${node.id}' is outside region '${node.region}' bounds` });
    if (!loaded.resources[node.resource]) issues.push({ path: `${path}/resource`, code: "reference.resource", message: `Unknown resource '${node.resource}'` });
    else if (loaded.resources[node.resource]!.tracking) issues.push({ path: `${path}/resource`, code: "lot.extraction", message: `Tracked Resource '${node.resource}' must enter through explicit Scenario lots, not a fungible resource node` });
  }
  const devices: Record<string, CompiledDevice> = {};
  const ids = new Set<string>();
  for (const [index, instance] of loaded.blueprint.devices.entries()) {
    const path = `blueprints/${loaded.manifest.defaultBlueprint}/devices/${index}`;
    if (ids.has(instance.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate device instance '${instance.id}'` });
    ids.add(instance.id);
    const asset = loaded.deviceAssets[instance.asset];
    if (!asset) { issues.push({ path: `${path}/asset`, code: "reference.device", message: `Unknown device asset '${instance.asset}'` }); continue; }
    const region = regions[instance.region];
    if (!region) issues.push({ path: `${path}/region`, code: "reference.region", message: `Unknown region '${instance.region}'` });
    if (!asset.geometry.rotatable && instance.rotation !== 0) issues.push({ path: `${path}/rotation`, code: "geometry.rotation", message: `Device '${instance.asset}' is not rotatable` });
    const footprint = rotatedFootprint(asset, instance.rotation);
    const endpointRoles = asset.logistics?.roles.filter((role): role is "loader" | "unloader" => role === "loader" || role === "unloader") ?? [];
    const dedicatedEndpoint = endpointRoles.length > 0 && asset.geometry.ports.length === 0
      && !asset.logistics?.roles.some((role) => role === "line" || role === "carrier");
    if (instance.transportEndpoint) {
      if (!asset.capabilities.includes("transport") || !endpointRoles.includes(instance.transportEndpoint.stage)) issues.push({
        path: `${path}/transportEndpoint/stage`, code: "logistics.endpoint-role",
        message: `Device asset '${asset.id}' cannot serve as logistics ${instance.transportEndpoint.stage}`,
      });
      const materialPolicy = instance.policy?.dispatch || instance.policy?.inputPriority || instance.policy?.outputPriority || instance.policy?.filter;
      if (instance.recipe || instance.treatment || instance.resourceNodes || instance.bufferFilters || instance.portFilters || materialPolicy) issues.push({
        path: `${path}/transportEndpoint`, code: "logistics.endpoint-exclusive",
        message: "A transport endpoint attachment cannot also configure production, treatment, extraction, material filters, or material dispatch policy",
      });
    } else if (dedicatedEndpoint) issues.push({
      path: `${path}/transportEndpoint`, code: "logistics.endpoint-binding-required",
      message: `Sorter-like Device '${instance.id}' requires an explicit connection endpoint binding`,
    });
    if (region && (instance.position.x + footprint.width > region.bounds.width || instance.position.y + footprint.height > region.bounds.height)) {
      issues.push({ path: `${path}/position`, code: "geometry.out-of-bounds", message: `Footprint ${footprint.width}x${footprint.height} at (${instance.position.x},${instance.position.y}) exceeds region '${region.id}' ${region.bounds.width}x${region.bounds.height} bounds` });
    }
    for (const message of validateDeviceConfig(asset.id, asset.program, instance.config ?? {})) {
      issues.push({ path: `${path}/config`, code: "runtime.invalid-config", message });
    }
    if (instance.policy?.inputPriority) {
      const port = asset.geometry.ports.find((item) => item.id === instance.policy!.inputPriority);
      if (!port || port.direction !== "input") issues.push({ path: `${path}/policy/inputPriority`, code: "policy.input-priority-port", message: `Input priority must name an input port on '${asset.id}'` });
    }
    if (instance.policy?.outputPriority) {
      const port = asset.geometry.ports.find((item) => item.id === instance.policy!.outputPriority);
      if (!port || port.direction !== "output") issues.push({ path: `${path}/policy/outputPriority`, code: "policy.output-priority-port", message: `Output priority must name an output port on '${asset.id}'` });
    }
    const stationSpec = asset.logisticsStation;
    const stationCharge = instance.policy?.stationChargeMilliWatts;
    const highSpeedTransport = instance.policy?.highSpeedTransport;
    if (stationSpec && stationCharge === undefined) issues.push({
      path: `${path}/policy/stationChargeMilliWatts`, code: "station.charge-power-required",
      message: `Station '${instance.id}' requires an explicit Blueprint charge-power setting`,
    });
    if (!stationSpec && stationCharge !== undefined) issues.push({
      path: `${path}/policy/stationChargeMilliWatts`, code: "station.charge-policy-device",
      message: `Device '${instance.id}' is not a logistics station`,
    });
    if (stationSpec && stationCharge !== undefined && stationCharge > stationSpec.maximumChargeMilliWatts) issues.push({
      path: `${path}/policy/stationChargeMilliWatts`, code: "station.charge-power-maximum",
      message: `Station charge ${stationCharge} mW exceeds '${asset.id}' maximum ${stationSpec.maximumChargeMilliWatts} mW`,
    });
    if (stationSpec && highSpeedTransport === undefined) issues.push({
      path: `${path}/policy/highSpeedTransport`, code: "station.high-speed-policy-required",
      message: `Station '${instance.id}' requires an explicit high-speed transport policy`,
    });
    if (!stationSpec && highSpeedTransport !== undefined) issues.push({
      path: `${path}/policy/highSpeedTransport`, code: "station.high-speed-policy-device",
      message: `Device '${instance.id}' is not a logistics station`,
    });
    if (instance.policy?.filter) {
      const port = asset.geometry.ports.find((item) => item.id === instance.policy!.filter!.outputPort);
      if (!port || port.direction !== "output") issues.push({ path: `${path}/policy/filter/outputPort`, code: "policy.filter-output-port", message: `Filter must name an output port on '${asset.id}'` });
      if (!loaded.resources[instance.policy.filter.resource]) issues.push({ path: `${path}/policy/filter/resource`, code: "reference.resource", message: `Unknown filter resource '${instance.policy.filter.resource}'` });
      const buffer = port ? asset.buffers.find((item) => item.id === port.buffer) : undefined;
      if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(instance.policy.filter.resource)) issues.push({ path: `${path}/policy/filter/resource`, code: "policy.filter-resource-contract", message: `Output port '${port!.id}' cannot carry '${instance.policy.filter.resource}'` });
    }
    const effectiveBuffers = Object.fromEntries(asset.buffers.map((buffer) => [buffer.id, { ...buffer, accepts: [...buffer.accepts] }]));
    for (const [bufferId, resources] of Object.entries(instance.bufferFilters ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      const filterPath = `${path}/bufferFilters/${bufferId}`;
      const buffer = asset.buffers.find((item) => item.id === bufferId);
      if (!buffer) {
        issues.push({ path: filterPath, code: "reference.buffer", message: `Unknown filtered buffer '${bufferId}' on Device '${asset.id}'` });
        continue;
      }
      const accepted: string[] = []; const seen = new Set<string>();
      for (const [resourceIndex, resource] of resources.entries()) {
        const resourcePath = `${filterPath}/${resourceIndex}`;
        if (seen.has(resource)) issues.push({ path: resourcePath, code: "buffer-filter.duplicate-resource", message: `Buffer filter '${bufferId}' lists '${resource}' more than once` });
        seen.add(resource);
        if (!loaded.resources[resource]) {
          issues.push({ path: resourcePath, code: "reference.resource", message: `Unknown filtered Resource '${resource}'` });
          continue;
        }
        if (!buffer.accepts.includes("*") && !buffer.accepts.includes(resource)) {
          issues.push({ path: resourcePath, code: "buffer-filter.resource-contract", message: `Buffer '${bufferId}' on '${asset.id}' cannot be configured to accept '${resource}'` });
          continue;
        }
        accepted.push(resource);
      }
      effectiveBuffers[bufferId] = { ...effectiveBuffers[bufferId]!, accepts: [...new Set(accepted)].sort() };
    }
    const effectivePorts = asset.geometry.ports.map((port) => ({
      ...port,
      accepts: [...(effectiveBuffers[port.buffer]?.accepts ?? [])],
    })) as CompiledDevice["ports"];
    for (const [portId, resources] of Object.entries(instance.portFilters ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
      const filterPath = `${path}/portFilters/${portId}`;
      const port = effectivePorts.find((item) => item.id === portId);
      const assetPort = asset.geometry.ports.find((item) => item.id === portId);
      const maximumBuffer = assetPort ? asset.buffers.find((item) => item.id === assetPort.buffer) : undefined;
      const effectiveBuffer = assetPort ? effectiveBuffers[assetPort.buffer] : undefined;
      if (!port || !maximumBuffer || !effectiveBuffer) {
        issues.push({ path: filterPath, code: "reference.port", message: `Unknown filtered port '${portId}' on Device '${asset.id}'` });
        continue;
      }
      const accepted: ResourceId[] = []; const seen = new Set<ResourceId>();
      for (const [resourceIndex, resource] of resources.entries()) {
        const resourcePath = `${filterPath}/${resourceIndex}`;
        if (seen.has(resource)) issues.push({ path: resourcePath, code: "port-filter.duplicate-resource", message: `Port filter '${portId}' lists '${resource}' more than once` });
        seen.add(resource);
        if (!loaded.resources[resource]) {
          issues.push({ path: resourcePath, code: "reference.resource", message: `Unknown filtered Resource '${resource}'` });
          continue;
        }
        if (!maximumBuffer.accepts.includes("*") && !maximumBuffer.accepts.includes(resource)) {
          issues.push({ path: resourcePath, code: "port-filter.resource-contract", message: `Port '${portId}' on '${asset.id}' cannot be configured to carry '${resource}'` });
          continue;
        }
        if (!effectiveBuffer.accepts.includes("*") && !effectiveBuffer.accepts.includes(resource)) {
          issues.push({ path: resourcePath, code: "port-filter.buffer-contract", message: `Port '${portId}' cannot expand configured buffer '${port.buffer}' to carry '${resource}'` });
          continue;
        }
        accepted.push(resource);
      }
      port.accepts = [...new Set(accepted)].sort();
    }
    if (instance.policy?.filter) {
      const port = effectivePorts.find((item) => item.id === instance.policy!.filter!.outputPort);
      const maximumBuffer = port ? asset.buffers.find((item) => item.id === port.buffer) : undefined;
      const resource = instance.policy.filter.resource;
      const permittedByAsset = maximumBuffer?.accepts.includes("*") || maximumBuffer?.accepts.includes(resource);
      if (port && permittedByAsset && !acceptsResource(port.accepts, resource)) {
        issues.push({ path: `${path}/policy/filter/resource`, code: "policy.filter-resource-filter", message: `Output port '${port.id}' instance filter excludes policy Resource '${resource}'` });
      }
    }
    let processPlan: CompiledDevice["processPlan"];
    const processPlans: CompiledDevice["processPlans"] = [];
    let treatmentPlan: CompiledDevice["treatmentPlan"];
    let extractionPlan: CompiledDevice["extractionPlan"];
    let generationPlan: CompiledDevice["generationPlan"];
    let storagePlan: CompiledDevice["storagePlan"];
    let stationEnergyPlan: CompiledDevice["stationEnergyPlan"];
    if (instance.recipe && instance.recipes) {
      issues.push({ path, code: "production.recipe-exclusive", message: "Device must declare either recipe or recipes, not both" });
    }
    const authoredRecipes = instance.recipes ?? (instance.recipe ? [instance.recipe] : []);
    if (authoredRecipes.length) {
      const seenOperations = new Set<string>();
      const portResources: Record<string, Set<ResourceId>> = {};
      const bufferRequirements: Record<string, Map<ResourceId, ResourceBufferQuantity>> = {};
      for (const [recipeIndex, recipe] of authoredRecipes.entries()) {
      const recipePath = instance.recipes ? `${path}/recipes/${recipeIndex}` : `${path}/recipe`;
      const definition = loaded.processes[recipe.process];
      if (!definition) issues.push({ path: `${recipePath}/process`, code: "reference.process", message: `Unknown process '${recipe.process}'` });
      if (!asset.production) issues.push({ path: recipePath, code: "production.unsupported", message: `Device asset '${asset.id}' does not support declarative recipes` });
      if (definition && asset.production) {
        let bindingValid = true;
        const mode = asset.production.modes.find((item) => item.id === recipe.mode);
        if (!mode) {
          issues.push({ path: `${recipePath}/mode`, code: "production-mode.unknown", message: `Device '${asset.id}' does not define production mode '${recipe.mode}'` });
          bindingValid = false;
        }
        if (!asset.production.categories.includes(definition.category)) {
          issues.push({ path: `${recipePath}/process`, code: "production.category", message: `Device '${asset.id}' does not support process category '${definition.category}'` });
          bindingValid = false;
        }
        if (!asset.production.processes.includes(definition.id)) {
          issues.push({
            path: `${recipePath}/process`, code: "production.process-qualification",
            message: `Device '${asset.id}' is not qualified for Process '${definition.id}'`,
          });
          bindingValid = false;
        }
        const compiledInputs = [] as NonNullable<CompiledDevice["processPlan"]>["inputs"];
        const compiledOutputs = [] as NonNullable<CompiledDevice["processPlan"]>["outputs"];
        const lotTransfers: NonNullable<CompiledDevice["processPlan"]>["lotTransfers"] = [];
        const compiledBindings = { inputs: {} as Record<ResourceId, string>, outputs: {} as Record<ResourceId, string> };
        const inspectionAlternatives = definition.quality?.kind === "inspection" ? [
          { resource: definition.quality.rejectResource, count: definition.outputs[0]!.count },
          ...(definition.quality.scrapResource ? [{ resource: definition.quality.scrapResource, count: definition.outputs[0]!.count }] : []),
        ] : [];
        for (const [side, amounts, bindings, allowedPorts, compiled, resolvedBindings] of [
          ["inputs", definition.inputs, recipe.inputs, asset.production.inputPorts, compiledInputs, compiledBindings.inputs],
          ["outputs", [...definition.outputs, ...inspectionAlternatives], recipe.outputs, asset.production.outputPorts, compiledOutputs, compiledBindings.outputs],
        ] as const) {
          const expected = new Set(amounts.map((amount) => amount.resource));
          for (const resource of Object.keys(bindings).sort()) if (!expected.has(resource)) {
            issues.push({ path: `${recipePath}/${side}/${resource}`, code: "recipe.extra-binding", message: `Recipe binds '${resource}' on ${side}, but process '${definition.id}' does not declare it` });
            bindingValid = false;
          }
          for (const amount of amounts) {
            const bindingPath = `${recipePath}/${side}/${amount.resource}`;
            const portId = bindings[amount.resource];
            if (!portId) {
              issues.push({ path: bindingPath, code: "recipe.binding-required", message: `Process '${definition.id}' requires a ${side} binding for '${amount.resource}'` });
              bindingValid = false;
              continue;
            }
            const port = effectivePorts.find((item) => item.id === portId);
            if (!port) {
              issues.push({ path: bindingPath, code: "reference.port", message: `Unknown recipe port '${portId}'` });
              bindingValid = false;
              continue;
            }
            if (!allowedPorts.includes(portId)) {
              issues.push({ path: bindingPath, code: "recipe.port-role", message: `Port '${portId}' is not declared as one of '${asset.id}' production ${side}` });
              bindingValid = false;
            }
            if (!acceptsResource(port.accepts, amount.resource)) {
              issues.push({ path: bindingPath, code: "recipe.resource-filter", message: `Port '${portId}' cannot accept '${amount.resource}' for process '${definition.id}'` });
              bindingValid = false;
            }
            resolvedBindings[amount.resource] = port.buffer;
            compiled.push({ buffer: port.buffer, ...amount });
          }
        }
        if (mode) {
          for (const input of mode.auxiliaryInputs) {
            const port = effectivePorts.find((item) => item.id === input.port);
            const buffer = port ? effectiveBuffers[port.buffer] : undefined;
            const processBinding = recipe.inputs[input.resource];
            if (processBinding && processBinding !== input.port) {
              issues.push({ path: `${recipePath}/mode`, code: "production-mode.ambiguous-port", message: `Production mode '${mode.id}' requires '${input.resource}' through '${input.port}', but the process binds it to '${processBinding}'` });
              bindingValid = false;
            }
            if (port && !acceptsResource(port.accepts, input.resource)) {
              issues.push({ path: `${recipePath}/mode`, code: "production-mode.resource-filter", message: `Production mode '${mode.id}' requires '${input.resource}' through port '${input.port}', but the instance filter excludes it` });
              bindingValid = false;
            }
            if (port && buffer) compiledBindings.inputs[input.resource] = port.buffer;
          }
          if (bindingValid) {
            const amounts = compileProductionAmounts(definition, mode, compiledBindings);
            compiledInputs.splice(0, compiledInputs.length, ...amounts.inputs);
            compiledOutputs.splice(0, compiledOutputs.length, ...amounts.outputs);
            const trackedInputs = compiledInputs.filter((amount) => loaded.resources[amount.resource]?.tracking);
            const trackedOutputs = compiledOutputs.filter((amount) => loaded.resources[amount.resource]?.tracking);
            for (const input of trackedInputs) {
              const family = loaded.resources[input.resource]!.tracking!.family;
              const outputs = trackedOutputs.filter((amount) => loaded.resources[amount.resource]!.tracking!.family === family);
              if (outputs.length !== 1 || input.count !== outputs[0]!.count) {
                issues.push({
                  path: `${recipePath}/mode`, code: "lot.mode-identity-count",
                  message: `Production mode '${mode.id}' must preserve each '${family}' lot identity one-for-one`,
                });
                bindingValid = false;
              } else lotTransfers.push({ family, input: { ...input }, output: { ...outputs[0]! } });
            }
            if (definition.quality?.kind === "inspection" && (lotTransfers.length !== 1 || lotTransfers[0]!.input.count !== 1 || lotTransfers[0]!.output.count !== 1)) {
              issues.push({
                path: `${recipePath}/mode`, code: "quality.inspection-single-lot",
                message: `Inspection Process '${definition.id}' must execute as one identity-preserving lot per Device job`,
              });
              bindingValid = false;
            }
            for (const bufferId of [...new Set([...compiledInputs, ...compiledOutputs].map((amount) => amount.buffer))]) {
              const amountsInBuffer = recipeBufferRequirements(bufferId, compiledInputs, compiledOutputs);
              const required = amountsInBuffer.reduce((sum, amount) => sum + amount.count, 0);
              const capacity = effectiveBuffers[bufferId]?.capacity;
              if (capacity !== undefined && required > capacity) {
                issues.push({ path: `${recipePath}/mode`, code: "production-mode.job-capacity", message: `Production mode '${mode.id}' requires ${required} total items in shared buffer '${bufferId}', exceeding capacity ${capacity}` });
                bindingValid = false;
              }
            }
          }
        }
        if (bindingValid && mode) {
          const operationKey = `${definition.id}\0${mode.id}`;
          if (seenOperations.has(operationKey)) {
            issues.push({ path: recipePath, code: "production.duplicate-operation", message: `Qualified operation '${definition.id}/${mode.id}' is declared more than once` });
          }
          seenOperations.add(operationKey);
          const passOutput = lotTransfers[0]?.output;
          const quality = definition.quality?.kind === "inspection" && passOutput ? {
            kind: "inspection" as const,
            detects: [...definition.quality.detects],
            passOutput: { ...passOutput },
            rejectOutput: {
              buffer: compiledBindings.outputs[definition.quality.rejectResource]!, resource: definition.quality.rejectResource,
              count: passOutput.count, treatmentLevel: passOutput.treatmentLevel,
            },
            ...(definition.quality.scrapResource ? { scrapOutput: {
              buffer: compiledBindings.outputs[definition.quality.scrapResource]!, resource: definition.quality.scrapResource,
              count: passOutput.count, treatmentLevel: passOutput.treatmentLevel,
            } } : {}),
            maxReworkCycles: definition.quality.maxReworkCycles ?? Number.MAX_SAFE_INTEGER,
          } : definition.quality?.kind === "rework" ? {
            kind: "rework" as const, repairs: [...definition.quality.repairs],
          } : undefined;
          const compiledPlan = {
            definition, mode,
            durationTicks: productionDurationTicks(definition, asset, mode),
            powerMilliWatts: productionPowerMilliWatts(asset, mode),
            inputs: compiledInputs,
            tooling: structuredClone(definition.tooling ?? []),
            toolingProviders: [],
            outputs: compiledOutputs,
            priority: recipe.priority ?? 0,
            lotTransfers,
            ...(quality ? { quality } : {}),
            ...(definition.setupGroup ? { setupGroup: definition.setupGroup } : {}),
            ...(asset.production.changeover ? {
              changeoverDurationTicks: asset.production.changeover.durationTicks,
              changeoverPowerMilliWatts: asset.production.changeover.powerMilliWatts,
            } : {}),
          };
          if (asset.production.changeover && !definition.setupGroup) issues.push({
            path: `${recipePath}/process`, code: "production.setup-group-required",
            message: `Setup-sensitive Device '${asset.id}' requires Process '${definition.id}' to declare setupGroup`,
          });
          processPlans.push(compiledPlan);
          for (const [resource, portId] of [...Object.entries(recipe.inputs), ...Object.entries(recipe.outputs)]) {
            (portResources[portId] ??= new Set()).add(resource);
          }
          for (const input of mode.auxiliaryInputs) (portResources[input.port] ??= new Set()).add(input.resource);
          const qualityOutputs = quality?.kind === "inspection"
            ? [quality.rejectOutput, ...(quality.scrapOutput ? [quality.scrapOutput] : [])] : [];
          for (const amount of [...compiledInputs, ...compiledOutputs, ...qualityOutputs]) {
            const byResource = bufferRequirements[amount.buffer] ??= new Map();
            const existing = byResource.get(amount.resource);
            if (!existing || existing.count < amount.count) byResource.set(amount.resource, { ...amount });
          }
        }
      }
      }
      for (const [portId, resources] of Object.entries(portResources)) {
        const port = effectivePorts.find((item) => item.id === portId);
        if (port) port.accepts = [...resources].sort();
      }
      for (const [bufferId, byResource] of Object.entries(bufferRequirements)) {
        const buffer = effectiveBuffers[bufferId]!;
        const amounts = [...byResource.values()];
        effectiveBuffers[bufferId] = {
          ...buffer,
          accepts: [...byResource.keys()].sort(),
          ...(amounts.length ? { resourceCapacities: partitionRecipeBuffer(buffer.capacity, amounts) } : {}),
        };
      }
      processPlan = processPlans[0];
    } else if (asset.production) {
      issues.push({ path: `${path}/recipe`, code: "production.recipe-required", message: `Device asset '${asset.id}' requires a blueprint recipe with explicit Resource-to-port bindings` });
    }
    if (instance.treatment) {
      if (!asset.treatment) issues.push({ path: `${path}/treatment`, code: "treatment.unsupported", message: `Device asset '${asset.id}' does not support material treatment` });
      else {
        const mode = asset.treatment.modes.find((candidate) => candidate.id === instance.treatment!.mode);
        if (!mode) issues.push({ path: `${path}/treatment/mode`, code: "treatment-mode.unknown", message: `Device '${asset.id}' does not define treatment mode '${instance.treatment.mode}'` });
        else {
          const agentBuffer = effectiveBuffers[asset.treatment.agentBuffer];
          if (agentBuffer && !agentBuffer.accepts.includes("*") && !agentBuffer.accepts.includes(mode.agent.resource)) {
            issues.push({ path: `${path}/treatment/mode`, code: "treatment.agent-filter", message: `Treatment mode '${mode.id}' requires '${mode.agent.resource}', but the instance filter excludes it` });
          }
          const inputCapacity = effectiveBuffers[asset.treatment.inputBuffer]?.capacity ?? 0;
          const outputCapacity = effectiveBuffers[asset.treatment.outputBuffer]?.capacity ?? 0;
          const agentCapacity = effectiveBuffers[asset.treatment.agentBuffer]?.capacity ?? 0;
          if (mode.itemCount > inputCapacity || mode.itemCount > outputCapacity || mode.agent.count > agentCapacity) {
            issues.push({ path: `${path}/treatment/mode`, code: "treatment-mode.job-capacity", message: `Treatment mode '${mode.id}' batch does not fit its configured buffers` });
          }
          treatmentPlan = { mode, inputBuffer: asset.treatment.inputBuffer, outputBuffer: asset.treatment.outputBuffer, agentBuffer: asset.treatment.agentBuffer };
        }
      }
    } else if (asset.treatment) {
      issues.push({ path: `${path}/treatment`, code: "treatment.mode-required", message: `Device asset '${asset.id}' requires an explicit treatment mode` });
    }
    if (asset.extraction) {
      if (!instance.resourceNodes?.length) issues.push({ path: `${path}/resourceNodes`, code: "extraction.nodes-required", message: `Extractor '${instance.id}' must bind at least one world resource node` });
      const nodes: WorldResourceNode[] = [];
      const seenNodes = new Set<string>();
      for (const [nodeIndex, nodeId] of (instance.resourceNodes ?? []).entries()) {
        const nodePath = `${path}/resourceNodes/${nodeIndex}`;
        if (seenNodes.has(nodeId)) issues.push({ path: nodePath, code: "extraction.duplicate-node", message: `Resource node '${nodeId}' is bound more than once` });
        seenNodes.add(nodeId);
        const node = resourceNodes[nodeId];
        if (!node) { issues.push({ path: nodePath, code: "reference.resource-node", message: `Unknown resource node '${nodeId}'` }); continue; }
        if (node.region !== instance.region) issues.push({ path: nodePath, code: "extraction.cross-region", message: `Extractor '${instance.id}' cannot bind node '${nodeId}' in region '${node.region}'` });
        if (!asset.extraction.resources.includes(node.resource)) issues.push({ path: nodePath, code: "extraction.resource-unsupported", message: `Extractor '${asset.id}' cannot extract '${node.resource}'` });
        const centerX = instance.position.x + footprint.width / 2;
        const centerY = instance.position.y + footprint.height / 2;
        const distance = Math.hypot(centerX - node.position.x - 0.5, centerY - node.position.y - 0.5);
        if (distance > asset.extraction.radius) issues.push({ path: nodePath, code: "extraction.out-of-range", message: `Resource node '${nodeId}' is ${distance.toFixed(3)} cells away, beyond radius ${asset.extraction.radius}` });
        nodes.push(node);
      }
      if (new Set(nodes.map((node) => node.resource)).size > 1) issues.push({ path: `${path}/resourceNodes`, code: "extraction.mixed-resource", message: `Extractor '${instance.id}' may bind only one resource type at a time` });
      const extractedResources = [...new Set(nodes.map((node) => node.resource))].sort();
      const extractionBuffer = effectiveBuffers[asset.extraction.outputBuffer];
      for (const resource of extractedResources) if (extractionBuffer && !extractionBuffer.accepts.includes("*") && !extractionBuffer.accepts.includes(resource)) {
        issues.push({ path: `${path}/bufferFilters/${asset.extraction.outputBuffer}`, code: "extraction.resource-filter", message: `Extractor output filter '${asset.extraction.outputBuffer}' excludes bound Resource '${resource}'` });
      }
      if (extractionBuffer && extractedResources.length) effectiveBuffers[asset.extraction.outputBuffer] = { ...extractionBuffer, accepts: extractedResources };
      extractionPlan = { nodes, outputBuffer: asset.extraction.outputBuffer, cycleTicks: asset.extraction.cycleTicks, itemsPerCycle: asset.extraction.itemsPerCycle };
    } else if (instance.resourceNodes) {
      issues.push({ path: `${path}/resourceNodes`, code: "extraction.unsupported", message: `Device asset '${asset.id}' cannot bind world resource nodes` });
    }
    if (asset.power.generation?.kind === "renewable") generationPlan = { ...asset.power.generation };
    else if (asset.power.generation?.kind === "fuel") {
      const fuelBuffer = effectiveBuffers[asset.power.generation.fuelBuffer];
      const configuredFuels = asset.power.generation.fuels.filter((resource) => fuelBuffer?.accepts.includes("*") || fuelBuffer?.accepts.includes(resource));
      if (!configuredFuels.length) issues.push({ path: `${path}/bufferFilters/${asset.power.generation.fuelBuffer}`, code: "power.fuel-filter-empty", message: `Fuel buffer filter '${asset.power.generation.fuelBuffer}' excludes every fuel supported by '${asset.id}'` });
      generationPlan = {
        kind: "fuel",
        outputMilliWatts: asset.power.generation.outputMilliWatts,
        fuelBuffer: asset.power.generation.fuelBuffer,
        fuels: configuredFuels.flatMap((resource) => {
        const energyMilliJoules = loaded.resources[resource]?.fuel?.energyMilliJoules;
        return energyMilliJoules === undefined ? [] : [{ resource, energyMilliJoules, durationTicks: Math.max(1, Math.floor(energyMilliJoules * 1000 / asset.power.generation!.outputMilliWatts)) }];
        }),
      };
    }
    if (asset.power.storage) storagePlan = { ...asset.power.storage };
    if (asset.logisticsStation && instance.policy?.stationChargeMilliWatts !== undefined) stationEnergyPlan = {
      capacityMilliJoules: asset.logisticsStation.energyCapacityMilliJoules,
      chargeMilliWatts: instance.policy.stationChargeMilliWatts,
    };
    if (instance.policy?.setupCampaign) {
      const campaignPath = `${path}/policy/setupCampaign`;
      if (!asset.production?.changeover) issues.push({
        path: campaignPath, code: "production.campaign-changeover-required",
        message: `Setup campaign policy on '${instance.id}' requires a changeover-capable production Device`,
      });
      if (new Set(processPlans.map((plan) => plan.setupGroup).filter(Boolean)).size < 2) issues.push({
        path: campaignPath, code: "production.campaign-setup-groups",
        message: `Setup campaign policy on '${instance.id}' requires at least two qualified setup groups`,
      });
      if (processPlans.some((plan) => plan.lotTransfers.length === 0)) issues.push({
        path: campaignPath, code: "production.campaign-lot-tracking-required",
        message: `Every operation on campaign-controlled Device '${instance.id}' must preserve tracked lot identities`,
      });
    }
    if (instance.policy?.preventiveMaintenance) {
      const maintenancePath = `${path}/policy/preventiveMaintenance`;
      if (!asset.production?.maintenance) issues.push({
        path: maintenancePath, code: "production.maintenance-required",
        message: `Preventive maintenance policy on '${instance.id}' requires a maintenance-capable production Device`,
      });
      else if (instance.policy.preventiveMaintenance.minimumJobs > asset.production.maintenance.maximumJobs) issues.push({
        path: `${maintenancePath}/minimumJobs`, code: "production.maintenance-threshold",
        message: `Preventive maintenance threshold ${instance.policy.preventiveMaintenance.minimumJobs} exceeds the physical maximum of ${asset.production.maintenance.maximumJobs} jobs`,
      });
    }
    devices[instance.id] = {
      ...instance, assetDef: asset, footprint,
      ports: effectivePorts.map((port) => ({ ...port, side: rotatePortSide(port.side, instance.rotation) })),
      buffers: effectiveBuffers,
      processPlans,
      ...(processPlan ? { processPlan } : {}),
      ...(treatmentPlan ? { treatmentPlan } : {}),
      ...(extractionPlan ? { extractionPlan } : {}),
      ...(generationPlan ? { generationPlan } : {}),
      ...(storagePlan ? { storagePlan } : {}),
      ...(stationEnergyPlan ? { stationEnergyPlan } : {}),
      maintenanceProviders: [],
      qualificationProviders: [],
    };
    narrowDevicePortsToBuffers(devices[instance.id]!);
  }

  const placed = Object.values(devices).sort((a, b) => a.id.localeCompare(b.id));
  for (const device of placed) for (const plan of device.processPlans) {
    if (!plan.tooling.length) continue;
    plan.toolingProviders = placed.flatMap((provider) => {
      const contract = provider.assetDef.toolingProvider;
      const inventory = contract ? provider.buffers[contract.inventoryBuffer] : undefined;
      if (!contract || provider.region !== device.region || !inventory
        || plan.tooling.some((tool) => !acceptsResource(inventory.accepts, tool.resource)
          || (inventory.resourceCapacities?.[tool.resource] ?? inventory.capacity) < tool.count)
        || plan.tooling.reduce((sum, tool) => sum + tool.count, 0) > inventory.capacity) return [];
      const distance = centerDistance(device, provider);
      return distance <= contract.serviceRadius ? [{ device: provider.id, distance }] : [];
    }).sort((left, right) => left.distance - right.distance || left.device.localeCompare(right.device));
    if (!plan.toolingProviders.length) {
      const deviceIndex = loaded.blueprint.devices.findIndex((candidate) => candidate.id === device.id);
      issues.push({
        path: `blueprint/devices/${deviceIndex}`, code: "tooling.provider-uncovered",
        message: `Device '${device.id}' has no in-range provider for Process '${plan.definition.id}' reusable tooling ${plan.tooling.map((tool) => `${tool.count} ${tool.resource}`).join(" + ")}`,
      });
    }
  }
  const providersFor = (device: CompiledDevice, service: { skill: string; crews: number; inputs: Array<{ resource: string; count: number }> }) => {
    const centerX = device.position.x + device.footprint.width / 2;
    const centerY = device.position.y + device.footprint.height / 2;
    return placed.flatMap((provider) => {
      const contract = provider.assetDef.maintenanceProvider;
      const inventory = contract ? provider.buffers[contract.inventoryBuffer] : undefined;
      if (!contract || provider.region !== device.region || contract.crews < service.crews || !contract.skills.includes(service.skill)
        || !inventory || service.inputs.some((input) => !acceptsResource(inventory.accepts, input.resource)
          || (inventory.resourceCapacities?.[input.resource] ?? inventory.capacity) < input.count)
        || service.inputs.reduce((total, input) => total + input.count, 0) > inventory.capacity) return [];
      const providerX = provider.position.x + provider.footprint.width / 2;
      const providerY = provider.position.y + provider.footprint.height / 2;
      const distance = Math.hypot(centerX - providerX, centerY - providerY);
      return distance <= contract.serviceRadius ? [{ device: provider.id, distance }] : [];
    }).sort((left, right) => left.distance - right.distance || left.device.localeCompare(right.device));
  };
  for (const device of placed) {
    const maintenance = device.assetDef.production?.maintenance;
    if (!maintenance) continue;
    device.maintenanceProviders = providersFor(device, maintenance.service);
    device.qualificationProviders = providersFor(device, maintenance.qualification.service);
    for (const [phase, service, providers] of [
      ["maintenance", maintenance.service, device.maintenanceProviders],
      ["qualification", maintenance.qualification.service, device.qualificationProviders],
    ] as const) if (!providers.length) {
      const index = loaded.blueprint.devices.findIndex((candidate) => candidate.id === device.id);
      issues.push({
        path: `blueprint/devices/${index}`, code: `${phase}.provider-uncovered`,
        message: `Device '${device.id}' has no in-range provider for ${service.crews} '${service.skill}' ${phase} crew(s) and required consumables`,
      });
    }
  }
  for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
    const left = placed[a]!; const right = placed[b]!;
    if (left.transportEndpoint || right.transportEndpoint) continue;
    const overlap = left.region === right.region && left.position.x < right.position.x + right.footprint.width && left.position.x + left.footprint.width > right.position.x
      && left.position.y < right.position.y + right.footprint.height && left.position.y + left.footprint.height > right.position.y;
    if (overlap) issues.push({ path: "blueprint/devices", code: "geometry.overlap", message: `Devices '${left.id}' and '${right.id}' overlap` });
  }

  compileStationSlotContracts(loaded.blueprint.logisticsNetworks, devices, loaded.resources, issues);
  for (const device of Object.values(devices)) narrowDevicePortsToBuffers(device);
  const powerGrids = compilePowerGrids(devices);

  const connections: Record<string, CompiledConnection> = {};
  const connectionIds = new Set<string>();
  const endpointReferenceCounts = new Map<string, number>();
  for (const [index, connection] of loaded.blueprint.connections.entries()) {
    const path = `blueprint/connections/${index}`;
    if (connectionIds.has(connection.id)) issues.push({ path: `${path}/id`, code: "reference.duplicate", message: `Duplicate connection '${connection.id}'` });
    connectionIds.add(connection.id);
    const from = devices[connection.from.device]; const to = devices[connection.to.device];
    if (!from) issues.push({ path: `${path}/from/device`, code: "reference.device-instance", message: `Unknown device instance '${connection.from.device}'` });
    if (!to) issues.push({ path: `${path}/to/device`, code: "reference.device-instance", message: `Unknown device instance '${connection.to.device}'` });
    const loader = devices[connection.logistics.loader.device];
    const unloader = devices[connection.logistics.unloader.device];
    for (const [stage, endpoint] of [["loader", loader], ["unloader", unloader]] as const) {
      const deviceId = connection.logistics[stage].device;
      endpointReferenceCounts.set(deviceId, (endpointReferenceCounts.get(deviceId) ?? 0) + 1);
      if (!endpoint) issues.push({ path: `${path}/logistics/${stage}/device`, code: "reference.device-instance", message: `Unknown transport endpoint Device '${deviceId}'` });
      else {
        const binding = endpoint.transportEndpoint;
        if (!binding || binding.connection !== connection.id || binding.stage !== stage) issues.push({
          path: `${path}/logistics/${stage}/device`, code: "logistics.endpoint-binding",
          message: `Device '${deviceId}' must bind itself to '${connection.id}.${stage}'`,
        });
        if (!endpoint.assetDef.capabilities.includes("transport") || !endpoint.assetDef.logistics?.roles.includes(stage)) issues.push({
          path: `${path}/logistics/${stage}/device`, code: "logistics.stage-role", message: `Device '${deviceId}' cannot serve as logistics ${stage}`,
        });
      }
    }
    const lineAsset = loaded.deviceAssets[connection.logistics.line.deviceAsset];
    if (!lineAsset) issues.push({ path: `${path}/logistics/line/deviceAsset`, code: "reference.device", message: `Unknown logistics asset '${connection.logistics.line.deviceAsset}'` });
    else if (!lineAsset.capabilities.includes("transport") || !lineAsset.logistics?.roles.includes("line")) issues.push({ path: `${path}/logistics/line/deviceAsset`, code: "logistics.stage-role", message: `Device '${lineAsset.id}' cannot serve as logistics line` });
    if (!from || !to || !loader?.transportEndpoint || !unloader?.transportEndpoint || !lineAsset
      || !loader.assetDef.logistics?.roles.includes("loader") || !unloader.assetDef.logistics?.roles.includes("unloader")
      || !lineAsset.logistics?.roles.includes("line")) continue;
    for (const [stage, endpoint] of [["loader", loader], ["unloader", unloader]] as const) {
      const distance = endpoint.transportEndpoint!.distance;
      const range = endpoint.assetDef.logistics?.endpointRange;
      if (range && (distance < range.minimum || distance > range.maximum)) issues.push({
        path: `${path}/logistics/${stage}/device`, code: "logistics.endpoint-distance",
        message: `${stage} Device '${endpoint.id}' supports ${range.minimum}-${range.maximum} cells, not ${distance}`,
      });
      if (endpoint.region !== from.region) issues.push({
        path: `${path}/logistics/${stage}/device`, code: "logistics.endpoint-region",
        message: `${stage} Device '${endpoint.id}' must be in connection region '${from.region}'`,
      });
    }
    if (from.region !== to.region) { issues.push({ path, code: "connection.cross-region", message: `Physical connection '${connection.id}' cannot cross from '${from.region}' to '${to.region}'` }); continue; }
    const fromPort = from.ports.find((port) => port.id === connection.from.port);
    const toPort = to.ports.find((port) => port.id === connection.to.port);
    if (!fromPort) issues.push({ path: `${path}/from/port`, code: "reference.port", message: `Unknown port '${connection.from.port}' on '${from.id}'` });
    if (!toPort) issues.push({ path: `${path}/to/port`, code: "reference.port", message: `Unknown port '${connection.to.port}' on '${to.id}'` });
    if (!fromPort || !toPort) continue;
    if (fromPort.direction !== "output") issues.push({ path: `${path}/from/port`, code: "port.direction", message: "Connection must start at an output port" });
    if (toPort.direction !== "input") issues.push({ path: `${path}/to/port`, code: "port.direction", message: "Connection must end at an input port" });
    if (fromPort.kind !== toPort.kind) issues.push({ path, code: "port.kind", message: `Incompatible port kinds '${fromPort.kind}' and '${toPort.kind}'` });
    const sourceResources = fromPort.accepts;
    const targetResources = toPort.accepts;
    const compatibleResources: ResourceId[] = [];
    const seenConnectionResources = new Set<ResourceId>();
    if (!connection.resources.length) issues.push({ path: `${path}/resources`, code: "connection.resources-required", message: `Connection '${connection.id}' must declare at least one transported Resource` });
    for (const [resourceIndex, resource] of connection.resources.entries()) {
      const resourcePath = `${path}/resources/${resourceIndex}`;
      if (seenConnectionResources.has(resource)) {
        issues.push({ path: resourcePath, code: "connection.resource-duplicate", message: `Connection '${connection.id}' declares Resource '${resource}' more than once` });
        continue;
      }
      seenConnectionResources.add(resource);
      if (!loaded.resources[resource]) {
        issues.push({ path: resourcePath, code: "reference.resource", message: `Unknown connection Resource '${resource}'` });
        continue;
      }
      const sourceAccepts = acceptsResource(sourceResources, resource);
      const targetAccepts = acceptsResource(targetResources, resource);
      if (!sourceAccepts) issues.push({ path: resourcePath, code: "connection.source-resource-contract", message: `Source '${from.id}.${fromPort.id}' cannot provide '${resource}'` });
      if (!targetAccepts) issues.push({ path: resourcePath, code: "connection.target-resource-contract", message: `Target '${to.id}.${toPort.id}' cannot accept '${resource}'` });
      if (sourceAccepts && targetAccepts) compatibleResources.push(resource);
    }
    if (!connection.path?.length) { issues.push({ path: `${path}/path`, code: "logistics.path-required", message: `Connection '${connection.id}' requires at least one explicit transport cell` }); continue; }
    let pathValid = true;
    const loaderDistance = loader.transportEndpoint.distance;
    const unloaderDistance = unloader.transportEndpoint.distance;
    const expectedStart = externalPortCellAtDistance(from, from.assetDef, connection.from.port, loaderDistance);
    const expectedEnd = externalPortCellAtDistance(to, to.assetDef, connection.to.port, unloaderDistance);
    const first = connection.path[0]!; const last = connection.path.at(-1)!;
    if (!expectedStart || first.x !== expectedStart.x || first.y !== expectedStart.y || (first.level ?? 0) !== 0) {
      issues.push({ path: `${path}/path/0`, code: "logistics.path-start", message: `Path must start ${loaderDistance} cell(s) from '${from.id}.${connection.from.port}'` }); pathValid = false;
    }
    if (!expectedEnd || last.x !== expectedEnd.x || last.y !== expectedEnd.y || (last.level ?? 0) !== 0) {
      issues.push({ path: `${path}/path/${connection.path.length - 1}`, code: "logistics.path-end", message: `Path must end ${unloaderDistance} cell(s) from '${to.id}.${connection.to.port}'` }); pathValid = false;
    }
    for (const [stage, endpoint, cell, port] of [["loader", loader, first, fromPort], ["unloader", unloader, last, toPort]] as const) {
      if (endpoint.position.x !== cell.x || endpoint.position.y !== cell.y) {
        issues.push({ path: `${path}/logistics/${stage}/device`, code: "logistics.endpoint-position", message: `${stage} Device '${endpoint.id}' must be anchored at belt cell (${cell.x},${cell.y})` }); pathValid = false;
      }
      const expectedRotation = transportEndpointRotation(stage, port.side);
      if (endpoint.rotation !== expectedRotation) issues.push({
        path: `${path}/logistics/${stage}/device`, code: "logistics.endpoint-rotation",
        message: `${stage} Device '${endpoint.id}' rotation must follow cargo flow (${expectedRotation}°)`,
      });
    }
    const seenPathCells = new Set<string>();
    const region = regions[from.region]!;
    for (const [pathIndex, position] of connection.path.entries()) {
      const cellPath = `${path}/path/${pathIndex}`;
      const key = `${position.x},${position.y}@${position.level ?? 0}`;
      if (seenPathCells.has(key)) { issues.push({ path: cellPath, code: "logistics.path-self-intersection", message: `Path visits cell (${position.x},${position.y}) more than once` }); pathValid = false; }
      seenPathCells.add(key);
      if (position.x >= region.bounds.width || position.y >= region.bounds.height) { issues.push({ path: cellPath, code: "logistics.path-out-of-bounds", message: `Path cell (${position.x},${position.y}) exceeds region '${region.id}' bounds` }); pathValid = false; }
      const blockingDevice = Object.values(devices).find((device) => !device.transportEndpoint && device.region === from.region && position.x >= device.position.x && position.x < device.position.x + device.footprint.width && position.y >= device.position.y && position.y < device.position.y + device.footprint.height);
      if (blockingDevice) { issues.push({ path: cellPath, code: "logistics.path-device-collision", message: `Path cell (${position.x},${position.y}) intersects device '${blockingDevice.id}'` }); pathValid = false; }
      const blockingNode = (position.level ?? 0) === 0 ? Object.values(resourceNodes).find((node) => node.region === from.region && node.position.x === position.x && node.position.y === position.y) : undefined;
      if (blockingNode) { issues.push({ path: cellPath, code: "logistics.path-resource-collision", message: `Path cell (${position.x},${position.y}) intersects resource node '${blockingNode.id}'` }); pathValid = false; }
      if (pathIndex > 0) {
        const previous = connection.path[pathIndex - 1]!;
        if (Math.abs(previous.x - position.x) + Math.abs(previous.y - position.y) !== 1 || Math.abs((previous.level ?? 0) - (position.level ?? 0)) > 1) { issues.push({ path: cellPath, code: "logistics.path-disconnected", message: "Consecutive path cells must share a cardinal edge and change at most one transport level" }); pathValid = false; }
      }
    }
    if (!pathValid) continue;
    const distance = connection.path.length;
    const logisticsStages = (["loader", "line", "unloader"] as const).map((stage) => {
      const endpoint = stage === "loader" ? loader : stage === "unloader" ? unloader : undefined;
      const asset = endpoint?.assetDef ?? lineAsset;
      const stageDistance = stage === "line" ? distance : endpoint!.transportEndpoint!.distance;
      const plan = planDeviceTransport(asset.id, asset.program, { apiVersion: 1, connection: connection.id, stage, distance: stageDistance });
      const position = endpoint?.position;
      return {
        stage, asset, distance: stageDistance, capacity: plan.capacity, durationTicks: plan.durationTicks, stackCapacity: plan.stackCapacity,
        ...(endpoint && position ? { device: endpoint, region: endpoint.region, position: { ...position }, powerGrid: powerGridAtPosition(powerGrids, devices, endpoint.region, position) } : {}),
      };
    });
    const travelTicks = logisticsStages.reduce((sum, stage) => sum + stage.durationTicks, 0);
    const dispatchIntervalTicks = Math.max(...logisticsStages.map((stage) => Math.ceil(stage.durationTicks / stage.capacity)));
    const loaderStage = logisticsStages.find((stage) => stage.stage === "loader")!;
    const lineStage = logisticsStages.find((stage) => stage.stage === "line")!;
    const unloaderStage = logisticsStages.find((stage) => stage.stage === "unloader")!;
    if (lineStage.capacity !== distance) issues.push({
      path: `${path}/logistics/line`, code: "logistics.line-slot-count",
      message: `Line asset '${lineStage.asset.id}' must expose one item slot per routed cell (${distance}); planTransport() returned ${lineStage.capacity}`,
    });
    const loaderDispatchIntervalTicks = Math.ceil(loaderStage.durationTicks / loaderStage.capacity);
    const lineDispatchIntervalTicks = Math.ceil(lineStage.durationTicks / lineStage.capacity);
    const lineCellTravelTicks = Math.ceil(lineStage.durationTicks / distance);
    const unloaderDispatchIntervalTicks = Math.ceil(unloaderStage.durationTicks / unloaderStage.capacity);
    const stageStackCapacity = Math.min(...logisticsStages.map((stage) => stage.stackCapacity));
    if (connection.stackSize !== undefined && connection.stackSize > stageStackCapacity) issues.push({
      path: `${path}/stackSize`, code: "logistics.stack-capacity",
      message: `Connection '${connection.id}' requests stack size ${connection.stackSize}, but its transport stages support at most ${stageStackCapacity}`,
    });
    const requestedStackSize = Math.min(connection.stackSize ?? stageStackCapacity, stageStackCapacity);
    const stackSizeByResource = Object.fromEntries(compatibleResources.map((resource) => [resource, Math.min(requestedStackSize, loaded.resources[resource]!.transport.stackSize)]));
    if (connection.stackSize !== undefined) for (const resource of compatibleResources) {
      const limit = loaded.resources[resource]!.transport.stackSize;
      if (connection.stackSize > limit) issues.push({
        path: `${path}/stackSize`, code: "logistics.resource-stack-limit",
        message: `Connection '${connection.id}' requests stack size ${connection.stackSize}, but Resource '${resource}' supports at most ${limit}`,
      });
    }
    const maxStackSize = Math.max(1, ...Object.values(stackSizeByResource));
    const capacity = Math.max(1, Math.ceil(travelTicks / dispatchIntervalTicks));
    const transportCells = connection.path.map((position) => transportCellId(from.region, position));
    connections[connection.id] = {
      ...connection, fromDevice: from, toDevice: to, fromPort, toPort, logisticsStages, distance, transportCells,
      stackSizeByResource, maxStackSize,
      loaderDispatchIntervalTicks, lineDispatchIntervalTicks, lineCellTravelTicks, unloaderDispatchIntervalTicks,
      capacity, travelTicks, dispatchIntervalTicks,
    };
    for (const stage of logisticsStages.filter((item): item is typeof item & { stage: "loader" | "unloader" } => item.stage !== "line")) {
      if (stage.powerGrid && stage.device) {
        stage.device.powerGrid = stage.powerGrid;
        if (!powerGrids[stage.powerGrid]!.members.includes(stage.device.id)) powerGrids[stage.powerGrid]!.members.push(stage.device.id);
        powerGrids[stage.powerGrid]!.idleConsumptionMilliWatts += stage.asset.power.idleMilliWatts;
      }
      if (!stage.powerGrid || stage.asset.power.activeMilliWatts <= 0) continue;
      powerGrids[stage.powerGrid]!.transportStages.push({ connection: connection.id, stage: stage.stage, device: stage.device!.id });
      powerGrids[stage.powerGrid]!.ratedConsumptionMilliWatts += stage.asset.power.activeMilliWatts;
    }
  }

  for (const [index, endpoint] of loaded.blueprint.devices.entries()) {
    if (!endpoint.transportEndpoint) continue;
    const count = endpointReferenceCounts.get(endpoint.id) ?? 0;
    if (count !== 1) issues.push({
      path: `blueprints/${loaded.manifest.defaultBlueprint}/devices/${index}/transportEndpoint`, code: "logistics.endpoint-reference-count",
      message: `Transport endpoint Device '${endpoint.id}' must be referenced by exactly one connection stage; found ${count}`,
    });
  }

  const transportCells: Record<string, CompiledTransportCell> = {};
  for (const connection of Object.values(connections).sort((a, b) => a.id.localeCompare(b.id))) {
    const lineAsset = connection.logisticsStages.find((stage) => stage.stage === "line")!.asset;
    for (const [cellIndex, position] of connection.path.entries()) {
      const id = connection.transportCells[cellIndex]!;
      const output: CompiledTransportCell["output"] = cellIndex < connection.transportCells.length - 1
        ? { kind: "cell", cell: connection.transportCells[cellIndex + 1]! }
        : { kind: "port", device: connection.to.device, port: connection.to.port };
      const existing = transportCells[id];
      if (existing && existing.asset.id !== lineAsset.id) {
        issues.push({ path: `blueprint/connections/${loaded.blueprint.connections.findIndex((item) => item.id === connection.id)}/path/${cellIndex}`, code: "logistics.shared-cell-asset", message: `Shared transport cell '${id}' mixes line assets '${existing.asset.id}' and '${lineAsset.id}'` });
        continue;
      }
      if (existing) {
        if (JSON.stringify(existing.output) !== JSON.stringify(output)) {
          issues.push({
            path: `blueprint/connections/${loaded.blueprint.connections.findIndex((item) => item.id === connection.id)}/path/${cellIndex}`,
            code: "logistics.shared-cell-direction",
            message: `Shared transport cell '${id}' cannot feed both '${existing.output.kind === "cell" ? existing.output.cell : `${existing.output.device}.${existing.output.port}`}' and '${output.kind === "cell" ? output.cell : `${output.device}.${output.port}`}'`,
          });
          continue;
        }
        existing.connections.push(connection.id);
        existing.dispatchIntervalTicks = Math.max(existing.dispatchIntervalTicks, connection.lineDispatchIntervalTicks);
        existing.travelTicks = Math.max(existing.travelTicks, connection.lineCellTravelTicks);
      } else transportCells[id] = {
        id, region: connection.fromDevice.region, position: { ...position }, asset: lineAsset,
        connections: [connection.id], output, dispatchIntervalTicks: connection.lineDispatchIntervalTicks, travelTicks: connection.lineCellTravelTicks,
      };
    }
  }

  const logisticsNetworks = compileLogisticsNetworks(
    loaded.blueprint.logisticsNetworks, devices, loaded.deviceAssets, loaded.resources, regions,
    loaded.blueprint.policies?.dispatch ?? "fifo", issues,
  );

  const lotReleasePolicy = loaded.blueprint.policies.lotRelease;
  if (lotReleasePolicy && lotReleasePolicy.reopenAtWip >= lotReleasePolicy.maximumWip) issues.push({
    path: "blueprint/policies/lotRelease/reopenAtWip", code: "lot.release-control-threshold",
    message: `CONWIP reopen threshold ${lotReleasePolicy.reopenAtWip} must be below maximum WIP ${lotReleasePolicy.maximumWip}`,
  });

  if (!loaded.resources[loaded.objective.targetResource]) issues.push({ path: "objective/targetResource", code: "reference.resource", message: `Unknown target resource '${loaded.objective.targetResource}'` });
  if (!regions[loaded.objective.targetRegion]) issues.push({ path: "objective/targetRegion", code: "reference.region", message: `Unknown target region '${loaded.objective.targetRegion}'` });
  for (const [deviceId, buffers] of Object.entries(loaded.scenario.initialBuffers ?? {})) {
    const device = devices[deviceId];
    if (!device) { issues.push({ path: `scenario/initialBuffers/${deviceId}`, code: "reference.device-instance", message: `Unknown device instance '${deviceId}'` }); continue; }
    for (const [bufferId, inventory] of Object.entries(buffers)) {
      const buffer = device.buffers[bufferId];
      if (!buffer) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}`, code: "reference.buffer", message: `Unknown buffer '${bufferId}'` });
      for (const resource of Object.keys(inventory)) {
        if (!loaded.resources[resource]) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}/${resource}`, code: "reference.resource", message: `Unknown resource '${resource}'` });
        else if (loaded.resources[resource]!.tracking) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}/${resource}`, code: "lot.explicit-required", message: `Tracked Resource '${resource}' must be declared through lotReleases` });
        else if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(resource)) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}/${resource}`, code: "buffer.resource-contract", message: `Buffer '${bufferId}' does not accept '${resource}'` });
        const resourceCapacity = buffer?.resourceCapacities?.[resource];
        if (resourceCapacity !== undefined && inventory[resource]! > resourceCapacity) issues.push({
          path: `scenario/initialBuffers/${deviceId}/${bufferId}/${resource}`, code: "buffer.resource-capacity",
          message: `Initial quantity ${inventory[resource]} exceeds '${resource}' capacity ${resourceCapacity} in buffer '${bufferId}'`,
        });
      }
      if (buffer && Object.values(inventory).reduce((sum, count) => sum + count, 0) > buffer.capacity) issues.push({ path: `scenario/initialBuffers/${deviceId}/${bufferId}`, code: "buffer.capacity", message: `Initial quantity exceeds buffer capacity ${buffer.capacity}` });
    }
  }
  const lotIds = new Set<string>();
  for (const [index, lot] of (loaded.scenario.lotReleases ?? []).entries()) {
    const path = `scenario/lotReleases/${index}`;
    if (lotIds.has(lot.id)) issues.push({ path: `${path}/id`, code: "lot.duplicate-id", message: `Lot '${lot.id}' is declared more than once` });
    lotIds.add(lot.id);
    const device = devices[lot.device];
    const buffer = device?.buffers[lot.buffer];
    const resource = loaded.resources[lot.resource];
    if (!device) issues.push({ path: `${path}/device`, code: "reference.device-instance", message: `Unknown device instance '${lot.device}'` });
    else if (!buffer) issues.push({ path: `${path}/buffer`, code: "reference.buffer", message: `Unknown buffer '${lot.buffer}'` });
    if (!resource) issues.push({ path: `${path}/resource`, code: "reference.resource", message: `Unknown Resource '${lot.resource}'` });
    else if (!resource.tracking) issues.push({ path: `${path}/resource`, code: "lot.tracking-required", message: `Resource '${lot.resource}' is not configured for lot tracking` });
    else {
      const route = loaded.routes[resource.tracking.route];
      if (route && route.entry.resource !== lot.resource) issues.push({ path: `${path}/resource`, code: "route.release-entry", message: `Lot '${lot.id}' must release through Route entry Resource '${route.entry.resource}'` });
    }
    if (lot.releaseTick > loaded.scenario.durationTicks) issues.push({
      path: `${path}/releaseTick`, code: "lot.release-outside-scenario", message: `Lot '${lot.id}' releases after Scenario duration ${loaded.scenario.durationTicks}`,
    });
    if (lot.dueTick !== undefined && lot.dueTick < lot.releaseTick) issues.push({
      path: `${path}/dueTick`, code: "lot.due-before-release", message: `Lot '${lot.id}' is due before its planned release`,
    });
    if (buffer && resource && !buffer.accepts.includes("*") && !buffer.accepts.includes(lot.resource)) issues.push({
      path: `${path}/resource`, code: "buffer.resource-contract", message: `Buffer '${lot.buffer}' does not accept '${lot.resource}'`,
    });
    const resourceCapacity = buffer?.resourceCapacities?.[lot.resource];
    if (resourceCapacity !== undefined && resourceCapacity < 1) issues.push({
      path, code: "buffer.resource-capacity", message: `Release buffer quota for '${lot.resource}' cannot hold one lot`,
    });
  }
  const excursionIds = new Set<string>();
  for (const [index, excursion] of (loaded.scenario.qualityExcursions ?? []).entries()) {
    const path = `scenario/qualityExcursions/${index}`;
    if (excursionIds.has(excursion.id)) issues.push({ path: `${path}/id`, code: "quality.duplicate-excursion", message: `Quality excursion '${excursion.id}' is declared more than once` });
    excursionIds.add(excursion.id);
    const process = loaded.processes[excursion.process];
    if (!process) issues.push({ path: `${path}/process`, code: "reference.process", message: `Unknown Process '${excursion.process}'` });
    else if (!Object.values(devices).some((device) => device.processPlans.some((plan) => plan.definition.id === excursion.process))) issues.push({
      path: `${path}/process`, code: "quality.process-not-qualified", message: `No Blueprint Device is qualified to run excursion Process '${excursion.process}'`,
    });
    if (!lotIds.has(excursion.lot)) issues.push({ path: `${path}/lot`, code: "quality.unknown-lot", message: `Unknown scheduled lot '${excursion.lot}'` });
    if (new Set(excursion.defects).size !== excursion.defects.length) issues.push({ path: `${path}/defects`, code: "quality.duplicate-defect", message: `Quality excursion '${excursion.id}' declares a defect class more than once` });
    const lotDefinition = loaded.scenario.lotReleases?.find((lot) => lot.id === excursion.lot);
    const lotFamily = lotDefinition ? loaded.resources[lotDefinition.resource]?.tracking?.family : undefined;
    const processFamilies = process ? new Set([...process.inputs, ...process.outputs].flatMap((amount) => {
      const family = loaded.resources[amount.resource]?.tracking?.family;
      return family ? [family] : [];
    })) : new Set<string>();
    if (lotFamily && process && !processFamilies.has(lotFamily)) issues.push({
      path, code: "quality.excursion-family", message: `Excursion Process '${process.id}' does not operate on lot family '${lotFamily}'`,
    });
  }
  for (const [deviceId, setupGroup] of Object.entries(loaded.scenario.initialSetups ?? {})) {
    const path = `scenario/initialSetups/${deviceId}`;
    const device = devices[deviceId];
    if (!device) issues.push({ path, code: "reference.device-instance", message: `Unknown device instance '${deviceId}'` });
    else if (!device.assetDef.production?.changeover) issues.push({
      path, code: "production.changeover-required", message: `Device '${deviceId}' does not declare changeover work`,
    });
    else if (!device.processPlans.some((plan) => plan.setupGroup === setupGroup)) issues.push({
      path, code: "production.setup-group-qualified", message: `Device '${deviceId}' is not qualified for setup group '${setupGroup}'`,
    });
  }
  const treatedTotals = new Map<string, number>();
  for (const [index, treatment] of (loaded.scenario.initialTreatments ?? []).entries()) {
    const path = `scenario/initialTreatments/${index}`;
    const device = devices[treatment.device];
    const buffer = device?.buffers[treatment.buffer];
    if (!device) issues.push({ path: `${path}/device`, code: "reference.device-instance", message: `Unknown device instance '${treatment.device}'` });
    else if (!buffer) issues.push({ path: `${path}/buffer`, code: "reference.buffer", message: `Unknown buffer '${treatment.buffer}'` });
    if (!loaded.resources[treatment.resource]) issues.push({ path: `${path}/resource`, code: "reference.resource", message: `Unknown Resource '${treatment.resource}'` });
    else if (buffer && !buffer.accepts.includes("*") && !buffer.accepts.includes(treatment.resource)) {
      issues.push({ path: `${path}/resource`, code: "buffer.resource-contract", message: `Buffer '${treatment.buffer}' does not accept '${treatment.resource}'` });
    }
    const key = `${treatment.device}\0${treatment.buffer}\0${treatment.resource}`;
    const total = (treatedTotals.get(key) ?? 0) + treatment.count;
    treatedTotals.set(key, total);
    const initial = loaded.scenario.initialBuffers?.[treatment.device]?.[treatment.buffer]?.[treatment.resource] ?? 0;
    if (total > initial) issues.push({ path, code: "treatment.initial-quantity", message: `Treated quantity ${total} exceeds initial '${treatment.resource}' inventory ${initial}` });
  }
  for (const [deviceId, initialEnergy] of Object.entries(loaded.scenario.initialEnergyMilliJoules ?? {})) {
    const device = devices[deviceId]; const path = `scenario/initialEnergyMilliJoules/${deviceId}`;
    if (!device) issues.push({ path, code: "reference.device-instance", message: `Unknown device instance '${deviceId}'` });
    else if (!device.storagePlan && !device.stationEnergyPlan) issues.push({ path, code: "power.energy-buffer-required", message: `Device '${deviceId}' does not declare grid storage or station energy` });
    else {
      const capacity = device.storagePlan?.capacityMilliJoules ?? device.stationEnergyPlan!.capacityMilliJoules;
      if (initialEnergy > capacity) issues.push({ path, code: "power.energy-capacity", message: `Initial energy ${initialEnergy} mJ exceeds energy capacity ${capacity} mJ` });
    }
  }
  for (const [profileIndex, profile] of (loaded.scenario.renewableProfiles ?? []).entries()) {
    const path = `scenario/renewableProfiles/${profileIndex}`;
    if (!regions[profile.region]) issues.push({ path: `${path}/region`, code: "reference.region", message: `Unknown region '${profile.region}'` });
    if (profile.asset) {
      const asset = loaded.deviceAssets[profile.asset];
      if (!asset) issues.push({ path: `${path}/asset`, code: "reference.device", message: `Unknown Device asset '${profile.asset}'` });
      else if (asset.power.generation?.kind !== "renewable") issues.push({ path: `${path}/asset`, code: "power.renewable-profile-required", message: `Device asset '${profile.asset}' is not a renewable generator` });
    }
    if (profile.points[0]?.atTick !== 0) issues.push({
      path: `${path}/points/0/atTick`, code: "power.generator-profile-origin", message: "Generator profile must start at tick 0",
    });
    for (const [index, point] of profile.points.entries()) {
      if (point.atTick >= profile.periodTicks) issues.push({
        path: `${path}/points/${index}/atTick`, code: "power.generator-profile-period", message: `Profile point ${point.atTick} must be before period ${profile.periodTicks}`,
      });
      if (index > 0 && point.atTick <= profile.points[index - 1]!.atTick) issues.push({
        path: `${path}/points/${index}/atTick`, code: "power.generator-profile-order", message: "Generator profile points must be strictly increasing",
      });
    }
  }
  for (const device of Object.values(devices).filter((item) => item.generationPlan?.kind === "renewable")) {
    const matches = (loaded.scenario.renewableProfiles ?? []).filter((profile) => profile.region === device.region && (!profile.asset || profile.asset === device.asset));
    if (matches.length > 1) issues.push({
      path: "scenario/renewableProfiles", code: "power.generator-profile-overlap",
      message: `Renewable Device '${device.id}' matches ${matches.length} Scenario profiles; environmental scopes must be unambiguous`,
    });
  }
  for (const [index, failure] of (loaded.scenario.failures ?? []).entries()) if (!devices[failure.device]) issues.push({ path: `scenario/failures/${index}/device`, code: "reference.device-instance", message: `Unknown device instance '${failure.device}'` });
  if (issues.length) throw new InmValidationError(issues);

  const hashes: ProjectHashes = {
    engineVersion: ENGINE_VERSION,
    resourceCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.resources).map(([id, asset]) => [id, asset.contentHash]))),
    processCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.processes).map(([id, process]) => [id, process.contentHash]))),
    routeCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.routes).map(([id, route]) => [id, route.contentHash]))),
    deviceCatalogHash: hashValue(Object.fromEntries(Object.entries(loaded.deviceAssets).map(([id, asset]) => [id, asset.contentHash]))),
    worldHash: hashValue(loaded.world),
    blueprintHash: hashValue(loaded.blueprint), scenarioHash: hashValue(loaded.scenario), objectiveHash: hashValue(loaded.objective),
  };
  return { ...loaded, regions, resourceNodes, devices, connections, transportCells, logisticsNetworks, powerGrids, hashes };
}
