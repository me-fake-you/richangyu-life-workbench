import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assertSupportedProjectVersion } from "./helpers/project-version.mjs";

test("v1.5 makes daily mobile capture fast, configurable and recoverable", async () => {
  const [
    pkgRaw,
    workbench,
    mobile,
    mobileStyles,
    preferences,
    serviceWorker,
    guide,
  ] = await Promise.all([
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/life-desk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mobile-experience.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/mobile-experience.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/preferences/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../app/user-guide.tsx", import.meta.url), "utf8"),
  ]);

  assertSupportedProjectVersion(JSON.parse(pkgRaw).version);
  for (const label of [
    "写一句话",
    "拍照记录",
    "语音随手记",
    "记录饮食",
    "先存收件箱",
    "更多指令",
  ]) {
    assert.match(mobile, new RegExp(label));
  }
  assert.match(mobile, /capture="environment"/);
  assert.match(workbench, /长按优先打开语音/);
  assert.match(workbench, /prepareLifePhoto/);
  assert.match(workbench, /MobileInstallNudge/);
  assert.match(workbench, /NotificationSetupCard/);
  assert.match(workbench, /privacy-concealed/);
  assert.match(preferences, /mobileShortcut/);
  assert.match(serviceWorker, /APP_SHELL_KEY/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(mobileStyles, /\.mobile-quick-sheet/);
  assert.match(mobileStyles, /scroll-snap-type/);
  assert.match(guide, /手机底部的“＋”/);
});
