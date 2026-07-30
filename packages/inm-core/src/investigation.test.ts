import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "bun:test";
import {
  appendIndustrialInvestigationEntry,
  createInvestigationCandidate,
  createIndustrialInvestigation,
  inspectIndustrialInvestigation,
  listIndustrialInvestigationEntries,
  listIndustrialInvestigations,
  resolveIndustrialInvestigationHypothesisSource,
} from "./investigation";
import { inspectCandidateDecision } from "./candidate-review";
import { simulateProjectOperation } from "./operation";
import { hashValue } from "./utils";

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

    await expect(appendIndustrialInvestigationEntry(projectDir, created.manifest.id, {
      id: "bad-reference",
      author: "agent",
      kind: "observation",
      statement: "This should not be written.",
      evidence: ["missing-anchor"],
    })).rejects.toEqual(expect.objectContaining({
      code: "investigation.unknown-evidence",
    }));

    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    blueprint.revision = `${blueprint.revision}-investigation-moved`;
    await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
    const historical = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(historical.state).toBe("historical");
    expect(historical.anchors.every((anchor) => anchor.state === "historical")).toBeTrue();

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
        requiredFields: ["entry-id", "author", "statement", "expected-effect"],
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
