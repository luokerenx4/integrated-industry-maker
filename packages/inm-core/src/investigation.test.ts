import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  appendIndustrialInvestigationEntry,
  createInvestigationCandidate,
  createInvestigationProductionPlanRevision,
  createIndustrialInvestigation,
  inspectIndustrialInvestigation,
  inspectProductionPlanRevision,
  listIndustrialInvestigationEntries,
  listIndustrialInvestigations,
  productionPlanRevisionDraft,
  resolveCurrentInvestigationDiagnosticDispositions,
  resolveIndustrialInvestigationHypothesisSource,
} from "./investigation";
import { inspectCandidateDecision } from "./candidate-review";
import { simulateProjectOperation } from "./operation";
import { hashValue } from "./utils";
import { openProjectWorkbenchSnapshot } from "./workbench";

const repository = resolve(import.meta.dir, "../../..");

async function restorePreCompactMemoryFabBlueprint(projectDir: string) {
  await writeFile(
    join(projectDir, "blueprints/generated-dram-fab.blueprint.json"),
    await readFile(join(projectDir, "runs/098-simulate/blueprint.json"), "utf8"),
  );
  await rm(join(projectDir, "candidates/compact-finished-goods-shipping.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/compact-inspection-rework-cell.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/compact-inspection-rework-cell-east-port.candidate.json"), { force: true });
  await rm(join(projectDir, "candidates/vacuum-lithography-etch-handoff.candidate.json"), { force: true });
  await rm(join(projectDir, "candidate-reviews/compact-finished-goods-shipping"), { recursive: true, force: true });
  await rm(join(projectDir, "candidate-reviews/compact-inspection-rework-cell-east-port"), { recursive: true, force: true });
  await rm(join(projectDir, "candidate-reviews/vacuum-lithography-etch-handoff"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/099-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/100-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/101-simulate"), { recursive: true, force: true });
  await rm(join(projectDir, "runs/102-simulate"), { recursive: true, force: true });
}

test("a project-local Investigation preserves exact evidence and append-only human/Agent reasoning", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => {
      const segments = source.split("/");
      return !segments.includes(".inm") && !segments.includes("investigations");
    },
  });
  await restorePreCompactMemoryFabBlueprint(projectDir);
  try {
    const initialSimulation = await simulateProjectOperation(projectDir, {}, { seed: 42 });
    const created = await createIndustrialInvestigation(
      projectDir,
      "inspection-starvation-next-step",
      {
        name: "Inspection starvation next step",
        question: "Which physically distinct intervention should follow the commissioned one-tick etch recovery?",
      },
    );
    expect(created.path).toBe(join(
      projectDir,
      "investigations/inspection-starvation-next-step/manifest.json",
    ));
    expect(created.manifest).toEqual(expect.objectContaining({
      version: 1,
      id: "inspection-starvation-next-step",
      project: "memory-fab",
      selection: {
        world: "cleanroom",
        blueprint: "generated-dram-fab",
        productionPlan: "production-window",
        scenario: "production-window",
        objective: "dram-output",
      },
      anchors: expect.arrayContaining([
        expect.objectContaining({
          id: "operating-run",
          runId: initialSimulation.data.run.id,
          resultHash: initialSimulation.data.resultHash,
        }),
        expect.objectContaining({
          id: "diagnostic",
          code: "fab-loss.input-starvation",
          runId: initialSimulation.data.run.id,
          loss: {
            bucket: "input-starvation",
            contributorId: "device:inspection-1:material-input-shortage",
          },
        }),
      ]),
    }));
    expect(created.manifest.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(created.manifest)).not.toContain(projectDir);

    const observation = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "inspection-input-is-empty",
        author: "agent",
        kind: "observation",
        statement: "Inspection waits with no resident wafer while the etch source is processing or itself waiting for input.",
        evidence: ["operating-run", "diagnostic"],
      },
    );
    const hypothesis = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "inspection-decoupling-buffer",
        author: "human",
        kind: "hypothesis",
        intervention: "blueprint",
        statement: "A small qualified wafer decoupling buffer may smooth the final etch-to-inspection handoff without making etch globally faster.",
        expectedEffect: "Reduce inspection material-shortage ticks while preserving all locked service, quality, WIP, and interruption outcomes.",
        evidence: ["diagnostic"],
      },
    );
    const decision = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "retain-commissioned-supply-path",
        author: "agent",
        kind: "decision",
        statement: "Retain the current factory observation as the boundary for a physically distinct next hypothesis.",
        disposition: "keep",
        evidence: ["operating-run", "diagnostic"],
        target: { kind: "diagnostic", anchorId: "diagnostic" },
      },
    );
    expect(observation.entry).toEqual(expect.objectContaining({
      sequence: 1,
      previousEntryHash: null,
      introducedAnchors: [],
    }));
    expect(hypothesis.entry).toEqual(expect.objectContaining({
      sequence: 2,
      previousEntryHash: observation.entry.entryHash,
      introducedAnchors: [],
    }));
    expect(decision.entry).toEqual(expect.objectContaining({
      sequence: 3,
      previousEntryHash: hypothesis.entry.entryHash,
      introducedAnchors: [],
      target: { kind: "diagnostic", anchorId: "diagnostic" },
    }));
    const entries = await listIndustrialInvestigationEntries(projectDir, created.manifest.id);
    expect(entries.map((entry) => [entry.sequence, entry.id, entry.kind]))
      .toEqual([
        [1, "inspection-input-is-empty", "observation"],
        [2, "inspection-decoupling-buffer", "hypothesis"],
        [3, "retain-commissioned-supply-path", "decision"],
      ]);
    expect(await listIndustrialInvestigations(projectDir)).toEqual([
      expect.objectContaining({
        id: created.manifest.id,
        entryCount: 3,
        lastEntry: expect.objectContaining({
          id: "retain-commissioned-supply-path",
          sequence: 3,
        }),
      }),
    ]);

    const inspected = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(inspected.state).toBe("current");
    expect(inspected.anchors.map((anchor) => [anchor.anchor.id, anchor.state]))
      .toEqual(expect.arrayContaining([
        ["operating-run", "current"],
        ["diagnostic", "current"],
      ]));
    expect(inspected.handoff).toEqual(expect.objectContaining({
      phase: "resume-project",
      sourceEntry: expect.objectContaining({
        id: "retain-commissioned-supply-path",
        kind: "decision",
      }),
      authorship: null,
      nextAction: inspected.currentNextAction,
    }));
    expect((await openProjectWorkbenchSnapshot(projectDir)).investigationDiagnosticDispositions)
      .toEqual([
        expect.objectContaining({
          disposition: "keep",
          queueEffect: "none",
          target: expect.objectContaining({
            anchorId: "diagnostic",
            anchorKind: "diagnostic",
            code: "fab-loss.input-starvation",
          }),
          source: expect.objectContaining({
            investigationId: created.manifest.id,
            entryId: decision.entry.id,
          }),
          observed: expect.objectContaining({ runId: initialSimulation.data.run.id }),
        }),
      ]);

    await expect(appendIndustrialInvestigationEntry(projectDir, created.manifest.id, {
      id: "bad-reference",
      author: "agent",
      kind: "observation",
      statement: "This should not be written.",
      evidence: ["missing-anchor"],
    })).rejects.toEqual(expect.objectContaining({
      code: "investigation.unknown-evidence",
    }));
    await expect(appendIndustrialInvestigationEntry(projectDir, created.manifest.id, {
      id: "bad-diagnostic-target",
      author: "agent",
      kind: "decision",
      statement: "An operating Run is not itself a diagnostic decision target.",
      disposition: "defer",
      evidence: ["operating-run"],
      target: { kind: "diagnostic", anchorId: "operating-run" },
    })).rejects.toEqual(expect.objectContaining({
      code: "investigation.invalid-decision-target",
    }));

    await appendIndustrialInvestigationEntry(projectDir, created.manifest.id, {
      id: "defer-current-inspection",
      author: "agent",
      kind: "decision",
      statement: "Defer this exact current inspection diagnostic while its complete evidence identity remains unchanged.",
      disposition: "defer",
      evidence: ["diagnostic"],
      target: { kind: "diagnostic", anchorId: "diagnostic" },
    });
    const exactSnapshot = await openProjectWorkbenchSnapshot(projectDir);
    expect(exactSnapshot.investigationDiagnosticDispositions)
      .toEqual([
        expect.objectContaining({
          state: "current",
          disposition: "defer",
          queueEffect: "suppressed",
          source: expect.objectContaining({ entryId: "defer-current-inspection" }),
          currentEvidence: expect.objectContaining({
            runId: initialSimulation.data.run.id,
            causalHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          }),
        }),
      ]);
    const requalifiedSnapshot = structuredClone(exactSnapshot);
    const originalRun = requalifiedSnapshot.runs.find((run) =>
      run.id === initialSimulation.data.run.id)!;
    originalRun.compatible = false;
    requalifiedSnapshot.hashes.engineVersion = "inm-sim/requalification-test";
    requalifiedSnapshot.hashes.executionHash = "1".repeat(64);
    requalifiedSnapshot.status.evidence = {
      state: "current",
      runId: "requalified-same-facts",
    };
    requalifiedSnapshot.runs.push({
      ...originalRun,
      id: "requalified-same-facts",
      resultHash: "2".repeat(64),
      engineVersion: "inm-sim/requalification-test",
      compatible: true,
    });
    requalifiedSnapshot.lossAttribution!.run = {
      id: "requalified-same-facts",
      resultHash: "2".repeat(64),
    };
    for (const diagnostic of requalifiedSnapshot.diagnostics) {
      if (diagnostic.evidence.source !== "compatible-run") continue;
      diagnostic.id = `${diagnostic.id}:requalified`;
      diagnostic.message = diagnostic.message.replace(
        initialSimulation.data.run.id,
        "requalified-same-facts",
      );
      diagnostic.evidence.runId = "requalified-same-facts";
    }
    expect(await resolveCurrentInvestigationDiagnosticDispositions(
      projectDir,
      requalifiedSnapshot,
    )).toEqual([
      expect.objectContaining({
        state: "requalified",
        disposition: "defer",
        queueEffect: "suppressed",
        observed: expect.objectContaining({ runId: initialSimulation.data.run.id }),
        currentEvidence: expect.objectContaining({
          runId: "requalified-same-facts",
          resultHash: "2".repeat(64),
          causalHash: exactSnapshot.diagnostics.find((diagnostic) =>
            diagnostic.code === "fab-loss.input-starvation")!.evidence.causalHash,
        }),
      }),
    ]);
    const changedSourceSnapshot = structuredClone(requalifiedSnapshot);
    changedSourceSnapshot.hashes.blueprintHash = "3".repeat(64);
    expect(await resolveCurrentInvestigationDiagnosticDispositions(
      projectDir,
      changedSourceSnapshot,
    )).toEqual([]);
    const changedCausalSnapshot = structuredClone(requalifiedSnapshot);
    changedCausalSnapshot.diagnostics.find((diagnostic) =>
      diagnostic.code === "fab-loss.input-starvation")!.evidence.causalHash = "4".repeat(64);
    expect(await resolveCurrentInvestigationDiagnosticDispositions(
      projectDir,
      changedCausalSnapshot,
    )).toEqual([]);

    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    blueprint.revision = `${blueprint.revision}-investigation-moved`;
    await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
    const historical = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(historical.state).toBe("historical");
    expect(historical.anchors.every((anchor) => anchor.state === "historical")).toBeTrue();
    expect((await openProjectWorkbenchSnapshot(projectDir)).investigationDiagnosticDispositions)
      .toEqual([]);

    const observationPath = join(
      projectDir,
      "investigations/inspection-starvation-next-step/entries/0001-inspection-input-is-empty.entry.json",
    );
    const tampered = JSON.parse(await readFile(observationPath, "utf8"));
    tampered.statement = "Silently rewritten";
    await writeFile(observationPath, `${JSON.stringify(tampered, null, 2)}\n`);
    await expect(listIndustrialInvestigationEntries(projectDir, created.manifest.id))
      .rejects.toEqual(expect.objectContaining({
        code: "investigation.invalid-entry-chain",
      }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("an Investigation advances to a new exact factory observation without erasing historical evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-checkpoint-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => {
      const segments = source.split("/");
      return !segments.includes(".inm") && !segments.includes("investigations");
    },
  });
  await restorePreCompactMemoryFabBlueprint(projectDir);
  try {
    await simulateProjectOperation(projectDir, {}, { seed: 42 });
    const created = await createIndustrialInvestigation(
      projectDir,
      "continuous-factory-question",
      {
        name: "Continuous factory question",
        question: "What should change after the current commissioned factory?",
      },
    );
    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    blueprint.revision = `${blueprint.revision}-checkpoint`;
    await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
    const historicalBeforeCheckpoint = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(historicalBeforeCheckpoint.state).toBe("historical");
    expect(historicalBeforeCheckpoint.handoff).toEqual(expect.objectContaining({
      phase: "observe-current-factory",
      authorship: {
        kind: "investigation-entry",
        entryKind: "observation",
        requiredFields: ["entry-id", "author", "statement"],
      },
    }));

    const simulation = await simulateProjectOperation(projectDir, created.manifest.selection, {
      seed: 42,
    });
    const checkpoint = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "revised-factory-observed",
        author: "agent",
        kind: "observation",
        statement: "The revised factory has a new compatible operating context.",
        evidence: ["revised-factory"],
        introduceEvidence: {
          id: "revised-factory",
          kind: "factory-observation",
        },
      },
    );
    expect(checkpoint.entry.introducedAnchors).toEqual([
      expect.objectContaining({
        id: "revised-factory",
        kind: "factory-observation",
        runId: simulation.data.run.id,
        resultHash: simulation.data.resultHash,
        selection: created.manifest.selection,
        hashes: expect.objectContaining({
          blueprintHash: hashValue(blueprint),
        }),
        diagnostic: expect.objectContaining({
          code: "fab-loss.input-starvation",
        }),
      }),
    ]);

    const current = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(current.state).toBe("current");
    expect(current.anchors.map((item) => [item.anchor.id, item.state])).toEqual([
      ["operating-run", "historical"],
      ["diagnostic", "historical"],
      ["revised-factory", "current"],
    ]);
    expect(current.handoff).toEqual(expect.objectContaining({
      phase: "form-hypothesis",
      sourceEntry: expect.objectContaining({
        id: "revised-factory-observed",
        kind: "observation",
        entryHash: checkpoint.entry.entryHash,
      }),
      evidenceIds: ["revised-factory"],
      authorship: {
        kind: "investigation-entry",
        entryKind: "hypothesis",
        requiredFields: ["entry-id", "author", "statement", "intervention", "expected-effect"],
      },
      nextAction: expect.objectContaining({
        target: {
          kind: "investigation",
          investigationId: created.manifest.id,
          phase: "form-hypothesis",
          sourceEntryId: checkpoint.entry.id,
        },
      }),
    }));

    const hypothesis = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "checkpoint-bound-hypothesis",
        author: "human",
        kind: "hypothesis",
        intervention: "blueprint",
        statement: "A small spatial change should preserve the revised factory outcomes.",
        expectedEffect: "The exact revised operating context remains feasible after the bounded change.",
        evidence: ["revised-factory"],
      },
    );
    const hypothesisHandoff = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(hypothesisHandoff.handoff).toEqual(expect.objectContaining({
      phase: "author-candidate",
      sourceEntry: expect.objectContaining({
        id: hypothesis.entry.id,
        kind: "hypothesis",
        entryHash: hypothesis.entry.entryHash,
      }),
      evidenceIds: ["revised-factory"],
      authorship: {
        kind: "candidate",
        hypothesisEntryId: hypothesis.entry.id,
        hypothesisEntryHash: hypothesis.entry.entryHash,
        requiredFields: ["candidate-id", "candidate-name", "benchmark", "patch-file"],
      },
    }));
    const candidate = await createInvestigationCandidate(projectDir, {
      id: "checkpoint-bound-candidate",
      name: "Checkpoint-bound Candidate",
      benchmark: "greenfield-dram-design",
      investigation: created.manifest.id,
      hypothesisEntry: hypothesis.entry.id,
      patch: [{ op: "replace", path: "/devices/0/position/x", value: 3 }],
    });
    expect(candidate.sourceEvidence).toEqual(expect.objectContaining({
      state: "current",
      entry: "checkpoint-bound-hypothesis",
      operatingContext: {
        source: "factory-observation",
        anchorId: "revised-factory",
        selection: created.manifest.selection,
        hashes: expect.objectContaining({ blueprintHash: hashValue(blueprint) }),
        run: {
          id: simulation.data.run.id,
          resultHash: simulation.data.resultHash,
        },
        diagnostic: expect.objectContaining({ code: "fab-loss.input-starvation" }),
      },
    }));

    const runManifestPath = join(simulation.data.run.path, "manifest.json");
    const runManifestSource = await readFile(runManifestPath, "utf8");
    const runManifest = JSON.parse(runManifestSource);
    runManifest.resultHash = "0".repeat(64);
    await writeFile(runManifestPath, `${JSON.stringify(runManifest, null, 2)}\n`);
    const invalid = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(invalid.state).toBe("invalid");
    expect(invalid.handoff.phase).toBe("repair-evidence");
    expect(invalid.anchors.find((item) => item.anchor.id === "revised-factory")?.state)
      .toBe("invalid");
    await expect(resolveIndustrialInvestigationHypothesisSource(
      projectDir,
      candidate.candidate.source as Extract<
        NonNullable<typeof candidate.candidate.source>,
        { kind: "investigation-hypothesis" }
      >,
    )).rejects.toEqual(expect.objectContaining({
      code: "investigation.source-context-unavailable",
    }));
    await writeFile(runManifestPath, runManifestSource);

    blueprint.revision = `${blueprint.revision}-later`;
    await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
    const movedAgain = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(movedAgain.state).toBe("historical");
    expect(movedAgain.handoff.phase).toBe("observe-current-factory");
    expect(movedAgain.anchors.find((item) => item.anchor.id === "revised-factory")?.state)
      .toBe("historical");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("a Production Plan hypothesis hands off to plan authoring and cannot source a Blueprint Candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-production-plan-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => {
      const segments = source.split("/");
      return !segments.includes(".inm") && !segments.includes("investigations");
    },
  });
  try {
    const created = await createIndustrialInvestigation(
      projectDir,
      "production-plan-next-step",
      {
        name: "Production Plan next step",
        question: "Can a different release plan reduce back-end WIP without surrendering planned supply?",
      },
    );
    const hypothesis = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "align-release-plan",
        author: "agent",
        kind: "hypothesis",
        intervention: "production-plan",
        statement: "Test one separately selected release plan without changing the installed factory.",
        expectedEffect: "Reduce back-end WIP while preserving scheduled, completed, on-time, and delivered production.",
        evidence: ["operating-run", "diagnostic"],
      },
    );

    const inspected = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(inspected.handoff).toEqual(expect.objectContaining({
      phase: "author-production-plan",
      sourceEntry: expect.objectContaining({
        id: hypothesis.entry.id,
        entryHash: hypothesis.entry.entryHash,
      }),
      authorship: {
        kind: "production-plan",
        hypothesisEntryId: hypothesis.entry.id,
        hypothesisEntryHash: hypothesis.entry.entryHash,
        requiredFields: ["production-plan-id", "production-plan-file"],
      },
      nextAction: expect.objectContaining({
        actionLabel: "AUTHOR PRODUCTION PLAN",
        target: expect.objectContaining({
          kind: "investigation",
          phase: "author-production-plan",
        }),
      }),
    }));
    await expect(createInvestigationCandidate(projectDir, {
      id: "wrong-artifact-kind",
      name: "Wrong artifact kind",
      benchmark: "greenfield-dram-design",
      investigation: created.manifest.id,
      hypothesisEntry: hypothesis.entry.id,
      patch: [{ op: "replace", path: "/devices/0/position/x", value: 3 }],
    })).rejects.toEqual(expect.objectContaining({
      code: "investigation.source-not-blueprint-hypothesis",
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("a Production Plan revision retains exact hypothesis, schedule, Run, and comparison identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-plan-revision-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => {
      const segments = source.split("/");
      return !segments.includes(".inm") && !segments.includes("investigations");
    },
  });
  try {
    const created = await createIndustrialInvestigation(
      projectDir,
      "cadence-revision",
      {
        name: "Cadence revision",
        question: "Can an explicit release cadence improve the complete twelve-lot plan?",
      },
    );
    const hypothesis = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "compress-release-cadence",
        author: "agent",
        kind: "hypothesis",
        intervention: "production-plan",
        statement: "Compress each planned lot and substrate release without removing planned production.",
        expectedEffect: "Pull back-end material availability forward while preserving twelve scheduled lots.",
        evidence: ["operating-run"],
      },
    );
    const draft = await productionPlanRevisionDraft(projectDir, created.manifest.id);
    expect(draft).toEqual(expect.objectContaining({
      hypothesisEntry: hypothesis.entry.id,
      hypothesisEntryHash: hypothesis.entry.entryHash,
      controlRunId: created.manifest.anchors.find((anchor) => anchor.id === "operating-run")
        && (created.manifest.anchors.find((anchor) => anchor.id === "operating-run") as { runId: string }).runId,
      productionPlan: expect.objectContaining({ id: created.manifest.selection.productionPlan }),
    }));

    const metadataOnly = structuredClone(draft.productionPlan);
    metadataOnly.id = "metadata-only";
    metadataOnly.name = "Metadata only";
    await expect(createInvestigationProductionPlanRevision(projectDir, {
      investigation: created.manifest.id,
      hypothesisEntry: hypothesis.entry.id,
      productionPlan: metadataOnly,
    })).rejects.toEqual(expect.objectContaining({
      code: "production-plan-revision.no-schedule-change",
    }));

    const proposed = structuredClone(draft.productionPlan);
    proposed.id = "compressed-twelve-lot-cadence";
    proposed.name = "Compressed twelve-lot cadence";
    proposed.lotReleases = proposed.lotReleases?.map((lot, index) => ({
      ...lot,
      releaseTick: index * 5_000,
    }));
    proposed.materialDeliveries = proposed.materialDeliveries?.map((delivery, index) => ({
      ...delivery,
      releaseTick: index * 5_000,
    }));
    const createdRevision = await createInvestigationProductionPlanRevision(projectDir, {
      investigation: created.manifest.id,
      hypothesisEntry: hypothesis.entry.id,
      productionPlan: proposed,
    });
    expect(createdRevision.revision).toEqual(expect.objectContaining({
      id: proposed.id,
      source: expect.objectContaining({
        hypothesisEntry: hypothesis.entry.id,
        hypothesisEntryHash: hypothesis.entry.entryHash,
        control: expect.objectContaining({
          runId: draft.controlRunId,
          seed: draft.controlSeed,
        }),
      }),
      base: expect.objectContaining({
        id: draft.productionPlan.id,
        hash: draft.baseProductionPlanHash,
      }),
      result: expect.objectContaining({
        id: proposed.id,
        hash: hashValue(proposed),
      }),
      patch: expect.arrayContaining([
        expect.objectContaining({ op: "replace" }),
      ]),
    }));
    expect(createdRevision.changes.some((change) => change.kind === "lot-release")).toBe(true);
    expect((await inspectIndustrialInvestigation(projectDir, created.manifest.id)).handoff)
      .toEqual(expect.objectContaining({
        phase: "simulate-production-plan",
        productionPlanRevision: expect.objectContaining({
          id: proposed.id,
          controlRunId: draft.controlRunId,
          interventionRunId: null,
        }),
      }));
    await expect(createInvestigationProductionPlanRevision(projectDir, {
      investigation: created.manifest.id,
      hypothesisEntry: hypothesis.entry.id,
      productionPlan: proposed,
    })).rejects.toEqual(expect.objectContaining({
      code: "production-plan-revision.already-exists",
    }));

    const simulation = await simulateProjectOperation(projectDir, {
      ...createdRevision.revision.source.control.selection,
      productionPlan: proposed.id,
    }, { seed: draft.controlSeed });
    const comparable = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(comparable.handoff).toEqual(expect.objectContaining({
      phase: "compare-production-plan",
      productionPlanRevision: expect.objectContaining({
        id: proposed.id,
        controlRunId: draft.controlRunId,
        interventionRunId: simulation.data.run.id,
      }),
      nextAction: expect.objectContaining({
        studioRoute: expect.stringContaining(`from=${draft.controlRunId}&to=${simulation.data.run.id}`),
      }),
    }));

    const planPath = join(projectDir, "production-plans", `${proposed.id}.production-plan.json`);
    const originalPlan = await readFile(planPath, "utf8");
    const modified = structuredClone(proposed);
    modified.name = "Modified outside the revision";
    await writeFile(planPath, `${JSON.stringify(modified, null, 2)}\n`);
    await expect(inspectProductionPlanRevision(projectDir, proposed.id)).rejects.toEqual(
      expect.objectContaining({ code: "production-plan-revision.result-modified" }),
    );
    await writeFile(planPath, originalPlan);
    expect((await inspectProductionPlanRevision(projectDir, proposed.id)).revision.revisionHash)
      .toBe(createdRevision.revision.revisionHash);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);

