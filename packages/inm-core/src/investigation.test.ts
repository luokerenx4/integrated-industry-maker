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
  try {
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
        scenario: "production-window",
        objective: "dram-output",
      },
      anchors: [
        expect.objectContaining({
          id: "operating-run",
          runId: "098-simulate",
          resultHash: "19fd034abbecc9dff1a2d7c67d3cf1e2f0c2ab56c3445e39b6b1e0c4b36decbc",
        }),
        expect.objectContaining({
          id: "diagnostic",
          code: "fab-loss.input-starvation",
          runId: "098-simulate",
          loss: {
            bucket: "input-starvation",
            contributorId: "device:inspection-1:material-input-shortage",
          },
        }),
        expect.objectContaining({
          id: "design-lineage",
          programId: "inspection-supply-path",
          runId: "966127dd542de0b114eafefed250b1f3e8fff02b5cb240592b8a949657e7af06",
          candidateId: "inspection-supply-path-966127dd",
          proposalHash: "18c8ebc898254d30a5e428dbd93412f947da062a1c20779656728237640c9832",
          reviewResultHash: "36c0fc962b3231e6a3a928d1ec7c6a1f1d6c8e0ceaea46f5a4b55cf277fc6a0e",
        }),
      ],
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
        evidence: ["diagnostic", "design-lineage"],
      },
    );
    const decision = await appendIndustrialInvestigationEntry(
      projectDir,
      created.manifest.id,
      {
        id: "retain-commissioned-supply-path",
        author: "agent",
        kind: "decision",
        statement: "Retain the already commissioned supply-path change and use its exact review as the boundary for a physically distinct next hypothesis.",
        disposition: "keep",
        evidence: ["design-lineage", "supply-path-review"],
        introduceEvidence: {
          id: "supply-path-review",
          kind: "candidate-review",
          candidateId: "inspection-supply-path-966127dd",
        },
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
      introducedAnchors: [
        expect.objectContaining({
          id: "supply-path-review",
          kind: "candidate-review",
          candidateId: "inspection-supply-path-966127dd",
          verdict: "KEEP",
        }),
      ],
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
      .toEqual([
        ["operating-run", "current"],
        ["diagnostic", "current"],
        ["design-lineage", "current"],
        ["supply-path-review", "current"],
      ]);
    expect(inspected.currentNextAction).toEqual(expect.objectContaining({
      target: expect.objectContaining({
        kind: "design-run",
        programId: "inspection-supply-path",
        phase: "commissioned",
      }),
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

    const candidatePath = join(
      projectDir,
      "candidates/inspection-supply-path-966127dd.candidate.json",
    );
    const candidateSource = await readFile(candidatePath, "utf8");
    const replacedCandidate = JSON.parse(candidateSource);
    replacedCandidate.hypothesis = `${replacedCandidate.hypothesis} Replaced under the same id.`;
    await writeFile(candidatePath, `${JSON.stringify(replacedCandidate, null, 2)}\n`);
    const replacedProposal = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(replacedProposal.anchors.find((anchor) => anchor.anchor.id === "supply-path-review")?.state)
      .toBe("historical");
    await writeFile(candidatePath, candidateSource);
    expect((await inspectIndustrialInvestigation(projectDir, created.manifest.id)).state).toBe("current");

    const blueprintPath = join(projectDir, "blueprints/generated-dram-fab.blueprint.json");
    const blueprint = JSON.parse(await readFile(blueprintPath, "utf8"));
    blueprint.revision = `${blueprint.revision}-investigation-moved`;
    await writeFile(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`);
    const historical = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(historical.state).toBe("historical");
    expect(historical.anchors.every((anchor) => anchor.state === "historical")).toBeTrue();

    const reviewPath = join(
      projectDir,
      "candidate-reviews/inspection-supply-path-966127dd/18c8ebc898254d30a5e428dbd93412f947da062a1c20779656728237640c9832.review.json",
    );
    const review = JSON.parse(await readFile(reviewPath, "utf8"));
    review.resultHash = "0".repeat(64);
    await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
    const invalidReview = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(invalidReview.state).toBe("invalid");
    expect(invalidReview.anchors.find((anchor) => anchor.anchor.id === "supply-path-review")?.state)
      .toBe("invalid");

    await rm(candidatePath);
    const missingCandidate = await inspectIndustrialInvestigation(projectDir, created.manifest.id);
    expect(missingCandidate.anchors.find((anchor) => anchor.anchor.id === "supply-path-review")?.state)
      .toBe("missing");

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
  try {
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
    expect((await inspectIndustrialInvestigation(projectDir, created.manifest.id)).state)
      .toBe("historical");

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
      ["design-lineage", "historical"],
      ["revised-factory", "current"],
    ]);

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
      state: "current",
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
          state: "current",
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
