import type { CompiledFactoryProject, ResourceId } from "./types";
import { connectionCapacityPerMinute } from "./logistics-capacity";

export interface ProcessCapacityRequirement {
  resource: ResourceId;
  process: string;
  asset: string;
  templateDevice: string;
  requiredOutputPerMinute: number;
  requiredCyclesPerMinute: number;
  inputsPerMinute: Record<ResourceId, number>;
  outputPerCycle: number;
  capacityPerMachine: number;
  configuredMachines: number;
  configuredCapacityPerMinute: number;
  requiredMachines: number;
  additionalMachines: number;
  region: string;
  powerMilliWattsPerMachine: number;
}

export interface RawCapacityRequirement {
  resource: ResourceId;
  processDemandPerMinute: number;
  infrastructureDemandPerMinute: number;
  totalDemandPerMinute: number;
  configuredExtractors: number;
  configuredExtractionPerMinute: number;
  extractionDeficitPerMinute: number;
  additionalExtractors: number;
  finiteReserve: number;
  lifetimeMinutes: number | null;
  scenarioDemand: number;
  reserveAfterScenario: number;
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
  resource: ResourceId;
  routes: string[];
  requiredItemsPerMinute: number;
  perCarrierItemsPerMinute: number;
  requiredCarriers: number;
  configuredCarriers: number;
  additionalCarriers: number;
}

export interface PowerCapacityRequirement {
  region: string;
  requiredMilliWatts: number;
  configuredGenerationMilliWatts: number;
  headroomMilliWatts: number;
}

export interface ProductionCapacityPlan {
  targetResource: ResourceId;
  targetRatePerMinute: number;
  scenarioMinutes: number;
  targetItemsForScenario: number;
  processes: ProcessCapacityRequirement[];
  rawResources: RawCapacityRequirement[];
  transport: TransportCapacityRequirement[];
  stationNetworks: StationCapacityRequirement[];
  power: PowerCapacityRequirement[];
  gaps: Array<{ kind: "process" | "extraction" | "transport" | "station" | "power" | "reserve"; entity: string; message: string }>;
  ready: boolean;
}

function add(target: Record<string, number>, key: string, value: number): void {
  target[key] = (target[key] ?? 0) + value;
}

