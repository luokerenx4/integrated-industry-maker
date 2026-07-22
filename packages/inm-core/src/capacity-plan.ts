import type { CompiledFactoryProject, ResourceId } from "./types";
import { connectionCapacityPerMinute } from "./logistics-capacity";
import { optimizeResourceDemands } from "./production-demand";
import { effectiveProductionAmounts } from "./production-mode";
import { plannedProductionAmounts, selectMaterialTreatment } from "./material-treatment";
import { evaluatePowerEnvelope, renewableProfileFor } from "./power-envelope";

export interface ProcessCapacityRequirement {
  resource: ResourceId;
  process: string;
  mode: string;
  asset: string;
  templateDevice: string;
  requiredOutputPerMinute: number;
  requiredCyclesPerMinute: number;
  inputsPerMinute: Record<ResourceId, number>;
  outputsPerMinute: Record<ResourceId, number>;
  outputPerCycle: number;
  capacityPerMachine: number;
  configuredMachines: number;
  configuredCapacityPerMinute: number;
  requiredMachines: number;
  additionalMachines: number;
  region: string;
  powerMilliWattsPerMachine: number;
  minimumInputTreatmentLevel: number;
}

export interface ToolsetCapacityRequirement {
  id: string;
  asset: string;
  region: string;
  requiredDeviceTicksPerMinute: number;
  configuredDeviceTicksPerMinute: number;
  allocatedDeviceTicksPerMinute: number;
  unallocatedDeviceTicksPerMinute: number;
  utilization: number;
  minimumAdditionalDevices: number;
  operations: Array<{
    process: string;
    mode: string;
    requiredDeviceTicksPerMinute: number;
    allocatedDeviceTicksPerMinute: number;
    unallocatedDeviceTicksPerMinute: number;
    qualifiedDevices: string[];
  }>;
  devices: Array<{
    device: string;
    allocatedDeviceTicksPerMinute: number;
    utilization: number;
    qualifiedOperations: string[];
  }>;
}

export interface TreatmentCapacityRequirement {
  process: string;
  mode: string;
  resource: ResourceId;
  region: string;
  minimumLevel: number;
  asset: string;
  treatmentMode: string;
  agentResource: ResourceId;
  requiredItemsPerMinute: number;
  requiredAgentPerMinute: number;
  capacityPerDevice: number;
  requiredDevices: number;
  configuredDevices: number;
  configuredCapacityPerMinute: number;
  additionalDevices: number;
}

export interface RawCapacityRequirement {
  resource: ResourceId;
  processDemandPerMinute: number;
  infrastructureDemandPerMinute: number;
  totalDemandPerMinute: number;
  configuredExtractors: number;
  configuredExtractionPerMinute: number;
  scheduledSupply: number;
  scheduledSupplyPerMinute: number;
  configuredSupplyPerMinute: number;
  supplyDeficitPerMinute: number;
  additionalExtractors: number;
  finiteReserve: number;
  lifetimeMinutes: number | null;
  scenarioDemand: number;
  scenarioSupply: number;
  scenarioBalance: number;
}

export interface TransportCapacityRequirement {
  direction: "input" | "output";
  process: string;
  resource: ResourceId;
  devices: string[];
  connections: string[];
  requiredItemsPerMinute: number;
  configuredCapacityPerMinute: number;
  capacityDeficitPerMinute: number;
}

export interface StationCapacityRequirement {
  network: string;
  source: string;
  carrierAsset: string;
  resource: ResourceId;
  routes: string[];
  requiredItemsPerMinute: number;
  perCarrierItemsPerMinute: number;
  energyLimitedItemsPerMinute: number;
  configuredItemsPerMinute: number;
  requiredCarriers: number;
  configuredCarriers: number;
  additionalCarriers: number;
  additionalChargeMilliWatts: number;
}

export interface PowerCapacityRequirement {
  region: string;
  requiredMilliWatts: number;
  configuredGenerationMilliWatts: number;
  headroomMilliWatts: number;
  scenarioGeneratedMilliJoules: number;
  scenarioDemandMilliJoules: number;
  scenarioUnservedMilliJoules: number;
  scenarioCurtailedMilliJoules: number;
  requiredStorageCapacityMilliJoules: number;
  configuredStorageCapacityMilliJoules: number;
  configuredStorageChargeMilliWatts: number;
  configuredStorageDischargeMilliWatts: number;
}

export interface ProductionCapacityPlan {
  targetResource: ResourceId;
  targetRatePerMinute: number;
  deliveryTargets: Array<{ id: string; resource: ResourceId; region: string; ratePerMinute: number; itemsForScenario: number }>;
  scenarioMinutes: number;
  targetItemsForScenario: number;
  processes: ProcessCapacityRequirement[];
  toolsets: ToolsetCapacityRequirement[];
  treatments: TreatmentCapacityRequirement[];
  rawResources: RawCapacityRequirement[];
  transport: TransportCapacityRequirement[];
  stationNetworks: StationCapacityRequirement[];
  power: PowerCapacityRequirement[];
  gaps: Array<{ kind: "process" | "toolset" | "treatment" | "extraction" | "transport" | "station" | "power" | "reserve"; entity: string; message: string }>;
  ready: boolean;
}

