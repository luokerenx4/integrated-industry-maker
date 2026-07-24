import path from "node:path";
import sharp from "sharp";

const projectDir = path.resolve(import.meta.dir, "..");
const environmentDir = path.join(projectDir, "assets", "environment");
const textureSize = 512;
const halfTextureSize = textureSize / 2;

function sourcePath(): string {
  const flag = Bun.argv[2];
  const value = Bun.argv[3];
  if (flag !== "--source" || !value || Bun.argv.length !== 4) {
    throw new Error("Usage: bun run memory-fab:environment-material --source <generated-floor.png>");
  }
  return path.resolve(value);
}

async function seamlessAlbedo(source: string): Promise<Buffer> {
  if (!(await Bun.file(source).exists())) throw new Error(`Generated floor source does not exist: ${source}`);
  const quadrant = await sharp(source)
    .resize(halfTextureSize, halfTextureSize, { fit: "cover" })
    .removeAlpha()
    .modulate({ brightness: .62, saturation: .72 })
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
      background: { r: 18, g: 28, b: 32 },
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

async function assertSeamless(image: Buffer): Promise<void> {
  const { data, info } = await sharp(image).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let y = 0; y < info.height; y += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      if (data[(y * info.width) * info.channels + channel] !== data[(y * info.width + info.width - 1) * info.channels + channel]) {
        throw new Error("Floor texture has a horizontal edge discontinuity.");
      }
    }
  }
  for (let x = 0; x < info.width; x += 1) {
    for (let channel = 0; channel < info.channels; channel += 1) {
      if (data[x * info.channels + channel] !== data[((info.height - 1) * info.width + x) * info.channels + channel]) {
        throw new Error("Floor texture has a vertical edge discontinuity.");
      }
    }
  }
}

async function companionMaps(albedo: Buffer): Promise<{ normal: Buffer; roughness: Buffer }> {
  const { data, info } = await sharp(albedo).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const luminance = new Float32Array(info.width * info.height);
  for (let pixel = 0; pixel < luminance.length; pixel += 1) {
    const offset = pixel * info.channels;
    luminance[pixel] = data[offset]! * .2126 + data[offset + 1]! * .7152 + data[offset + 2]! * .0722;
  }
  const normal = Buffer.alloc(info.width * info.height * 3);
  const roughness = Buffer.alloc(info.width * info.height);
  const sample = (x: number, y: number) =>
    luminance[((y + info.height) % info.height) * info.width + ((x + info.width) % info.width)]!;
  const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const pixel = y * info.width + x;
      const dx = ((sample(x + 1, y) - sample(x - 1, y)) / 255) * 1.15;
      const dy = ((sample(x, y + 1) - sample(x, y - 1)) / 255) * 1.15;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      normal[pixel * 3] = byte((-dx * inverseLength * .5 + .5) * 255);
      normal[pixel * 3 + 1] = byte((dy * inverseLength * .5 + .5) * 255);
      normal[pixel * 3 + 2] = byte((inverseLength * .5 + .5) * 255);
      roughness[pixel] = byte(214 + (128 - luminance[pixel]!) * .06);
    }
  }
  return {
    normal: await sharp(normal, { raw: { width: info.width, height: info.height, channels: 3 } }).png({ compressionLevel: 9 }).toBuffer(),
    roughness: await sharp(roughness, { raw: { width: info.width, height: info.height, channels: 1 } }).png({ compressionLevel: 9 }).toBuffer(),
  };
}

const albedo = await seamlessAlbedo(sourcePath());
await assertSeamless(albedo);
const maps = await companionMaps(albedo);
await Promise.all([
  Bun.write(path.join(environmentDir, "cleanroom-floor-base-color.png"), albedo),
  Bun.write(path.join(environmentDir, "cleanroom-floor-normal.png"), maps.normal),
  Bun.write(path.join(environmentDir, "cleanroom-floor-roughness.png"), maps.roughness),
]);
console.log("environment floor: seamless 512px base-color, normal, and roughness maps");
