import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("v1.4 keeps the full system discoverable while making daily use simpler", async () => {
  const [pkgRaw, workbench, command, preferences, styles] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/life-desk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/command-palette.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.equal(JSON.parse(pkgRaw).version, "1.4.0");
  assert.match(preferences, /workspaceMode/);
  assert.match(preferences, /scenePreset/);
  assert.match(workbench, /简洁模式/);
  assert.match(workbench, /完整模式/);
  assert.match(workbench, /查看全部功能/);
  assert.match(workbench, /逐条整理/);
  assert.match(workbench, /一次只处理一条/);
  assert.match(workbench, /<span>回顾<\/span>/);
  assert.match(command, /MULTI-ACTION CAPTURE/);
  assert.match(command, /午饭鸡肉饭，花了32元，心情不错/);
  assert.match(command, /语音输入/);
  assert.match(command, /已附加照片/);
  assert.match(command, /刚才的快捷操作已经撤销/);
  assert.match(styles, /\.workspace-mode-switch/);
  assert.match(styles, /\.inbox-triage/);
});
