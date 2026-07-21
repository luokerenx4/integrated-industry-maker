import type { Scenario, ScenarioGeneratorProfile } from "./types";

export interface PowerEnvelopeSource {
  outputMilliWatts: number;
  count: number;
  profile?: ScenarioGeneratorProfile;
}

export interface PowerEnvelopeStorage {
  capacityMilliJoules: number;
  chargeMilliWatts: number;
  dischargeMilliWatts: number;
  initialMilliJoules?: number;
}

export interface PowerEnvelope {
  durationTicks: number;
  generatedMilliJoules: number;
  demandMilliJoules: number;
  servedMilliJoules: number;
  unservedMilliJoules: number;
  curtailedMilliJoules: number;
  finalStoredMilliJoules: number;
  peakGenerationMilliWatts: number;
  peakDemandMilliWatts: number;
  peakDeficitMilliWatts: number;
  peakSurplusMilliWatts: number;
  requiredStorageCapacityMilliJoules: number;
}

export function renewableProfileFor(scenario: Scenario, region: string, asset: string): ScenarioGeneratorProfile | undefined {
  return scenario.renewableProfiles?.find((profile) => profile.region === region && (!profile.asset || profile.asset === asset));
}

function profilePermilleAt(profile: ScenarioGeneratorProfile | undefined, tick: number): number {
  if (!profile) return 1000;
  const phase = tick % profile.periodTicks;
  return [...profile.points].reverse().find((point) => point.atTick <= phase)!.outputPermille;
}

function profileBoundaries(profile: ScenarioGeneratorProfile, durationTicks: number): number[] {
  const boundaries: number[] = [];
  for (let cycleStart = 0; cycleStart < durationTicks; cycleStart += profile.periodTicks) {
    for (const point of profile.points) {
      const tick = cycleStart + point.atTick;
      if (tick > 0 && tick < durationTicks) boundaries.push(tick);
    }
  }
  return boundaries;
}

/** Integrates a constant requested load against piecewise-constant generation and one aggregate ideal storage bank. */
export function evaluatePowerEnvelope(input: {
  durationTicks: number;
  loadMilliWatts: number;
  sources: PowerEnvelopeSource[];
  storage?: PowerEnvelopeStorage;
}): PowerEnvelope {
  const storage = input.storage;
  const capacity = storage?.capacityMilliJoules ?? 0;
  let stored = Math.min(capacity, storage?.initialMilliJoules ?? 0);
  const boundaries = [...new Set([0, input.durationTicks, ...input.sources.flatMap((source) => source.profile ? profileBoundaries(source.profile, input.durationTicks) : [])])]
    .sort((a, b) => a - b);
  const result: PowerEnvelope = {
    durationTicks: input.durationTicks,
    generatedMilliJoules: 0, demandMilliJoules: 0, servedMilliJoules: 0, unservedMilliJoules: 0, curtailedMilliJoules: 0,
    finalStoredMilliJoules: stored,
    peakGenerationMilliWatts: 0, peakDemandMilliWatts: input.loadMilliWatts, peakDeficitMilliWatts: 0, peakSurplusMilliWatts: 0,
    requiredStorageCapacityMilliJoules: 0,
  };
  let deficitEpisodeMilliJoules = 0;
  for (let index = 0; index < boundaries.length - 1; index++) {
    const tick = boundaries[index]!; const duration = boundaries[index + 1]! - tick;
    if (duration <= 0) continue;
    const generated = input.sources.reduce((sum, source) => sum
      + source.count * Math.floor(source.outputMilliWatts * profilePermilleAt(source.profile, tick) / 1000), 0);
    const demandEnergy = input.loadMilliWatts * duration / 1000;
    const generatedEnergy = generated * duration / 1000;
    result.generatedMilliJoules += generatedEnergy; result.demandMilliJoules += demandEnergy;
    result.peakGenerationMilliWatts = Math.max(result.peakGenerationMilliWatts, generated);
    result.peakDeficitMilliWatts = Math.max(result.peakDeficitMilliWatts, input.loadMilliWatts - generated);
    result.peakSurplusMilliWatts = Math.max(result.peakSurplusMilliWatts, generated - input.loadMilliWatts);
    if (generated < input.loadMilliWatts) {
      const deficitPower = input.loadMilliWatts - generated;
      const deficitEnergy = deficitPower * duration / 1000;
      deficitEpisodeMilliJoules += deficitEnergy;
      result.requiredStorageCapacityMilliJoules = Math.max(result.requiredStorageCapacityMilliJoules, deficitEpisodeMilliJoules);
      const discharged = Math.min(deficitEnergy, stored, (storage?.dischargeMilliWatts ?? 0) * duration / 1000);
      stored -= discharged;
      result.servedMilliJoules += generatedEnergy + discharged;
      result.unservedMilliJoules += deficitEnergy - discharged;
    } else {
      deficitEpisodeMilliJoules = 0;
      const surplusEnergy = (generated - input.loadMilliWatts) * duration / 1000;
      const charged = Math.min(surplusEnergy, capacity - stored, (storage?.chargeMilliWatts ?? 0) * duration / 1000);
      stored += charged;
      result.servedMilliJoules += demandEnergy;
      result.curtailedMilliJoules += surplusEnergy - charged;
    }
  }
  result.finalStoredMilliJoules = stored;
  return result;
}

