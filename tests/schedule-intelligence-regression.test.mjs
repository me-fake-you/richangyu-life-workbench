import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Beijing local schedule times are normalized before persistence", async () => {
  const [workbench, workspaceRoute, commandPalette] = await Promise.all([
    readFile(new URL("../app/life-desk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/command-palette.tsx", import.meta.url), "utf8"),
  ]);

  const utc = new Date(
    Date.UTC(2026, 6, 30, 9, 30) + -480 * 60_000,
  ).toISOString();
  assert.equal(utc, "2026-07-30T01:30:00.000Z");
  assert.match(workbench, /function localDateTimeToIso/);
  assert.match(workbench, /timezoneOffset: new Date\(\)\.getTimezoneOffset\(\)/);
  assert.match(workspaceRoute, /function scheduleIsoDate/);
  assert.match(workspaceRoute, /offset \* 60_000/);
  assert.match(commandPalette, /startAt: start\.toISOString\(\)/);
  assert.doesNotMatch(workbench, /调整开始时间/);
});

test("schedule supports full editing and batch creation", async () => {
  const [workbench, workspaceRoute, styles] = await Promise.all([
    readFile(new URL("../app/life-desk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/workspace/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(workbench, /单个安排/);
  assert.match(workbench, /批量安排/);
  assert.match(workbench, /编辑时间表事件/);
  assert.match(workbench, /编辑日程内容和时间/);
  assert.match(workspaceRoute, /schedule\.batchCreate/);
  assert.match(workspaceRoute, /schedule\.edit/);
  assert.match(workspaceRoute, /一次最多批量添加 50 项安排/);
  assert.match(styles, /\.batch-schedule-row/);
});

test("intelligence cards capture images and render safe Markdown", async () => {
  const [center, route, briefing, imageRoute, markdown, schema] =
    await Promise.all([
      readFile(new URL("../app/intelligence-center.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/api/intelligence/route.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/intelligence-briefing.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/intelligence/image/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/markdown-content.tsx", import.meta.url), "utf8"),
      readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    ]);
  assert.match(center, /<FeedArtwork item=\{item\}/);
  assert.match(center, /<MarkdownContent content=\{latestDailyBrief\.content\}/);
  assert.match(route, /og:image/);
  assert.match(briefing, /discoverArticleImage/);
  assert.match(imageRoute, /SELECT image_url FROM feed_items/);
  assert.match(imageRoute, /content-type/);
  assert.match(markdown, /inlineMarkdown/);
  assert.doesNotMatch(markdown, /dangerouslySetInnerHTML/);
  assert.match(schema, /imageUrl: text\("image_url"\)/);
});
