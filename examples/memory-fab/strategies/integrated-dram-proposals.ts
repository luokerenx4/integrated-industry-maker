import type { FabLossBucketId, JsonPatchOperation, ProjectProposalProvider } from "./runtime-api";

interface ProposalBlueprint {
  revision?: string;
  devices: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  policies: Record<string, unknown>;
}

interface Candidate {
  strategy: string;
  hypothesis: string;
  expectedEffect: string;
  addresses: FabLossBucketId[];
  addressesCases?: string[];
  subjects?: string[];
  patch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function equalJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => equalJson(value, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && equalJson(left[key], right[key]));
}

function facilityRedundancyPatch(blueprint: { devices: Array<Record<string, unknown>> }): JsonPatchOperation[] | null {
  if (deviceIndex(blueprint, "fab-utility-plant-2") >= 0) return null;
  return [{
    op: "add",
    path: "/devices/-",
    value: {
      id: "fab-utility-plant-2",
      asset: "fab-utility-plant",
      region: "cleanroom",
      position: { x: 34, y: 17 },
      rotation: 0,
    },
  }];
}

function facilitySecondRedundancyPatch(blueprint: { devices: Array<Record<string, unknown>> }): JsonPatchOperation[] | null {
  if (deviceIndex(blueprint, "lithography-l2") < 0
    || deviceIndex(blueprint, "fab-utility-plant-2") < 0
    || deviceIndex(blueprint, "fab-utility-plant-3") >= 0) return null;
  return [{
    op: "add",
    path: "/devices/-",
    value: {
      id: "fab-utility-plant-3",
      asset: "fab-utility-plant",
      region: "cleanroom",
      position: { x: 30, y: 22 },
      rotation: 0,
    },
  }];
}

function deviceIndex(blueprint: { devices: Array<Record<string, unknown>> }, id: string): number {
  return blueprint.devices.findIndex((device) => device.id === id);
}

function connectionIndex(blueprint: { connections: Array<Record<string, unknown>> }, id: string): number {
  return blueprint.connections.findIndex((connection) => connection.id === id);
}

function devicePolicyPatch(
  blueprint: { devices: Array<Record<string, unknown>> },
  id: string,
  policyKey: "preventiveMaintenance" | "setupCampaign",
  value: Record<string, unknown>,
): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, id);
  if (index < 0) return null;
  const policy = blueprint.devices[index]!.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return null;
  const current = (policy as Record<string, unknown>)[policyKey];
  if (equalJson(current, value)) return null;
  return [{
    op: Object.hasOwn(policy, policyKey) ? "replace" : "add",
    path: `/devices/${index}/policy/${policyKey}`,
    value,
  }];
}

function deviceLotDispatchPatch(
  blueprint: { devices: Array<Record<string, unknown>> },
  id: string,
  value: "earliest-due-date" | "highest-priority",
): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, id);
  if (index < 0) return null;
  const policy = blueprint.devices[index]!.policy;
  if (!isRecord(policy) || policy.lotDispatch === value) return null;
  return [{
    op: Object.hasOwn(policy, "lotDispatch") ? "replace" : "add",
    path: `/devices/${index}/policy/lotDispatch`,
    value,
  }];
}

function deviceRecipeModePatch(
  blueprint: { devices: Array<Record<string, unknown>> },
  id: string,
  process: string,
  mode: string,
): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, id);
  if (index < 0) return null;
  const recipe = blueprint.devices[index]!.recipe;
  if (!isRecord(recipe) || recipe.process !== process || recipe.mode === mode) return null;
  return [{
    op: Object.hasOwn(recipe, "mode") ? "replace" : "add",
    path: `/devices/${index}/recipe/mode`,
    value: mode,
  }];
}

function commissionedAgilePulsePatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const requiredAssets = {
    "inspection-1": "continuous-deep-metrology-cell",
    "rework-1": "advanced-pattern-recovery-cell",
    "maintenance-service-1": "dual-crew-maintenance-service-bay",
    "etch-l2": "closed-loop-plasma-etch-bay",
    "lithography-l2": "lithography-bay",
    "fab-utility-plant-3": "fab-utility-plant",
  };
  if (!Object.entries(requiredAssets).every(([id, asset]) => {
    const index = deviceIndex(blueprint, id);
    return index >= 0 && blueprint.devices[index]!.asset === asset;
  })) return null;
  const burnInIndex = deviceIndex(blueprint, "burn-in-1");
  const burnIn = burnInIndex >= 0 ? blueprint.devices[burnInIndex] : undefined;
  if (!burnIn
    || !isRecord(burnIn.policy)
    || burnIn.policy.recipeDispatch !== "contract-value"
    || !Array.isArray(burnIn.recipes)
    || !burnIn.recipes.every((recipe) => isRecord(recipe) && recipe.mode === "high-throughput-qualified")
    || !equalJson(blueprint.policies.lotRelease, {
      kind: "conwip",
      maximumWip: 6,
      reopenAtWip: 3,
      serviceLevelAfterTicks: 18_000,
      dispatch: "earliest-due-date",
    })) return null;
  return deviceRecipeModePatch(
    blueprint,
    "deposition-1",
    "deposit-dielectric-stack",
    "agile-pulse",
  );
}

function commissionedAdaptiveCadencePatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  if (![
    "5f2852b5c09a5fe68e7ab1a32a52cc401742146caaf51fb8a672ada8a89882fd",
    "6ed24bc31d8176104a511777e4e6296f04a623547c8d97c491196e28e00f1c23",
  ].includes(blueprint.revision ?? "")) return null;
  const index = deviceIndex(blueprint, "deposition-1");
  if (index < 0) return null;
  const deposition = blueprint.devices[index]!;
  const recipe = deposition.recipe;
  const policy = deposition.policy;
  if (deposition.asset !== "ald-deposition-bay"
    || !isRecord(recipe)
    || recipe.process !== "deposit-dielectric-stack"
    || recipe.mode !== "qualified"
    || deposition.recipes !== undefined
    || !isRecord(policy)
    || policy.recipeDispatch !== undefined
    || policy.cadenceControl !== undefined) return null;
  const normal = structuredClone(recipe);
  return [
    { op: "remove", path: `/devices/${index}/recipe` },
    { op: "add", path: `/devices/${index}/recipes`, value: [normal, { ...structuredClone(normal), mode: "agile-pulse" }] },
    {
      op: "add",
      path: `/devices/${index}/policy/cadenceControl`,
      value: {
        kind: "downstream-starvation-recovery",
        process: "deposit-dielectric-stack",
        normalMode: "qualified",
        recoveryMode: "agile-pulse",
        downstreamConnection: "deposition-to-batch-furnace",
        recoverBelowItems: 1,
        minimumStarvationTicks: 10_000,
      },
    },
  ];
}

function lithographyCampaignInterruptionEscapePatch(
  blueprint: { devices: Array<Record<string, unknown>> },
): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, "lithography-1");
  if (index < 0) return null;
  const policy = blueprint.devices[index]!.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) return null;
  const campaign = (policy as Record<string, unknown>).setupCampaign;
  if (!campaign || typeof campaign !== "object" || Array.isArray(campaign)) return null;
  const value = campaign as Record<string, unknown>;
  if (value.minimumReadyLots !== 3 || value.maximumHoldTicks !== 12_000) return null;
  return [{
    op: "replace",
    path: `/devices/${index}/policy/setupCampaign`,
    value: { minimumReadyLots: 3, maximumHoldTicks: 0 },
  }];
}

function furnaceBatchFormationPatch(blueprint: { devices: Array<Record<string, unknown>> }): JsonPatchOperation[] | null {
  const index = deviceIndex(blueprint, "furnace-1");
  if (index < 0) return null;
  const furnace = blueprint.devices[index]!;
  const policy = furnace.policy;
  const recipe = furnace.recipe;
  if (furnace.asset !== "thermal-batch-furnace"
    || !policy || typeof policy !== "object" || Array.isArray(policy)
    || !recipe || typeof recipe !== "object" || Array.isArray(recipe)
    || (recipe as Record<string, unknown>).process !== "batch-anneal-dielectric-stack"
    || furnace.recipes !== undefined) return null;
  const batchRecipe = structuredClone(recipe);
  const rapidRecipe = { ...structuredClone(recipe), process: "rapid-anneal-dielectric-stack" };
  return [
    { op: "remove", path: `/devices/${index}/recipe` },
    { op: "add", path: `/devices/${index}/recipes`, value: [batchRecipe, rapidRecipe] },
    {
      op: Object.hasOwn(policy, "batchFormation") ? "replace" : "add",
      path: `/devices/${index}/policy/batchFormation`,
      value: { preferredProcess: "batch-anneal-dielectric-stack", maximumWaitTicks: 30_000 },
    },
  ];
}

function commissionedQTimeCapacityPatch(
  blueprint: { devices: Array<Record<string, unknown>> },
): JsonPatchOperation[] | null {
  const commissionedDevices = ["lithography-l2", "etch-l2", "fab-utility-plant-3"];
  if (commissionedDevices.some((id) => deviceIndex(blueprint, id) < 0)) return null;
  const furnaceIndex = deviceIndex(blueprint, "furnace-1");
  const serviceIndex = deviceIndex(blueprint, "maintenance-service-1");
  if (furnaceIndex < 0 || serviceIndex < 0) return null;
  const furnace = blueprint.devices[furnaceIndex]!;
  const service = blueprint.devices[serviceIndex]!;
  const policy = furnace.policy;
  const recipe = furnace.recipe;
  if (furnace.asset !== "thermal-batch-furnace"
    || service.asset !== "maintenance-service-bay"
    || !isRecord(policy)
    || !isRecord(recipe)
    || recipe.process !== "batch-anneal-dielectric-stack"
    || furnace.recipes !== undefined) return null;
  return [
    { op: "remove", path: `/devices/${furnaceIndex}/recipe` },
    {
      op: "add",
      path: `/devices/${furnaceIndex}/recipes`,
      value: [
        structuredClone(recipe),
        { ...structuredClone(recipe), process: "rapid-anneal-dielectric-stack" },
      ],
    },
    {
      op: Object.hasOwn(policy, "batchFormation") ? "replace" : "add",
      path: `/devices/${furnaceIndex}/policy/batchFormation`,
      value: { preferredProcess: "batch-anneal-dielectric-stack", maximumWaitTicks: 0 },
    },
    {
      op: "replace",
      path: `/devices/${serviceIndex}/asset`,
      value: "dual-crew-maintenance-service-bay",
    },
  ];
}

function continuousDeepMetrologyPatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const inspectionIndex = deviceIndex(blueprint, "inspection-1");
  if (inspectionIndex < 0) return null;
  const inspection = blueprint.devices[inspectionIndex]!;
  const recipe = inspection.recipe;
  const policy = inspection.policy;
  const incumbentRelease = {
    kind: "conwip",
    maximumWip: 9,
    reopenAtWip: 6,
    serviceLevelAfterTicks: 18_000,
    dispatch: "earliest-due-date",
  };
  if (inspection.asset !== "wafer-inspection-bay"
    || !isRecord(recipe)
    || recipe.process !== "inspect-final-pattern-deep"
    || !isRecord(policy)
    || Object.hasOwn(policy, "preventiveMaintenance")
    || !equalJson(blueprint.policies.lotRelease, incumbentRelease)) return null;
  return [
    {
      op: "replace",
      path: `/devices/${inspectionIndex}/asset`,
      value: "continuous-deep-metrology-cell",
    },
    {
      op: "replace",
      path: "/policies/lotRelease",
      value: {
        kind: "conwip",
        maximumWip: 7,
        reopenAtWip: 4,
        serviceLevelAfterTicks: 30_000,
        dispatch: "earliest-due-date",
      },
    },
  ];
}

function advancedPatternRecoveryPatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const recoveryIndex = deviceIndex(blueprint, "rework-1");
  if (recoveryIndex < 0) return null;
  const recovery = blueprint.devices[recoveryIndex]!;
  const recipe = recovery.recipe;
  const policy = recovery.policy;
  const incumbentRelease = {
    kind: "conwip",
    maximumWip: 7,
    reopenAtWip: 4,
    serviceLevelAfterTicks: 30_000,
    dispatch: "earliest-due-date",
  };
  if (recovery.asset !== "pattern-rework-bay"
    || !isRecord(recipe)
    || recipe.process !== "rework-final-pattern"
    || !isRecord(policy)
    || Object.hasOwn(policy, "preventiveMaintenance")
    || !equalJson(blueprint.policies.lotRelease, incumbentRelease)) return null;
  return [
    {
      op: "replace",
      path: `/devices/${recoveryIndex}/asset`,
      value: "advanced-pattern-recovery-cell",
    },
    {
      op: "replace",
      path: `/devices/${recoveryIndex}/recipe/process`,
      value: "recover-final-pattern-advanced",
    },
    {
      op: "replace",
      path: "/policies/lotRelease",
      value: {
        kind: "conwip",
        maximumWip: 6,
        reopenAtWip: 3,
        serviceLevelAfterTicks: 18_000,
        dispatch: "earliest-due-date",
      },
    },
  ];
}

function recoveredOutputHighThroughputPatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const recoveryPatch = advancedPatternRecoveryPatch(blueprint);
  const burnInIndex = deviceIndex(blueprint, "burn-in-1");
  if (!recoveryPatch || burnInIndex < 0) return null;
  const recipes = blueprint.devices[burnInIndex]!.recipes;
  if (!Array.isArray(recipes)) return null;
  const requiredProcesses = new Set(["screen-commercial-dram", "screen-performance-mix"]);
  const modePatch: JsonPatchOperation[] = [];
  for (const [recipeIndex, recipe] of recipes.entries()) {
    if (!isRecord(recipe) || !requiredProcesses.has(String(recipe.process)) || recipe.mode !== "qualified") continue;
    modePatch.push({
      op: "replace",
      path: `/devices/${burnInIndex}/recipes/${recipeIndex}/mode`,
      value: "high-throughput-qualified",
    });
  }
  return modePatch.length === requiredProcesses.size ? [...recoveryPatch, ...modePatch] : null;
}

function burnInContractValuePatch(blueprint: { devices: Array<Record<string, unknown>> }): JsonPatchOperation[] | null {
  const requiredCommissionedDevices = ["fab-utility-plant-2", "lithography-1", "burn-in-1"];
  if (requiredCommissionedDevices.some((id) => deviceIndex(blueprint, id) < 0)) return null;
  const lithography = blueprint.devices[deviceIndex(blueprint, "lithography-1")]!;
  const lithographyPolicy = lithography.policy;
  if (!lithographyPolicy || typeof lithographyPolicy !== "object" || Array.isArray(lithographyPolicy)) return null;
  const campaign = (lithographyPolicy as Record<string, unknown>).setupCampaign;
  const commissionedSharedTool = campaign && typeof campaign === "object" && !Array.isArray(campaign)
    && (campaign as Record<string, unknown>).minimumReadyLots === 3
    && (campaign as Record<string, unknown>).maximumHoldTicks === 0;
  if (!commissionedSharedTool && deviceIndex(blueprint, "lithography-l2") < 0) return null;
  const index = deviceIndex(blueprint, "burn-in-1");
  const policy = blueprint.devices[index]!.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)
    || (policy as Record<string, unknown>).recipeDispatch === "contract-value") return null;
  return [{
    op: Object.hasOwn(policy, "recipeDispatch") ? "replace" : "add",
    path: `/devices/${index}/policy/recipeDispatch`,
    value: "contract-value",
  }];
}

function lithographyLayerTwoSpecializationPatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const requiredDevices = [
    "fab-utility-plant-2",
    "lithography-1",
    "furnace-1",
    "inspection-1",
    "burn-in-1",
    "batch-furnace-to-lithography-unloader",
  ];
  if (requiredDevices.some((id) => deviceIndex(blueprint, id) < 0)
    || deviceIndex(blueprint, "lithography-l2") >= 0
    || deviceIndex(blueprint, "lithography-to-etch-lithography-l2-loader") >= 0
    || deviceIndex(blueprint, "lithography-to-etch-lithography-l2-unloader") >= 0) return null;
  const lithographyIndex = deviceIndex(blueprint, "lithography-1");
  const inspection = blueprint.devices[deviceIndex(blueprint, "inspection-1")]!;
  const burnIn = blueprint.devices[deviceIndex(blueprint, "burn-in-1")]!;
  const lithography = blueprint.devices[lithographyIndex]!;
  const lithographyPolicy = lithography.policy;
  const inspectionPolicy = inspection.policy;
  const burnInPolicy = burnIn.policy;
  const recipes = lithography.recipes;
  if (!isRecord(lithographyPolicy) || !isRecord(inspectionPolicy) || !isRecord(burnInPolicy)
    || inspectionPolicy.lotDispatch !== "earliest-due-date"
    || burnInPolicy.recipeDispatch !== "contract-value"
    || !Array.isArray(recipes) || recipes.length !== 2) return null;
  const campaign = lithographyPolicy.setupCampaign;
  const maintenance = lithographyPolicy.preventiveMaintenance;
  const opportunisticMaintenance = isRecord(maintenance) ? maintenance.opportunistic : null;
  if (!isRecord(campaign) || campaign.minimumReadyLots !== 3 || campaign.maximumHoldTicks !== 0
    || !isRecord(opportunisticMaintenance) || opportunisticMaintenance.afterJobs !== 6) return null;
  const layerOneRecipe = recipes.find((recipe) => isRecord(recipe) && recipe.process === "pattern-cell-layer-1");
  const layerTwoRecipe = recipes.find((recipe) => isRecord(recipe) && recipe.process === "pattern-cell-layer-2");
  if (!isRecord(layerOneRecipe) || !isRecord(layerTwoRecipe)) return null;

  const lithographyToEtchIndex = connectionIndex(blueprint, "lithography-to-etch");
  const furnaceToLithographyIndex = connectionIndex(blueprint, "batch-furnace-to-lithography");
  const furnaceUnloaderIndex = deviceIndex(blueprint, "batch-furnace-to-lithography-unloader");
  if (lithographyToEtchIndex < 0 || furnaceToLithographyIndex < 0 || furnaceUnloaderIndex < 0
    || connectionIndex(blueprint, "lithography-to-etch-lithography-l2") >= 0) return null;
  const lithographyToEtch = blueprint.connections[lithographyToEtchIndex]!;
  const furnaceToLithography = blueprint.connections[furnaceToLithographyIndex]!;
  const furnaceUnloader = blueprint.devices[furnaceUnloaderIndex]!;
  const { setupCampaign: _setupCampaign, ...specializedPolicy } = lithographyPolicy;
  const layerTwoDevice = {
    ...structuredClone(lithography),
    id: "lithography-l2",
    position: { x: 15, y: 9 },
    rotation: 90,
    recipes: [structuredClone(layerTwoRecipe)],
    policy: structuredClone(specializedPolicy),
  };
  const layerTwoConnectionId = "lithography-to-etch-lithography-l2";

  return [
    {
      op: "replace",
      path: `/devices/${lithographyIndex}`,
      value: { ...structuredClone(lithography), recipes: [structuredClone(layerOneRecipe)], policy: structuredClone(specializedPolicy) },
    },
    {
      op: "replace",
      path: `/devices/${furnaceUnloaderIndex}`,
      value: { ...structuredClone(furnaceUnloader), position: { x: 18, y: 10 }, rotation: 180 },
    },
    { op: "add", path: "/devices/-", value: layerTwoDevice },
    {
      op: "add",
      path: "/devices/-",
      value: {
        id: `${layerTwoConnectionId}-loader`,
        asset: "sorter",
        region: "cleanroom",
        position: { x: 16, y: 12 },
        rotation: 90,
        transportEndpoint: { connection: layerTwoConnectionId, stage: "loader", distance: 1 },
      },
    },
    {
      op: "add",
      path: "/devices/-",
      value: {
        id: `${layerTwoConnectionId}-unloader`,
        asset: "sorter",
        region: "cleanroom",
        position: { x: 16, y: 13 },
        rotation: 0,
        transportEndpoint: { connection: layerTwoConnectionId, stage: "unloader", distance: 1 },
      },
    },
    {
      op: "replace",
      path: `/connections/${lithographyToEtchIndex}`,
      value: {
        ...structuredClone(lithographyToEtch),
        resources: ["patterned-cell-l1-lot"],
        path: [
          { x: 11, y: 13 },
          { x: 12, y: 13 },
          { x: 13, y: 13 },
          { x: 14, y: 13 },
          { x: 15, y: 13 },
          { x: 16, y: 13 },
        ],
      },
    },
    {
      op: "replace",
      path: `/connections/${furnaceToLithographyIndex}`,
      value: {
        ...structuredClone(furnaceToLithography),
        to: { device: "lithography-l2", port: "reentrant-input" },
        path: [
          { x: 24, y: 6 },
          { x: 23, y: 6 },
          { x: 22, y: 6 },
          { x: 21, y: 6 },
          { x: 20, y: 6 },
          { x: 19, y: 6 },
          { x: 18, y: 6 },
          { x: 18, y: 7 },
          { x: 18, y: 8 },
          { x: 18, y: 9 },
          { x: 18, y: 10 },
        ],
      },
    },
    {
      op: "add",
      path: "/connections/-",
      value: {
        id: layerTwoConnectionId,
        from: { device: "lithography-l2", port: "pattern-output" },
        to: { device: "etch-1", port: "pattern-input" },
        resources: ["patterned-cell-l2-lot"],
        path: [{ x: 16, y: 12 }, { x: 16, y: 13 }],
        logistics: {
          loader: { device: `${layerTwoConnectionId}-loader` },
          line: { deviceAsset: "conveyor" },
          unloader: { device: `${layerTwoConnectionId}-unloader` },
        },
      },
    },
  ];
}

