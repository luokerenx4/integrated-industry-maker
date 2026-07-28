#!/usr/bin/env bun
import { resolve } from "node:path";

interface Check {
  name: string;
  argv: string[];
}

const repository = resolve(import.meta.dir, "..");
const checks: Check[] = [
  { name: "documentation", argv: ["run", "docs:check"] },
  { name: "TypeScript", argv: ["run", "typecheck"] },
  {
    name: "short unit suite",
    argv: [
      "test",
      "packages/inm-core/src/artifact-schema.test.ts",
      "packages/inm-studio/src/design-workbench.test.ts",
      "packages/inm-studio/src/factory-presentation.test.ts",
      "packages/inm-studio/src/routes.test.ts",
      "packages/inm-studio/src/selection.test.ts",
    ],
  },
];

const startedAt = performance.now();
for (const check of checks) {
  const checkStartedAt = performance.now();
  process.stdout.write(`FAST  ${check.name}\n`);
  const child = Bun.spawn([process.execPath, ...check.argv], {
    cwd: repository,
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  const elapsed = ((performance.now() - checkStartedAt) / 1_000).toFixed(1);
  if (exitCode !== 0) {
    process.stderr.write(`FAIL  ${check.name} · ${elapsed}s\n`);
    process.exit(exitCode);
  }
  process.stdout.write(`PASS  ${check.name} · ${elapsed}s\n`);
}
process.stdout.write(`FAST CHECK PASSED · ${((performance.now() - startedAt) / 1_000).toFixed(1)}s\n`);
