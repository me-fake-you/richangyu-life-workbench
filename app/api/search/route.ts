import { ensureAdvancedSchema, parseStoredJson } from "../../../lib/advanced-store";
import { ensureFinanceSchema } from "../../../lib/finance-store";
import { ensureIntelligenceSchema } from "../../../lib/intelligence-store";
import { getLifeBindings } from "../../../lib/life-store";

type JsonObject = Record<string, unknown>;

type SearchType =
  | "event"
  | "schedule"
  | "inbox"
  | "table"
  | "project"
  | "summary"
  | "meal"
  | "finance"
  | "sideHustle"
  | "intelligence"
  | "paper"
  | "job";

type SearchFilters = {
  text: string;
  terms: string[];
  types: SearchType[];
  dateFrom: string | null;
  dateTo: string | null;
  kind: string;
  mood: string;
  person: string;
  place: string;
  project: string;
  tags: string[];
  hasPhoto: boolean;
  hasAttachment: boolean;
  sort: "relevance" | "newest" | "oldest";
  applied: string[];
};

type CandidateRow = {
  id: string;
  title: string | null;
  content: string | null;
  category: string | null;
  status: string | null;
  occurred_at: string | null;
  person: string | null;
  place: string | null;
  project: string | null;
  tags: string | null;
  attachment_count: number | null;
};

type SearchResult = {
  id: string;
  type: SearchType;
  typeLabel: string;
  title: string;
  snippet: string;
  meta: string;
  occurredAt: string | null;
  view: string;
  source: string;
  matchedFields: string[];
  hasAttachment: boolean;
  score: number;
};

const allowedTypes = new Set<SearchType>([
  "event",
  "schedule",
  "inbox",
  "table",
  "project",
  "summary",
  "meal",
  "finance",
  "sideHustle",
  "intelligence",
  "paper",
  "job",
]);

const typeMeta: Record<
  SearchType,
  { label: string; view: string; source: string }
> = {
  event: { label: "生活记录", view: "timeline", source: "生活时间线" },
  schedule: { label: "时间表", view: "schedule", source: "时间表中心" },
  inbox: { label: "收件箱", view: "inbox", source: "生活收件箱" },
  table: { label: "表格", view: "tables", source: "自定义表格库" },
  project: { label: "项目", view: "topics", source: "专题与项目" },
  summary: { label: "总结", view: "review", source: "回顾与总结" },
  meal: { label: "饮食", view: "nutrition", source: "饮食与营养" },
  finance: { label: "财务", view: "finance", source: "财务中心" },
  sideHustle: {
    label: "兼职",
    view: "sideHustle",
    source: "兼职中心",
  },
  intelligence: {
    label: "情报",
    view: "intelligence",
    source: "情报中心",
  },
  paper: { label: "论文", view: "intelligence", source: "AI 研究雷达" },
  job: { label: "求职", view: "jobs", source: "求职机会" },
};

function text(value: unknown, max = 3000) {
  return String(value ?? "").trim().slice(0, max);
}

function list(value: unknown, max = 20) {
  return Array.isArray(value)
    ? value.map((item) => text(item, 80)).filter(Boolean).slice(0, max)
    : [];
}

function chineseNumber(value: string) {
  const direct = Number(value);
  if (Number.isFinite(direct)) return direct;
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
    两: 2,
  };
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (digits[value[1]] ?? 0);
  if (value.endsWith("十")) return (digits[value[0]] ?? 1) * 10;
  if (value.includes("十")) {
    const [left, right] = value.split("十");
    return (digits[left] ?? 1) * 10 + (digits[right] ?? 0);
  }
  return digits[value] ?? 0;
}

function localBoundary(
  value: string,
  offsetMinutes: number,
  addOneDay = false,
) {
  if (value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const result = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]) + (addOneDay ? 1 : 0),
    ) +
      offsetMinutes * 60000,
  );
  return result.toISOString();
}

function monthBoundary(
  year: number,
  month: number,
  offsetMinutes: number,
) {
  return new Date(Date.UTC(year, month, 1) + offsetMinutes * 60000);
}

