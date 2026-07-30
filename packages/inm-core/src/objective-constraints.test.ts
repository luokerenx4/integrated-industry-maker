import { expect, test } from "bun:test";
import { evaluateObjectiveConstraints } from "./objective-constraints";
import type { Objective } from "./types";

const objective: Objective = {
  id: "test-objective",
  name: "Test objective",
  targetResource: "finished",
  targetRegion: "plant",
  targetRatePerMinute: 1,
  wipAccounting: { unit: "item", resources: [{ resource: "wip", equivalentUnitsPerItem: 1 }] },
  deliveryContracts: [{
    id: "priority-order",
    name: "Priority order",
    resource: "finished",
    region: "plant",
    demandPerMinute: 1,
    valuePerItem: 1,
    shortfallPenaltyPerItem: 1,
    minimumFulfillment: 0.95,
  }],
  constraints: { maxBuildCost: 100, maxOccupiedArea: 20, minProduction: 10 },
  weights: {
    throughput: 1,
    energy: 0,
    buildCost: 0,
    occupiedArea: 0,
    wip: 0,
    blocked: 0,
  },
};

test("Objective constraints expose every authored boundary as exact ordered evidence", () => {
  const evidence = evaluateObjectiveConstraints(objective, {
    totalBuildCost: 115,
    occupiedArea: 18,
    targetProduction: 9,
    contractFulfillment: { "priority-order": 0.9 },
  });
  expect(evidence.map((constraint) => constraint.id)).toEqual([
    "objective:max-build-cost",
    "objective:max-occupied-area",
    "objective:min-production",
    "delivery-contract:priority-order:minimum-fulfillment",
  ]);
  expect(evidence[0]).toMatchObject({
    metric: "totalBuildCost",
    operator: "maximum",
    actual: 115,
    threshold: 100,
    deficit: 15,
    passed: false,
  });
  expect(evidence[1]).toMatchObject({ actual: 18, threshold: 20, deficit: 0, passed: true });
  expect(evidence[2]).toMatchObject({
    operator: "minimum",
    actual: 9,
    threshold: 10,
    deficit: 1,
    passed: false,
  });
  expect(evidence[3]).toMatchObject({
    source: "delivery-contract",
    metric: "contractFulfillment",
    actual: 0.9,
    threshold: 0.95,
    passed: false,
    contract: { id: "priority-order", name: "Priority order", resource: "finished", region: "plant" },
  });
  expect(evidence[3]!.deficit).toBeCloseTo(0.05);
});
