import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openFactoryProject } from "@inm/core";
import { initCommand } from "./commands";

test("inm init creates a standalone valid project", async () => {
  const parent = await mkdtemp(join(tmpdir(), "inm-init-")); const target = join(parent, "factory");
  await initCommand(target, { force: false, json: false });
  const project = await openFactoryProject(target);
  expect(project.manifest.version).toBe(1); expect(Object.keys(project.devices).length).toBeGreaterThan(0);
});
