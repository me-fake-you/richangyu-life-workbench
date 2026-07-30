import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the production shell includes the core life workbench modules", async () => {
  const [layout, page, workbench, dashboard, command, graph, topics, finance, hustle, intelligence, guide, jobs, portability, longTermReview, financeRoute, financeDocumentsRoute, intelligenceRoute, backupRoute, reviewRoute, automationEngine, intelligenceStore, intelligenceBriefing, styles] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/life-desk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/configurable-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/command-palette.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/life-graph.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/topic-spaces.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/finance-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/side-hustle-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/intelligence-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/user-guide.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/job-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/data-portability-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/long-term-review-center.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/finance/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/finance/documents/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/intelligence/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/backup/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/review/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/automation-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/intelligence-store.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/intelligence-briefing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /lang="zh-CN"/);
  assert.match(layout, /日常屿 · 生活工作台/);
  assert.match(page, /<LifeDesk \/>/);

  for (const moduleName of [
    "今日",
    "时间表中心",
    "生活时间线",
    "生活图谱",
    "专题空间",
    "财务中心",
    "兼职中心",
    "情报中心",
    "求职机会",
    "自定义表格",
    "生活收件箱",
    "回顾与总结",
    "饮食与营养",
    "智能与自动化",
    "私密空间",
    "使用指南",
  ]) {
    assert.match(workbench, new RegExp(moduleName));
  }

  assert.match(workbench, /FormData/);
  assert.match(workbench, /actualMinutes/);
  assert.match(workbench, /!\w+\.isPrivate/);
  assert.match(workbench, /发现时间冲突/);
  assert.match(workbench, /导出 CSV/);
  assert.match(dashboard, /DAILY NOTE/);
  assert.match(dashboard, /今年第/);
  assert.match(dashboard, /智能排序中/);
  assert.match(command, /执行前预览/);
  assert.match(command, /Ctrl|全局指令/);
  assert.match(graph, /LIFE GRAPH/);
  assert.match(topics, /TOPIC SPACES/);
  assert.match(finance, /FINANCE CENTER/);
  assert.match(finance, /周期账单/);
  assert.match(hustle, /SIDE HUSTLE CENTER/);
  assert.match(hustle, /应赚与到账分开记录/);
  assert.match(intelligence, /INTELLIGENCE CENTER/);
  assert.match(intelligence, /论文评价信号分开展示/);
  assert.match(intelligence, /daily\.refresh/);
  assert.match(intelligence, /国内外基础来源已自动配置/);
  assert.match(guide, /第一次使用，建议完成这四件事/);
  assert.match(guide, /手机端是网页，也能像 App 一样安装/);
  assert.match(guide, /情报不是让 AI 凭空编新闻/);
  assert.match(jobs, /OPPORTUNITY RADAR/);
  assert.match(jobs, /岗位开放状态/);
  assert.match(jobs, /个人投递状态/);
  assert.match(portability, /完整可移植备份/);
  assert.match(portability, /预检不会修改当前数据/);
  assert.match(portability, /安全合并/);
  assert.match(longTermReview, /LONG-TERM REFLECTION/);
  assert.match(longTermReview, /计划与实际/);
  assert.match(longTermReview, /SOURCE-BACKED HIGHLIGHTS/);
  assert.match(financeRoute, /settleReceivable/);
  assert.match(financeRoute, /INSERT INTO receivables/);
  assert.match(financeDocumentsRoute, /MEDIA\.put/);
  assert.match(financeDocumentsRoute, /finance_documents/);
  assert.match(intelligenceRoute, /job_snapshots/);
  assert.match(intelligenceRoute, /job_changes/);
  assert.match(intelligenceRoute, /inferOpeningStatus/);
  assert.match(backupRoute, /richangyu-backup/);
  assert.match(backupRoute, /backupTarStream/);
  assert.match(backupRoute, /confirmation[\s\S]*RESTORE/);
  assert.match(backupRoute, /sensitiveTables/);
  assert.match(reviewRoute, /is_private = 0/);
  assert.match(reviewRoute, /sourceIds/);
  assert.match(reviewRoute, /AbortSignal\.timeout/);
  assert.match(automationEngine, /automation_runs/);
  assert.match(automationEngine, /automation_messages/);
  assert.match(automationEngine, /ON CONFLICT\(automation_id, run_key\)/);
  assert.match(automationEngine, /createMonthlyPhotoStory/);
  assert.match(automationEngine, /daily_intelligence_brief/);
  assert.match(automationEngine, /status = 'failed'/);
  assert.match(intelligenceStore, /topic_subscriptions/);
  assert.match(intelligenceStore, /联合国新闻 · 中文/);
  assert.match(intelligenceBriefing, /generateDailyIntelligenceBrief/);
  assert.match(intelligenceBriefing, /不要编造任何新闻、数字、日期或来源/);
  assert.match(intelligenceBriefing, /refreshIntelligenceSources/);
  assert.match(dashboard, /dailyIntel/);
  assert.match(dashboard, /researchRadar/);
  assert.match(dashboard, /jobRadar/);
  assert.match(styles, /@media \(max-width:/);
  assert.doesNotMatch(`${layout}${page}${workbench}`, /codex-preview|react-loading-skeleton/i);
});
