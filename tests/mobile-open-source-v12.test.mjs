import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v1.2 exposes mobile shortcuts and an accessible walkthrough", async () => {
  const [pkgRaw, manifest, workbench, guide, readme, videoScript, captions] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/manifest.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/life-desk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/user-guide.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../docs/video-script.md", import.meta.url), "utf8"),
    readFile(new URL("../public/tutorial/richangyu-quick-start.vtt", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(pkgRaw).version, "1.4.0");
  for (const action of ["record", "schedule", "nutrition", "inbox"]) {
    assert.match(manifest, new RegExp(`action=${action}`));
    assert.match(workbench, new RegExp(`action === "${action}"`));
  }
  assert.match(guide, /richangyu-quick-start\.mp4/);
  assert.match(guide, /richangyu-quick-start\.vtt/);
  assert.match(guide, /poster="\/tutorial\/quick-start-poster\.png"/);
  assert.match(readme, /三分钟产品讲解/);
  assert.match(readme, /功能成熟度/);
  assert.match(videoScript, /计划—实际—回忆/);
  assert.match(captions, /^WEBVTT/m);
});