export function planProductionCapacity(project: CompiledFactoryProject): ProductionCapacityPlan {
  const targetRatePerMinute = project.objective.targetRatePerMinute;
  const scenarioMinutes = project.scenario.durationTicks / 60_000;
  const processDemand = new Map<string, {
    resource: ResourceId;
    template: CompiledFactoryProject["devices"][string];
    requiredOutputPerMinute: number;
    requiredCyclesPerMinute: number;
    inputsPerMinute: Record<ResourceId, number>;
    outputPerCycle: number;
  }>();
  const rawProcessDemand: Record<ResourceId, number> = {};

  const expand = (resource: ResourceId, requiredPerMinute: number, visiting: Set<ResourceId>): void => {
    if (requiredPerMinute <= 0) return;
    if (visiting.has(resource)) { add(rawProcessDemand, resource, requiredPerMinute); return; }
    const template = Object.values(project.devices).filter((device) => device.processPlan?.outputs.some((output) => output.resource === resource))
      .sort((a, b) => {
        const aOutput = a.processPlan!.outputs.find((output) => output.resource === resource)!.count * 60_000 / a.processPlan!.durationTicks;
        const bOutput = b.processPlan!.outputs.find((output) => output.resource === resource)!.count * 60_000 / b.processPlan!.durationTicks;
        return bOutput - aOutput || a.assetDef.economics.buildCost - b.assetDef.economics.buildCost || a.id.localeCompare(b.id);
      })[0];
    const output = template?.processPlan?.outputs.find((amount) => amount.resource === resource);
    if (!template?.processPlan || !output) { add(rawProcessDemand, resource, requiredPerMinute); return; }
    const key = `${template.processPlan.definition.id}:${template.asset}:${resource}`;
    const cycles = requiredPerMinute / output.count;
    const row = processDemand.get(key) ?? {
      resource, template, requiredOutputPerMinute: 0, requiredCyclesPerMinute: 0, inputsPerMinute: {}, outputPerCycle: output.count,
    };
    row.requiredOutputPerMinute += requiredPerMinute;
    row.requiredCyclesPerMinute += cycles;
    processDemand.set(key, row);
    const next = new Set(visiting); next.add(resource);
    for (const input of template.processPlan.inputs) {
      const inputRate = input.count * cycles;
      add(row.inputsPerMinute, input.resource, inputRate);
      expand(input.resource, inputRate, next);
    }
  };
  expand(project.objective.targetResource, targetRatePerMinute, new Set());

  const processes: ProcessCapacityRequirement[] = [...processDemand.values()].map((row) => {
    const plan = row.template.processPlan!;
    const matching = Object.values(project.devices).filter((device) => device.asset === row.template.asset && device.processPlan?.definition.id === plan.definition.id);
    const configuredCapacityPerMinute = matching.reduce((sum, device) => {
      const output = device.processPlan!.outputs.find((amount) => amount.resource === row.resource)?.count ?? 0;
      return sum + output * 60_000 / device.processPlan!.durationTicks;
    }, 0);
    const capacityPerMachine = row.outputPerCycle * 60_000 / plan.durationTicks;
    const requiredMachines = Math.ceil(row.requiredOutputPerMinute / capacityPerMachine - 1e-9);
    const additionalMachines = Math.max(0, Math.ceil(Math.max(0, row.requiredOutputPerMinute - configuredCapacityPerMinute) / capacityPerMachine - 1e-9));
    return {
      resource: row.resource, process: plan.definition.id, asset: row.template.asset, templateDevice: row.template.id,
      requiredOutputPerMinute: row.requiredOutputPerMinute, requiredCyclesPerMinute: row.requiredCyclesPerMinute,
      inputsPerMinute: Object.fromEntries(Object.entries(row.inputsPerMinute).sort(([a], [b]) => a.localeCompare(b))),
      outputPerCycle: row.outputPerCycle, capacityPerMachine, configuredMachines: matching.length, configuredCapacityPerMinute,
      requiredMachines, additionalMachines, region: row.template.region, powerMilliWattsPerMachine: row.template.assetDef.power.consumptionMilliWatts,
    };
  }).sort((a, b) => a.process.localeCompare(b.process) || a.resource.localeCompare(b.resource));

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
    const extractionDeficitPerMinute = Math.max(0, totalDemandPerMinute - configuredExtractionPerMinute);
    const additionalExtractors = extractionDeficitPerMinute > 0 && perExtractor > 0 ? Math.ceil(extractionDeficitPerMinute / perExtractor - 1e-9) : extractionDeficitPerMinute > 0 ? 1 : 0;
    const finiteReserve = Object.values(project.resourceNodes).filter((node) => node.resource === resource).reduce((sum, node) => sum + node.amount, 0);
    const scenarioDemand = totalDemandPerMinute * scenarioMinutes;
    return {
      resource, processDemandPerMinute, infrastructureDemandPerMinute, totalDemandPerMinute,
      configuredExtractors: extractors.length, configuredExtractionPerMinute, extractionDeficitPerMinute, additionalExtractors,
      finiteReserve, lifetimeMinutes: totalDemandPerMinute > 0 ? finiteReserve / totalDemandPerMinute : null,
      scenarioDemand, reserveAfterScenario: finiteReserve - scenarioDemand,
    };
  });

  const transport: TransportCapacityRequirement[] = processes.flatMap((requirement) => {
    const devices = Object.values(project.devices).filter((device) => device.asset === requirement.asset && device.processPlan?.definition.id === requirement.process);
    const ids = new Set(devices.map((device) => device.id));
    const rows: TransportCapacityRequirement[] = [];
    for (const [resource, requiredItemsPerMinute] of Object.entries(requirement.inputsPerMinute)) {
      const links = Object.values(project.connections).filter((connection) => ids.has(connection.to.device)
        && (connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes("*") || connection.toDevice.buffers[connection.toPort.buffer]!.accepts.includes(resource)));
      const configuredCapacityPerMinute = links.reduce((sum, link) => sum + connectionCapacityPerMinute(link, resource), 0);
      rows.push({
        direction: "input", process: requirement.process, resource, devices: [...ids].sort(), connections: links.map((link) => link.id).sort(),
        requiredItemsPerMinute, configuredCapacityPerMinute, capacityDeficitPerMinute: Math.max(0, requiredItemsPerMinute - configuredCapacityPerMinute),
      });
    }
    const links = Object.values(project.connections).filter((connection) => ids.has(connection.from.device)
      && (connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes("*") || connection.fromDevice.buffers[connection.fromPort.buffer]!.accepts.includes(requirement.resource)));
    const configuredCapacityPerMinute = links.reduce((sum, link) => sum + connectionCapacityPerMinute(link, requirement.resource), 0);
    rows.push({
      direction: "output", process: requirement.process, resource: requirement.resource, devices: [...ids].sort(), connections: links.map((link) => link.id).sort(),
      requiredItemsPerMinute: requirement.requiredOutputPerMinute, configuredCapacityPerMinute,
      capacityDeficitPerMinute: Math.max(0, requirement.requiredOutputPerMinute - configuredCapacityPerMinute),
    });
    return rows;
  }).sort((a, b) => a.process.localeCompare(b.process) || a.direction.localeCompare(b.direction) || a.resource.localeCompare(b.resource));

  const stationNetworks: StationCapacityRequirement[] = Object.values(project.logisticsNetworks).flatMap((network) => {
    const byResource = new Map<ResourceId, typeof network.routes>();
    for (const route of network.routes) byResource.set(route.resource, [...(byResource.get(route.resource) ?? []), route]);
    return [...byResource.entries()].map(([resource, routes]) => {
      const requiredItemsPerMinute = processes.reduce((sum, process) => sum + (process.inputsPerMinute[resource] ?? 0), 0);
      const perCarrierItemsPerMinute = Math.max(0, ...routes.map((route) => route.capacity * 60_000 / route.travelTicks));
      const requiredCarriers = perCarrierItemsPerMinute > 0 ? Math.ceil(requiredItemsPerMinute / perCarrierItemsPerMinute - 1e-9) : 0;
      return {
        network: network.id, resource, routes: routes.map((route) => route.id).sort(), requiredItemsPerMinute, perCarrierItemsPerMinute,
        requiredCarriers, configuredCarriers: network.fleetSize, additionalCarriers: Math.max(0, requiredCarriers - network.fleetSize),
      };
    });
  }).sort((a, b) => a.network.localeCompare(b.network) || a.resource.localeCompare(b.resource));

  const requiredPowerByRegion: Record<string, number> = {};
  for (const process of processes) add(requiredPowerByRegion, process.region, process.requiredMachines * process.powerMilliWattsPerMachine);
  for (const raw of rawResources) {
    const templates = Object.values(project.devices).filter((device) => device.extractionPlan?.nodes.some((node) => node.resource === raw.resource));
    const template = templates.sort((a, b) => a.id.localeCompare(b.id))[0];
    if (template) add(requiredPowerByRegion, template.region, (raw.configuredExtractors + raw.additionalExtractors) * template.assetDef.power.consumptionMilliWatts);
  }
  for (const device of Object.values(project.devices)) if (device.assetDef.capabilities.includes("station") || device.assetDef.capabilities.includes("transport-junction")) {
    add(requiredPowerByRegion, device.region, device.assetDef.power.consumptionMilliWatts);
  }
  for (const connection of Object.values(project.connections)) for (const stage of connection.logisticsStages) {
    if (stage.region) add(requiredPowerByRegion, stage.region, stage.asset.power.consumptionMilliWatts);
  }
  const power: PowerCapacityRequirement[] = project.world.regions.map((region) => {
    const requiredMilliWatts = requiredPowerByRegion[region.id] ?? 0;
    const configuredGenerationMilliWatts = Object.values(project.powerGrids).filter((grid) => grid.region === region.id).reduce((sum, grid) => sum + grid.productionMilliWatts, 0);
    return { region: region.id, requiredMilliWatts, configuredGenerationMilliWatts, headroomMilliWatts: configuredGenerationMilliWatts - requiredMilliWatts };
  });

  const gaps: ProductionCapacityPlan["gaps"] = [];
  for (const process of processes) if (process.additionalMachines > 0) gaps.push({ kind: "process", entity: process.process, message: `${process.process} needs ${process.requiredMachines} ${process.asset} but configures ${process.configuredMachines}; add ${process.additionalMachines}` });
  for (const raw of rawResources) {
    if (raw.extractionDeficitPerMinute > 1e-9) gaps.push({ kind: "extraction", entity: raw.resource, message: `${raw.resource} extraction is short by ${raw.extractionDeficitPerMinute.toFixed(3)}/min; add ${raw.additionalExtractors} extractor(s)` });
    if (raw.reserveAfterScenario < -1e-9) gaps.push({ kind: "reserve", entity: raw.resource, message: `${raw.resource} reserve is short by ${(-raw.reserveAfterScenario).toFixed(3)} items over the scenario` });
  }
  for (const link of transport) if (link.capacityDeficitPerMinute > 1e-9) gaps.push({ kind: "transport", entity: `${link.process}:${link.direction}:${link.resource}`, message: `${link.process} ${link.direction} transport for ${link.resource} is short by ${link.capacityDeficitPerMinute.toFixed(3)}/min` });
  for (const network of stationNetworks) if (network.additionalCarriers > 0) gaps.push({ kind: "station", entity: network.network, message: `${network.network} needs ${network.requiredCarriers} carriers for ${network.resource}; add ${network.additionalCarriers}` });
  for (const region of power) if (region.headroomMilliWatts < 0) gaps.push({ kind: "power", entity: region.region, message: `${region.region} needs ${(-region.headroomMilliWatts / 1000).toFixed(3)} W additional generation` });

  return {
    targetResource: project.objective.targetResource, targetRatePerMinute, scenarioMinutes,
    targetItemsForScenario: targetRatePerMinute * scenarioMinutes,
    processes, rawResources, transport, stationNetworks, power, gaps, ready: gaps.length === 0,
  };
}
