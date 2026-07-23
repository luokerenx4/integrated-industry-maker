# Device material authoring

The memory fab uses four neutral generated source families: cleanroom enclosure panels, brushed chamber alloy, ventilated equipment racks, and durable utility panels. The source images are intentionally text-free, logo-free, evenly lit, orthographic, and neutral enough to preserve each Device's authored base-color tint.

`generate-device-materials.ts` is the project-local import pipeline. It accepts one raster source for each family, creates an exact mirrored seamless tile, derives pixel-aligned tangent-space normal, roughness, and metalness maps, verifies the tile edges, then writes an independent copy of all four runtime maps into every owning Device package:

```sh
bun run memory-fab:materials \
  --enclosure /path/to/enclosure.png \
  --chamber /path/to/chamber.png \
  --rack /path/to/rack.png \
  --utility /path/to/utility.png
```

Each target package receives `equipment-base-color.png`, `equipment-normal.png`, `equipment-roughness.png`, and `equipment-metalness.png`, and its `visual.json` is updated to reference only those local files. The generated source path is never retained as a runtime dependency. To reuse a result in another project or Device, copy the finished files into that asset's own directory and author its material there.

Family membership and scalar PBR response live in the TypeScript pipeline beside the import logic. This keeps regeneration deterministic and reviewable without introducing a shared asset library.
