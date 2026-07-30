import type { Objective, ObjectiveConstraintEvidence } from "./types";

export interface ObjectiveConstraintInputs {
  totalBuildCost: number;
  occupiedArea: number;
  targetProduction: number;
  contractFulfillment: Record<string, number>;
}

function maximumConstraint(
  evidence: Omit<ObjectiveConstraintEvidence, "operator" | "deficit" | "passed">,
): ObjectiveConstraintEvidence {
  return {
    ...evidence,
    operator: "maximum",
    deficit: Math.max(0, evidence.actual - evidence.threshold),
    passed: evidence.actual <= evidence.threshold + 1e-12,
  };
}

function minimumConstraint(
  evidence: Omit<ObjectiveConstraintEvidence, "operator" | "deficit" | "passed">,
): ObjectiveConstraintEvidence {
  return {
    ...evidence,
    operator: "minimum",
    deficit: Math.max(0, evidence.threshold - evidence.actual),
    passed: evidence.actual + 1e-12 >= evidence.threshold,
  };
}

export function evaluateObjectiveConstraints(
  objective: Objective,
  inputs: ObjectiveConstraintInputs,
): ObjectiveConstraintEvidence[] {
  const constraints = objective.constraints ?? {};
  const evidence: ObjectiveConstraintEvidence[] = [];
  if (constraints.maxBuildCost !== undefined) evidence.push(maximumConstraint({
    id: "objective:max-build-cost",
    label: "Maximum build cost",
    source: "objective",
    metric: "totalBuildCost",
    unit: "currency",
    actual: inputs.totalBuildCost,
    threshold: constraints.maxBuildCost,
  }));
  if (constraints.maxOccupiedArea !== undefined) evidence.push(maximumConstraint({
    id: "objective:max-occupied-area",
    label: "Maximum occupied area",
    source: "objective",
    metric: "occupiedArea",
    unit: "area",
    actual: inputs.occupiedArea,
    threshold: constraints.maxOccupiedArea,
  }));
  if (constraints.minProduction !== undefined) evidence.push(minimumConstraint({
    id: "objective:min-production",
    label: "Minimum target production",
    source: "objective",
    metric: "targetProduction",
    unit: "items",
    actual: inputs.targetProduction,
    threshold: constraints.minProduction,
  }));
  for (const contract of objective.deliveryContracts ?? []) {
    if (contract.minimumFulfillment === undefined) continue;
    const actual = inputs.contractFulfillment[contract.id];
    if (actual === undefined) throw new Error(`Objective constraint evaluation omitted delivery contract '${contract.id}' fulfillment`);
    evidence.push(minimumConstraint({
      id: `delivery-contract:${contract.id}:minimum-fulfillment`,
      label: `${contract.name} minimum fulfillment`,
      source: "delivery-contract",
      metric: "contractFulfillment",
      unit: "ratio",
      actual,
      threshold: contract.minimumFulfillment,
      contract: {
        id: contract.id,
        name: contract.name,
        resource: contract.resource,
        region: contract.region,
      },
    }));
  }
  return evidence;
}

export function objectiveConstraintReason(constraint: ObjectiveConstraintEvidence): string {
  if (constraint.metric === "totalBuildCost") return `build cost ${constraint.actual} exceeds ${constraint.threshold}`;
  if (constraint.metric === "occupiedArea") return `occupied area ${constraint.actual} exceeds ${constraint.threshold}`;
  if (constraint.metric === "targetProduction") return `production ${constraint.actual} is below ${constraint.threshold}`;
  return `delivery contract ${constraint.contract!.id} fulfillment ${(constraint.actual * 100).toFixed(1)}% is below ${(constraint.threshold * 100).toFixed(1)}%`;
}
