import { generateProviderText } from "./ai-provider";

type SourceRow = {
  id: string;
  name: string;
  url: string;
  kind: string;
  authority: string;
};

type SourceItem = {
  title: string;
  summary: string;
  url: string;
  imageUrl: string;
  publishedAt: string | null;
};

type FeedContextRow = {
  id: string;
  title: string;
  summary: string;
  source_url: string;
  source_name: string;
  category: string;
  published_at: string | null;
  updated_at: string;
};

const DAY = 86_400_000;

function decodeHtml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
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

function cleanText(value: string, max = 1200) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  ).slice(0, max);
}

function tagValue(block: string, tags: string[]) {
  for (const tag of tags) {
    const escaped = tag.replace(":", "\\:");
    const match = block.match(
      new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"),
    );
    if (match?.[1]) return match[1];
  }
  return "";
}

function entryLink(block: string) {
  const direct = tagValue(block, ["link"]);
  if (direct && !direct.includes("<")) return cleanText(direct, 2000);
  return (
    block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ||
    block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i)?.[1] ||
    ""
  );
}

function entryImage(block: string, sourceUrl: URL) {
  const raw =
    block.match(
      /<(?:media:content|media:thumbnail|enclosure)\b[^>]*(?:url|href)=["']([^"']+)["']/i,
    )?.[1] ||
    block.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
    "";
  return normalizeItemUrl(raw, sourceUrl);
}

function safeSourceUrl(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("只支持公开的 HTTP 或 HTTPS 信息源。");
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
  if (blocked) throw new Error("不能抓取本机或内网地址。");
  parsed.hash = "";
  return parsed;
}

function normalizeItemUrl(raw: string, sourceUrl: URL) {
  try {
    const url = new URL(decodeHtml(raw.trim()), sourceUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

function dateFromUrl(value: string) {
  const compact = value.match(/(20\d{2})(0[1-9]|1[0-2])([0-2]\d|3[01])/);
  const separated = value.match(
    /(20\d{2})[/-](0[1-9]|1[0-2])[/-]([0-2]\d|3[01])/,
  );
  const match = compact || separated;
  if (!match) return null;
  const parsed = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+08:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseFeed(xml: string, sourceUrl: URL) {
  const blocks = [
    ...(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? []),
  ];
  return blocks
    .map((block): SourceItem | null => {
      const title = cleanText(tagValue(block, ["title"]), 300);
      const rawLink = entryLink(block);
      const url = normalizeItemUrl(rawLink, sourceUrl);
      const summary = cleanText(
        tagValue(block, [
          "description",
          "summary",
          "content:encoded",
          "content",
        ]),
        1800,
      );
      const rawDate = cleanText(
        tagValue(block, ["pubDate", "published", "updated", "dc:date"]),
        100,
      );
      const date = rawDate ? new Date(rawDate) : null;
      if (!title || !url) return null;
      return {
        title,
        summary,
        url,
        imageUrl: entryImage(block, sourceUrl),
        publishedAt:
          date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
      };
    })
    .filter((item): item is SourceItem => Boolean(item))
    .slice(0, 50);
}

function parseHtmlLinks(html: string, sourceUrl: URL) {
  const candidates: SourceItem[] = [];
  const seen = new Set<string>();
  const pattern = /<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(pattern)) {
    const title = cleanText(match[2], 300);
    if (
      title.length < 10 ||
      title.length > 180 ||
      /首页|更多|登录|注册|English|图片|视频|专题|频道|返回顶部/.test(title)
    ) {
      continue;
    }
    const url = normalizeItemUrl(match[1], sourceUrl);
    if (!url || seen.has(url)) continue;
    const parsed = new URL(url);
    if (parsed.hostname !== sourceUrl.hostname) continue;
    const publishedAt = dateFromUrl(url);
    if (!publishedAt) continue;
    seen.add(url);
    candidates.push({
      title,
      summary: "",
      url,
      imageUrl: normalizeItemUrl(
        match[2].match(
          /<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i,
        )?.[1] || "",
        sourceUrl,
      ),
      publishedAt,
    });
    if (candidates.length >= 35) break;
  }
  return candidates;
}

async function downloadSource(source: SourceRow) {
  let url = safeSourceUrl(source.url);
  let response: Response | null = null;
  for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9",
        "user-agent":
          "RichangyuDailyBrief/1.0 (+private personal intelligence reader)",
      },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error(`${source.name} 重定向地址无效`);
    url = safeSourceUrl(new URL(location, url).toString());
    response = null;
  }
  if (!response) throw new Error(`${source.name} 重定向次数过多`);
  if (!response.ok) {
    throw new Error(`${source.name} 返回 ${response.status}`);
  }
  const body = (await response.text()).slice(0, 6_000_000);
  const contentType = response.headers.get("content-type") || "";
  const looksLikeFeed =
    /rss|atom|xml/i.test(contentType) ||
    /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000));
  const items = looksLikeFeed
    ? parseFeed(body, url)
    : parseHtmlLinks(body, url);
  if (!items.length) throw new Error(`${source.name} 暂未解析到新条目`);
  return items;
}

