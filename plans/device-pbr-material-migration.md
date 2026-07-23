# Migrate Device visuals to project-local PBR materials

- Status: `completed`
- Updated: `2026-07-23`
- Related design: [[docs/design/project-boundaries]], [[docs/design/studio-debugger]], and [[docs/PROJECT_FORMAT]].

## Outcome

Every procedural Device can use an explicit project-local PBR material, and the commissioned memory fab ships a coherent semiconductor-cleanroom texture set whose files are copied into each owning Device package rather than drawn from a shared asset library.

## Context

The completed [[plans/memory-fab-visual-language]] established distinguishable procedural silhouettes, but the active Device visual contract still exposes only top-level `texture` and `color`. Studio applies that one sRGB image to the primary shell with hard-coded metalness and roughness. There are no normal, roughness, metalness, or emissive maps, no repeat control, and no structured material identity.

INM is pre-alpha, so this change will replace the old Device fields directly. Resource visuals are a separate cargo/icon concern and retain their current contract. A project-local GLTF/GLB model continues to own its embedded materials and replaces the procedural body. Generated raster sources are project deliverables, not engine-global assets.

## Scope

### In scope

- Replace Device `texture` and `color` with a strict `material` object containing base color, albedo/normal/roughness/metalness/emissive map paths, scalar PBR controls, normal strength, and two-axis repeat.
- Resolve, validate, hash, serve, and render every referenced file inside its Device package.
- Migrate every current Device visual in Ironworks and memory-fab directly to the active format without aliases or fallback readers.
- Generate a small coherent family of tileable, text-free semiconductor equipment surfaces; derive and validate companion maps; copy the selected outputs into each memory-fab Device package.
- Preserve dynamic processing/status emission, selection, progress, procedural profiles, GLTF override behavior, and renderer-independent simulation.
- Relock catalog-dependent Benchmarks and generate compatible current evidence after the asset hashes change.

### Out of scope

- Resource cargo/icon material migration, photogrammetry, external texture libraries, or network-loaded assets.
- A shared cross-project or cross-asset material directory. Reuse means copying the files into each package.
- Per-face UV authoring, arbitrary shader graphs, clearcoat/transmission, or runtime material editing.
- Backward-compatible Device `texture` / `color` readers or migration aliases.

## Acceptance

- [x] Device schema, loader, public JSON Schema, Studio, examples, tests, and documentation use only the new `material` contract.
- [x] Albedo, normal, roughness, metalness, and optional emissive maps load from project-confined Device packages with deterministic repeat and color-space handling.
- [x] All memory-fab equipment families have coherent generated materials without baked text, logos, lighting, perspective, or obvious seams; assets remain independently copyable.
- [x] Procedural body details, live status, selection, and progress remain legible, while GLTF/GLB assets retain their own materials.
- [x] Visual-only changes leave simulator events, state, and metrics invariant; Ironworks and memory-fab validate under the new format.
- [x] Benchmark locks, compatible current runs, focused tests, type checking, documentation checks, full regression, and desktop/narrow browser comparison pass.

## Work

- [x] Define and implement the strict Device PBR material contract, path confinement, and public documentation.
- [x] Migrate all Device assets and Studio materials; remove every old Device field reader.
- [x] Generate and inspect the texture family, derive companion maps, and copy final assets into each memory-fab Device package.
- [x] Add schema/loader/rendering/invariance tests and validate Ironworks plus memory-fab.
- [x] Relock Benchmarks, generate compatible runs, perform browser comparison, and complete the full regression audit.

## Findings and decisions

- 2026-07-23 — Resource visuals remain separate because cargo rendering and icon presentation have different scale, UV, and material needs from installed equipment.
- 2026-07-23 — Generated source art will be neutral enough to accept each asset's authored base-color tint. Normal and scalar maps will be derived deterministically so all channels remain pixel-aligned.
- 2026-07-23 — Text, warning labels, logos, cast shadows, perspective, and baked lighting are excluded from tile textures; identity and live state remain separate Studio layers.
- 2026-07-23 — Four generated source families cover cleanroom enclosures, brushed process chambers, ventilated racks, and durable utility equipment. The TypeScript importer mirrors each source into an exactly seamless 512px tile, verifies both edge pairs, derives aligned data maps, and writes independent copies into all 21 memory-fab Device packages.
- 2026-07-23 — The 390px viewport remains functional but fitting the entire commissioned factory makes individual equipment too small for comfortable direct inspection. This presentation-only issue is separated into [[plans/responsive-factory-presentation]].

## Verification

- `bun run memory-fab:materials --enclosure … --chamber … --rack … --utility …` — generated and edge-verified four PBR maps in each of 21 self-contained memory-fab Device packages; 84 files, zero asset symlinks.
- `bun run inm validate examples/ironworks --json` and `bun run inm validate examples/memory-fab --json` — both projects valid; memory-fab keeps Blueprint `d679917…` with Device catalog `6005e47…`.
- Focused Schema/loader/invariance tests prove the public Device visual contract has no top-level `texture` or `color`, missing local maps fail loading, resolved maps remain in the owning package, and visual edits leave events/state/metrics identical.
- `bun run ironworks:relock-benchmarks` and `bun run memory-fab:relock-benchmarks` — all 5 Ironworks and 8 memory-fab Benchmark contracts relocked to their new Device catalogs.
- `bun run runs:regenerate` — all 9 checked-in Ironworks demonstration runs regenerate and replay against the new visual catalog.
- Compatible memory-fab runs `063-simulate` and `064-simulate` record the commissioned production and equipment-energy selections under Device catalog `6005e47…`.
- Browser comparison at `1440 × 900` and `390 × 844` — PBR surfaces, selection beacon, inspector, status overlays, navigation, and timeline render without console warnings or errors.
- `bun run docs:check` — 603 repository double-links resolve.
- `bun run test` — 201 tests, 1,797 assertions, all 8 Ironworks industrial fixtures, type checking, documentation checks, Core/CLI/Studio suites, locked Benchmarks, and immutable Run replay pass with zero failures.

## Progress log

- 2026-07-23 — Activated as a direct follow-up to [[plans/memory-fab-visual-language]] after the user requested immediate material migration and a unified generated texture set.
- 2026-07-23 — Replaced the Device visual contract, migrated both examples, implemented Studio's project-local PBR material path, and generated/imported the four-family memory-fab texture set.
- 2026-07-23 — Relocked catalog-dependent evidence, generated compatible runs, completed desktop/narrow browser checks, and passed the full repository regression.

## Completion

Shipped a strict project-local Device PBR contract with five optional maps, scalar controls, repeat, confined loading, and color-space-correct Studio rendering. All 44 current Device visuals use the new format directly. The memory fab now owns four generated semiconductor-equipment surface families, imported by a persistent TypeScript pipeline into 21 independently copyable Device packages. Dynamic state presentation and GLTF ownership remain separate, simulation behavior is invariant, and every catalog-dependent Benchmark and replay artifact is current. Narrow-viewport equipment legibility is intentionally deferred to [[plans/responsive-factory-presentation]].