function etchLayerTwoQualityCellPatch(blueprint: ProposalBlueprint): JsonPatchOperation[] | null {
  const etchIndex = deviceIndex(blueprint, "etch-1");
  const inspectionIndex = deviceIndex(blueprint, "inspection-1");
  const inspectionLoaderIndex = deviceIndex(blueprint, "etch-to-inspection-loader");
  const layerTwoUnloaderIndex = deviceIndex(blueprint, "lithography-to-etch-lithography-l2-unloader");
  const etchToInspectionIndex = connectionIndex(blueprint, "etch-to-inspection");
  const layerTwoInputIndex = connectionIndex(blueprint, "lithography-to-etch-lithography-l2");
  if (deviceIndex(blueprint, "lithography-l2") < 0
    || deviceIndex(blueprint, "etch-l2") >= 0
    || [etchIndex, inspectionIndex, inspectionLoaderIndex, layerTwoUnloaderIndex, etchToInspectionIndex, layerTwoInputIndex]
      .some((index) => index < 0)) return null;

  const etch = blueprint.devices[etchIndex]!;
  const inspection = blueprint.devices[inspectionIndex]!;
  const inspectionLoader = blueprint.devices[inspectionLoaderIndex]!;
  const layerTwoUnloader = blueprint.devices[layerTwoUnloaderIndex]!;
  const etchToInspection = blueprint.connections[etchToInspectionIndex]!;
  const layerTwoInput = blueprint.connections[layerTwoInputIndex]!;
  if (etch.asset !== "plasma-etch-bay" || !Array.isArray(etch.recipes) || etch.recipes.length !== 2
    || !isRecord(etch.policy)
    || !isRecord(inspection.recipe)
    || inspection.recipe.process !== "inspect-final-pattern-standard") return null;
  const layerOneRecipe = etch.recipes.find((recipe) => isRecord(recipe) && recipe.process === "etch-cell-layer-1");
  const layerTwoRecipe = etch.recipes.find((recipe) => isRecord(recipe) && recipe.process === "etch-cell-layer-2");
  if (!isRecord(layerOneRecipe) || !isRecord(layerTwoRecipe)) return null;
  const maintainedPolicy = {
    ...structuredClone(etch.policy),
    preventiveMaintenance: { opportunistic: { afterJobs: 5 } },
  };

  return [
    {
      op: "replace",
      path: `/devices/${etchIndex}`,
      value: {
        ...structuredClone(etch),
        recipes: [structuredClone(layerOneRecipe)],
        policy: maintainedPolicy,
      },
    },
    {
      op: "replace",
      path: `/devices/${inspectionIndex}/recipe/process`,
      value: "inspect-final-pattern-deep",
    },
    {
      op: "replace",
      path: `/devices/${inspectionLoaderIndex}`,
      value: {
        ...structuredClone(inspectionLoader),
        position: { x: 16, y: 18 },
        rotation: 90,
      },
    },
    {
      op: "replace",
      path: `/devices/${layerTwoUnloaderIndex}`,
      value: {
        ...structuredClone(layerTwoUnloader),
        position: { x: 14, y: 16 },
        rotation: 0,
      },
    },
    {
      op: "add",
      path: "/devices/-",
      value: {
        ...structuredClone(etch),
        id: "etch-l2",
        position: { x: 15, y: 15 },
        recipes: [structuredClone(layerTwoRecipe)],
        policy: structuredClone(maintainedPolicy),
      },
    },
    {
      op: "replace",
      path: `/connections/${etchToInspectionIndex}`,
      value: {
        ...structuredClone(etchToInspection),
        from: { device: "etch-l2", port: "final-output" },
        path: [
          { x: 16, y: 18 },
          { x: 17, y: 18 },
          { x: 17, y: 19 },
          { x: 18, y: 19 },
        ],
      },
    },
    {
      op: "replace",
      path: `/connections/${layerTwoInputIndex}`,
      value: {
        ...structuredClone(layerTwoInput),
        to: { device: "etch-l2", port: "pattern-input" },
        path: [
          { x: 16, y: 12, level: 0 },
          { x: 15, y: 12, level: 1 },
          { x: 14, y: 12, level: 1 },
          { x: 14, y: 13, level: 1 },
          { x: 14, y: 14, level: 1 },
          { x: 14, y: 15, level: 1 },
          { x: 14, y: 16, level: 0 },
        ],
      },
    },
  ];
}

