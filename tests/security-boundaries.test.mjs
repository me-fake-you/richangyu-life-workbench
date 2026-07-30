import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("private, backup and AI boundaries remain explicit", async () => {
  const [reviewRoute, backupRoute, mediaRoute, worker, aiProvider, gitignore] =
    await Promise.all([
      readFile(new URL("../app/api/review/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/backup/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/api/media/[id]/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/ai-provider.ts", import.meta.url), "utf8"),
      readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    ]);

  assert.match(reviewRoute, /is_private = 0/);
  assert.match(reviewRoute, /sourceIds/);
  assert.match(backupRoute, /confirmation[\s\S]*RESTORE/);
  assert.match(backupRoute, /sensitiveTables/);
  assert.match(mediaRoute, /private|vault/i);
  assert.match(worker, /life-workbench\.internal/);
  assert.doesNotMatch(worker, /richangyu\.internal/);
  assert.match(aiProvider, /NVIDIA_TEXT_API_KEY/);
  assert.match(aiProvider, /NVIDIA_VISION_API_KEY/);
  assert.match(gitignore, /\.env\*/);
});