function articleMetaContent(html: string, keys: string[]) {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const propertyFirst = html.match(
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)`,
        "i",
      ),
    )?.[1];
    const contentFirst = html.match(
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
        "i",
      ),
    )?.[1];
    if (propertyFirst || contentFirst) {
      return decodeHtml(propertyFirst || contentFirst || "");
    }
  }
  return "";
}

async function discoverArticleMetadata(item: SourceItem) {
  if (item.imageUrl && item.summary) return item;
  try {
    let url = safeSourceUrl(item.url);
    let response: Response | null = null;
    for (let redirects = 0; redirects < 3; redirects += 1) {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: "text/html,application/xhtml+xml",
          "user-agent": "RichangyuDailyBrief/1.0",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) return item;
      url = safeSourceUrl(new URL(location, url).toString());
      response = null;
    }
    if (!response?.ok) return item;
    const html = (await response.text()).slice(0, 400_000);
    const rawImage =
      articleMetaContent(html, [
        "og:image",
        "og:image:url",
        "twitter:image",
      ]) ||
      html.match(/<img\b[^>]*(?:src|data-src)=["']([^"']+)["']/i)?.[1] ||
      "";
    const rawSummary = articleMetaContent(html, [
      "og:description",
      "description",
      "twitter:description",
    ]);
    return {
      ...item,
      summary: item.summary || cleanText(rawSummary, 800),
      imageUrl: item.imageUrl || normalizeItemUrl(rawImage, url),
    };
  } catch {
    return item;
  }
}

function relevantTopics(
  item: SourceItem,
  subscriptions: Array<{ value: string; scope: string }>,
) {
  const haystack = `${item.title} ${item.summary}`.toLowerCase();
  return subscriptions
    .filter((subscription) =>
      haystack.includes(subscription.value.toLowerCase()),
    )
    .map((subscription) => subscription.value)
    .slice(0, 8);
}

async function ingestSource(
  DB: D1Database,
  source: SourceRow,
  subscriptions: Array<{ value: string; scope: string }>,
) {
  const downloaded = await downloadSource(source);
  // Enrich the entries most likely to appear in today's brief. Feeds that
  // already contain a summary and media URL do not trigger an article request.
  const enriched = await Promise.all(
    downloaded.slice(0, 12).map(discoverArticleMetadata),
  );
  const items = [...enriched, ...downloaded.slice(12)];
  const existing = await DB.prepare(
    `SELECT id, source_url FROM feed_items
     WHERE source_id = ? LIMIT 3000`,
  )
    .bind(source.id)
    .all<{ id: string; source_url: string }>();
  const idByUrl = new Map(
    existing.results.map((item) => [item.source_url, item.id]),
  );
  const checkedAt = new Date().toISOString();
  let added = 0;
  const statements: D1PreparedStatement[] = [];
  for (const item of items) {
    const currentId = idByUrl.get(item.url);
    const id = currentId || crypto.randomUUID();
    if (!currentId) added += 1;
    const topics = relevantTopics(item, subscriptions);
    const confirmed =
      /官方|政府|联合国|新华社|央视|国家/.test(
        `${source.authority}${source.name}`,
      );
    statements.push(
      DB.prepare(
        `INSERT INTO feed_items
         (id, source_id, kind, category, title, summary, importance,
          source_url, source_name, image_url, published_at, updated_at, event_status,
          topics, official_confirmed, independent_sources, read_status)
         VALUES (?, ?, '新闻', ?, ?, ?, ?, ?, ?, ?, ?, ?, '已收录', ?, ?, 1, '未读')
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           summary = excluded.summary,
           importance = excluded.importance,
           image_url = CASE
             WHEN excluded.image_url <> '' THEN excluded.image_url
             ELSE feed_items.image_url
           END,
           published_at = COALESCE(excluded.published_at, feed_items.published_at),
           topics = excluded.topics,
           official_confirmed = excluded.official_confirmed,
           updated_at = CASE
             WHEN feed_items.title <> excluded.title
               OR feed_items.summary <> excluded.summary
             THEN excluded.updated_at
             ELSE feed_items.updated_at
           END`,
      ).bind(
        id,
        source.id,
        source.kind,
        item.title,
        item.summary,
        topics.length ? `与你关注的 ${topics.join("、")} 相关` : "",
        item.url,
        source.name,
        item.imageUrl,
        item.publishedAt,
        checkedAt,
        JSON.stringify(topics),
        confirmed ? 1 : 0,
      ),
    );
  }
  statements.push(
    DB.prepare(
      `UPDATE feed_sources
       SET last_checked_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).bind(checkedAt, source.id),
  );
  await DB.batch(statements);
  return {
    checked: items.length,
    added,
    imageCount: items.filter((item) => Boolean(item.imageUrl)).length,
  };
}

