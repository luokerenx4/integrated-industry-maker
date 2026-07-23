import path from "node:path";
import sharp from "sharp";

type MaterialFamilyId = "enclosure" | "chamber" | "rack" | "utility";

type DeviceVisualFile = {
  shape: string;
  height: number;
  model: string | null;
  material: {
    baseColor: string;
    maps: {
      baseColor: string | null;
      normal: string | null;
      roughness: string | null;
      metalness: string | null;
      emissive: string | null;
    };
    metalness: number;
    roughness: number;
    normalScale: number;
    emissiveColor: string;
    emissiveIntensity: number;
    repeat: { x: number; y: number };
  };
  label: string;
};

type MaterialFamily = {
  devices: readonly string[];
  metalnessMapValue: number;
  metalness: number;
  roughnessMapValue: number;
  roughness: number;
  normalStrength: number;
  normalScale: number;
  repeat: { x: number; y: number };
};

const projectDir = path.resolve(import.meta.dir, "..");
const deviceAssetsDir = path.join(projectDir, "assets", "devices");
const textureSize = 512;
const halfTextureSize = textureSize / 2;

const families: Record<MaterialFamilyId, MaterialFamily> = {
  enclosure: {
    devices: [
      "advanced-pattern-recovery-cell",
      "ald-deposition-bay",
      "continuous-deep-metrology-cell",
      "dram-packaging-cell",
      "dram-wafer-probe-cell",
      "lithography-bay",
      "pattern-rework-bay",
      "rapid-metrology-cell",
      "wafer-inspection-bay",
    ],
    metalnessMapValue: 154,
    metalness: 0.55,
    roughnessMapValue: 196,
    roughness: 0.62,
    normalStrength: 2.1,
    normalScale: 0.68,
    repeat: { x: 1.25, y: 1.25 },
  },
  chamber: {
    devices: ["plasma-etch-bay", "thermal-batch-furnace"],
    metalnessMapValue: 232,
    metalness: 0.82,
    roughnessMapValue: 202,
    roughness: 0.48,
    normalStrength: 1.8,
    normalScale: 0.58,
    repeat: { x: 1, y: 1 },
  },
  rack: {
    devices: ["buffer", "dram-burn-in-rack", "material-sink", "reticle-stocker", "scrap-bin"],
    metalnessMapValue: 126,
    metalness: 0.42,
    roughnessMapValue: 214,
    roughness: 0.68,
    normalStrength: 2.35,
    normalScale: 0.74,
    repeat: { x: 1.5, y: 1.5 },
  },
  utility: {
    devices: [
      "conveyor",
      "dual-crew-maintenance-service-bay",
      "fab-utility-plant",
      "maintenance-service-bay",
      "sorter",
      "splitter",
      "wind-turbine",
    ],
    metalnessMapValue: 142,
    metalness: 0.5,
    roughnessMapValue: 222,
    roughness: 0.66,
    normalStrength: 2,
    normalScale: 0.66,
    repeat: { x: 1.2, y: 1.2 },
  },
};

function parseSources(): Record<MaterialFamilyId, string> {
  const args = Bun.argv.slice(2);
  const sources = {} as Partial<Record<MaterialFamilyId, string>>;
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !value) {
      throw new Error("Expected --enclosure, --chamber, --rack, and --utility source paths.");
    }
    const family = flag.slice(2) as MaterialFamilyId;
    if (!(family in families)) throw new Error(`Unknown material family flag ${flag}.`);
    sources[family] = path.resolve(value);
  }
  for (const family of Object.keys(families) as MaterialFamilyId[]) {
    if (!sources[family]) throw new Error(`Missing --${family} source path.`);
  }
  return sources as Record<MaterialFamilyId, string>;
}

