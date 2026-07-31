import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  appendIndustrialInvestigationEntry,
  createIndustrialInvestigation,
  createInvestigationCandidate,
  inspectIndustrialInvestigation,
  listIndustrialInvestigationEntries,
} from "./investigation";
import { simulateProjectOperation } from "./operation";

const repository = resolve(import.meta.dir, "../../..");
const sourceProjectDir = join(repository, "examples/memory-fab");

test("an immutable Run comparison accumulates as exact Investigation and Candidate evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-run-comparison-"));
  const projectDir = join(root, "memory-fab");
  try {
    await cp(sourceProjectDir, projectDir, {
      recursive: true,
      filter: (source) => {
        const segments = source.split("/");
        if ([".inm", "design-runs", "candidate-reviews", "investigations"]
          .some((directory) => segments.includes(directory))) return false;
        const runsIndex = segments.lastIndexOf("runs");
        return runsIndex < 0
          || segments[runsIndex + 1] === undefined
          || segments[runsIndex + 1] === "100-simulate"
          || segments[runsIndex + 1] === "101-simulate";
      },
    });
    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    await writeFile(blueprintPath, await readFile(join(projectDir, "runs/100-simulate/blueprint.json"), "utf8"));
    const fromOperation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    await writeFile(blueprintPath, await readFile(join(projectDir, "runs/101-simulate/blueprint.json"), "utf8"));
    const toOperation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    const fromRunId = fromOperation.data.run.id;
    const toRunId = toOperation.data.run.id;

    await createIndustrialInvestigation(projectDir, "compact-cell-evidence", {
      name: "Compact inspection and rework evidence",
      question: "What did the compact inspection and rework cell change?",
    });
    const appended = await appendIndustrialInvestigationEntry(
      projectDir,
      "compact-cell-evidence",
      {
        id: "compact-cell-compared",
        kind: "observation",
        author: "agent",
        statement: `${toRunId} preserves delivery and quality while reducing the compact-cell footprint and inspection starvation.`,
        evidence: ["operating-run", "diagnostic", "compact-cell-comparison"],
        introduceEvidence: {
          id: "compact-cell-comparison",
          kind: "run-comparison",
          fromRunId,
          toRunId,
        },
      },
    );
    expect(appended.entry.introducedAnchors).toEqual([
      expect.objectContaining({
        id: "compact-cell-comparison",
        kind: "run-comparison",
        from: expect.objectContaining({ runId: fromRunId }),
        to: expect.objectContaining({ runId: toRunId }),
        comparisonHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        diagnostic: expect.objectContaining({ code: "fab-loss.input-starvation" }),
      }),
    ]);

    const current = await inspectIndustrialInvestigation(projectDir, "compact-cell-evidence");
    expect(current.state).toBe("current");
    expect(current.anchors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        state: "current",
        anchor: expect.objectContaining({
          id: "compact-cell-comparison",
          kind: "run-comparison",
        }),
        navigation: {
          argv: [
            "inm",
            "compare",
            projectDir,
            "--from-run",
            fromRunId,
            "--to-run",
            toRunId,
            "--json",
          ],
          studioRoute: `/memory-fab/runs?from=${fromRunId}&to=${toRunId}`,
        },
      }),
    ]));

    const probeAssetPath = join(projectDir, "assets/devices/dram-wafer-probe-cell/asset.json");
    const probeAsset = JSON.parse(await readFile(probeAssetPath, "utf8"));
    probeAsset.production.modes.push({
      id: "unused-investigation-test-mode",
      name: "Unused Investigation test mode",
      inputCycles: 1,
      outputCycles: 1,
      durationMultiplier: { numerator: 19, denominator: 20 },
      powerMultiplier: { numerator: 20, denominator: 19 },
      auxiliaryInputs: [],
      preventsDefects: [],
      minimumInputTreatmentLevel: 0,
    });
    await writeFile(probeAssetPath, `${JSON.stringify(probeAsset, null, 2)}\n`);
    const afterUnusedCatalogOption = await inspectIndustrialInvestigation(projectDir, "compact-cell-evidence");
    expect(afterUnusedCatalogOption.state).toBe("current");
    expect(afterUnusedCatalogOption.anchors.find((item) =>
      item.anchor.id === "compact-cell-comparison")?.state).toBe("current");

    const hypothesis = await appendIndustrialInvestigationEntry(
      projectDir,
      "compact-cell-evidence",
      {
        id: "preserve-compact-cell-guardrails",
        kind: "hypothesis",
        author: "human",
        intervention: "blueprint",
        statement: "The next inspection intervention can preserve the compact cell's unchanged delivery and quality guardrails.",
        expectedEffect: "The next exact comparison retains 12 on-time lots, zero scrap, zero escapes, and no additional area.",
        evidence: ["compact-cell-comparison"],
      },
    );
    const candidate = await createInvestigationCandidate(projectDir, {
      id: "compact-cell-follow-up",
      name: "Compact cell follow-up",
      benchmark: "greenfield-dram-design",
      investigation: "compact-cell-evidence",
      hypothesisEntry: hypothesis.entry.id,
      patch: [{
        op: "replace",
        path: "/devices/0/position/x",
        value: 3,
      }],
    });
    expect(candidate.sourceEvidence).toEqual(expect.objectContaining({
      state: "current",
      operatingContext: expect.objectContaining({
        source: "run-comparison",
        anchorId: "compact-cell-comparison",
        run: expect.objectContaining({ id: toRunId }),
        diagnostic: expect.objectContaining({ code: "fab-loss.input-starvation" }),
      }),
    }));

    await writeFile(
      blueprintPath,
      await readFile(join(projectDir, "runs/100-simulate/blueprint.json"), "utf8"),
    );
    const historical = await inspectIndustrialInvestigation(projectDir, "compact-cell-evidence");
    expect(historical.state).toBe("historical");
    expect(historical.anchors.find((item) =>
      item.anchor.id === "compact-cell-comparison")?.state).toBe("historical");
    const [entry] = (await listIndustrialInvestigationEntries(projectDir, "compact-cell-evidence"))
      .filter((item) => item.id === hypothesis.entry.id);
    const historicalCandidate = await createInvestigationCandidate(projectDir, {
      id: "compact-cell-historical-follow-up",
      name: "Compact cell historical follow-up",
      benchmark: "greenfield-dram-design",
      investigation: "compact-cell-evidence",
      hypothesisEntry: entry!.id,
      patch: [{
        op: "replace",
        path: "/devices/0/position/x",
        value: 4,
      }],
    });
    expect(historicalCandidate.sourceEvidence.state).toBe("historical");
    expect(historicalCandidate.sourceEvidence.operatingContext.run.id).toBe(toRunId);

    await writeFile(join(projectDir, "runs", toRunId, "metrics.json"), "{}\n");
    const invalid = await inspectIndustrialInvestigation(projectDir, "compact-cell-evidence");
    expect(invalid.state).toBe("invalid");
    expect(invalid.anchors.find((item) =>
      item.anchor.id === "compact-cell-comparison")?.state).toBe("invalid");

    await rm(join(projectDir, "runs", toRunId), { recursive: true, force: true });
    const missing = await inspectIndustrialInvestigation(projectDir, "compact-cell-evidence");
    expect(missing.state).toBe("missing");
    expect(missing.anchors.find((item) =>
      item.anchor.id === "compact-cell-comparison")?.state).toBe("missing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
