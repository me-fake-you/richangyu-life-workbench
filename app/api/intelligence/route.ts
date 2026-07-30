import { generateProviderText } from "../../../lib/ai-provider";
import {
  generateDailyIntelligenceBrief,
  refreshIntelligenceSources,
} from "../../../lib/intelligence-briefing";
import { ensureIntelligenceSchema } from "../../../lib/intelligence-store";
import { getLifeBindings, safeJson } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

function text(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : min;
}

function bool(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function nullableIso(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function iso(value: unknown, fallback = new Date()) {
  return nullableIso(value) ?? fallback.toISOString();
}

function externalUrl(value: unknown) {
  const raw = text(value, 2000);
  if (!raw) return "";
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只支持 http 或 https 网页地址。");
  }
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (blocked) throw new Error("不能监控本机或内网地址。");
  parsed.hash = "";
  return parsed.toString();
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    );
}

function extractHtml(html: string, baseUrl: string) {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1] ||
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ||
    "";
  const description =
    html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i)?.[1] ||
    "";
  const rawImage =
    html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i)?.[1] ||
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1] ||
    html.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
    "";
  let imageUrl = "";
  try {
    const parsedImage = new URL(decodeHtml(rawImage), baseUrl);
    if (["http:", "https:"].includes(parsedImage.protocol)) {
      imageUrl = parsedImage.toString();
    }
  } catch {
    imageUrl = "";
  }
  const content = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " "),
  ).trim();
  return {
    title: decodeHtml(title.replace(/\s+/g, " ").trim()).slice(0, 300),
    description: decodeHtml(description.replace(/\s+/g, " ").trim()).slice(
      0,
      1600,
    ),
    imageUrl,
    content: content.slice(0, 80000),
  };
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "RichangyuOpportunityRadar/1.0 (+personal research and job monitor)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) {
      throw new Error(`网页返回 ${response.status}，暂时无法读取。`);
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error("该地址不是可读取的网页。");
    }
    const html = (await response.text()).slice(0, 600000);
    return { ...extractHtml(html, response.url || url), status: response.status };
  } finally {
    clearTimeout(timeout);
  }
}

