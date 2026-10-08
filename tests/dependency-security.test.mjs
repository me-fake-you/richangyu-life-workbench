import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import { imageSize } from "image-size";

function atLeast(value, minimum) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value || "");
  if (!match) return false;
  const actual = match.slice(1).map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index];
  }
  return true;
}

test("locked image dependencies cannot regress below published security patches", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const [name, minimum] of [["sharp", [0, 35, 5]], ["image-size", [2, 0, 3]]]) {
    const entries = Object.entries(lock.packages || {}).filter(([path]) =>
      path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`));
    assert(entries.length > 0, `${name} must be present in the validated dependency graph`);
    for (const [path, entry] of entries) {
      assert(atLeast(entry.version, minimum), `${path}: unpatched version ${entry.version}`);
    }
  }
});

test("loaded native image library includes the patched SVG dependency", () => {
  assert(atLeast(sharp.versions.sharp, [0, 35, 5]), "loaded sharp version must be patched");
  assert(atLeast(sharp.versions.rsvg, [2, 63, 2]), "loaded librsvg must include the upstream patch");
});

test("patched image stack preserves PNG dimensions and thumbnail conversion", async () => {
  const png = await sharp({
    create: { width: 12, height: 8, channels: 4, background: "#55775d" },
  }).png().toBuffer();
  const size = imageSize(png);
  assert.equal(size.width, 12);
  assert.equal(size.height, 8);
  assert.equal(size.type, "png");
  const thumbnail = await sharp(png).resize({ width: 6, height: 4 }).webp().toBuffer();
  const metadata = await sharp(thumbnail).metadata();
  assert.equal(metadata.width, 6);
  assert.equal(metadata.height, 4);
  assert.equal(metadata.format, "webp");
});

test("patched SVG decoder still renders a bounded local image", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="7" height="5"><rect width="7" height="5" fill="#55775d"/></svg>');
  const size = imageSize(svg);
  assert.equal(size.width, 7);
  assert.equal(size.height, 5);
  const png = await sharp(svg).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.width, 7);
  assert.equal(metadata.height, 5);
  assert.equal(metadata.format, "png");
});

test("unsupported image data is rejected rather than producing invented dimensions", async () => {
  const invalid = Buffer.from("not an image");
  assert.throws(() => imageSize(invalid));
  await assert.rejects(sharp(invalid).metadata());
});