test("an Investigation hypothesis creates a strictly sourced Candidate without caller-authored hashes or prose", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-candidate-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes(".inm"),
  });
  await restorePreCompactMemoryFabBlueprint(projectDir);
  try {
    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    const created = await createInvestigationCandidate(projectDir, {
      id: "inspection-standby-followup",
      name: "Inspection standby follow-up",
      benchmark: "greenfield-dram-design",
      investigation: "inspection-starvation-next-step",
      hypothesisEntry: "metrology-low-power-standby",
      patch: [{
        op: "replace",
        path: "/devices/0/position/x",
        value: 3,
      }],
    });

    expect(created.path).toBe(join(
      projectDir,
      "candidates/inspection-standby-followup.candidate.json",
    ));
    expect(created.candidate).toEqual(expect.objectContaining({
      hypothesis: "Give the continuous deep-metrology cell an explicit qualified low-power standby state and let inspection-1 sleep after ten seconds without a resident wafer, exploiting long supply gaps instead of forcing more wafer release or local transport capacity.",
      expectedEffect: "Reduce total energy and electricity across every locked operating case while preserving completion, on-time service, first-pass yield, zero quality escapes, final-inspection Q-time, and the current inspection-starvation target; the replay should show sleep and bounded wake work only inside long empty intervals.",
      baseCandidateHash: hashValue(blueprint),
      source: {
        kind: "investigation-hypothesis",
        project: "memory-fab",
        investigation: "inspection-starvation-next-step",
        manifestHash: "a9fe64f1e50a57a712a659ef0b3d5c92dd28fd7e56cf91cab197699b186cf41a",
        entry: "metrology-low-power-standby",
        entryHash: "fe0a8d067272f1edbb7a76e27dc86c24a877b44fa0a6fb32860c3967dd2d2ceb",
      },
    }));
    expect(created.sourceEvidence).toEqual(expect.objectContaining({
      state: "historical",
      author: "agent",
      sequence: 2,
      investigationName: "Inspection starvation next step",
      navigation: expect.objectContaining({
        studioRoute: "/memory-fab/investigations/inspection-starvation-next-step",
      }),
    }));
    expect((await inspectCandidateDecision(projectDir, created.candidate.id))).toEqual(
      expect.objectContaining({
        state: "proposed",
        sourceEvidence: expect.objectContaining({
          entry: "metrology-low-power-standby",
          state: "historical",
        }),
      }),
    );

    await expect(createInvestigationCandidate(projectDir, {
      id: "observation-is-not-a-candidate-source",
      name: "Invalid observation source",
      benchmark: "greenfield-dram-design",
      investigation: "inspection-starvation-next-step",
      hypothesisEntry: "inspection-path-is-supply-limited",
      patch: [{ op: "replace", path: "/devices/0/position/x", value: 3 }],
    })).rejects.toEqual(expect.objectContaining({
      code: "investigation.source-not-hypothesis",
    }));

    await expect(resolveIndustrialInvestigationHypothesisSource(projectDir, {
      ...created.candidate.source as Extract<NonNullable<typeof created.candidate.source>, { kind: "investigation-hypothesis" }>,
      project: "other-project",
    })).rejects.toEqual(expect.objectContaining({
      code: "investigation.project-mismatch",
    }));

    const candidate = JSON.parse(await readFile(created.path, "utf8"));
    candidate.hypothesis = "Silently replaced Candidate prose";
    await writeFile(created.path, `${JSON.stringify(candidate, null, 2)}\n`);
    expect(await inspectCandidateDecision(projectDir, created.candidate.id)).toEqual(
      expect.objectContaining({
        state: "invalid",
        sourceEvidence: null,
        error: expect.objectContaining({
          code: "candidate.investigation-source-invalid",
        }),
      }),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test("a Candidate-sourced Investigation fails closed when its pre-contract comparison evidence becomes invalid", async () => {
  const root = await mkdtemp(join(tmpdir(), "inm-investigation-candidate-cycle-"));
  const projectDir = join(root, "memory-fab");
  await cp(join(repository, "examples/memory-fab"), projectDir, {
    recursive: true,
    filter: (source) => !source.split("/").includes(".inm"),
  });
  const investigationId = "source-lot-back-end-service";
  const candidateId = "incumbent-five-performance-seven-commercial";
  try {
    await writeFile(
      join(projectDir, "blueprints/generated-dram-fab.blueprint.json"),
      await readFile(join(projectDir, "runs/105-simulate/blueprint.json"), "utf8"),
    );
    const invalid = await inspectIndustrialInvestigation(projectDir, investigationId);
    expect(invalid.state).toBe("invalid");
    expect(invalid.handoff).toEqual(expect.objectContaining({
      phase: "repair-evidence",
      authorship: null,
      candidateCycle: expect.objectContaining({
        state: "completed",
        activeCandidateId: candidateId,
        candidates: [
          expect.objectContaining({
            id: candidateId,
            decisionState: "reviewed-keep",
            trial: expect.objectContaining({
              parentRunId: "105-simulate",
              runId: "109-candidate-trial-incumbent-five-performance-seven",
            }),
            comparison: null,
            disposition: expect.objectContaining({
              entryId: "discard-incumbent-five-seven-campaign",
              disposition: "discard",
            }),
          }),
        ],
      }),
      nextAction: expect.objectContaining({
        actionLabel: "REVIEW EVIDENCE",
        effect: "read-only",
        target: expect.objectContaining({
          phase: "repair-evidence",
          sourceEntryId: "discard-incumbent-five-seven-campaign",
        }),
      }),
    }));

    await writeFile(
      join(projectDir, "blueprints/generated-dram-fab.blueprint.json"),
      await readFile(
        join(projectDir, "runs/109-candidate-trial-incumbent-five-performance-seven/blueprint.json"),
        "utf8",
      ),
    );
    const applied = await inspectIndustrialInvestigation(projectDir, investigationId);
    expect(applied.state).toBe("invalid");
    expect(applied.handoff).toEqual(expect.objectContaining({
      phase: "repair-evidence",
      authorship: null,
      candidateCycle: expect.objectContaining({
        state: "completed",
        candidates: [
          expect.objectContaining({
            id: candidateId,
            decisionState: "verified",
            comparison: null,
            disposition: expect.objectContaining({
              entryId: "discard-incumbent-five-seven-campaign",
              disposition: "discard",
            }),
          }),
        ],
      }),
      nextAction: expect.objectContaining({
        actionLabel: "REVIEW EVIDENCE",
        target: expect.objectContaining({
          phase: "repair-evidence",
        }),
      }),
    }));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