function parseFilters(body: JsonObject): SearchFilters {
  const now = new Date();
  const offsetValue = Number(body.timezoneOffset);
  const offsetMinutes = Number.isFinite(offsetValue)
    ? Math.max(-840, Math.min(840, Math.round(offsetValue)))
    : 0;
  const localNow = new Date(now.getTime() - offsetMinutes * 60000);
  const raw = text(body.q ?? body.text, 2000);
  let cleaned = raw;
  const applied: string[] = [];
  let dateFrom = text(body.dateFrom, 40)
    ? localBoundary(text(body.dateFrom, 40), offsetMinutes)
    : null;
  let dateTo = text(body.dateTo, 40)
    ? localBoundary(text(body.dateTo, 40), offsetMinutes, true)
    : null;

  const yearMonth = raw.match(/(\d{4})年\s*(\d{1,2})月/);
  const yearOnly = !yearMonth ? raw.match(/(\d{4})年/) : null;
  const recentMonths = raw.match(/(?:最近|近)([一二三四五六七八九十两\d]+)个?月/);
  const recentDays = raw.match(/(?:最近|近)([一二三四五六七八九十两\d]+)天/);
  const lastSummer = /去年暑假/.test(raw);
  const thisYear = /今年/.test(raw);
  const lastYear = /去年/.test(raw) && !lastSummer;

  if (yearMonth) {
    const year = Number(yearMonth[1]);
    const month = Math.max(1, Math.min(12, Number(yearMonth[2])));
    dateFrom = monthBoundary(year, month - 1, offsetMinutes).toISOString();
    dateTo = monthBoundary(year, month, offsetMinutes).toISOString();
    applied.push(`${year}年${month}月`);
    cleaned = cleaned.replace(yearMonth[0], " ");
  } else if (lastSummer) {
    const year = localNow.getUTCFullYear() - 1;
    dateFrom = monthBoundary(year, 6, offsetMinutes).toISOString();
    dateTo = monthBoundary(year, 8, offsetMinutes).toISOString();
    applied.push(`${year}年暑假`);
    cleaned = cleaned.replace(/去年暑假/g, " ");
  } else if (yearOnly) {
    const year = Number(yearOnly[1]);
    dateFrom = monthBoundary(year, 0, offsetMinutes).toISOString();
    dateTo = monthBoundary(year, 12, offsetMinutes).toISOString();
    applied.push(`${year}年`);
    cleaned = cleaned.replace(yearOnly[0], " ");
  } else if (recentMonths) {
    const amount = Math.max(1, Math.min(60, chineseNumber(recentMonths[1])));
    const start = new Date(
      Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth() - amount,
        localNow.getUTCDate(),
      ) +
        offsetMinutes * 60000,
    );
    dateFrom = start.toISOString();
    dateTo = now.toISOString();
    applied.push(`最近${amount}个月`);
    cleaned = cleaned.replace(recentMonths[0], " ");
  } else if (recentDays) {
    const amount = Math.max(1, Math.min(3650, chineseNumber(recentDays[1])));
    dateFrom = new Date(now.getTime() - amount * 86400000).toISOString();
    dateTo = now.toISOString();
    applied.push(`最近${amount}天`);
    cleaned = cleaned.replace(recentDays[0], " ");
  } else if (thisYear) {
    const year = localNow.getUTCFullYear();
    dateFrom = monthBoundary(year, 0, offsetMinutes).toISOString();
    dateTo = monthBoundary(year, 12, offsetMinutes).toISOString();
    applied.push("今年");
    cleaned = cleaned.replace(/今年/g, " ");
  } else if (lastYear) {
    const year = localNow.getUTCFullYear() - 1;
    dateFrom = monthBoundary(year, 0, offsetMinutes).toISOString();
    dateTo = monthBoundary(year, 12, offsetMinutes).toISOString();
    applied.push("去年");
    cleaned = cleaned.replace(/去年/g, " ");
  }

  if (dateFrom && !applied.some((item) => item.includes("年") || item.includes("最近"))) {
    applied.push(`从 ${dateFrom.slice(0, 10)}`);
  }
  if (dateTo && !applied.some((item) => item.includes("年") || item.includes("最近"))) {
    applied.push(`至 ${dateTo.slice(0, 10)}`);
  }

  const hasPhoto =
    Boolean(body.hasPhoto) || /有照片|带照片|照片记录|含照片/.test(raw);
  const hasAttachment =
    Boolean(body.hasAttachment) || /有附件|带附件|含附件/.test(raw);
  if (hasPhoto) {
    applied.push("有照片");
    cleaned = cleaned.replace(/有照片|带照片|照片记录|含照片/g, " ");
  }
  if (hasAttachment) {
    applied.push("有附件");
    cleaned = cleaned.replace(/有附件|带附件|含附件/g, " ");
  }

  const moods = ["开心", "平静", "疲惫", "焦虑", "低落", "充实", "兴奋"];
  const kinds = [
    "生活",
    "教学",
    "学习",
    "科研",
    "运动",
    "旅行",
    "读书",
    "工作",
    "饮食",
    "兼职",
  ];
  const mood =
    text(body.mood, 30) || moods.find((item) => raw.includes(item)) || "";
  const kind =
    text(body.kind, 40) || kinds.find((item) => raw.includes(item)) || "";
  if (mood) {
    applied.push(`心情：${mood}`);
    cleaned = cleaned.replace(new RegExp(mood, "g"), " ");
  }
  if (kind) {
    applied.push(`分类：${kind}`);
    cleaned = cleaned.replace(new RegExp(kind, "g"), " ");
  }

  function quotedFilter(label: string, supplied: unknown) {
    const explicit = text(supplied, 80);
    if (explicit) return explicit;
    const match = raw.match(
      new RegExp(`${label}[：:]?[“"']([^”"']+)[”"']`),
    );
    if (match) cleaned = cleaned.replace(match[0], " ");
    return match?.[1]?.trim() ?? "";
  }

  const person = quotedFilter("人物", body.person);
  const place = quotedFilter("地点", body.place);
  const project = quotedFilter("项目", body.project);
  const suppliedTags = list(body.tags, 10);
  const hashTags = [...raw.matchAll(/#([^#\s，。！？、]+)/g)].map(
    (match) => match[1],
  );
  const quotedTag = quotedFilter("标签", "");
  const tags = [...new Set([...suppliedTags, ...hashTags, quotedTag].filter(Boolean))];
  if (person) applied.push(`人物：${person}`);
  if (place) applied.push(`地点：${place}`);
  if (project) applied.push(`项目：${project}`);
  tags.forEach((tag) => {
    applied.push(`标签：${tag}`);
    cleaned = cleaned.replace(new RegExp(`#${tag}`, "g"), " ");
  });

  const explicitTypes = list(body.types, 12).filter((item): item is SearchType =>
    allowedTypes.has(item as SearchType),
  );
  const inferredTypes: SearchType[] = [];
  const typeHints: Array<[RegExp, SearchType[]]> = [
    [/读了什么书|读书|书籍|阅读/, ["table"]],
    [/日程|课程表|考试安排|时间表/, ["schedule"]],
    [/第一次上课|上课时|教学经历/, ["event", "schedule"]],
    [/去了哪些|去过哪些|旅行去了/, ["event"]],
    [/周报|月报|年度总结|总结|复盘/, ["summary"]],
    [/早餐|午餐|晚餐|饮食|热量|卡路里/, ["meal"]],
    [/兼职|家教|副业/, ["sideHustle"]],
    [/新闻|情报|热点/, ["intelligence"]],
    [/论文|科研文献|研究论文/, ["paper"]],
    [/岗位|招聘|求职|投递/, ["job"]],
    [/账单|消费|支出|收入|财务/, ["finance"]],
  ];
  if (!explicitTypes.length) {
    for (const [pattern, candidates] of typeHints) {
      if (pattern.test(raw)) inferredTypes.push(...candidates);
    }
  }
  const types = [...new Set(explicitTypes.length ? explicitTypes : inferredTypes)];
  types.forEach((type) => applied.push(`范围：${typeMeta[type].label}`));

  const sortInput = text(body.sort, 20);
  const sort =
    sortInput === "oldest" || /第一次|最早|从什么时候开始/.test(raw)
      ? "oldest"
      : sortInput === "newest"
        ? "newest"
        : "relevance";
  if (sort === "oldest") {
    applied.push("最早优先");
    cleaned = cleaned.replace(/第一次|最早|从什么时候开始/g, " ");
  }

  cleaned = cleaned
    .replace(/读了什么书|读过什么书|看了什么书/g, "读书")
    .replace(/去了哪些城市|去了哪些地方|去了哪里|去过哪些城市|去过哪些地方/g, " ")
    .replace(/上课时/g, "上课")
    .replace(/找出|查找|搜索|帮我|请|所有|我|的记录|的内容|有关|相关/g, " ")
    .replace(/(^|\s)和(?=[\u4e00-\u9fffA-Za-z0-9])/g, " ")
    .replace(/[＋+，。！？、,.!?：:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const terms = [...new Set(cleaned.toLowerCase().split(/\s+/).filter(Boolean))]
    .slice(0, 8);

  return {
    text: cleaned,
    terms,
    types,
    dateFrom,
    dateTo,
    kind,
    mood,
    person,
    place,
    project,
    tags,
    hasPhoto,
    hasAttachment,
    sort,
    applied,
  };
}

function likePattern(value: string) {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function addTextClauses(
  clauses: string[],
  bindings: unknown[],
  fields: string[],
  terms: string[],
) {
  for (const term of terms) {
    clauses.push(
      `(${fields
        .map(
          (field) =>
            `LOWER(COALESCE(${field}, '')) LIKE ? ESCAPE '\\'`,
        )
        .join(" OR ")})`,
    );
    bindings.push(...fields.map(() => likePattern(term)));
  }
}

function addDateClauses(
  clauses: string[],
  bindings: unknown[],
  field: string,
  filters: SearchFilters,
) {
  if (filters.dateFrom) {
    clauses.push(`${field} >= ?`);
    bindings.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push(`${field} < ?`);
    bindings.push(filters.dateTo);
  }
}

function jsonText(value: string | null) {
  if (!value) return "";
  const parsed = parseStoredJson<unknown>(value, value);
  if (typeof parsed === "string") return parsed;
  if (Array.isArray(parsed)) return parsed.map(String).join(" ");
  if (parsed && typeof parsed === "object") {
    return Object.values(parsed as JsonObject)
      .flatMap((item) => (Array.isArray(item) ? item : [item]))
      .map((item) => String(item ?? ""))
      .join(" ");
  }
  return String(parsed ?? "");
}

function snippet(value: string, terms: string[]) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return "没有补充说明";
  const lower = normalized.toLowerCase();
  const positions = terms
    .map((term) => lower.indexOf(term))
    .filter((position) => position >= 0);
  const position = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, position - 45);
  const result = normalized.slice(start, start + 150);
  return `${start > 0 ? "…" : ""}${result}${start + 150 < normalized.length ? "…" : ""}`;
}

function mapCandidate(
  row: CandidateRow,
  type: SearchType,
  filters: SearchFilters,
) {
  const meta = typeMeta[type];
  const title = text(row.title, 240) || `${meta.label}记录`;
  const content = text(row.content, 6000);
  const fields: Array<[string, string]> = [
    ["标题", title],
    ["正文", content],
    ["分类", text(row.category, 100)],
    ["状态", text(row.status, 100)],
    ["人物", text(row.person, 200)],
    ["地点", text(row.place, 200)],
    ["项目", text(row.project, 200)],
    ["标签", jsonText(row.tags)],
  ];
  const matchedFields = fields
    .filter(([, value]) =>
      filters.terms.some((term) => value.toLowerCase().includes(term)),
    )
    .map(([label]) => label);
  const phrase = filters.text.toLowerCase();
  let score = filters.terms.length ? 0 : 1;
  for (const term of filters.terms) {
    if (title.toLowerCase().includes(term)) score += 7;
    if (content.toLowerCase().includes(term)) score += 3;
    if (fields.slice(2).some(([, value]) => value.toLowerCase().includes(term))) {
      score += 2;
    }
  }
  if (phrase && title.toLowerCase() === phrase) score += 14;
  else if (phrase && title.toLowerCase().includes(phrase)) score += 8;
  const descriptor = [row.category, row.status, row.person, row.place]
    .map((item) => text(item, 80))
    .filter(Boolean)
    .slice(0, 3)
    .join(" · ");
  return {
    id: row.id,
    type,
    typeLabel: meta.label,
    title,
    snippet: snippet(content || descriptor, filters.terms),
    meta: descriptor,
    occurredAt: row.occurred_at,
    view: meta.view,
    source: meta.source,
    matchedFields,
    hasAttachment: Number(row.attachment_count) > 0,
    score,
  } satisfies SearchResult;
}

async function candidatesForType(
  type: SearchType,
  filters: SearchFilters,
) {
  const { DB } = getLifeBindings();
  const clauses: string[] = [];
  const bindings: unknown[] = [];
  let sql = "";
  let fields: string[] = [];

  if (type === "event") {
    const photoText = `(
      SELECT GROUP_CONCAT(
        COALESCE(pmd.caption, '') || ' ' ||
        COALESCE(pmd.tags, '') || ' ' ||
        COALESCE(pmd.place, '') || ' ' ||
        COALESCE(pmd.album, '') || ' ' ||
        COALESCE(pi.note, ''),
        ' '
      )
      FROM media pm
      LEFT JOIN photo_insights pi ON pi.media_id = pm.id
      LEFT JOIN photo_metadata pmd ON pmd.media_id = pm.id
      WHERE pm.event_id = le.id
    )`;
    clauses.push("le.deleted_at IS NULL", "le.is_private = 0");
    addDateClauses(clauses, bindings, "le.happened_at", filters);
    if (filters.kind) {
      clauses.push("le.kind = ?");
      bindings.push(filters.kind);
    }
    if (filters.mood) {
      clauses.push("le.mood = ?");
      bindings.push(filters.mood);
    }
    if (filters.person) {
      clauses.push("le.person LIKE ?");
      bindings.push(likePattern(filters.person));
    }
    if (filters.place) {
      clauses.push(`(le.place LIKE ? OR ${photoText} LIKE ?)`);
      bindings.push(
        likePattern(filters.place),
        likePattern(filters.place),
      );
    }
    if (filters.project) {
      clauses.push("le.project LIKE ?");
      bindings.push(likePattern(filters.project));
    }
    for (const tag of filters.tags) {
      clauses.push(`(le.tags LIKE ? OR ${photoText} LIKE ?)`);
      bindings.push(likePattern(tag), likePattern(tag));
    }
    if (filters.hasPhoto || filters.hasAttachment) {
      clauses.push("EXISTS (SELECT 1 FROM media em WHERE em.event_id = le.id)");
    }
    fields = [
      "le.title",
      "le.content",
      "le.kind",
      "le.mood",
      "le.tags",
      "le.person",
      "le.place",
      "le.project",
      photoText,
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT le.id, le.title,
             (le.content || ' ' || COALESCE(${photoText}, '')) AS content,
             le.kind AS category, le.mood AS status, le.happened_at AS occurred_at,
             le.person, le.place, le.project, le.tags,
             (SELECT COUNT(*) FROM media cm WHERE cm.event_id = le.id) AS attachment_count
           FROM life_events le
           WHERE ${clauses.join(" AND ")}
           ORDER BY le.happened_at DESC LIMIT 180`;
  }

  if (type === "schedule") {
    if (filters.mood || filters.tags.length || filters.hasPhoto) return [];
    addDateClauses(clauses, bindings, "se.start_at", filters);
    if (filters.kind) {
      clauses.push("se.category = ?");
      bindings.push(filters.kind);
    }
    if (filters.person) {
      clauses.push("se.person LIKE ?");
      bindings.push(likePattern(filters.person));
    }
    if (filters.place) {
      clauses.push("se.place LIKE ?");
      bindings.push(likePattern(filters.place));
    }
    if (filters.project) {
      clauses.push("se.project LIKE ?");
      bindings.push(likePattern(filters.project));
    }
    if (filters.hasAttachment) return [];
    fields = [
      "se.title",
      "se.note",
      "se.category",
      "se.status",
      "se.person",
      "se.place",
      "se.project",
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT se.id, se.title, se.note AS content,
             se.category, se.status, se.start_at AS occurred_at,
             se.person, se.place, se.project, '[]' AS tags,
             0 AS attachment_count
           FROM schedule_events se
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY se.start_at DESC LIMIT 180`;
  }

  if (type === "inbox") {
    if (
      filters.kind ||
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.project ||
      filters.tags.length ||
      filters.hasPhoto
    ) {
      return [];
    }
    addDateClauses(clauses, bindings, "ii.created_at", filters);
    if (filters.hasAttachment) {
      clauses.push(
        "EXISTS (SELECT 1 FROM inbox_attachments ia WHERE ia.inbox_id = ii.id)",
      );
    }
    fields = ["ii.content", "ii.source_type", "ii.status"];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT ii.id, SUBSTR(ii.content, 1, 120) AS title,
             ii.content, ii.source_type AS category, ii.status,
             ii.created_at AS occurred_at, '' AS person, '' AS place,
             '' AS project, '[]' AS tags,
             (SELECT COUNT(*) FROM inbox_attachments ia WHERE ia.inbox_id = ii.id)
               AS attachment_count
           FROM inbox_items ii
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY ii.created_at DESC LIMIT 180`;
  }

  if (type === "table") {
    if (
      filters.kind ||
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.project ||
      filters.tags.length ||
      filters.hasPhoto ||
      filters.hasAttachment
    ) {
      return [];
    }
    addDateClauses(clauses, bindings, "cr.updated_at", filters);
    fields = ["c.name", "c.description", "cr.values_json"];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT cr.id, c.name AS title,
             cr.values_json AS content, c.name AS category,
             '表格记录' AS status, cr.updated_at AS occurred_at,
             '' AS person, '' AS place, '' AS project, '[]' AS tags,
             0 AS attachment_count
           FROM collection_rows cr
           JOIN collections c ON c.id = cr.collection_id
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY cr.updated_at DESC LIMIT 180`;
  }

  if (type === "project") {
    if (
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.tags.length ||
      filters.hasPhoto ||
      filters.hasAttachment
    ) {
      return [];
    }
    addDateClauses(clauses, bindings, "p.updated_at", filters);
    if (filters.kind) {
      clauses.push("p.kind = ?");
      bindings.push(filters.kind);
    }
    if (filters.project) {
      clauses.push("p.title LIKE ?");
      bindings.push(likePattern(filters.project));
    }
    fields = ["p.title", "p.description", "p.kind", "p.status"];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT p.id, p.title, p.description AS content,
             p.kind AS category, p.status, COALESCE(p.start_at, p.updated_at) AS occurred_at,
             '' AS person, '' AS place, p.title AS project, '[]' AS tags,
             0 AS attachment_count
           FROM projects p
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY p.updated_at DESC LIMIT 180`;
  }

  if (type === "summary") {
    if (
      filters.kind ||
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.project ||
      filters.tags.length ||
      filters.hasPhoto ||
      filters.hasAttachment
    ) {
      return [];
    }
    addDateClauses(clauses, bindings, "gs.period_end", filters);
    fields = ["gs.title", "gs.content", "gs.kind", "gs.generated_by"];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT gs.id, gs.title, gs.content, gs.kind AS category,
             gs.generated_by AS status, gs.period_end AS occurred_at,
             '' AS person, '' AS place, '' AS project, '[]' AS tags,
             0 AS attachment_count
           FROM generated_summaries gs
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY gs.period_end DESC LIMIT 180`;
  }

  if (type === "meal") {
    if (
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.project ||
      filters.tags.length
    ) {
      return [];
    }
    addDateClauses(clauses, bindings, "m.eaten_at", filters);
    if (filters.kind) {
      clauses.push("(m.meal_type = ? OR ? = '饮食')");
      bindings.push(filters.kind, filters.kind);
    }
    if (filters.hasPhoto || filters.hasAttachment) {
      clauses.push(
        "EXISTS (SELECT 1 FROM meal_media mm WHERE mm.meal_id = m.id)",
      );
    }
    const mealItems = `(
      SELECT GROUP_CONCAT(mi.name || ' ' || mi.portion, ' ')
      FROM meal_items mi WHERE mi.meal_id = m.id
    )`;
    fields = ["m.meal_type", "m.note", mealItems];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT m.id, m.meal_type AS title,
             (m.note || ' ' || COALESCE(${mealItems}, '')) AS content,
             m.meal_type AS category,
             CAST(ROUND(m.estimated_calories) AS TEXT) || ' 千卡' AS status,
             m.eaten_at AS occurred_at, '' AS person, '' AS place,
             '' AS project, '[]' AS tags,
             (SELECT COUNT(*) FROM meal_media mm WHERE mm.meal_id = m.id)
               AS attachment_count
           FROM meals m
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY m.eaten_at DESC LIMIT 180`;
  }

  if (type === "finance") {
    if (
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.tags.length ||
      filters.hasPhoto
    ) {
      return [];
    }
    clauses.push("ft.deleted_at IS NULL", "ft.is_private = 0");
    addDateClauses(clauses, bindings, "ft.occurred_at", filters);
    if (filters.kind) {
      clauses.push("(ft.type = ? OR ft.category = ?)");
      bindings.push(filters.kind, filters.kind);
    }
    if (filters.project) {
      clauses.push("ft.project LIKE ?");
      bindings.push(likePattern(filters.project));
    }
    if (filters.hasAttachment) {
      clauses.push(
        "EXISTS (SELECT 1 FROM finance_documents fd WHERE fd.transaction_id = ft.id)",
      );
    }
    fields = [
      "ft.type",
      "ft.category",
      "ft.note",
      "ft.project",
      "fa.name",
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT ft.id, ft.category AS title, ft.note AS content,
             ft.type AS category, fa.name AS status, ft.occurred_at,
             '' AS person, '' AS place, ft.project, '[]' AS tags,
             (SELECT COUNT(*) FROM finance_documents fd WHERE fd.transaction_id = ft.id)
               AS attachment_count
           FROM finance_transactions ft
           LEFT JOIN financial_accounts fa ON fa.id = ft.account_id
           WHERE ${clauses.join(" AND ")}
           ORDER BY ft.occurred_at DESC LIMIT 180`;
  }

  if (type === "sideHustle") {
    if (filters.mood || filters.tags.length || filters.hasPhoto) return [];
    addDateClauses(clauses, bindings, "sp.updated_at", filters);
    if (filters.kind) {
      clauses.push("sp.kind = ?");
      bindings.push(filters.kind);
    }
    if (filters.person) {
      clauses.push("sc.name LIKE ?");
      bindings.push(likePattern(filters.person));
    }
    if (filters.place) {
      clauses.push(
        "EXISTS (SELECT 1 FROM work_sessions ws WHERE ws.project_id = sp.id AND ws.place LIKE ?)",
      );
      bindings.push(likePattern(filters.place));
    }
    if (filters.project) {
      clauses.push("sp.title LIKE ?");
      bindings.push(likePattern(filters.project));
    }
    if (filters.hasAttachment) return [];
    const workText = `(
      SELECT GROUP_CONCAT(ws.work_content || ' ' || ws.result || ' ' || ws.feeling, ' ')
      FROM work_sessions ws WHERE ws.project_id = sp.id
    )`;
    fields = [
      "sp.title",
      "sp.note",
      "sp.kind",
      "sp.status",
      "sc.name",
      workText,
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT sp.id, sp.title,
             (sp.note || ' ' || COALESCE(${workText}, '')) AS content,
             sp.kind AS category, sp.status, COALESCE(sp.start_at, sp.updated_at) AS occurred_at,
             sc.name AS person, '' AS place, sp.title AS project, '[]' AS tags,
             0 AS attachment_count
           FROM side_hustle_projects sp
           LEFT JOIN side_hustle_clients sc ON sc.id = sp.client_id
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY sp.updated_at DESC LIMIT 180`;
  }

  if (type === "intelligence") {
    if (
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.project ||
      filters.hasPhoto ||
      filters.hasAttachment
    ) {
      return [];
    }
    clauses.push("fi.is_ignored = 0");
    addDateClauses(
      clauses,
      bindings,
      "COALESCE(fi.published_at, fi.updated_at)",
      filters,
    );
    if (filters.kind) {
      clauses.push("(fi.kind = ? OR fi.category = ?)");
      bindings.push(filters.kind, filters.kind);
    }
    for (const tag of filters.tags) {
      clauses.push("fi.topics LIKE ?");
      bindings.push(likePattern(tag));
    }
    fields = [
      "fi.title",
      "fi.summary",
      "fi.kind",
      "fi.category",
      "fi.source_name",
      "fi.topics",
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT fi.id, fi.title, fi.summary AS content,
             fi.category, fi.read_status AS status,
             COALESCE(fi.published_at, fi.updated_at) AS occurred_at,
             '' AS person, '' AS place, '' AS project, fi.topics AS tags,
             0 AS attachment_count
           FROM feed_items fi
           WHERE ${clauses.join(" AND ")}
           ORDER BY COALESCE(fi.published_at, fi.updated_at) DESC LIMIT 180`;
  }

  if (type === "paper") {
    if (
      filters.kind ||
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.tags.length ||
      filters.hasPhoto ||
      filters.hasAttachment
    ) {
      return [];
    }
    addDateClauses(
      clauses,
      bindings,
      "COALESCE(rp.published_at, rp.updated_at)",
      filters,
    );
    if (filters.project) {
      clauses.push("rp.related_project LIKE ?");
      bindings.push(likePattern(filters.project));
    }
    fields = [
      "rp.title",
      "rp.authors",
      "rp.organization",
      "rp.venue",
      "rp.research_question",
      "rp.innovation",
      "rp.method",
      "rp.datasets",
      "rp.results",
      "rp.limitations",
      "rp.note",
      "rp.related_project",
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT rp.id, rp.title,
             (rp.authors || ' ' || rp.research_question || ' ' || rp.innovation ||
              ' ' || rp.method || ' ' || rp.results || ' ' || rp.note) AS content,
             rp.venue AS category, rp.reading_status AS status,
             COALESCE(rp.published_at, rp.updated_at) AS occurred_at,
             rp.authors AS person, rp.organization AS place,
             rp.related_project AS project, '[]' AS tags, 0 AS attachment_count
           FROM research_papers rp
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY COALESCE(rp.published_at, rp.updated_at) DESC LIMIT 180`;
  }

  if (type === "job") {
    if (
      filters.kind ||
      filters.mood ||
      filters.tags.length ||
      filters.hasPhoto ||
      filters.hasAttachment
    ) {
      return [];
    }
    addDateClauses(
      clauses,
      bindings,
      "COALESCE(jp.open_at, jp.updated_at)",
      filters,
    );
    if (filters.person) {
      clauses.push("jo.name LIKE ?");
      bindings.push(likePattern(filters.person));
    }
    if (filters.place) {
      clauses.push("jp.region LIKE ?");
      bindings.push(likePattern(filters.place));
    }
    if (filters.project) {
      clauses.push("(jp.recruitment_batch LIKE ? OR jp.title LIKE ?)");
      bindings.push(
        likePattern(filters.project),
        likePattern(filters.project),
      );
    }
    fields = [
      "jp.title",
      "jp.majors",
      "jp.region",
      "jp.education",
      "jp.note",
      "jp.last_change",
      "jo.name",
      "jo.kind",
    ];
    addTextClauses(clauses, bindings, fields, filters.terms);
    sql = `SELECT jp.id, (jo.name || ' · ' || jp.title) AS title,
             (jp.majors || ' ' || jp.education || ' ' || jp.note || ' ' || jp.last_change)
               AS content,
             jp.recruitment_batch AS category, jp.opening_status AS status,
             COALESCE(jp.open_at, jp.updated_at) AS occurred_at,
             jo.name AS person, jp.region AS place,
             jp.recruitment_batch AS project, '[]' AS tags, 0 AS attachment_count
           FROM job_postings jp
           JOIN job_organizations jo ON jo.id = jp.organization_id
           WHERE ${clauses.length ? clauses.join(" AND ") : "1 = 1"}
           ORDER BY COALESCE(jp.open_at, jp.updated_at) DESC LIMIT 180`;
  }

  if (!sql) return [];
  const result = await DB.prepare(sql)
    .bind(...bindings)
    .all<CandidateRow>();
  return result.results.map((row) => {
    if (type === "table") {
      row.content = jsonText(row.content);
      row.title = `${row.title} · ${text(row.content, 50) || "未命名记录"}`;
    }
    return mapCandidate(row, type, filters);
  });
}

export async function GET() {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const rows = await DB.prepare(
      `SELECT id, name, query_json, created_at
       FROM saved_searches ORDER BY created_at DESC`,
    ).all<{
      id: string;
      name: string;
      query_json: string;
      created_at: string;
    }>();
    return Response.json({
      savedSearches: rows.results.map((row) => ({
        id: row.id,
        name: row.name,
        query: parseStoredJson(row.query_json, {}),
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "读取保存搜索失败。",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await Promise.all([
      ensureAdvancedSchema(),
      ensureFinanceSchema(),
      ensureIntelligenceSchema(),
    ]);
    const body = (await request.json()) as JsonObject;
    const filters = parseFilters(body);
    const requestedTypes = filters.types.length
      ? filters.types
      : [...allowedTypes];
    const groups = await Promise.all(
      requestedTypes.map((type) => candidatesForType(type, filters)),
    );
    let results = groups.flat();
    if (filters.sort === "oldest") {
      results.sort(
        (a, b) =>
          new Date(a.occurredAt ?? 0).getTime() -
          new Date(b.occurredAt ?? 0).getTime(),
      );
    } else if (filters.sort === "newest") {
      results.sort(
        (a, b) =>
          new Date(b.occurredAt ?? 0).getTime() -
          new Date(a.occurredAt ?? 0).getTime(),
      );
    } else {
      results.sort(
        (a, b) =>
          b.score - a.score ||
          new Date(b.occurredAt ?? 0).getTime() -
            new Date(a.occurredAt ?? 0).getTime(),
      );
    }
    const limitValue = Number(body.limit);
    const limit = Number.isFinite(limitValue)
      ? Math.max(1, Math.min(100, Math.round(limitValue)))
      : 40;
    const total = results.length;
    results = results.slice(0, limit);
    const counts = results.reduce<Record<string, number>>((accumulator, item) => {
      accumulator[item.type] = (accumulator[item.type] ?? 0) + 1;
      return accumulator;
    }, {});
    return Response.json({
      results,
      total,
      counts,
      parsed: {
        text: filters.text,
        types: filters.types,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        kind: filters.kind,
        mood: filters.mood,
        person: filters.person,
        place: filters.place,
        project: filters.project,
        tags: filters.tags,
        hasPhoto: filters.hasPhoto,
        hasAttachment: filters.hasAttachment,
        sort: filters.sort,
      },
      appliedFilters: filters.applied,
      privacyNote: "普通全局搜索不会返回私密空间或标记为私密的财务记录。",
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "全局搜索失败。",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const body = (await request.json()) as JsonObject;
    const name = text(body.name, 120);
    const query =
      body.query && typeof body.query === "object" && !Array.isArray(body.query)
        ? body.query
        : {};
    if (!name) {
      return Response.json({ error: "请填写搜索名称。" }, { status: 400 });
    }
    const id = crypto.randomUUID();
    await DB.prepare(
      "INSERT INTO saved_searches (id, name, query_json) VALUES (?, ?, ?)",
    )
      .bind(id, name, JSON.stringify(query).slice(0, 12000))
      .run();
    return Response.json({ id, name, query }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "保存搜索失败。",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await ensureAdvancedSchema();
    const { DB } = getLifeBindings();
    const id = text(new URL(request.url).searchParams.get("id"), 80);
    if (!id) {
      return Response.json({ error: "缺少搜索编号。" }, { status: 400 });
    }
    await DB.prepare("DELETE FROM saved_searches WHERE id = ?").bind(id).run();
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "删除搜索失败。",
      },
      { status: 500 },
    );
  }
}
