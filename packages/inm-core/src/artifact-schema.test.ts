import { expect, test } from "bun:test";
import { listProjectArtifactSchemaKinds, projectArtifactJsonSchema } from "./artifact-schema";

test("every authored project artifact has a deterministic Draft 7 JSON Schema", () => {
  const kinds = listProjectArtifactSchemaKinds();
  expect(kinds).toEqual([...kinds].sort());
  expect(kinds).toContain("benchmark");
  expect(kinds).toContain("candidate");

  for (const kind of kinds) {
    const first = projectArtifactJsonSchema(kind);
    const second = projectArtifactJsonSchema(kind);
    expect(second).toEqual(first);
    expect(first.$schema).toBe("http://json-schema.org/draft-07/schema#");
    expect(first.$ref).toBe(`#/definitions/${kind}`);
    expect(first.definitions).toEqual(expect.objectContaining({ [kind]: expect.any(Object) }));
  }
});

test("strict Zod object contracts remain closed in exported JSON Schemas", () => {
  for (const kind of ["manifest", "world", "blueprint", "scenario", "objective", "device-asset", "resource-asset", "process", "benchmark", "candidate"] as const) {
    const schema = projectArtifactJsonSchema(kind);
    const root = (schema.definitions as Record<string, Record<string, unknown>>)[kind]!;
    expect(root.type).toBe("object");
    expect(root.additionalProperties).toBeFalse();
    expect(root.required).toEqual(expect.any(Array));
  }
});

test("Device visual schema exposes only the strict PBR material contract", () => {
  const schema = projectArtifactJsonSchema("device-visual");
  const root = (schema.definitions as Record<string, {
    properties: Record<string, unknown>;
    required: string[];
  }>)["device-visual"]!;
  expect(root.required).toContain("material");
  expect(root.properties).not.toHaveProperty("texture");
  expect(root.properties).not.toHaveProperty("color");
  expect(JSON.stringify(root.properties.material)).toContain("normalScale");
  expect(JSON.stringify(root.properties.material)).toContain("emissiveIntensity");
});
