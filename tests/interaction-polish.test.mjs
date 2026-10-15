import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const code = ts.transpileModule(source("app/interaction-kit.tsx"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports, require, setTimeout, clearTimeout });
const kit = exports;
test("Progress states are bounded and an unread snapshot is never advertised as zero complete", () => {
  const html = renderToStaticMarkup(React.createElement(kit.ProgressOrbit, { completed: 2, total: 5 }));
  assert.match(html, /已读取任务完成 2 \/ 5/); assert.match(html, /stroke-dashoffset="60"/);
  const unknown = renderToStaticMarkup(React.createElement(kit.ProgressOrbit, { completed: 0, total: 0, unavailable: true }));
  assert.match(unknown, /任务进度尚未读到/); assert.doesNotMatch(unknown, /已读取任务完成/);
  const excessive = renderToStaticMarkup(React.createElement(kit.ProgressOrbit, { completed: 99, total: 5 }));
  assert.match(excessive, /已读取任务完成 5 \/ 5/);
});
test("Local queue feedback cannot use the server-confirmed success label", () => {
  const local = renderToStaticMarkup(React.createElement(kit.SaveFeedback, { local: true, label: "fixture queue" }));
  assert.match(local, /已存本机待同步/); assert.doesNotMatch(local, /保存已确认/); assert.match(local, /role="status"/);
  const remote = renderToStaticMarkup(React.createElement(kit.SaveFeedback, { local: false, label: "fixture receipt" }));
  assert.match(remote, /保存已确认/); assert.match(remote, /polish-check-path/);
});
test("Duration choices are bounded, ordered and usable without a gesture", () => {
  const values = Array.from(kit.DURATION_CHOICES);
  assert.equal(new Set(values).size, values.length);
  assert.deepEqual(values, values.slice().sort((a, b) => a - b));
  assert.ok(values.every(x => Number.isInteger(x) && x >= 1 && x <= 1440));
  assert.ok(values.includes(25) && values.includes(45) && values.includes(60));
  const html = renderToStaticMarkup(React.createElement(kit.DurationWheel, { value: 25, onChange() {} }));
  assert.match(html, /可滚动或点击/); assert.match(html, /aria-pressed="true"/);
  assert.equal((html.match(/type="button"/g) || []).length, values.length);
});
test("Record expansion is user controlled and secondary content starts hidden", () => {
  const html = renderToStaticMarkup(React.createElement(kit.StackedList, null,
    React.createElement("p", null, "fixture first"), React.createElement("p", null, "fixture second")));
  assert.match(html, /aria-expanded="false"/); assert.match(html, /hidden=""/);
  assert.match(html, /展开另外 1 条记录/);
});
test("Home wiring keeps data APIs and offline semantics while honoring reduced motion", () => {
  const home = source("app/home-studio.tsx"), css = source("app/workbench-polish.css");
  assert.match(home, /<DurationWheel value=\{focusMinutes\}/);
  assert.match(home, /<ProgressOrbit completed=\{completed\}/);
  assert.match(home, /unavailable=\{taskLoading \|\| Boolean\(taskError\)\}/);
  assert.match(home, /setCaptureOutcome\(\{ local: queuedLocally, label \}\)/);
  assert.match(home, /await enqueueOfflineMutation/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /animation:none!important/); assert.match(css, /scroll-snap-type:y mandatory/);
  assert.match(source("app/layout.tsx"), /import "\.\/workbench-polish.css"/);
});