async function backfillStoredFeedMetadata(
  DB: D1Database,
  sourceId?: string,
) {
  const query = sourceId
    ? DB.prepare(
        `SELECT id, title, summary, source_url, image_url, published_at
         FROM feed_items
         WHERE source_id = ?
           AND source_url <> ''
           AND (summary = '' OR image_url = '')
           AND is_ignored = 0
         ORDER BY updated_at DESC
         LIMIT 24`,
      ).bind(sourceId)
    : DB.prepare(
        `SELECT id, title, summary, source_url, image_url, published_at
         FROM feed_items
         WHERE source_url <> ''
           AND (summary = '' OR image_url = '')
           AND is_ignored = 0
         ORDER BY updated_at DESC
         LIMIT 24`,
      );
  const stored = await query.all<{
    id: string;
    title: string;
    summary: string;
    source_url: string;
    image_url: string;
    published_at: string | null;
  }>();
  const enriched = await Promise.all(
    stored.results.map(async (row) => ({
      row,
      item: await discoverArticleMetadata({
        title: row.title,
        summary: row.summary,
        url: row.source_url,
        imageUrl: row.image_url,
        publishedAt: row.published_at,
      }),
    })),
  );
  const updates = enriched
    .filter(
      ({ row, item }) =>
        item.summary !== row.summary || item.imageUrl !== row.image_url,
    )
    .map(({ row, item }) =>
      DB.prepare(
        `UPDATE feed_items
         SET summary = CASE WHEN ? <> '' THEN ? ELSE summary END,
             image_url = CASE WHEN ? <> '' THEN ? ELSE image_url END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      ).bind(
        item.summary,
        item.summary,
        item.imageUrl,
        item.imageUrl,
        row.id,
      ),
    );
  if (updates.length) await DB.batch(updates);
  return updates.length;
}

export async function refreshIntelligenceSources(
  DB: D1Database,
  sourceId?: string,
  { backfill = true }: { backfill?: boolean } = {},
) {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  await DB.prepare(
    `INSERT INTO monitor_runs
     (id, target_type, target_id, started_at, status, message)
     VALUES (?, '每日热点', ?, ?, '进行中', '正在读取国内外来源')`,
  )
    .bind(runId, sourceId || null, startedAt)
    .run();
  const [sources, subscriptions] = await DB.batch([
    sourceId
      ? DB.prepare(
          "SELECT id, name, url, kind, authority FROM feed_sources WHERE enabled = 1 AND id = ?",
        ).bind(sourceId)
      : DB.prepare(
          "SELECT id, name, url, kind, authority FROM feed_sources WHERE enabled = 1 ORDER BY created_at ASC",
        ),
    DB.prepare(
      "SELECT value, scope FROM topic_subscriptions WHERE enabled = 1",
    ),
  ]);
  const sourceRows = sources.results as unknown as SourceRow[];
  const topicRows = subscriptions.results as unknown as Array<{
    value: string;
    scope: string;
  }>;
  let checkedCount = 0;
  let changedCount = 0;
  const errors: string[] = [];
  const results = await Promise.all(
    sourceRows.map(async (source) => {
      try {
        return {
          source,
          result: await ingestSource(DB, source, topicRows),
          error: null,
        };
      } catch (error) {
        return { source, result: null, error };
      }
    }),
  );
  for (const item of results) {
    if (item.result) {
      checkedCount += item.result.checked;
      changedCount += item.result.added;
      await DB.prepare(
        `INSERT INTO feed_source_health
         (source_id, last_success_at, last_error, consecutive_failures,
          item_count, image_count, updated_at)
         VALUES (?, CURRENT_TIMESTAMP, '', 0, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(source_id) DO UPDATE SET
           last_success_at = CURRENT_TIMESTAMP,
           last_error = '',
           consecutive_failures = 0,
           item_count = excluded.item_count,
           image_count = excluded.image_count,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(item.source.id, item.result.checked, item.result.imageCount)
        .run();
    } else {
      const message =
        item.error instanceof Error ? item.error.message : "读取失败";
      errors.push(
        `${item.source.name}：${message}`,
      );
      await DB.prepare(
        `INSERT INTO feed_source_health
         (source_id, last_failure_at, last_error, consecutive_failures,
          updated_at)
         VALUES (?, CURRENT_TIMESTAMP, ?, 1, CURRENT_TIMESTAMP)
         ON CONFLICT(source_id) DO UPDATE SET
           last_failure_at = CURRENT_TIMESTAMP,
           last_error = excluded.last_error,
           consecutive_failures = feed_source_health.consecutive_failures + 1,
           updated_at = CURRENT_TIMESTAMP`,
      )
        .bind(item.source.id, message.slice(0, 1000))
      .run();
    }
  }
  const enrichedCount = backfill
    ? await backfillStoredFeedMetadata(DB, sourceId)
    : 0;
  const completedAt = new Date().toISOString();
  const status =
    checkedCount > 0 ? (errors.length ? "部分完成" : "已完成") : "失败";
  const message = [
    `检查 ${sourceRows.length} 个来源，读取 ${checkedCount} 条，新增 ${changedCount} 条，补全 ${enrichedCount} 条摘要或配图。`,
    ...errors.slice(0, 5),
  ].join("\n");
  await DB.prepare(
    `UPDATE monitor_runs
     SET completed_at = ?, status = ?, checked_count = ?,
         changed_count = ?, message = ?
     WHERE id = ?`,
  )
    .bind(completedAt, status, checkedCount, changedCount, message, runId)
    .run();
  return {
    runId,
    sourceCount: sourceRows.length,
    checkedCount,
    addedCount: changedCount,
    enrichedCount,
    errors,
  };
}

function localDayWindow(now: Date, timezoneOffset: number) {
  const offset = Math.max(-840, Math.min(840, Math.round(timezoneOffset || 0)));
  const local = new Date(now.getTime() - offset * 60_000);
  const start = new Date(
    Date.UTC(
      local.getUTCFullYear(),
      local.getUTCMonth(),
      local.getUTCDate(),
    ) +
      offset * 60_000,
  );
  return {
    start,
    end: new Date(start.getTime() + DAY),
    label: `${local.getUTCMonth() + 1}月${local.getUTCDate()}日`,
  };
}

function sourceLine(row: FeedContextRow, index: number, prefix: string) {
  return {
    ref: `${prefix}${index + 1}`,
    title: row.title,
    summary: row.summary.slice(0, 600),
    source: row.source_name,
    url: row.source_url,
    publishedAt: row.published_at || row.updated_at,
  };
}

function fallbackBrief(
  domestic: ReturnType<typeof sourceLine>[],
  international: ReturnType<typeof sourceLine>[],
) {
  const section = (
    title: string,
    items: ReturnType<typeof sourceLine>[],
  ) => [
    `## ${title}`,
    ...(items.length
      ? items.map(
          (item, index) =>
            `${index + 1}. ${item.title}（${item.source}，${item.ref}）\n简要总结：${
              item.summary || "来源暂未提供摘要，请打开原文核对。"
            }\n${item.url}`,
        )
      : ["今日暂未从已启用来源读取到新条目。"]),
  ];
  return [
    "## 今日结论",
    "以下内容来自已保存的公开来源，请打开原文核对细节；系统没有让模型凭空猜测热点。",
    ...section("国内热点", domestic),
    ...section("国际热点", international),
    "## 今天怎么用",
    "优先打开与你的研究、求职、教学或财务决策直接相关的两条，其余内容留在情报中心稍后阅读。",
  ].join("\n\n");
}

export async function generateDailyIntelligenceBrief(
  DB: D1Database,
  {
    timezoneOffset = 0,
    refresh = true,
  }: { timezoneOffset?: number; refresh?: boolean } = {},
) {
  const refreshResult = refresh
    ? await refreshIntelligenceSources(DB)
    : {
        sourceCount: 0,
        checkedCount: 0,
        addedCount: 0,
        errors: [] as string[],
      };
  const now = new Date();
  const window = localDayWindow(now, timezoneOffset);
  const recent = await DB.prepare(
    `SELECT id, title, summary, source_url, source_name, category,
            published_at, updated_at
     FROM feed_items
     WHERE is_ignored = 0
       AND category IN ('国内', '国际')
       AND datetime(COALESCE(published_at, created_at, updated_at)) >= datetime(?)
       AND datetime(COALESCE(published_at, created_at, updated_at)) < datetime(?)
     ORDER BY official_confirmed DESC,
              COALESCE(published_at, created_at, updated_at) DESC
     LIMIT 80`,
  )
    .bind(window.start.toISOString(), window.end.toISOString())
    .all<FeedContextRow>();

  const rows = recent.results;
  const domesticRows = rows
    .filter((item) => item.category === "国内")
    .slice(0, 6);
  const internationalRows = rows
    .filter((item) => item.category === "国际")
    .slice(0, 6);
  const domestic = domesticRows.map((row, index) =>
    sourceLine(row, index, "CN"),
  );
  const international = internationalRows.map((row, index) =>
    sourceLine(row, index, "INT"),
  );
  let content = fallbackBrief(domestic, international);
  let generatedBy = "local";
  let model = "";
  let aiError = "";
  if (domestic.length || international.length) {
    try {
      const generated = await generateProviderText({
        signal: AbortSignal.timeout(240_000),
        maxTokens: 1000,
        system: [
          "你是日常屿的每日情报编辑，只能使用用户提供的来源条目；不要编造任何新闻、数字、日期或来源，也不得引用列表之外的新闻。",
          "用中文输出，英文标题可以翻译，但要保留来源编号。严格分成：今日结论、国内热点、国际热点、与你有关、建议继续阅读。",
          "每条热点必须带来源编号，例如 [CN1] 或 [INT2]；信息不足时明确说信息不足，不要制造所谓全网热度排名。",
          "优先选择影响广、来源可靠且彼此不重复的内容。事实与建议分开。",
        ].join("\n"),
        prompt: [
          `日期：${window.label}`,
          "根据下面来源生成一份 3—5 分钟可读完的国内外热点简报。",
          JSON.stringify({ domestic, international }),
        ].join("\n\n"),
      });
      if (generated?.text) {
        content = generated.text;
        generatedBy = generated.provider;
        model = generated.model;
      }
    } catch (error) {
      aiError = error instanceof Error ? error.message : "模型调用失败";
      // Source-backed local fallback remains available when the model times out.
    }
  }
  const id = crypto.randomUUID();
  const sourceIds = [...domesticRows, ...internationalRows].map(
    (item) => item.id,
  );
  await DB.prepare(
    `INSERT INTO generated_summaries
     (id, kind, period_start, period_end, title, content, source_ids,
      generated_by)
     VALUES (?, '情报日报', ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, period_start, period_end) DO UPDATE SET
       title = excluded.title,
       content = excluded.content,
       source_ids = excluded.source_ids,
       generated_by = excluded.generated_by,
       updated_at = CURRENT_TIMESTAMP`,
  )
    .bind(
      id,
      window.start.toISOString(),
      window.end.toISOString(),
      `${window.label}国内外热点`,
      content,
      JSON.stringify(sourceIds),
      generatedBy,
    )
    .run();
  const persisted = await DB.prepare(
    `SELECT id FROM generated_summaries
     WHERE kind = '情报日报' AND period_start = ? AND period_end = ?`,
  )
    .bind(window.start.toISOString(), window.end.toISOString())
    .first<{ id: string }>();
  return {
    id: persisted?.id ?? id,
    title: `${window.label}国内外热点`,
    content,
    generatedBy,
    model,
    aiError,
    sourceIds,
    domesticCount: domestic.length,
    internationalCount: international.length,
    refresh: refreshResult,
  };
}