async function seamlessAlbedo(source: string): Promise<Buffer> {
  if (!(await Bun.file(source).exists())) throw new Error(`Generated material source does not exist: ${source}`);
  const quadrant = await sharp(source)
    .resize(halfTextureSize, halfTextureSize, { fit: "cover" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();
  const [right, lower, lowerRight] = await Promise.all([
    sharp(quadrant).flop().toBuffer(),
    sharp(quadrant).flip().toBuffer(),
    sharp(quadrant).flip().flop().toBuffer(),
  ]);
  return sharp({
    create: {
      width: textureSize,
      height: textureSize,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
    },
  })
    .composite([
      { input: quadrant, left: 0, top: 0 },
      { input: right, left: halfTextureSize, top: 0 },
      { input: lower, left: 0, top: halfTextureSize },
      { input: lowerRight, left: halfTextureSize, top: halfTextureSize },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function assertSeamless(image: Buffer, familyId: MaterialFamilyId): Promise<void> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      const left = (y * info.width) * info.channels + channel;
      const right = (y * info.width + info.width - 1) * info.channels + channel;
      if (data[left] !== data[right]) throw new Error(`${familyId} texture has a horizontal edge discontinuity.`);
    }
  }
  for (let x = 0; x < info.width; x += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      const top = x * info.channels + channel;
      const bottom = ((info.height - 1) * info.width + x) * info.channels + channel;
      if (data[top] !== data[bottom]) throw new Error(`${familyId} texture has a vertical edge discontinuity.`);
    }
  }
}

async function materialMaps(
  albedo: Buffer,
  family: MaterialFamily,
): Promise<{ normal: Buffer; roughness: Buffer; metalness: Buffer }> {
  const { data, info } = await sharp(albedo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const luminance = new Float32Array(info.width * info.height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * info.channels;
    luminance[pixel] = data[offset]! * 0.2126 + data[offset + 1]! * 0.7152 + data[offset + 2]! * 0.0722;
  }

  const normalPixels = Buffer.alloc(info.width * info.height * 3);
  const roughnessPixels = Buffer.alloc(info.width * info.height);
  const metalnessPixels = Buffer.alloc(info.width * info.height);
  const sample = (x: number, y: number) =>
    luminance[((y + info.height) % info.height) * info.width + ((x + info.width) % info.width)]!;
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = y * info.width + x;
      const dx = ((sample(x + 1, y) - sample(x - 1, y)) / 255) * family.normalStrength;
      const dy = ((sample(x, y + 1) - sample(x, y - 1)) / 255) * family.normalStrength;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      const normalOffset = pixel * 3;
      normalPixels[normalOffset] = byte((-dx * inverseLength * 0.5 + 0.5) * 255);
      normalPixels[normalOffset + 1] = byte((dy * inverseLength * 0.5 + 0.5) * 255);
      normalPixels[normalOffset + 2] = byte((inverseLength * 0.5 + 0.5) * 255);

      const brightnessDelta = 128 - luminance[pixel]!;
      roughnessPixels[pixel] = byte(family.roughnessMapValue + brightnessDelta * 0.08);
      metalnessPixels[pixel] = byte(family.metalnessMapValue - brightnessDelta * 0.04);
    }
  }

  const rawOptions = { raw: { width: info.width, height: info.height, channels: 1 as const } };
  return {
    normal: await sharp(normalPixels, {
      raw: { width: info.width, height: info.height, channels: 3 },
    })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    roughness: await sharp(roughnessPixels, rawOptions).png({ compressionLevel: 9 }).toBuffer(),
    metalness: await sharp(metalnessPixels, rawOptions).png({ compressionLevel: 9 }).toBuffer(),
  };
}

async function writeFamily(familyId: MaterialFamilyId, source: string): Promise<void> {
  const family = families[familyId];
  const albedo = await seamlessAlbedo(source);
  await assertSeamless(albedo, familyId);
  const maps = await materialMaps(albedo, family);
  for (const deviceId of family.devices) {
    const assetDir = path.join(deviceAssetsDir, deviceId);
    const visualPath = path.join(assetDir, "visual.json");
    const visual = (await Bun.file(visualPath).json()) as DeviceVisualFile;
    visual.material = {
      ...visual.material,
      maps: {
        baseColor: "equipment-base-color.png",
        normal: "equipment-normal.png",
        roughness: "equipment-roughness.png",
        metalness: "equipment-metalness.png",
        emissive: null,
      },
      metalness: family.metalness,
      roughness: family.roughness,
      normalScale: family.normalScale,
      repeat: family.repeat,
    };
    await Promise.all([
      Bun.write(path.join(assetDir, "equipment-base-color.png"), albedo),
      Bun.write(path.join(assetDir, "equipment-normal.png"), maps.normal),
      Bun.write(path.join(assetDir, "equipment-roughness.png"), maps.roughness),
      Bun.write(path.join(assetDir, "equipment-metalness.png"), maps.metalness),
      Bun.write(visualPath, `${JSON.stringify(visual, null, 2)}\n`),
    ]);
  }
  console.log(`${familyId}: ${family.devices.length} self-contained Device packages`);
}

const sources = parseSources();
for (const family of Object.keys(families) as MaterialFamilyId[]) {
  await writeFamily(family, sources[family]);
}