export interface PowerInfrastructurePlan {
  generators: number;
  storageDevices: number;
  envelope: PowerEnvelope;
  buildCost: number;
  occupiedArea: number;
}

/** Finds a deterministic low-cost generator/storage bundle that serves a constant design load from an empty cold start. */
export function optimizePowerInfrastructure(input: {
  durationTicks: number;
  loadMilliWatts: number;
  minimumGenerators: number;
  generator: { outputMilliWatts: number; buildCost: number; occupiedArea: number; profile?: ScenarioGeneratorProfile };
  storage?: { capacityMilliJoules: number; chargeMilliWatts: number; dischargeMilliWatts: number; idleMilliWatts: number; buildCost: number; occupiedArea: number };
  maxAdditionalGenerators?: number;
  maxAdditionalStorage?: number;
}): PowerInfrastructurePlan | null {
  const plans: PowerInfrastructurePlan[] = [];
  const maxGenerators = input.minimumGenerators + (input.maxAdditionalGenerators ?? 64);
  for (let generators = input.minimumGenerators; generators <= maxGenerators; generators++) {
    const sources = [{ outputMilliWatts: input.generator.outputMilliWatts, count: generators, profile: input.generator.profile }];
    const withoutStorage = evaluatePowerEnvelope({ durationTicks: input.durationTicks, loadMilliWatts: input.loadMilliWatts, sources });
    if (withoutStorage.unservedMilliJoules <= 1e-6) {
      plans.push({ generators, storageDevices: 0, envelope: withoutStorage, buildCost: generators * input.generator.buildCost, occupiedArea: generators * input.generator.occupiedArea });
      continue;
    }
    if (!input.storage || withoutStorage.generatedMilliJoules + 1e-6 < withoutStorage.demandMilliJoules) continue;
    const estimatedStorage = Math.max(1,
      Math.ceil(withoutStorage.requiredStorageCapacityMilliJoules / input.storage.capacityMilliJoules - 1e-9),
      Math.ceil(withoutStorage.peakDeficitMilliWatts / input.storage.dischargeMilliWatts - 1e-9));
    const maxStorage = estimatedStorage + (input.maxAdditionalStorage ?? 32);
    for (let storageDevices = estimatedStorage; storageDevices <= maxStorage; storageDevices++) {
      const loadMilliWatts = input.loadMilliWatts + storageDevices * input.storage.idleMilliWatts;
      const envelope = evaluatePowerEnvelope({
        durationTicks: input.durationTicks, loadMilliWatts, sources,
        storage: {
          capacityMilliJoules: storageDevices * input.storage.capacityMilliJoules,
          chargeMilliWatts: storageDevices * input.storage.chargeMilliWatts,
          dischargeMilliWatts: storageDevices * input.storage.dischargeMilliWatts,
        },
      });
      if (envelope.unservedMilliJoules > 1e-6) continue;
      plans.push({
        generators, storageDevices, envelope,
        buildCost: generators * input.generator.buildCost + storageDevices * input.storage.buildCost,
        occupiedArea: generators * input.generator.occupiedArea + storageDevices * input.storage.occupiedArea,
      });
      break;
    }
  }
  return plans.sort((a, b) => a.buildCost - b.buildCost || a.occupiedArea - b.occupiedArea
    || a.generators - b.generators || a.storageDevices - b.storageDevices)[0] ?? null;
}