const release = (maximumWip: number, reopenAtWip: number): Candidate => ({
  strategy: `dispatch:conwip-${maximumWip}-${reopenAtWip}-edd`,
  hypothesis: `A ${maximumWip}-card CONWIP loop reopening at ${reopenAtWip} lots may reduce downstream queue and Q-time exposure without withholding the fixed twelve-lot workload.`,
  expectedEffect: "Lower peak active WIP and queue time while preserving locked-case admission service and completed product.",
  addresses: ["release-admission", "queue-congestion", "input-starvation", "q-time"],
  patch: (blueprint) => {
    const value = { kind: "conwip", maximumWip, reopenAtWip, serviceLevelAfterTicks: 18_000, dispatch: "earliest-due-date" };
    if (equalJson(blueprint.policies.lotRelease, value)) return null;
    return [{
      op: Object.hasOwn(blueprint.policies, "lotRelease") ? "replace" : "add",
      path: "/policies/lotRelease",
      value,
    }];
  },
});

const candidates: Candidate[] = [
  {
    strategy: "facility:utility-n-plus-one",
    hypothesis: "A second independent fab-utility plant may preserve vacuum and hazardous-exhaust service when the primary provider trips, while its ordinary-case cost, power, and footprint remain visible to the unchanged Objective.",
    expectedEffect: "Repair the facility-interruption promotion blocker through ordinary powered N+1 provider capacity without changing the locked failure Scenario.",
    addresses: [],
    addressesCases: ["facility-interruption"],
    patch: facilityRedundancyPatch,
  },
  {
    strategy: "facility:utility-n-plus-two",
    hypothesis: "The independently qualified layer-two lithography bay needs a third spatially independent utility plant so one failed provider cannot collapse the enlarged vacuum and hazardous-exhaust envelope.",
    expectedEffect: "Repair the specialized branch's facility-interruption blocker with explicit powered N+2 utility capacity while retaining its ordinary queue and delivery gain.",
    addresses: [],
    addressesCases: ["facility-interruption"],
    patch: facilitySecondRedundancyPatch,
  },
  {
    strategy: "setup-campaign:lithography-3-0-interruption-escape",
    hypothesis: "Keeping three-lot setup-aware selection but removing voluntary campaign hold may avoid trapping ready lithography work behind an interrupted bay while retaining any benefit the locked cases can prove.",
    expectedEffect: "Eliminate the lithography-interruption promotion blocker; the unchanged Benchmark decides whether surrendering ordinary campaign waiting remains worthwhile.",
    addresses: [],
    addressesCases: ["lithography-interruption"],
    patch: lithographyCampaignInterruptionEscapePatch,
  },
  {
    strategy: "dispatch:burn-in-contract-value",
    hypothesis: "Objective-aware burn-in dispatch may fill performance and automotive demand before spending scarce test time on additional commercial-grade output.",
    expectedEffect: "Replace low-value commercial overflow with the existing fixed high-value product mix while leaving demand, binning physics, equipment, and locked scenarios unchanged.",
    addresses: ["delivery-portfolio"],
    patch: burnInContractValuePatch,
  },
  {
    strategy: "specialize:lithography-layer-two",
    hypothesis: "Moving the re-entrant second lithography pass onto an independently qualified physical bay may remove shared-tool queue and setup coupling after the commissioned dispatch and resilience controls are in place.",
    expectedEffect: "Reduce the commercial delivery shortfall through explicit layer-two lithography capacity, separately owned setup/maintenance state, and fully routed physical material lanes.",
    addresses: ["queue-congestion", "q-time", "delivery-portfolio"],
    patch: lithographyLayerTwoSpecializationPatch,
  },
  {
    strategy: "specialize:etch-layer-two-quality-cell",
    hypothesis: "Separating layer-two etch, servicing both etch bays before their measured particle-drift threshold, and closing the known latent-electrical inspection gap may turn the exposed quality bottleneck into good completed product instead of rework, scrap, or escapes.",
    expectedEffect: "Reduce equipment-drift defects, rework, scrap, and commercial shortfall through an explicitly routed etch bay, physical five-job maintenance on both bays, and deep final-pattern inspection under the unchanged five-case benchmark.",
    addresses: ["yield-quality", "queue-congestion", "delivery-portfolio", "maintenance-qualification"],
    subjects: ["etch-1"],
    patch: etchLayerTwoQualityCellPatch,
  },
  {
    strategy: "batch-formation:furnace-zero-wait+dual-service",
    hypothesis: "Let the commissioned furnace take a ready three-lot batch immediately but never hold a ready single lot for companions, while staffing the existing shared service bay with a second physical crew so inspection qualification is not trapped behind unrelated work.",
    expectedEffect: "Remove anneal companion-wait visits and reduce final-inspection maintenance Q-time through explicit furnace flexibility and staffed service capacity, with every locked case and causal quality floor remaining authoritative.",
    addresses: ["q-time", "batch-formation", "maintenance-qualification"],
    subjects: ["furnace-1", "inspection-1", "maintenance-service-1"],
    patch: commissionedQTimeCapacityPatch,
  },
  {
    strategy: "toolset-capacity:continuous-deep-metrology+conwip-7-4",
    hypothesis: "A continuous-duty deep-metrology cell can finish the complete inspection and rework-return campaign without mid-wave qualification, while a tighter seven-card release window converts its higher capacity into terminal lots instead of excess WIP.",
    expectedEffect: "Remove final-inspection Q-time contamination, reduce rework and scrap, and improve completed first-pass lots through one explicit high-power equipment replacement coupled to bounded release control.",
    addresses: ["yield-quality", "q-time", "maintenance-qualification", "release-admission", "queue-congestion"],
    subjects: ["inspection-1"],
    patch: continuousDeepMetrologyPatch,
  },
  {
    strategy: "recipe:advanced-recovery+high-throughput-burn-in",
    hypothesis: "A six-card advanced-recovery flow can become paid delivery when the existing final-test rack runs both qualified screens at two-thirds duration and 150% active power, without purchasing another rack.",
    expectedEffect: "Convert the recovered eight-device batch into delivered contract value, reduce terminal packaged-device WIP, and keep capital and occupied area within the locked ceilings.",
    addresses: ["yield-quality", "delivery-portfolio", "release-admission", "queue-congestion"],
    subjects: ["etch-l2", "rework-1", "burn-in-1"],
    patch: recoveredOutputHighThroughputPatch,
  },
  {
    strategy: "recipe:advanced-pattern-recovery+conwip-6-3-delay-18",
    hypothesis: "A high-power advanced pattern-recovery cell can remove particle contamination while a six-card release window gives the recovered lot enough downstream horizon to complete, without pretending latent electrical damage is repairable.",
    expectedEffect: "Reduce persistent quality scrap and mixed-case cycle time through one explicit recovery Process and Device coupled to bounded admission; the lithography-interruption case remains authoritative.",
    addresses: ["yield-quality", "release-admission", "queue-congestion"],
    subjects: ["etch-l2", "rework-1"],
    patch: advancedPatternRecoveryPatch,
  },
  {
    strategy: "recipe:adaptive-agile-pulse-deposition-after-10000",
    hypothesis: "The existing ALD bay can use its qualified agile pulse only after the exact furnace-bound lane has remained empty for ten seconds, then return to its normal recipe as soon as downstream coverage recovers.",
    expectedEffect: "Debounce ordinary handoff gaps while recovering sustained furnace starvation, preserving steady production and retaining disruption gains under every locked case.",
    addresses: ["input-starvation"],
    subjects: ["deposition-1", "deposition-to-batch-furnace", "furnace-1"],
    patch: commissionedAdaptiveCadencePatch,
  },
  {
    strategy: "recipe:agile-pulse-deposition",
    hypothesis: "A qualified 4/5-duration ALD pulse sequence may feed the commissioned rapid furnace more evenly without purchasing another chamber, while its 5/4 active-power envelope remains explicit.",
    expectedEffect: "Reduce the measured deposition-to-furnace input-gap chain if faster deposition becomes useful delivery rather than merely moving idle time upstream; every locked case remains authoritative.",
    addresses: ["input-starvation"],
    subjects: ["deposition-1", "furnace-1"],
    patch: commissionedAgilePulsePatch,
  },
  {
    strategy: "dispatch:lithography-l2-earliest-due-date",
    hypothesis: "The independently qualified layer-two lithography bay can sequence ready re-entrant lots by contract due date, protecting interrupted campaigns without disturbing the FIFO discipline of the shared front-end route.",
    expectedEffect: "Improve facility-interruption delivery while preserving every current-best locked-case score through one device-local dispatch policy.",
    addresses: ["input-starvation", "queue-congestion", "delivery-portfolio"],
    subjects: ["lithography-l2"],
    patch: (blueprint) => deviceLotDispatchPatch(blueprint, "lithography-l2", "earliest-due-date"),
  },
  release(9, 6),
  release(8, 5),
  release(10, 7),
  {
    strategy: "maintenance:lithography-jobs-6",
    hypothesis: "Pulling lithography maintenance forward after six completed jobs may prevent the qualified bay from entering its defect-producing drift interval during the fixed twelve-lot campaign.",
    expectedEffect: "Reduce latent critical-dimension defects and qualification disruption while retaining the shared re-entrant toolset.",
    addresses: ["yield-quality", "maintenance-qualification"],
    subjects: ["lithography-1"],
    patch: (blueprint) => devicePolicyPatch(blueprint, "lithography-1", "preventiveMaintenance", { planned: { afterJobs: 6 } }),
  },
  {
    strategy: "maintenance:inspection-jobs-4",
    hypothesis: "Pulling inspection maintenance forward after four jobs may keep disposition capacity qualified through rework recirculation and the final release wave.",
    expectedEffect: "Reduce quality-disposition interruption without changing inspection or rework physics.",
    addresses: ["yield-quality", "maintenance-qualification"],
    subjects: ["inspection-1"],
    patch: (blueprint) => devicePolicyPatch(blueprint, "inspection-1", "preventiveMaintenance", { opportunistic: { afterJobs: 4 } }),
  },
  {
    strategy: "batch-formation:furnace-flex-30000",
    hypothesis: "Qualifying rapid single-lot anneal as a thirty-second fallback may reduce companion-arrival wait while preserving efficient full furnace batches whenever three lots become ready together.",
    expectedEffect: "Reduce measured batch queue delay in ordinary production, while allowing the locked interruption cases to reject excess single-lot furnace work.",
    addresses: ["batch-formation"],
    patch: furnaceBatchFormationPatch,
  },
  {
    strategy: "setup-campaign:lithography-3-12000",
    hypothesis: "Holding lithography changeover until three compatible ready lots accumulate, with a twelve-thousand-tick escape, may avoid repeated long returns from layer two to layer one without starving the re-entrant route.",
    expectedEffect: "Reduce changeover work and energy while bounding campaign-induced lot hold time.",
    addresses: ["setup-campaign"],
    patch: (blueprint) => devicePolicyPatch(blueprint, "lithography-1", "setupCampaign", { minimumReadyLots: 3, maximumHoldTicks: 12_000 }),
  },
  {
    strategy: "dispatch:inspection-earliest-due-date",
    hypothesis: "Earliest-due-date inspection may prioritize lots with the least remaining contract slack after the re-entrant front end.",
    expectedEffect: "Reduce final-inspection tardiness without changing equipment or quality physics.",
    addresses: ["q-time", "queue-congestion"],
    patch: (blueprint) => deviceLotDispatchPatch(blueprint, "inspection-1", "earliest-due-date"),
  },
  {
    strategy: "power:furnace-idle-sleep-30000",
    hypothesis: "Putting the rapid-anneal furnace into its asset-owned sleep state after thirty idle seconds may reduce metered energy without delaying the dense release wave.",
    expectedEffect: "Lower electricity and idle energy while preserving completion, Q-time, and capacity gates.",
    addresses: [],
    patch: (blueprint) => {
      const index = deviceIndex(blueprint, "furnace-1");
      if (index < 0) return null;
      const policy = blueprint.devices[index]!.policy as Record<string, unknown> | undefined;
      return [{ op: policy && Object.hasOwn(policy, "idleEnergy") ? "replace" : "add", path: `/devices/${index}/policy/idleEnergy`, value: { sleepAfterTicks: 30_000 } }];
    },
  },
  {
    strategy: "dispatch:probe-highest-priority",
    hypothesis: "Highest-priority probe dispatch may protect the evaluator-owned priority and due-date portfolio after inline quality disposition.",
    expectedEffect: "Improve weighted delivery service without changing Probe yield or downstream capacity.",
    addresses: ["delivery-portfolio", "q-time"],
    patch: (blueprint) => deviceLotDispatchPatch(blueprint, "probe-1", "highest-priority"),
  },
];

