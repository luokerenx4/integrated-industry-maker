import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import {
  atomicWriteJson,
  compileFactoryProject,
  loadFactoryProject,
  runUntil,
  writeRunArtifact,
  type Blueprint,
  type RunManifest,
} from "../packages/inm-core/src";

interface RunSource {
  name: string;
  manifest: RunManifest;
  blueprint: Blueprint;
}

const repository = resolve(import.meta.dir, "..");
const requestedProjects = process.argv.slice(2);
const targets = requestedProjects.length
  ? requestedProjects.map((project) => ({
      project: resolve(project),
      runs: [] as string[],
    }))
  : [
      { project: join(repository, "examples/ironworks"), runs: ["021-simulate"] },
      { project: join(repository, "examples/memory-fab"), runs: ["097-simulate", "098-simulate"] },
    ];

for (const target of targets) {
  if (target.runs.length === 0) {
    throw new Error(
      "Explicit project arguments require an authored target list; use the default invocation for checked-in evidence.",
    );
  }
}

const temporaryRoot = await mkdtemp(join(tmpdir(), "inm-current-run-evidence-"));

try {
  for (const target of targets) {
    const temporaryProject = join(temporaryRoot, basename(target.project));
    const sources: RunSource[] = [];
    for (const name of target.runs) {
      const runDir = join(target.project, "runs", name);
      sources.push({
        name,
        manifest: JSON.parse(await readFile(join(runDir, "manifest.json"), "utf8")) as RunManifest,
        blueprint: JSON.parse(await readFile(join(runDir, "blueprint.json"), "utf8")) as Blueprint,
      });
    }

    await cp(target.project, temporaryProject, {
      recursive: true,
      filter: (source) => {
        const local = relative(target.project, source);
        return local !== ".inm" && !local.startsWith(`.inm/`);
      },
    });
    for (const source of sources) {
      await rm(join(temporaryProject, "runs", source.name), { recursive: true, force: true });
    }

    for (const source of sources) {
      const loaded = await loadFactoryProject(temporaryProject, source.manifest.selection);
      loaded.blueprint = source.blueprint;
      const project = compileFactoryProject(loaded);
      const result = runUntil(project, undefined, { seed: source.manifest.seed });
      const generated = await writeRunArtifact(project, result, {
        label: "simulate",
        seed: source.manifest.seed,
        decision: source.manifest.decision,
      });
      if (generated.name !== source.name) {
        throw new Error(`Expected regenerated Run '${source.name}', received '${generated.name}'`);
      }
      generated.manifest.createdAt = source.manifest.createdAt;
      await atomicWriteJson(join(generated.path, "manifest.json"), generated.manifest);

      const targetDir = join(target.project, "runs", source.name);
      for (const file of [
        "blueprint.json",
        "metrics.json",
        "final-state.json",
        "events.ndjson",
        "report.md",
        "manifest.json",
      ]) {
        await cp(join(generated.path, file), join(targetDir, file), { force: true });
      }
      process.stdout.write(
        `${relative(repository, targetDir)} ${source.manifest.resultHash} -> ${result.resultHash}\n`,
      );
    }
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
