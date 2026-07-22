import { blueprintBenchmarkSchema } from "./benchmark";
import { candidateChangeSetSchema } from "./candidate-change-set";
import { schemas } from "./schema";
import { zodToJsonSchema } from "zod-to-json-schema";

export const projectArtifactSchemas = {
  ...schemas,
  benchmark: blueprintBenchmarkSchema,
  candidate: candidateChangeSetSchema,
} as const;

export type ProjectArtifactSchemaKind = keyof typeof projectArtifactSchemas;

export function listProjectArtifactSchemaKinds(): ProjectArtifactSchemaKind[] {
  return Object.keys(projectArtifactSchemas).sort() as ProjectArtifactSchemaKind[];
}

export function projectArtifactJsonSchema(kind: ProjectArtifactSchemaKind): Record<string, unknown> {
  return zodToJsonSchema(projectArtifactSchemas[kind], {
    name: kind,
    target: "jsonSchema7",
    $refStrategy: "root",
    errorMessages: true,
  }) as Record<string, unknown>;
}