function add(target: Record<string, number>, key: string, value: number): void {
  target[key] = (target[key] ?? 0) + value;
}

interface FlowEdge { to: number; reverse: number; capacity: number; initialCapacity: number }

function addFlowEdge(graph: FlowEdge[][], from: number, to: number, capacity: number): FlowEdge {
  const forward: FlowEdge = { to, reverse: graph[to]!.length, capacity, initialCapacity: capacity };
  const reverse: FlowEdge = { to: from, reverse: graph[from]!.length, capacity: 0, initialCapacity: 0 };
  graph[from]!.push(forward);
  graph[to]!.push(reverse);
  return forward;
}

function allocateToolsets(project: CompiledFactoryProject, processes: ProcessCapacityRequirement[]): ToolsetCapacityRequirement[] {
  const grouped = new Map<string, ProcessCapacityRequirement[]>();
  for (const process of processes) {
    const key = `${process.region}\0${process.asset}`;
    grouped.set(key, [...(grouped.get(key) ?? []), process]);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).flatMap(([key, unsorted]) => {
    const operations = [...unsorted].sort((left, right) => left.process.localeCompare(right.process) || left.mode.localeCompare(right.mode));
    if (operations.length < 2) return [];
    const [region, asset] = key.split("\0") as [string, string];
    const devices = Object.values(project.devices).filter((device) => device.region === region && device.asset === asset
      && operations.some((operation) => device.processPlans.some((plan) => plan.definition.id === operation.process && plan.mode.id === operation.mode)))
      .sort((left, right) => left.id.localeCompare(right.id));
    const source = 0;
    const operationOffset = 1;
    const deviceOffset = operationOffset + operations.length;
    const sink = deviceOffset + devices.length;
    const graph: FlowEdge[][] = Array.from({ length: sink + 1 }, () => []);
    const operationDemands = operations.map((operation) => {
      const template = project.devices[operation.templateDevice]!;
      const plan = template.processPlans.find((candidate) => candidate.definition.id === operation.process && candidate.mode.id === operation.mode)!;
      return operation.requiredCyclesPerMinute * plan.durationTicks;
    });
    const operationDeviceEdges = new Map<string, FlowEdge>();
    for (const [operationIndex, operation] of operations.entries()) {
      addFlowEdge(graph, source, operationOffset + operationIndex, operationDemands[operationIndex]!);
      for (const [deviceIndex, device] of devices.entries()) {
        if (!device.processPlans.some((plan) => plan.definition.id === operation.process && plan.mode.id === operation.mode)) continue;
        operationDeviceEdges.set(`${operationIndex}:${deviceIndex}`,
          addFlowEdge(graph, operationOffset + operationIndex, deviceOffset + deviceIndex, operationDemands[operationIndex]!));
      }
    }
    for (const deviceIndex of devices.keys()) addFlowEdge(graph, deviceOffset + deviceIndex, sink, 60_000);
    let allocated = 0;
    while (true) {
      const parentNode = Array<number>(graph.length).fill(-1);
      const parentEdge = Array<number>(graph.length).fill(-1);
      const queue = [source]; parentNode[source] = source;
      for (let cursor = 0; cursor < queue.length && parentNode[sink]! < 0; cursor++) {
        const node = queue[cursor]!;
        for (const [edgeIndex, edge] of graph[node]!.entries()) {
          if (edge.capacity <= 1e-9 || parentNode[edge.to]! >= 0) continue;
          parentNode[edge.to] = node; parentEdge[edge.to] = edgeIndex; queue.push(edge.to);
          if (edge.to === sink) break;
        }
      }
      if (parentNode[sink]! < 0) break;
      let increment = Number.POSITIVE_INFINITY;
      for (let node = sink; node !== source; node = parentNode[node]!) increment = Math.min(increment, graph[parentNode[node]!]![parentEdge[node]!]!.capacity);
      for (let node = sink; node !== source; node = parentNode[node]!) {
        const edge = graph[parentNode[node]!]![parentEdge[node]!]!;
        edge.capacity -= increment;
        graph[node]![edge.reverse]!.capacity += increment;
      }
      allocated += increment;
    }
    const allocatedByOperation = operations.map((_, operationIndex) => devices.reduce((sum, __, deviceIndex) => {
      const edge = operationDeviceEdges.get(`${operationIndex}:${deviceIndex}`);
      return sum + (edge ? edge.initialCapacity - edge.capacity : 0);
    }, 0));
    const allocatedByDevice = devices.map((_, deviceIndex) => operations.reduce((sum, __, operationIndex) => {
      const edge = operationDeviceEdges.get(`${operationIndex}:${deviceIndex}`);
      return sum + (edge ? edge.initialCapacity - edge.capacity : 0);
    }, 0));
    const required = operationDemands.reduce((sum, demand) => sum + demand, 0);
    const unallocated = Math.max(0, required - allocated);
    return [{
      id: `${region}:${asset}`, asset, region,
      requiredDeviceTicksPerMinute: required,
      configuredDeviceTicksPerMinute: devices.length * 60_000,
      allocatedDeviceTicksPerMinute: allocated,
      unallocatedDeviceTicksPerMinute: unallocated,
      utilization: devices.length ? allocated / (devices.length * 60_000) : 0,
      minimumAdditionalDevices: Math.ceil(unallocated / 60_000 - 1e-9),
      operations: operations.map((operation, operationIndex) => ({
        process: operation.process, mode: operation.mode,
        requiredDeviceTicksPerMinute: operationDemands[operationIndex]!,
        allocatedDeviceTicksPerMinute: allocatedByOperation[operationIndex]!,
        unallocatedDeviceTicksPerMinute: Math.max(0, operationDemands[operationIndex]! - allocatedByOperation[operationIndex]!),
        qualifiedDevices: devices.filter((device) => device.processPlans.some((plan) => plan.definition.id === operation.process && plan.mode.id === operation.mode)).map((device) => device.id),
      })),
      devices: devices.map((device, deviceIndex) => ({
        device: device.id, allocatedDeviceTicksPerMinute: allocatedByDevice[deviceIndex]!,
        utilization: allocatedByDevice[deviceIndex]! / 60_000,
        qualifiedOperations: operations.filter((operation) => device.processPlans.some((plan) => plan.definition.id === operation.process && plan.mode.id === operation.mode))
          .map((operation) => `${operation.process}/${operation.mode}`),
      })),
    }];
  });
}

