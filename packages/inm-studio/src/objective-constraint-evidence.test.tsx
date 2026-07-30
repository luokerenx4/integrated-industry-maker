import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ObjectiveConstraintEvidence } from "@inm/core";
import { ObjectiveConstraintComparison } from "./objective-constraint-evidence";

const current: ObjectiveConstraintEvidence[] = [{
  id: "objective:max-build-cost",
  label: "Maximum build cost",
  source: "objective",
  metric: "totalBuildCost",
  operator: "maximum",
  unit: "currency",
  actual: 228_000,
  threshold: 230_000,
  deficit: 0,
  passed: true,
}];

test("Objective constraint evidence renders exact current-to-proposed causality at a stable anchor", () => {
  const html = renderToStaticMarkup(<ObjectiveConstraintComparison
    baseline={current}
    candidate={[{ ...current[0]!, actual: 230_150, deficit: 150, passed: false }]}
    baselineLabel="CURRENT"
    candidateLabel="PROPOSED"
    anchorId="candidate-current-constraints-steady-production"
  />);

  expect(html).toContain('id="candidate-current-constraints-steady-production"');
  expect(html).toContain("1 ACTIVE FAILURE");
  expect(html).toContain("228,000");
  expect(html).toContain("230,150");
  expect(html).toContain("≤ 230,000");
  expect(html).toContain("DEFICIT 150");
  expect(html).toContain("objective:max-build-cost");
});