export default {
  apiVersion: 5,
  propose(context) {
    const used = new Set(context.history.map((item) => item.strategy));
    const blockingCases = context.promotionBoundary.guardrail.violations;
    if (context.branch.role === "alternative" && blockingCases.length) {
      for (const candidate of candidates) {
        const addressedCase = blockingCases.find((caseId) => candidate.addressesCases?.includes(caseId));
        if (!addressedCase || used.has(candidate.strategy)) continue;
        const patch = candidate.patch(context.blueprint);
        if (!patch) continue;
        return {
          strategy: candidate.strategy,
          hypothesis: candidate.hypothesis,
          expectedEffect: candidate.expectedEffect,
          addressedCase,
          patch,
        };
      }
      return null;
    }
    const lossChain = context.fabLoss?.chain ?? [];
    const attempts = new Map<FabLossBucketId, number>();
    for (const item of context.history) {
      if (item.addressedLoss) attempts.set(item.addressedLoss, (attempts.get(item.addressedLoss) ?? 0) + 1);
    }
    const ranked = lossChain.length
      ? candidates.map((candidate, index) => {
        const targets = lossChain.filter((loss) => candidate.addresses.includes(loss)).sort((left, right) =>
          (attempts.get(left) ?? 0) - (attempts.get(right) ?? 0)
          || lossChain.indexOf(left) - lossChain.indexOf(right));
        const addressedLoss = targets[0];
        const observedBucket = addressedLoss
          ? context.fabLoss?.buckets.find((bucket) => bucket.id === addressedLoss)
          : undefined;
        const observedSubjects = observedBucket
          ? [...observedBucket.subjects, ...observedBucket.contributors.flatMap((contributor) => contributor.subjects)]
            .map((subject) => subject.id)
          : [];
        const subjectMatch = candidate.subjects?.some((subject) => observedSubjects.includes(subject)) ?? false;
        return { candidate, index, addressedLoss, subjectMatch, attempts: addressedLoss ? attempts.get(addressedLoss) ?? 0 : 0 };
      }).filter((item) => item.addressedLoss).sort((left, right) =>
        left.attempts - right.attempts
        || lossChain.indexOf(left.addressedLoss!) - lossChain.indexOf(right.addressedLoss!)
        || Number(right.subjectMatch) - Number(left.subjectMatch)
        || left.index - right.index)
      : candidates.map((candidate, index) => ({ candidate, index, addressedLoss: undefined, subjectMatch: false }));
    for (const { candidate, addressedLoss } of ranked) {
      if (used.has(candidate.strategy)) continue;
      const patch = candidate.patch(context.blueprint);
      if (!patch) continue;
      return {
        strategy: candidate.strategy,
        hypothesis: candidate.hypothesis,
        expectedEffect: candidate.expectedEffect,
        ...(addressedLoss ? { addressedLoss } : {}),
        patch,
      };
    }
    return null;
  },
} satisfies ProjectProposalProvider;