export function planProductionCapacity(project: CompiledFactoryProject): ProductionCapacityPlan {
  const targetRatePerMinute = project.objective.targetRatePerMinute;
  const scenarioMinutes = project.scenario.durationTicks / 60_000;
  const deliveryTargets = project.objective.deliveryContracts?.map((contract) => ({
    id: contract.id, resource: contract.resource, region: contract.region,
    ratePerMinute: contract.demandPerMinute, itemsForScenario: contract.demandPerMinute * scenarioMinutes,
  })) ?? [{
    id: "primary", resource: project.objective.targetResource, region: project.objective.targetRegion,
    ratePerMinute: targetRatePerMinute, itemsForScenario: targetRatePerMinute * scenarioMinutes,
  }];
  const portfolioRatePerMinute = deliveryTargets.reduce((sum, target) => sum + target.ratePerMinute, 0);
  const processCandidates = [...new Map(Object.values(project.devices).sort((a, b) => a.id.localeCompare(b.id)).flatMap((template) => template.processPlans
    .filter((processPlan) => processPlan.definition.quality?.kind !== "rework")
    .map((processPlan) => {
      const amounts = plannedProductionAmounts(processPlan.definition, processPlan.mode, project.deviceAssets);
      const candidate = {
        key: `${processPlan.definition.id}:${template.asset}:${processPlan.mode.id}`,
        inputs: amounts.inputs,
        outputs: amounts.outputs,
        data: { template, processPlan },
      };
      return [candidate.key, candidate] as const;
    }))).values()];
  const producedResources = new Set(processCandidates.flatMap((candidate) => candidate.outputs.map((output) => output.resource)));
  const inputResources = new Set(processCandidates.flatMap((candidate) => candidate.inputs.map((input) => input.resource)));
  const rawResourceIds = Object.keys(project.resources).filter((resource) => Object.values(project.resourceNodes).some((node) => node.resource === resource)
    || (inputResources.has(resource) && !producedResources.has(resource)));
  const demandPlan = optimizeResourceDemands({
    demands: deliveryTargets.map((target) => ({ resource: target.resource, count: target.ratePerMinute })),
    candidates: processCandidates, rawResources: rawResourceIds,
    candidateCost: (candidate) => candidate.data.template.assetDef.economics.buildCost * candidate.data.processPlan.durationTicks / 60_000,
    rawResourceCost: (resource) => {
      const reserve = Object.values(project.resourceNodes).filter((node) => node.resource === resource).reduce((sum, node) => sum + node.amount, 0);
      return reserve > 0 ? 1 + portfolioRatePerMinute / reserve : 1;
    },
  });
  const rawProcessDemand = demandPlan.rawDemandPerMinute;

  const processes: ProcessCapacityRequirement[] = demandPlan.processes.flatMap((row) => {
    const template = row.candidate.data.template;
    const primaryOutput = row.candidate.outputs.find((amount) => amount.resource === row.primaryResource)!;
    const plan = row.candidate.data.processPlan;
    const allMatching = Object.values(project.devices).filter((device) => device.asset === template.asset
      && device.processPlans.some((candidate) => candidate.definition.id === plan.definition.id && candidate.mode.id === plan.mode.id));
    const capacityPerMachine = primaryOutput.count * 60_000 / plan.durationTicks;
    const cyclesPerMachine = 60_000 / plan.durationTicks;
    const matchingByRegion = new Map<string, typeof allMatching>();
    for (const device of allMatching) matchingByRegion.set(device.region, [...(matchingByRegion.get(device.region) ?? []), device]);
    const targetRegion = deliveryTargets.find((target) => target.resource === row.primaryResource)?.region;
    const regions = targetRegion
      ? [targetRegion]
      : [...matchingByRegion.keys()].sort();
    const totalConfiguredCycles = regions.reduce((sum, region) => sum + (matchingByRegion.get(region)?.length ?? 0) * cyclesPerMachine, 0);
    return regions.map((region, regionIndex) => {
      const matching = matchingByRegion.get(region) ?? [];
      const requiredCyclesPerMinute = regionIndex === regions.length - 1
        ? row.requiredCyclesPerMinute - regions.slice(0, regionIndex).reduce((sum, previousRegion) =>
          sum + row.requiredCyclesPerMinute * (matchingByRegion.get(previousRegion)?.length ?? 0) * cyclesPerMachine / totalConfiguredCycles, 0)
        : totalConfiguredCycles > 0
          ? row.requiredCyclesPerMinute * matching.length * cyclesPerMachine / totalConfiguredCycles
          : row.requiredCyclesPerMinute;
      const scale = row.requiredCyclesPerMinute > 0 ? requiredCyclesPerMinute / row.requiredCyclesPerMinute : 0;
      const configuredCapacityPerMinute = matching.reduce((sum, device) => {
        const matchingPlan = device.processPlans.find((candidate) => candidate.definition.id === plan.definition.id && candidate.mode.id === plan.mode.id)!;
        const output = matchingPlan.outputs.find((amount) => amount.resource === row.primaryResource)?.count ?? 0;
        return sum + output * 60_000 / matchingPlan.durationTicks;
      }, 0);
      const requiredMachines = Math.ceil(requiredCyclesPerMinute / cyclesPerMachine - 1e-9);
      return {
        resource: row.primaryResource, process: plan.definition.id, mode: plan.mode.id, asset: template.asset,
        templateDevice: matching[0]?.id ?? template.id,
        requiredOutputPerMinute: row.outputsPerMinute[row.primaryResource]! * scale, requiredCyclesPerMinute,
        inputsPerMinute: Object.fromEntries(Object.entries(row.inputsPerMinute).map(([resource, rate]) => [resource, rate * scale])),
        outputsPerMinute: Object.fromEntries(Object.entries(row.outputsPerMinute).map(([resource, rate]) => [resource, rate * scale])),
        outputPerCycle: primaryOutput.count, capacityPerMachine, configuredMachines: matching.length, configuredCapacityPerMinute,
        requiredMachines, additionalMachines: Math.max(0, requiredMachines - matching.length), region,
        powerMilliWattsPerMachine: plan.powerMilliWatts, minimumInputTreatmentLevel: plan.mode.minimumInputTreatmentLevel,
      };
    });
  }).sort((a, b) => a.process.localeCompare(b.process) || a.region.localeCompare(b.region) || a.resource.localeCompare(b.resource));
  const toolsets = allocateToolsets(project, processes);

  const treatments: TreatmentCapacityRequirement[] = processes.flatMap((requirement) => {
    if (requirement.minimumInputTreatmentLevel <= 0) return [];
    const treatment = selectMaterialTreatment(project.deviceAssets, requirement.minimumInputTreatmentLevel);
    const template = project.devices[requirement.templateDevice]!;
    if (!treatment) return [];
    const processPlan = template.processPlans.find((plan) => plan.definition.id === requirement.process && plan.mode.id === requirement.mode)!;
    const processInputs = new Map(processPlan.definition.inputs.map((amount) => [amount.resource, amount.count * processPlan.mode.inputCycles]));
    return [...processInputs.entries()].map(([resource, perCycle]) => {
      const requiredItemsPerMinute = perCycle * requirement.requiredCyclesPerMinute;
      const requiredAgentPerMinute = requiredItemsPerMinute * treatment.mode.agent.count / treatment.mode.itemCount;
      const capacityPerDevice = treatment.mode.itemCount * 60_000 / treatment.mode.durationTicks;
      const configured = Object.values(project.devices).filter((device) => device.region === requirement.region
        && device.asset === treatment.asset.id && device.treatmentPlan?.mode.id === treatment.mode.id
        && (device.buffers[device.treatmentPlan.inputBuffer]!.accepts.includes("*") || device.buffers[device.treatmentPlan.inputBuffer]!.accepts.includes(resource)));
      const requiredDevices = Math.ceil(requiredItemsPerMinute / capacityPerDevice - 1e-9);
      return {
        process: requirement.process, mode: requirement.mode, resource, region: requirement.region,
        minimumLevel: requirement.minimumInputTreatmentLevel, asset: treatment.asset.id, treatmentMode: treatment.mode.id,
        agentResource: treatment.mode.agent.resource, requiredItemsPerMinute, requiredAgentPerMinute,
        capacityPerDevice, requiredDevices, configuredDevices: configured.length,
        configuredCapacityPerMinute: configured.length * capacityPerDevice,
        additionalDevices: Math.max(0, requiredDevices - configured.length),
      };
    });
  }).sort((left, right) => left.process.localeCompare(right.process) || left.resource.localeCompare(right.resource));

  const infrastructureDemand: Record<ResourceId, number> = {};
  for (const device of Object.values(project.devices)) if (device.generationPlan?.kind === "fuel") {
    for (const fuel of device.generationPlan.fuels) add(infrastructureDemand, fuel.resource, 60_000 / fuel.durationTicks);
  }
  const rawResources: RawCapacityRequirement[] = [...new Set([...Object.keys(rawProcessDemand), ...Object.keys(infrastructureDemand)])].sort().map((resource) => {
    const extractors = Object.values(project.devices).filter((device) => device.extractionPlan?.nodes.some((node) => node.resource === resource));
    const configuredExtractionPerMinute = extractors.reduce((sum, device) => sum + device.extractionPlan!.itemsPerCycle * 60_000 / device.extractionPlan!.cycleTicks, 0);
    const perExtractor = Math.max(0, ...extractors.map((device) => device.extractionPlan!.itemsPerCycle * 60_000 / device.extractionPlan!.cycleTicks));
    const processDemandPerMinute = rawProcessDemand[resource] ?? 0;
    const infrastructureDemandPerMinute = infrastructureDemand[resource] ?? 0;
    const totalDemandPerMinute = processDemandPerMinute + infrastructureDemandPerMinute;
    const scheduledSupply = (project.scenario.lotReleases ?? []).filter((lot) => lot.resource === resource).length
      + (project.scenario.materialDeliveries ?? []).filter((delivery) => delivery.resource === resource).reduce((sum, delivery) => sum + delivery.count, 0);
    const scheduledSupplyPerMinute = scenarioMinutes > 0 ? scheduledSupply / scenarioMinutes : 0;
    const configuredSupplyPerMinute = configuredExtractionPerMinute + scheduledSupplyPerMinute;
    const supplyDeficitPerMinute = Math.max(0, totalDemandPerMinute - configuredSupplyPerMinute);
    const additionalExtractors = supplyDeficitPerMinute > 0 && perExtractor > 0 ? Math.ceil(supplyDeficitPerMinute / perExtractor - 1e-9) : supplyDeficitPerMinute > 0 ? 1 : 0;
    const finiteReserve = Object.values(project.resourceNodes).filter((node) => node.resource === resource).reduce((sum, node) => sum + node.amount, 0);
    const scenarioDemand = totalDemandPerMinute * scenarioMinutes;
    return {
      resource, processDemandPerMinute, infrastructureDemandPerMinute, totalDemandPerMinute,
      configuredExtractors: extractors.length, configuredExtractionPerMinute,
      scheduledSupply, scheduledSupplyPerMinute, configuredSupplyPerMinute, supplyDeficitPerMinute, additionalExtractors,
      finiteReserve, lifetimeMinutes: finiteReserve > 0 && totalDemandPerMinute > 0 ? finiteReserve / totalDemandPerMinute : null,
      scenarioDemand, scenarioSupply: finiteReserve + scheduledSupply, scenarioBalance: finiteReserve + scheduledSupply - scenarioDemand,
    };
  });

  const transport: TransportCapacityRequirement[] = processes.flatMap((requirement) => {
    const devices = Object.values(project.devices).filter((device) => device.region === requirement.region && device.asset === requirement.asset
      && device.processPlans.some((plan) => plan.definition.id === requirement.process && plan.mode.id === requirement.mode));
    const ids = new Set(devices.map((device) => device.id));
    const rows: TransportCapacityRequirement[] = [];
    const template = project.devices[requirement.templateDevice]!;
    const processPlan = template.processPlans.find((plan) => plan.definition.id === requirement.process && plan.mode.id === requirement.mode)!;
    const machineInputs = effectiveProductionAmounts(processPlan.definition, processPlan.mode).inputs;
    const machineInputRates: Record<ResourceId, number> = {};
    for (const amount of machineInputs) add(machineInputRates, amount.resource, amount.count * requirement.requiredCyclesPerMinute);
    for (const [resource, requiredItemsPerMinute] of Object.entries(machineInputRates)) {
      const links = Object.values(project.connections).filter((connection) => ids.has(connection.to.device)
        && connection.resources.includes(resource)
        && (connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes("*") || connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes(resource)));
      const configuredCapacityPerMinute = links.reduce((sum, link) => sum + connectionCapacityPerMinute(link, resource), 0);
      rows.push({
        direction: "input", process: requirement.process, resource, devices: [...ids].sort(), connections: links.map((link) => link.id).sort(),
        requiredItemsPerMinute, configuredCapacityPerMinute, capacityDeficitPerMinute: Math.max(0, requiredItemsPerMinute - configuredCapacityPerMinute),
      });
    }
    for (const [resource, requiredItemsPerMinute] of Object.entries(requirement.outputsPerMinute)) {
      const links = Object.values(project.connections).filter((connection) => ids.has(connection.from.device)
        && connection.resources.includes(resource)
        && (connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes("*") || connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes(resource)));
      const configuredCapacityPerMinute = links.reduce((sum, link) => sum + connectionCapacityPerMinute(link, resource), 0);
      rows.push({
        direction: "output", process: requirement.process, resource, devices: [...ids].sort(), connections: links.map((link) => link.id).sort(),
        requiredItemsPerMinute, configuredCapacityPerMinute,
        capacityDeficitPerMinute: Math.max(0, requiredItemsPerMinute - configuredCapacityPerMinute),
      });
    }
    return rows;
  });
  for (const treatment of treatments) {
    const devices = Object.values(project.devices).filter((device) => device.region === treatment.region && device.asset === treatment.asset
      && device.treatmentPlan?.mode.id === treatment.treatmentMode
      && (device.buffers[device.treatmentPlan.inputBuffer]!.accepts.includes("*") || device.buffers[device.treatmentPlan.inputBuffer]!.accepts.includes(treatment.resource)));
    const ids = new Set(devices.map((device) => device.id));
    const rows = [
      { direction: "input" as const, resource: treatment.resource, requiredItemsPerMinute: treatment.requiredItemsPerMinute,
        links: Object.values(project.connections).filter((connection) => ids.has(connection.to.device) && connection.resources.includes(treatment.resource)) },
      { direction: "output" as const, resource: treatment.resource, requiredItemsPerMinute: treatment.requiredItemsPerMinute,
        links: Object.values(project.connections).filter((connection) => ids.has(connection.from.device) && connection.resources.includes(treatment.resource)) },
      { direction: "input" as const, resource: treatment.agentResource, requiredItemsPerMinute: treatment.requiredAgentPerMinute,
        links: Object.values(project.connections).filter((connection) => ids.has(connection.to.device) && connection.resources.includes(treatment.agentResource)) },
    ];
    for (const row of rows) {
      const configuredCapacityPerMinute = row.links.reduce((sum, link) => sum + connectionCapacityPerMinute(link, row.resource), 0);
      transport.push({
        direction: row.direction, process: `${treatment.process}:${treatment.treatmentMode}`, resource: row.resource,
        devices: [...ids].sort(), connections: row.links.map((link) => link.id).sort(), requiredItemsPerMinute: row.requiredItemsPerMinute,
        configuredCapacityPerMinute, capacityDeficitPerMinute: Math.max(0, row.requiredItemsPerMinute - configuredCapacityPerMinute),
      });
    }
  }
  transport.sort((a, b) => a.process.localeCompare(b.process) || a.direction.localeCompare(b.direction) || a.resource.localeCompare(b.resource));

  const compiledNetworks = Object.values(project.logisticsNetworks);
  const stationNetworks: StationCapacityRequirement[] = compiledNetworks.flatMap((network) => {
    const bySourceResource = new Map<string, typeof network.routes>();
    for (const route of network.routes) {
      const key = `${route.from}\0${route.resource}`;
      bySourceResource.set(key, [...(bySourceResource.get(key) ?? []), route]);
    }
    return [...bySourceResource.entries()].map(([key, routes]) => {
      const [source, resource] = key.split("\0") as [string, ResourceId];
      const parallelNetworks = Math.max(1, ...routes.map((route) => compiledNetworks.filter((candidate) => candidate.routes.some((candidateRoute) =>
        candidateRoute.resource === resource && candidateRoute.fromRegion === route.fromRegion && candidateRoute.toRegion === route.toRegion)).length));
      const requiredItemsPerMinute = processes.reduce((sum, process) => sum + (process.inputsPerMinute[resource] ?? 0), 0) / parallelNetworks;
      const perCarrierItemsPerMinute = Math.max(0, ...routes.map((route) => route.capacity * 60_000 / route.roundTripTicks));
      const energyLimitedItemsPerMinute = Math.max(0, ...routes.map((route) => {
        const charge = project.devices[route.from]!.stationEnergyPlan!.chargeMilliWatts;
        return charge * 60 / route.missionEnergyMilliJoules * route.capacity;
      }));
      const requiredCarriers = perCarrierItemsPerMinute > 0 ? Math.ceil(requiredItemsPerMinute / perCarrierItemsPerMinute - 1e-9) : 0;
      const configuredCarriers = Math.max(0, ...routes.map((route) => route.fleetSize));
      const configuredItemsPerMinute = Math.min(configuredCarriers * perCarrierItemsPerMinute, energyLimitedItemsPerMinute);
      const requiredChargeMilliWatts = Math.max(0, ...routes.map((route) => requiredItemsPerMinute / route.capacity * route.missionEnergyMilliJoules / 60));
      const configuredChargeMilliWatts = Math.max(0, ...routes.map((route) => project.devices[route.from]!.stationEnergyPlan!.chargeMilliWatts));
      return {
        network: network.id, source, carrierAsset: routes[0]!.carrierAsset, resource, routes: routes.map((route) => route.id).sort(), requiredItemsPerMinute, perCarrierItemsPerMinute,
        energyLimitedItemsPerMinute, configuredItemsPerMinute,
        requiredCarriers, configuredCarriers, additionalCarriers: Math.max(0, requiredCarriers - configuredCarriers),
        additionalChargeMilliWatts: Math.max(0, Math.ceil(requiredChargeMilliWatts - configuredChargeMilliWatts - 1e-9)),
      };
    });
  }).sort((a, b) => a.network.localeCompare(b.network) || a.source.localeCompare(b.source) || a.resource.localeCompare(b.resource));

  const requiredPowerByRegion: Record<string, number> = {};
  const toolsetOperations = new Set(toolsets.flatMap((toolset) => toolset.operations.map((operation) => `${toolset.region}\0${toolset.asset}\0${operation.process}\0${operation.mode}`)));
  for (const toolset of toolsets) {
    const maximumPower = Math.max(...toolset.operations.map((operation) => processes.find((process) => process.region === toolset.region && process.asset === toolset.asset
      && process.process === operation.process && process.mode === operation.mode)!.powerMilliWattsPerMachine));
    add(requiredPowerByRegion, toolset.region, Math.ceil(toolset.requiredDeviceTicksPerMinute / 60_000 - 1e-9) * maximumPower);
  }
  for (const process of processes) if (!toolsetOperations.has(`${process.region}\0${process.asset}\0${process.process}\0${process.mode}`)) {
    add(requiredPowerByRegion, process.region, process.requiredMachines * process.powerMilliWattsPerMachine);
  }
  for (const treatment of treatments) add(requiredPowerByRegion, treatment.region,
    treatment.requiredDevices * project.deviceAssets[treatment.asset]!.power.activeMilliWatts);
  for (const raw of rawResources) {
    const templates = Object.values(project.devices).filter((device) => device.extractionPlan?.nodes.some((node) => node.resource === raw.resource));
    const template = templates.sort((a, b) => a.id.localeCompare(b.id))[0];
    if (template) add(requiredPowerByRegion, template.region, (raw.configuredExtractors + raw.additionalExtractors) * template.assetDef.power.activeMilliWatts);
  }
  for (const device of Object.values(project.devices)) if (device.assetDef.capabilities.includes("station") || device.assetDef.capabilities.includes("transport-junction")) {
    add(requiredPowerByRegion, device.region, device.stationEnergyPlan
      ? device.assetDef.power.idleMilliWatts + device.stationEnergyPlan.chargeMilliWatts
      : device.assetDef.power.activeMilliWatts);
  }
  for (const connection of Object.values(project.connections)) for (const stage of connection.logisticsStages) {
    if (stage.region) add(requiredPowerByRegion, stage.region, stage.asset.power.activeMilliWatts);
  }
  const power: PowerCapacityRequirement[] = project.world.regions.map((region) => {
    const requiredMilliWatts = requiredPowerByRegion[region.id] ?? 0;
    const regionGrids = Object.values(project.powerGrids).filter((grid) => grid.region === region.id);
    const configuredGenerationMilliWatts = regionGrids.reduce((sum, grid) => sum + grid.productionMilliWatts, 0);
    const generationDevices = Object.values(project.devices).filter((device) => device.region === region.id && device.generationPlan);
    const sources = generationDevices.map((device) => ({
      outputMilliWatts: device.generationPlan!.outputMilliWatts, count: 1,
      ...(device.generationPlan!.kind === "renewable" ? { profile: renewableProfileFor(project.scenario, region.id, device.asset) } : {}),
    }));
    const configuredStorageCapacityMilliJoules = regionGrids.reduce((sum, grid) => sum + grid.storageCapacityMilliJoules, 0);
    const configuredStorageChargeMilliWatts = regionGrids.reduce((sum, grid) => sum + grid.storageChargeMilliWatts, 0);
    const configuredStorageDischargeMilliWatts = regionGrids.reduce((sum, grid) => sum + grid.storageDischargeMilliWatts, 0);
    const initialMilliJoules = Object.values(project.devices).filter((device) => device.region === region.id && device.storagePlan)
      .reduce((sum, device) => sum + (project.scenario.initialEnergyMilliJoules?.[device.id] ?? 0), 0);
    const envelope = evaluatePowerEnvelope({
      durationTicks: project.scenario.durationTicks, loadMilliWatts: requiredMilliWatts, sources,
      storage: {
        capacityMilliJoules: configuredStorageCapacityMilliJoules, chargeMilliWatts: configuredStorageChargeMilliWatts,
        dischargeMilliWatts: configuredStorageDischargeMilliWatts, initialMilliJoules,
      },
    });
    return {
      region: region.id, requiredMilliWatts, configuredGenerationMilliWatts,
      headroomMilliWatts: configuredGenerationMilliWatts - requiredMilliWatts,
      scenarioGeneratedMilliJoules: envelope.generatedMilliJoules, scenarioDemandMilliJoules: envelope.demandMilliJoules,
      scenarioUnservedMilliJoules: envelope.unservedMilliJoules, scenarioCurtailedMilliJoules: envelope.curtailedMilliJoules,
      requiredStorageCapacityMilliJoules: envelope.requiredStorageCapacityMilliJoules,
      configuredStorageCapacityMilliJoules, configuredStorageChargeMilliWatts, configuredStorageDischargeMilliWatts,
    };
  });

  const gaps: ProductionCapacityPlan["gaps"] = [];
  for (const process of processes) if (process.additionalMachines > 0) gaps.push({ kind: "process", entity: process.process, message: `${process.process} needs ${process.requiredMachines} ${process.asset} but configures ${process.configuredMachines}; add ${process.additionalMachines}` });
  for (const toolset of toolsets) if (toolset.unallocatedDeviceTicksPerMinute > 1e-9) gaps.push({
    kind: "toolset", entity: toolset.id,
    message: `${toolset.id} qualification load leaves ${(toolset.unallocatedDeviceTicksPerMinute / 60_000).toFixed(3)} machine-equivalents unallocated across ${toolset.operations.map((operation) => `${operation.process}/${operation.mode}`).join(" + ")}; add ${toolset.minimumAdditionalDevices} qualified ${toolset.asset}`,
  });
  for (const treatment of treatments) if (treatment.additionalDevices > 0) gaps.push({
    kind: "treatment", entity: `${treatment.process}:${treatment.resource}@${treatment.minimumLevel}`,
    message: `${treatment.process} needs ${treatment.requiredDevices} ${treatment.asset}/${treatment.treatmentMode} for ${treatment.requiredItemsPerMinute.toFixed(3)} ${treatment.resource}@${treatment.minimumLevel}+/min but configures ${treatment.configuredDevices}; add ${treatment.additionalDevices}`,
  });
  for (const raw of rawResources) {
    if (raw.supplyDeficitPerMinute > 1e-9) gaps.push({ kind: "extraction", entity: raw.resource, message: `${raw.resource} supply is short by ${raw.supplyDeficitPerMinute.toFixed(3)}/min after ${raw.scheduledSupplyPerMinute.toFixed(3)}/min scheduled external supply; add ${raw.additionalExtractors} extractor(s)` });
    if (raw.scenarioBalance < -1e-9) gaps.push({ kind: "reserve", entity: raw.resource, message: `${raw.resource} Scenario supply is short by ${(-raw.scenarioBalance).toFixed(3)} items after ${raw.scheduledSupply.toFixed(3)} scheduled external supply` });
  }
  for (const link of transport) if (link.capacityDeficitPerMinute > 1e-9) gaps.push({ kind: "transport", entity: `${link.process}:${link.direction}:${link.resource}`, message: `${link.process} ${link.direction} transport for ${link.resource} is short by ${link.capacityDeficitPerMinute.toFixed(3)}/min` });
  for (const network of stationNetworks) if (network.additionalCarriers > 0) gaps.push({ kind: "station", entity: network.network, message: `${network.network} needs ${network.requiredCarriers} carriers for ${network.resource}; add ${network.additionalCarriers}` });
  for (const network of stationNetworks) if (network.additionalChargeMilliWatts > 0) gaps.push({
    kind: "station", entity: network.network,
    message: `${network.network} carrier energy limits ${network.resource} to ${network.energyLimitedItemsPerMinute.toFixed(3)}/min; add ${(network.additionalChargeMilliWatts / 1000).toFixed(3)} W station charge power`,
  });
  for (const region of power) {
    if (region.headroomMilliWatts < 0) gaps.push({ kind: "power", entity: region.region, message: `${region.region} needs ${(-region.headroomMilliWatts / 1000).toFixed(3)} W additional rated generation` });
    else if (region.scenarioUnservedMilliJoules > 1e-6) gaps.push({
      kind: "power", entity: region.region,
      message: `${region.region} leaves ${(region.scenarioUnservedMilliJoules / 1e6).toFixed(3)} MJ unserved across Scenario '${project.scenario.id}'; add profiled generation or storage for the ${(region.requiredStorageCapacityMilliJoules / 1e6).toFixed(3)} MJ deficit envelope`,
    });
  }

  return {
    targetResource: project.objective.targetResource, targetRatePerMinute, deliveryTargets, scenarioMinutes,
    targetItemsForScenario: targetRatePerMinute * scenarioMinutes,
    processes, toolsets, treatments, rawResources, transport, stationNetworks, power, gaps, ready: gaps.length === 0,
  };
}