async function hashText(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function inferOpeningStatus(content: string, previous: string) {
  const normalized = content.toLowerCase();
  if (/补录|追加招聘/.test(normalized)) return "补录开放";
  if (/已结束|报名结束|停止申请|投递截止|申请通道关闭/.test(normalized)) {
    return "已截止";
  }
  if (/立即申请|立即投递|申请职位|网申入口|报名入口|投递简历/.test(normalized)) {
    return "已开放";
  }
  if (/敬请期待|即将开放|招聘预告/.test(normalized)) {
    return normalized.includes("预告") ? "招聘预告" : "暂未开放";
  }
  return previous || "信息待确认";
}

function camelFeed(row: JsonObject) {
  return {
    id: row.id,
    sourceId: row.source_id,
    kind: row.kind,
    category: row.category,
    title: row.title,
    summary: row.summary,
    importance: row.importance,
    sourceUrl: row.source_url,
    sourceName: row.source_name,
    imageUrl: row.image_url,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    eventStatus: row.event_status,
    topics: safeJson(String(row.topics ?? "[]"), [] as string[]),
    officialConfirmed: bool(row.official_confirmed),
    independentSources: Number(row.independent_sources) || 0,
    unconfirmed: row.unconfirmed,
    readStatus: row.read_status,
    isFavorite: bool(row.is_favorite),
    isIgnored: bool(row.is_ignored),
  };
}

async function createSchedule(
  DB: D1Database,
  payload: {
    title: string;
    startAt: string;
    endAt?: string | null;
    category?: string;
    project?: string;
    note?: string;
    reminderMinutes?: number;
  },
) {
  const id = crypto.randomUUID();
  const startAt = iso(payload.startAt);
  const endAt =
    nullableIso(payload.endAt) ??
    new Date(new Date(startAt).getTime() + 60 * 60 * 1000).toISOString();
  const plannedMinutes = Math.max(
    1,
    Math.round(
      (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000,
    ),
  );
  await DB.batch([
    DB.prepare(
      `INSERT INTO schedule_events
       (id, title, category, start_at, end_at, project, note, repeat_rule,
        status, planned_minutes, actual_minutes)
       VALUES (?, ?, ?, ?, ?, ?, ?, '不重复', '计划中', ?, 0)`,
    ).bind(
      id,
      payload.title,
      payload.category || "求职",
      startAt,
      endAt,
      payload.project || "",
      payload.note || "",
      plannedMinutes,
    ),
    DB.prepare(
      `INSERT INTO schedule_rule_settings
       (schedule_id, reminder_minutes, custom_interval, custom_unit, weekdays)
       VALUES (?, ?, 1, 'week', '[]')`,
    ).bind(id, payload.reminderMinutes ?? 1440),
  ]);
  return id;
}

export async function GET() {
  try {
    await ensureIntelligenceSchema();
    const { DB } = getLifeBindings();
    const [
      sourcesResult,
      feedResult,
      subscriptionsResult,
      papersResult,
      signalsResult,
      organizationsResult,
      postingsResult,
      changesResult,
      applicationsResult,
      eventsResult,
      documentsResult,
      alertsResult,
      runsResult,
      briefsResult,
    ] = await DB.batch([
      DB.prepare("SELECT * FROM feed_sources ORDER BY updated_at DESC"),
      DB.prepare(
        `SELECT * FROM feed_items
         WHERE is_ignored = 0
         ORDER BY updated_at DESC LIMIT 800`,
      ),
      DB.prepare(
        "SELECT * FROM topic_subscriptions ORDER BY priority DESC, created_at ASC",
      ),
      DB.prepare("SELECT * FROM research_papers ORDER BY updated_at DESC LIMIT 800"),
      DB.prepare("SELECT * FROM paper_signals ORDER BY updated_at DESC"),
      DB.prepare("SELECT * FROM job_organizations ORDER BY updated_at DESC"),
      DB.prepare(
        `SELECT jp.*, jo.name AS organization_name,
                ja.id AS application_id, ja.status AS application_status
         FROM job_postings jp
         JOIN job_organizations jo ON jo.id = jp.organization_id
         LEFT JOIN job_applications ja ON ja.posting_id = jp.id
         ORDER BY
           CASE jp.opening_status
             WHEN '即将截止' THEN 0 WHEN '已开放' THEN 1
             WHEN '补录开放' THEN 2 ELSE 3 END,
           jp.deadline_at ASC, jp.updated_at DESC
         LIMIT 1200`,
      ),
      DB.prepare(
        `SELECT jc.*, jp.title AS posting_title, jo.name AS organization_name
         FROM job_changes jc
         JOIN job_postings jp ON jp.id = jc.posting_id
         JOIN job_organizations jo ON jo.id = jp.organization_id
         ORDER BY jc.detected_at DESC LIMIT 500`,
      ),
      DB.prepare(
        `SELECT ja.*, jp.title AS posting_title, jp.opening_status,
                jp.deadline_at, jo.name AS organization_name
         FROM job_applications ja
         JOIN job_postings jp ON jp.id = ja.posting_id
         JOIN job_organizations jo ON jo.id = jp.organization_id
         ORDER BY ja.updated_at DESC`,
      ),
      DB.prepare(
        `SELECT ae.*, jp.title AS posting_title, jo.name AS organization_name
         FROM application_events ae
         JOIN job_applications ja ON ja.id = ae.application_id
         JOIN job_postings jp ON jp.id = ja.posting_id
         JOIN job_organizations jo ON jo.id = jp.organization_id
         ORDER BY ae.start_at ASC LIMIT 1000`,
      ),
      DB.prepare(
        "SELECT * FROM application_documents ORDER BY created_at DESC LIMIT 500",
      ),
      DB.prepare("SELECT * FROM alert_rules ORDER BY created_at DESC LIMIT 500"),
      DB.prepare("SELECT * FROM monitor_runs ORDER BY started_at DESC LIMIT 80"),
      DB.prepare(
        `SELECT id, kind, title, content, period_start, period_end,
                generated_by, created_at
         FROM generated_summaries
         WHERE kind IN ('情报日报', '情报周报', '研究周报')
         ORDER BY created_at DESC LIMIT 20`,
      ),
    ]);

    const signalByPaper = new Map(
      (signalsResult.results as JsonObject[]).map((row) => [
        String(row.paper_id),
        {
          reviewScore: row.review_score,
          acceptanceStatus: row.acceptance_status,
          venueLevel: row.venue_level,
          heatSignal: row.heat_signal,
          citations: Number(row.citations) || 0,
          benchmarkSignal: row.benchmark_signal,
          codeAvailable: bool(row.code_available),
          modelAvailable: bool(row.model_available),
          dataAvailable: bool(row.data_available),
        },
      ]),
    );
    const postings = (postingsResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      title: row.title,
      recruitmentBatch: row.recruitment_batch,
      organizationLevel: row.organization_level,
      region: row.region,
      education: row.education,
      majors: row.majors,
      openAt: row.open_at,
      deadlineAt: row.deadline_at,
      sourceUrl: row.source_url,
      openingStatus: row.opening_status,
      lastCheckedAt: row.last_checked_at,
      lastChange: row.last_change,
      sourceConfirmed: bool(row.source_confirmed),
      favorite: bool(row.favorite),
      matchLevel: row.match_level,
      note: row.note,
      applicationId: row.application_id,
      applicationStatus: row.application_status,
    }));
    const now = Date.now();
    const urgentUntil = now + 7 * 86400000;
    const activeApplicationStatuses = new Set([
      "准备材料",
      "待投递",
      "已投递",
      "简历筛选",
      "在线测评",
      "笔试",
      "一面",
      "二面",
      "终面",
      "体检",
      "背调",
    ]);
    const papers = (papersResult.results as JsonObject[]).map((row) => ({
      id: row.id,
      title: row.title,
      authors: row.authors,
      organization: row.organization,
      venue: row.venue,
      publishedAt: row.published_at,
      paperUrl: row.paper_url,
      codeUrl: row.code_url,
      projectUrl: row.project_url,
      researchQuestion: row.research_question,
      innovation: row.innovation,
      method: row.method,
      datasets: row.datasets,
      results: row.results,
      limitations: row.limitations,
      relevance: Number(row.relevance) || 0,
      reproducibility: row.reproducibility,
      readingStatus: row.reading_status,
      relatedProject: row.related_project,
      note: row.note,
      signal: signalByPaper.get(String(row.id)) ?? null,
    }));
    const feedItems = (feedResult.results as JsonObject[]).map(camelFeed);
    const applications = (applicationsResult.results as JsonObject[]).map(
      (row) => ({
        id: row.id,
        postingId: row.posting_id,
        postingTitle: row.posting_title,
        organizationName: row.organization_name,
        openingStatus: row.opening_status,
        deadlineAt: row.deadline_at,
        status: row.status,
        appliedAt: row.applied_at,
        nextAction: row.next_action,
        nextActionAt: row.next_action_at,
        resumeVersion: row.resume_version,
        materialCompleteness: Number(row.material_completeness) || 0,
        missingMaterials: row.missing_materials,
        note: row.note,
      }),
    );

    return Response.json({
      sources: (sourcesResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        name: row.name,
        url: row.url,
        kind: row.kind,
        authority: row.authority,
        enabled: bool(row.enabled),
        checkFrequency: row.check_frequency,
        lastCheckedAt: row.last_checked_at,
      })),
      feedItems,
      subscriptions: (subscriptionsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        kind: row.kind,
        value: row.value,
        scope: row.scope,
        priority: row.priority,
        enabled: bool(row.enabled),
      })),
      papers,
      organizations: (organizationsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        name: row.name,
        kind: row.kind,
        level: row.level,
        officialUrl: row.official_url,
        note: row.note,
      })),
      postings,
      changes: (changesResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        postingId: row.posting_id,
        postingTitle: row.posting_title,
        organizationName: row.organization_name,
        kind: row.kind,
        summary: row.summary,
        detectedAt: row.detected_at,
        isImportant: bool(row.is_important),
        acknowledged: bool(row.acknowledged),
      })),
      applications,
      applicationEvents: (eventsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        applicationId: row.application_id,
        postingTitle: row.posting_title,
        organizationName: row.organization_name,
        kind: row.kind,
        title: row.title,
        startAt: row.start_at,
        endAt: row.end_at,
        place: row.place,
        link: row.link,
        reminderDays: Number(row.reminder_days) || 0,
        status: row.status,
        scheduleId: row.schedule_id,
        note: row.note,
      })),
      documents: (documentsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        applicationId: row.application_id,
        name: row.name,
        kind: row.kind,
        version: row.version,
        status: row.status,
        lastModifiedAt: row.last_modified_at,
        filename: row.filename,
        contentType: row.content_type,
        size: Number(row.size) || 0,
        url: row.object_key ? `/api/intelligence/documents/${row.id}` : null,
        note: row.note,
      })),
      alerts: (alertsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        kind: row.kind,
        targetId: row.target_id,
        title: row.title,
        triggerAt: row.trigger_at,
        leadDays: safeJson(String(row.lead_days ?? "[]"), [] as number[]),
        priority: row.priority,
        enabled: bool(row.enabled),
      })),
      monitorRuns: (runsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        targetType: row.target_type,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        status: row.status,
        checkedCount: Number(row.checked_count) || 0,
        changedCount: Number(row.changed_count) || 0,
        message: row.message,
      })),
      briefs: (briefsResult.results as JsonObject[]).map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        content: row.content,
        periodStart: row.period_start,
        periodEnd: row.period_end,
        generatedBy: row.generated_by,
        createdAt: row.created_at,
      })),
      summary: {
        unreadNews: feedItems.filter((item) => item.readStatus === "未读").length,
        relevantNews: feedItems.filter(
          (item) => item.importance || item.topics.length > 0,
        ).length,
        researchToRead: papers.filter((item) =>
          ["待筛选", "准备阅读", "正在精读"].includes(String(item.readingStatus)),
        ).length,
        researchToReproduce: papers.filter((item) =>
          ["准备复现", "正在复现"].includes(String(item.readingStatus)),
        ).length,
        openJobs: postings.filter((item) =>
          ["已开放", "即将截止", "补录开放"].includes(String(item.openingStatus)),
        ).length,
        urgentJobs: postings.filter((item) => {
          const deadline = item.deadlineAt
            ? new Date(String(item.deadlineAt)).getTime()
            : 0;
          return deadline >= now && deadline <= urgentUntil;
        }).length,
        activeApplications: applications.filter((item) =>
          activeApplicationStatuses.has(String(item.status)),
        ).length,
        upcomingEvents: (eventsResult.results as JsonObject[]).filter(
          (item) =>
            new Date(String(item.start_at)).getTime() >= now &&
            new Date(String(item.start_at)).getTime() <= now + 7 * 86400000,
        ).length,
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "情报中心读取失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const action = text(body.action, 80);
    const payload = (body.payload ?? {}) as JsonObject;

    if (action === "source.create") {
      const id = crypto.randomUUID();
      const url = externalUrl(payload.url);
      if (!url) throw new Error("请填写信息来源网址。");
      await DB.prepare(
        `INSERT INTO feed_sources
         (id, name, url, kind, authority, enabled, check_frequency)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      )
        .bind(
          id,
          text(payload.name, 160) || new URL(url).hostname,
          url,
          text(payload.kind, 40) || "新闻",
          text(payload.authority, 40) || "媒体",
          text(payload.checkFrequency, 40) || "每日",
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "source.refreshAll") {
      const result = await refreshIntelligenceSources(DB);
      return Response.json(result);
    }

    if (action === "daily.refresh") {
      const result = await generateDailyIntelligenceBrief(DB, {
        timezoneOffset: Math.max(
          -840,
          Math.min(840, Number(payload.timezoneOffset) || 0),
        ),
        refresh: payload.refresh !== false,
      });
      return Response.json(result, { status: 201 });
    }

    if (action === "source.check") {
      const sourceId = text(payload.id, 200);
      const result = await refreshIntelligenceSources(DB, sourceId);
      return Response.json(result, { status: 201 });
    }

    if (action === "source.check.v1") {
      const source = await DB.prepare(
        "SELECT * FROM feed_sources WHERE id = ? AND enabled = 1",
      )
        .bind(text(payload.id, 200))
        .first<JsonObject>();
      if (!source) throw new Error("没有找到这个已启用的信息来源。");
      const url = externalUrl(source.url);
      const page = await fetchPage(url);
      const now = new Date().toISOString();
      const existing = await DB.prepare(
        `SELECT id FROM feed_items
         WHERE source_id = ? AND title = ? LIMIT 1`,
      )
        .bind(source.id, page.title || source.name)
        .first<{ id: string }>();
      const id = existing?.id || crypto.randomUUID();
      await DB.batch([
        DB.prepare(
          `INSERT INTO feed_items
           (id, source_id, kind, category, title, summary, source_url,
            source_name, image_url, updated_at, event_status, topics, official_confirmed,
            independent_sources, read_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待确认', '[]', ?, 1, '未读')
           ON CONFLICT(id) DO UPDATE SET
             summary = excluded.summary,
             updated_at = excluded.updated_at,
             source_url = excluded.source_url,
             source_name = excluded.source_name,
             image_url = CASE
               WHEN excluded.image_url <> '' THEN excluded.image_url
               ELSE feed_items.image_url
             END`,
        ).bind(
          id,
          source.id,
          source.kind,
          source.kind === "研究" ? "科技与AI" : source.kind,
          page.title || source.name,
          page.description,
          url,
          source.name,
          page.imageUrl,
          now,
          String(source.authority).includes("官方") ? 1 : 0,
        ),
        DB.prepare(
          `UPDATE feed_sources
           SET last_checked_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).bind(now, source.id),
      ]);
      return Response.json({ id, title: page.title }, { status: 201 });
    }

    if (action === "subscription.create") {
      const id = crypto.randomUUID();
      const value = text(payload.value, 200);
      if (!value) throw new Error("请填写关注的主题、机构或关键词。");
      await DB.prepare(
        `INSERT INTO topic_subscriptions
         (id, kind, value, scope, priority, enabled)
         VALUES (?, ?, ?, ?, ?, 1)
         ON CONFLICT(kind, value) DO UPDATE SET
           scope = excluded.scope, priority = excluded.priority, enabled = 1`,
      )
        .bind(
          id,
          text(payload.kind, 40) || "主题",
          value,
          text(payload.scope, 40) || "全部",
          text(payload.priority, 40) || "普通",
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "subscription.toggle") {
      await DB.prepare(
        "UPDATE topic_subscriptions SET enabled = ? WHERE id = ?",
      )
        .bind(bool(payload.enabled) ? 1 : 0, text(payload.id, 200))
        .run();
      return Response.json({ ok: true });
    }

    if (action === "feed.importUrl") {
      const url = externalUrl(payload.url);
      if (!url) throw new Error("请粘贴要保存的网页地址。");
      const page = await fetchPage(url);
      const existing = await DB.prepare(
        "SELECT id FROM feed_items WHERE source_url = ? LIMIT 1",
      )
        .bind(url)
        .first<{ id: string }>();
      const id = existing?.id || crypto.randomUUID();
      const sourceName =
        text(payload.sourceName, 160) || new URL(url).hostname.replace(/^www\./, "");
      await DB.prepare(
        `INSERT INTO feed_items
         (id, kind, category, title, summary, importance, source_url,
          source_name, image_url, published_at, event_status, topics, official_confirmed,
          independent_sources, unconfirmed, read_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           kind = excluded.kind,
           category = excluded.category,
           title = excluded.title,
           summary = excluded.summary,
           importance = excluded.importance,
           source_name = excluded.source_name,
           image_url = CASE
             WHEN excluded.image_url <> '' THEN excluded.image_url
             ELSE feed_items.image_url
           END,
           published_at = excluded.published_at,
           updated_at = CURRENT_TIMESTAMP,
           event_status = excluded.event_status,
           topics = excluded.topics,
           official_confirmed = excluded.official_confirmed,
           independent_sources = excluded.independent_sources,
           unconfirmed = excluded.unconfirmed`,
      )
        .bind(
          id,
          text(payload.kind, 40) || "网页",
          text(payload.category, 60) || "待读资料",
          text(payload.title, 300) || page.title || "未命名网页",
          text(payload.summary, 1800) || page.description,
          text(payload.importance, 1800),
          url,
          sourceName,
          page.imageUrl,
          nullableIso(payload.publishedAt),
          text(payload.eventStatus, 40) || "待确认",
          JSON.stringify(
            text(payload.topics, 600)
              .split(/[，,、]/)
              .map((item) => item.trim())
              .filter(Boolean),
          ),
          bool(payload.officialConfirmed) ? 1 : 0,
          number(payload.independentSources, 1, 99),
          text(payload.unconfirmed, 1200),
          text(payload.readStatus, 40) || "稍后读",
        )
        .run();
      return Response.json({ id, title: page.title }, { status: 201 });
    }

    if (action === "feed.create") {
      const id = crypto.randomUUID();
      const title = text(payload.title, 300);
      if (!title) throw new Error("请填写信息标题。");
      await DB.prepare(
        `INSERT INTO feed_items
         (id, kind, category, title, summary, importance, source_url,
          source_name, image_url, published_at, event_status, topics, official_confirmed,
          independent_sources, unconfirmed, read_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.kind, 40) || "新闻",
          text(payload.category, 60) || "科技与AI",
          title,
          text(payload.summary, 1800),
          text(payload.importance, 1800),
          payload.sourceUrl ? externalUrl(payload.sourceUrl) : "",
          text(payload.sourceName, 160),
          payload.imageUrl ? externalUrl(payload.imageUrl) : "",
          nullableIso(payload.publishedAt),
          text(payload.eventStatus, 40) || "待确认",
          JSON.stringify(
            text(payload.topics, 600)
              .split(/[，,、]/)
              .map((item) => item.trim())
              .filter(Boolean),
          ),
          bool(payload.officialConfirmed) ? 1 : 0,
          number(payload.independentSources, 1, 99),
          text(payload.unconfirmed, 1200),
          text(payload.readStatus, 40) || "未读",
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "feed.update") {
      const id = text(payload.id, 200);
      const field = text(payload.field, 40);
      const allowed: Record<string, string> = {
        readStatus: "read_status",
        isFavorite: "is_favorite",
        isIgnored: "is_ignored",
        eventStatus: "event_status",
      };
      const column = allowed[field];
      if (!column) throw new Error("不支持更新该字段。");
      const value = ["is_favorite", "is_ignored"].includes(column)
        ? bool(payload.value)
          ? 1
          : 0
        : text(payload.value, 80);
      await DB.prepare(
        `UPDATE feed_items SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
        .bind(value, id)
        .run();
      return Response.json({ ok: true });
    }

    if (action === "feed.toTask") {
      const item = await DB.prepare(
        "SELECT title, summary, source_url FROM feed_items WHERE id = ?",
      )
        .bind(text(payload.id, 200))
        .first<JsonObject>();
      if (!item) throw new Error("没有找到这条情报。");
      const scheduleId = await createSchedule(DB, {
        title: `阅读：${text(item.title, 180)}`,
        startAt: iso(payload.startAt, new Date(Date.now() + 86400000)),
        category: "学习",
        project: text(payload.project, 160) || "情报阅读",
        note: [text(item.summary, 800), text(item.source_url, 1000)]
          .filter(Boolean)
          .join("\n"),
        reminderMinutes: 60,
      });
      await DB.prepare(
        "UPDATE feed_items SET read_status = '准备阅读' WHERE id = ?",
      )
        .bind(text(payload.id, 200))
        .run();
      return Response.json({ scheduleId }, { status: 201 });
    }

    if (action === "paper.create") {
      const id = crypto.randomUUID();
      const title = text(payload.title, 500);
      if (!title) throw new Error("请填写论文标题。");
      const paperUrl = payload.paperUrl ? externalUrl(payload.paperUrl) : "";
      const codeUrl = payload.codeUrl ? externalUrl(payload.codeUrl) : "";
      const projectUrl = payload.projectUrl
        ? externalUrl(payload.projectUrl)
        : "";
      await DB.batch([
        DB.prepare(
          `INSERT INTO research_papers
           (id, title, authors, organization, venue, published_at, paper_url,
            code_url, project_url, research_question, innovation, method,
            datasets, results, limitations, relevance, reproducibility,
            reading_status, related_project, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id,
          title,
          text(payload.authors, 1200),
          text(payload.organization, 500),
          text(payload.venue, 300),
          nullableIso(payload.publishedAt),
          paperUrl,
          codeUrl,
          projectUrl,
          text(payload.researchQuestion, 2000),
          text(payload.innovation, 3000),
          text(payload.method, 3000),
          text(payload.datasets, 1200),
          text(payload.results, 2000),
          text(payload.limitations, 2000),
          Math.round(number(payload.relevance, 0, 100)),
          text(payload.reproducibility, 80) || "待判断",
          text(payload.readingStatus, 80) || "新发现",
          text(payload.relatedProject, 300),
          text(payload.note, 4000),
        ),
        DB.prepare(
          `INSERT INTO paper_signals
           (id, paper_id, review_score, acceptance_status, venue_level,
            heat_signal, citations, benchmark_signal, code_available,
            model_available, data_available)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          id,
          text(payload.reviewScore, 80) || "未公开",
          text(payload.acceptanceStatus, 80) || "未公开",
          text(payload.venueLevel, 120),
          text(payload.heatSignal, 500),
          Math.round(number(payload.citations, 0, 10000000)),
          text(payload.benchmarkSignal, 800),
          codeUrl || bool(payload.codeAvailable) ? 1 : 0,
          bool(payload.modelAvailable) ? 1 : 0,
          bool(payload.dataAvailable) ? 1 : 0,
        ),
      ]);
      return Response.json({ id }, { status: 201 });
    }

    if (action === "paper.updateStatus") {
      await DB.prepare(
        `UPDATE research_papers
         SET reading_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
        .bind(text(payload.status, 80), text(payload.id, 200))
        .run();
      return Response.json({ ok: true });
    }

    if (action === "paper.toTask") {
      const paper = await DB.prepare(
        "SELECT title, paper_url, related_project FROM research_papers WHERE id = ?",
      )
        .bind(text(payload.id, 200))
        .first<JsonObject>();
      if (!paper) throw new Error("没有找到这篇论文。");
      const mode = text(payload.mode, 40) || "精读";
      const scheduleId = await createSchedule(DB, {
        title: `${mode}：${text(paper.title, 180)}`,
        startAt: iso(payload.startAt, new Date(Date.now() + 86400000)),
        category: "科研",
        project: text(paper.related_project, 200) || "论文研究",
        note: text(paper.paper_url, 1200),
        reminderMinutes: 120,
      });
      const nextStatus = mode.includes("复现") ? "准备复现" : "准备阅读";
      await DB.prepare(
        `UPDATE research_papers
         SET reading_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      )
        .bind(nextStatus, text(payload.id, 200))
        .run();
      return Response.json({ scheduleId }, { status: 201 });
    }

    if (action === "organization.create") {
      const id = crypto.randomUUID();
      const name = text(payload.name, 240);
      if (!name) throw new Error("请填写银行或单位名称。");
      await DB.prepare(
        `INSERT INTO job_organizations
         (id, name, kind, level, official_url, note)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          name,
          text(payload.kind, 80) || "银行",
          text(payload.level, 80) || "总行",
          payload.officialUrl ? externalUrl(payload.officialUrl) : "",
          text(payload.note, 2000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "posting.create") {
      let organizationId = text(payload.organizationId, 200);
      if (!organizationId) {
        const organizationName = text(payload.organizationName, 240);
        if (!organizationName) throw new Error("请填写招聘单位。");
        const existing = await DB.prepare(
          "SELECT id FROM job_organizations WHERE name = ? LIMIT 1",
        )
          .bind(organizationName)
          .first<{ id: string }>();
        organizationId = existing?.id || crypto.randomUUID();
        if (!existing) {
          await DB.prepare(
            `INSERT INTO job_organizations
             (id, name, kind, level, official_url)
             VALUES (?, ?, ?, ?, ?)`,
          )
            .bind(
              organizationId,
              organizationName,
              text(payload.organizationKind, 80) || "银行",
              text(payload.organizationLevel, 80) || "总行",
              payload.organizationUrl
                ? externalUrl(payload.organizationUrl)
                : "",
            )
            .run();
        }
      }
      const id = crypto.randomUUID();
      const title = text(payload.title, 300);
      if (!title) throw new Error("请填写岗位名称。");
      const deadlineAt = nullableIso(payload.deadlineAt);
      await DB.batch([
        DB.prepare(
          `INSERT INTO job_postings
           (id, organization_id, title, recruitment_batch, organization_level,
            region, education, majors, open_at, deadline_at, source_url,
            opening_status, source_confirmed, favorite, match_level, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          id,
          organizationId,
          title,
          text(payload.recruitmentBatch, 80) || "秋招",
          text(payload.organizationLevel, 80) || "总行",
          text(payload.region, 120) || "全国",
          text(payload.education, 120) || "硕士",
          text(payload.majors, 800),
          nullableIso(payload.openAt),
          deadlineAt,
          payload.sourceUrl ? externalUrl(payload.sourceUrl) : "",
          text(payload.openingStatus, 80) || "信息待确认",
          bool(payload.sourceConfirmed) ? 1 : 0,
          bool(payload.favorite) ? 1 : 0,
          text(payload.matchLevel, 40) || "待评估",
          text(payload.note, 3000),
        ),
        DB.prepare(
          `INSERT INTO alert_rules
           (id, kind, target_id, title, trigger_at, lead_days, priority, enabled)
           VALUES (?, '岗位截止', ?, ?, ?, '[7,3,1,0]', '重要', 1)`,
        ).bind(
          crypto.randomUUID(),
          id,
          `${title}截止提醒`,
          deadlineAt,
        ),
      ]);
      return Response.json({ id }, { status: 201 });
    }

    if (action === "posting.update") {
      await DB.prepare(
        `UPDATE job_postings
         SET opening_status = COALESCE(?, opening_status),
             favorite = COALESCE(?, favorite),
             match_level = COALESCE(?, match_level),
             deadline_at = COALESCE(?, deadline_at),
             note = COALESCE(?, note),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(
          payload.openingStatus === undefined
            ? null
            : text(payload.openingStatus, 80),
          payload.favorite === undefined ? null : bool(payload.favorite) ? 1 : 0,
          payload.matchLevel === undefined
            ? null
            : text(payload.matchLevel, 40),
          payload.deadlineAt === undefined ? null : nullableIso(payload.deadlineAt),
          payload.note === undefined ? null : text(payload.note, 3000),
          text(payload.id, 200),
        )
        .run();
      return Response.json({ ok: true });
    }

    if (action === "posting.delete") {
      const id = text(payload.id, 200);
      await DB.batch([
        DB.prepare(
          "DELETE FROM alert_rules WHERE kind = '岗位截止' AND target_id = ?",
        ).bind(id),
        DB.prepare("DELETE FROM job_postings WHERE id = ?").bind(id),
      ]);
      return new Response(null, { status: 204 });
    }

    if (action === "posting.monitor") {
      const posting = await DB.prepare(
        `SELECT id, title, source_url, opening_status
         FROM job_postings WHERE id = ?`,
      )
        .bind(text(payload.id, 200))
        .first<JsonObject>();
      if (!posting) throw new Error("没有找到这个岗位。");
      const url = externalUrl(posting.source_url);
      if (!url) throw new Error("这个岗位还没有填写官方招聘页面。");
      const runId = crypto.randomUUID();
      const startedAt = new Date().toISOString();
      await DB.prepare(
        `INSERT INTO monitor_runs
         (id, target_type, target_id, started_at, status)
         VALUES (?, '岗位', ?, ?, '进行中')`,
      )
        .bind(runId, posting.id, startedAt)
        .run();
      try {
        const page = await fetchPage(url);
        const normalized = page.content.replace(/\s+/g, " ").slice(0, 80000);
        const contentHash = await hashText(normalized);
        const previous = await DB.prepare(
          `SELECT content_hash, content_text
           FROM job_snapshots WHERE posting_id = ?
           ORDER BY checked_at DESC LIMIT 1`,
        )
          .bind(posting.id)
          .first<{ content_hash: string; content_text: string }>();
        const inferred = inferOpeningStatus(
          normalized,
          text(posting.opening_status, 80),
        );
        const changed = Boolean(previous && previous.content_hash !== contentHash);
        const statusChanged = inferred !== String(posting.opening_status);
        const changeSummary = statusChanged
          ? `岗位状态从“${posting.opening_status}”变为“${inferred}”`
          : changed
            ? "官方招聘页面内容发生变化，请核对岗位要求、截止时间和申请入口。"
            : previous
              ? "本次检查未发现页面变化。"
              : "已保存第一次官方页面快照，后续检查将显示具体变化。";
        const statements = [
          DB.prepare(
            `INSERT INTO job_snapshots
             (id, posting_id, content_hash, page_title, content_text,
              checked_at, http_status)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            crypto.randomUUID(),
            posting.id,
            contentHash,
            page.title,
            normalized,
            startedAt,
            page.status,
          ),
          DB.prepare(
            `UPDATE job_postings
             SET opening_status = ?, last_checked_at = ?, last_change = ?,
                 source_confirmed = 1, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).bind(inferred, startedAt, changeSummary, posting.id),
          DB.prepare(
            `UPDATE monitor_runs
             SET completed_at = ?, status = '已完成', checked_count = 1,
                 changed_count = ?, message = ?
             WHERE id = ?`,
          ).bind(
            new Date().toISOString(),
            changed || statusChanged ? 1 : 0,
            changeSummary,
            runId,
          ),
        ];
        if (changed || statusChanged) {
          statements.push(
            DB.prepare(
              `INSERT INTO job_changes
               (id, posting_id, kind, summary, before_text, after_text,
                detected_at, is_important, acknowledged)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            ).bind(
              crypto.randomUUID(),
              posting.id,
              statusChanged ? "状态变化" : "页面变化",
              changeSummary,
              previous?.content_text.slice(0, 1600) || "",
              normalized.slice(0, 1600),
              startedAt,
              statusChanged ? 1 : 0,
            ),
          );
        }
        await DB.batch(statements);
        return Response.json({
          runId,
          changed: changed || statusChanged,
          openingStatus: inferred,
          summary: changeSummary,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "检查招聘页面失败。";
        await DB.prepare(
          `UPDATE monitor_runs
           SET completed_at = ?, status = '失败', checked_count = 1,
               message = ? WHERE id = ?`,
        )
          .bind(new Date().toISOString(), message, runId)
          .run();
        throw error;
      }
    }

    if (action === "application.create") {
      const postingId = text(payload.postingId, 200);
      if (!postingId) throw new Error("请选择要加入投递计划的岗位。");
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO job_applications
         (id, posting_id, status, next_action, next_action_at, resume_version,
          material_completeness, missing_materials, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(posting_id) DO UPDATE SET
           status = excluded.status,
           next_action = excluded.next_action,
           next_action_at = excluded.next_action_at,
           resume_version = excluded.resume_version,
           material_completeness = excluded.material_completeness,
           missing_materials = excluded.missing_materials,
           note = excluded.note,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(
          id,
          postingId,
          text(payload.status, 80) || "准备材料",
          text(payload.nextAction, 500),
          nullableIso(payload.nextActionAt),
          text(payload.resumeVersion, 200),
          Math.round(number(payload.materialCompleteness, 0, 10)),
          text(payload.missingMaterials, 1000),
          text(payload.note, 3000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "application.update") {
      const status = text(payload.status, 80);
      await DB.prepare(
        `UPDATE job_applications
         SET status = COALESCE(?, status),
             applied_at = CASE
               WHEN ? = '已投递' AND applied_at IS NULL THEN CURRENT_TIMESTAMP
               ELSE applied_at END,
             next_action = COALESCE(?, next_action),
             next_action_at = COALESCE(?, next_action_at),
             resume_version = COALESCE(?, resume_version),
             material_completeness = COALESCE(?, material_completeness),
             missing_materials = COALESCE(?, missing_materials),
             note = COALESCE(?, note),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
        .bind(
          status || null,
          status || null,
          payload.nextAction === undefined
            ? null
            : text(payload.nextAction, 500),
          payload.nextActionAt === undefined
            ? null
            : nullableIso(payload.nextActionAt),
          payload.resumeVersion === undefined
            ? null
            : text(payload.resumeVersion, 200),
          payload.materialCompleteness === undefined
            ? null
            : Math.round(number(payload.materialCompleteness, 0, 10)),
          payload.missingMaterials === undefined
            ? null
            : text(payload.missingMaterials, 1000),
          payload.note === undefined ? null : text(payload.note, 3000),
          text(payload.id, 200),
        )
        .run();
      return Response.json({ ok: true });
    }

    if (action === "application.event.create") {
      const applicationId = text(payload.applicationId, 200);
      const application = await DB.prepare(
        `SELECT ja.id, jp.title, jo.name AS organization_name
         FROM job_applications ja
         JOIN job_postings jp ON jp.id = ja.posting_id
         JOIN job_organizations jo ON jo.id = jp.organization_id
         WHERE ja.id = ?`,
      )
        .bind(applicationId)
        .first<JsonObject>();
      if (!application) throw new Error("没有找到这项投递。");
      const kind = text(payload.kind, 80) || "网申";
      const startAt = iso(payload.startAt);
      const title =
        text(payload.title, 300) ||
        `${application.organization_name} · ${kind}`;
      const scheduleId = await createSchedule(DB, {
        title,
        startAt,
        endAt: nullableIso(payload.endAt),
        category: "求职",
        project: `${application.organization_name}求职`,
        note: [
          text(application.title, 300),
          text(payload.link, 1200),
          text(payload.note, 1600),
        ]
          .filter(Boolean)
          .join("\n"),
        reminderMinutes: Math.max(
          10,
          Math.round(number(payload.reminderDays, 0, 30) * 1440),
        ),
      });
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO application_events
         (id, application_id, kind, title, start_at, end_at, place, link,
          reminder_days, status, schedule_id, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '待完成', ?, ?)`,
      )
        .bind(
          id,
          applicationId,
          kind,
          title,
          startAt,
          nullableIso(payload.endAt),
          text(payload.place, 300),
          payload.link ? externalUrl(payload.link) : "",
          Math.round(number(payload.reminderDays, 0, 30)),
          scheduleId,
          text(payload.note, 2000),
        )
        .run();
      return Response.json({ id, scheduleId }, { status: 201 });
    }

    if (action === "document.create") {
      const id = crypto.randomUUID();
      const name = text(payload.name, 300);
      if (!name) throw new Error("请填写材料名称。");
      await DB.prepare(
        `INSERT INTO application_documents
         (id, application_id, name, kind, version, status, last_modified_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          id,
          text(payload.applicationId, 200) || null,
          name,
          text(payload.kind, 80) || "简历",
          text(payload.version, 80) || "V1",
          text(payload.status, 80) || "可用",
          nullableIso(payload.lastModifiedAt),
          text(payload.note, 2000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "job.expense") {
      const id = crypto.randomUUID();
      const amount = number(payload.amount, 0.01, 100000000);
      const accountId =
        text(payload.accountId, 200) ||
        (
          await DB.prepare(
            "SELECT id FROM financial_accounts WHERE is_archived = 0 ORDER BY created_at LIMIT 1",
          ).first<{ id: string }>()
        )?.id ||
        null;
      await DB.prepare(
        `INSERT INTO finance_transactions
         (id, type, amount, category, account_id, project, occurred_at,
          note, is_private)
         VALUES (?, '支出', ?, '求职投入', ?, ?, ?, ?, 1)`,
      )
        .bind(
          id,
          amount,
          accountId,
          text(payload.project, 300) || "求职",
          iso(payload.occurredAt),
          text(payload.note, 1000),
        )
        .run();
      return Response.json({ id }, { status: 201 });
    }

    if (action === "change.acknowledge") {
      await DB.prepare(
        "UPDATE job_changes SET acknowledged = 1 WHERE id = ?",
      )
        .bind(text(payload.id, 200))
        .run();
      return Response.json({ ok: true });
    }

    if (action === "brief.generate") {
      const kind = text(payload.kind, 40) || "情报周报";
      if (kind === "情报日报") {
        const result = await generateDailyIntelligenceBrief(DB, {
          timezoneOffset: Math.max(
            -840,
            Math.min(840, Number(payload.timezoneOffset) || 0),
          ),
          refresh: payload.refresh !== false,
        });
        return Response.json(result, { status: 201 });
      }
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - (kind.includes("日") ? 1 : 7));
      const [feed, papers, jobs, applications] = await DB.batch([
        DB.prepare(
          `SELECT title, category, summary, importance, source_name,
                  official_confirmed, independent_sources, unconfirmed,
                  updated_at
           FROM feed_items WHERE is_ignored = 0 AND updated_at >= ?
           ORDER BY updated_at DESC LIMIT 80`,
        ).bind(start.toISOString()),
        DB.prepare(
          `SELECT title, venue, innovation, relevance, reproducibility,
                  reading_status, updated_at
           FROM research_papers WHERE updated_at >= ?
           ORDER BY relevance DESC LIMIT 60`,
        ).bind(start.toISOString()),
        DB.prepare(
          `SELECT jp.title, jo.name AS organization, jp.opening_status,
                  jp.deadline_at, jp.last_change, jp.match_level
           FROM job_postings jp
           JOIN job_organizations jo ON jo.id = jp.organization_id
           ORDER BY jp.updated_at DESC LIMIT 80`,
        ),
        DB.prepare(
          `SELECT jp.title, jo.name AS organization, ja.status,
                  ja.next_action, ja.next_action_at
           FROM job_applications ja
           JOIN job_postings jp ON jp.id = ja.posting_id
           JOIN job_organizations jo ON jo.id = jp.organization_id
           ORDER BY ja.updated_at DESC LIMIT 80`,
        ),
      ]);
      const context = JSON.stringify({
        feed: feed.results,
        papers: papers.results,
        jobs: jobs.results,
        applications: applications.results,
      }).slice(0, 42000);
      let content = [
        `${kind} · ${end.toLocaleDateString("zh-CN")}`,
        `本期收录 ${feed.results.length} 条信息、${papers.results.length} 篇论文、${jobs.results.length} 个岗位。`,
        "请优先处理临近截止的岗位、正在推进的投递，以及已经进入“准备阅读/复现”的论文。",
      ].join("\n\n");
      let generatedBy = "local";
      const generated = await generateProviderText({
        system: [
          "你是个人情报与机会雷达助手。",
          "只依据提供的数据生成中文简报，不得虚构新闻、论文信号、岗位状态或截止日期。",
          "明确区分已确认事实、未确认信息和建议；不使用不透明真实性分数。",
          "先给本周最重要结论，再列新闻、研究、求职和下一步行动，每条尽量说明来源或对象。",
        ].join("\n"),
        prompt: `生成${kind}。\n\n数据：${context}`,
      });
      if (generated?.text) {
        content = generated.text;
        generatedBy = generated.provider;
      }
      const id = crypto.randomUUID();
      await DB.prepare(
        `INSERT INTO generated_summaries
         (id, kind, period_start, period_end, title, content, source_ids,
          generated_by)
         VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`,
      )
        .bind(
          id,
          kind,
          start.toISOString(),
          end.toISOString(),
          `${kind} · ${end.toLocaleDateString("zh-CN")}`,
          content,
          generatedBy,
        )
        .run();
      return Response.json({ id, content, generatedBy }, { status: 201 });
    }

    return Response.json({ error: "未知的情报中心操作。" }, { status: 400 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "操作失败。" },
      { status: 500 },
    );
  }
}
