import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v1.3 exposes auditable health, demo, sync and AI transparency", async () => {
  const [
    pkgRaw,
    healthRoute,
    demoRoute,
    reliabilityCenter,
    syncCenter,
    offlineSync,
    aiAnalysis,
    layout,
    globals,
    readme,
  ] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/health/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/demo/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/reliability-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/sync-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/offline-sync.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/ai-analysis.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(pkgRaw).version, "1.4.0");
  assert.match(healthRoute, /PRAGMA foreign_key_check/);
  assert.match(healthRoute, /SHA-256/);
  assert.match(healthRoute, /wroteProductionData: false/);
  assert.match(demoRoute, /demo-v13-/);
  assert.match(demoRoute, /RESET DEMO/);
  assert.match(demoRoute, /DELETE FROM \$\{target\.table\} WHERE \$\{target\.column\} LIKE/);
  assert.match(reliabilityCenter, /数据健康与恢复演练/);
  assert.match(reliabilityCenter, /安全演示模式/);
  assert.match(syncCenter, /同步诊断/);
  assert.match(offlineSync, /richangyu-offline-diagnostics/);
  assert.match(aiAnalysis, /costLabel/);
  assert.match(aiAnalysis, /sourceCount/);
  assert.match(layout, /skip-link/);
  assert.match(globals, /prefers-reduced-motion/);
  assert.match(readme, /长期可靠性/);
});
