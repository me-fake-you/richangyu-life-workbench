import { ensureFinanceSchema } from "./finance-store";
import { getLifeBindings } from "./life-store";

let intelligenceSchemaPromise: Promise<unknown> | null = null;

export async function ensureIntelligenceSchema() {
  await ensureFinanceSchema();
  if (intelligenceSchemaPromise) return intelligenceSchemaPromise;
  const { DB } = getLifeBindings();
  intelligenceSchemaPromise = (async () => {
    await DB.batch([
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS feed_sources (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '新闻',
          authority TEXT NOT NULL DEFAULT '媒体',
          enabled INTEGER NOT NULL DEFAULT 1,
          check_frequency TEXT NOT NULL DEFAULT '每日',
          last_checked_at TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS feed_items (
          id TEXT PRIMARY KEY NOT NULL,
          source_id TEXT,
          kind TEXT NOT NULL DEFAULT '新闻',
          category TEXT NOT NULL DEFAULT '科技与AI',
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          importance TEXT NOT NULL DEFAULT '',
          source_url TEXT NOT NULL DEFAULT '',
          source_name TEXT NOT NULL DEFAULT '',
          image_url TEXT NOT NULL DEFAULT '',
          published_at TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          event_status TEXT NOT NULL DEFAULT '待确认',
          topics TEXT NOT NULL DEFAULT '[]',
          official_confirmed INTEGER NOT NULL DEFAULT 0,
          independent_sources INTEGER NOT NULL DEFAULT 1,
          unconfirmed TEXT NOT NULL DEFAULT '',
          read_status TEXT NOT NULL DEFAULT '未读',
          is_favorite INTEGER NOT NULL DEFAULT 0,
          is_ignored INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (source_id) REFERENCES feed_sources(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS topic_subscriptions (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL DEFAULT '主题',
          value TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT '全部',
          priority TEXT NOT NULL DEFAULT '普通',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(kind, value)
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS research_papers (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          authors TEXT NOT NULL DEFAULT '',
          organization TEXT NOT NULL DEFAULT '',
          venue TEXT NOT NULL DEFAULT '',
          published_at TEXT,
          paper_url TEXT NOT NULL DEFAULT '',
          code_url TEXT NOT NULL DEFAULT '',
          project_url TEXT NOT NULL DEFAULT '',
          research_question TEXT NOT NULL DEFAULT '',
          innovation TEXT NOT NULL DEFAULT '',
          method TEXT NOT NULL DEFAULT '',
          datasets TEXT NOT NULL DEFAULT '',
          results TEXT NOT NULL DEFAULT '',
          limitations TEXT NOT NULL DEFAULT '',
          relevance INTEGER NOT NULL DEFAULT 0,
          reproducibility TEXT NOT NULL DEFAULT '待判断',
          reading_status TEXT NOT NULL DEFAULT '新发现',
          related_project TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS paper_signals (
          id TEXT PRIMARY KEY NOT NULL,
          paper_id TEXT NOT NULL,
          review_score TEXT NOT NULL DEFAULT '未公开',
          acceptance_status TEXT NOT NULL DEFAULT '未公开',
          venue_level TEXT NOT NULL DEFAULT '',
          heat_signal TEXT NOT NULL DEFAULT '',
          citations INTEGER NOT NULL DEFAULT 0,
          benchmark_signal TEXT NOT NULL DEFAULT '',
          code_available INTEGER NOT NULL DEFAULT 0,
          model_available INTEGER NOT NULL DEFAULT 0,
          data_available INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (paper_id) REFERENCES research_papers(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS job_organizations (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '银行',
          level TEXT NOT NULL DEFAULT '总行',
          official_url TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS job_postings (
          id TEXT PRIMARY KEY NOT NULL,
          organization_id TEXT NOT NULL,
          title TEXT NOT NULL,
          recruitment_batch TEXT NOT NULL DEFAULT '秋招',
          organization_level TEXT NOT NULL DEFAULT '总行',
          region TEXT NOT NULL DEFAULT '全国',
          education TEXT NOT NULL DEFAULT '硕士',
          majors TEXT NOT NULL DEFAULT '',
          open_at TEXT,
          deadline_at TEXT,
          source_url TEXT NOT NULL DEFAULT '',
          opening_status TEXT NOT NULL DEFAULT '信息待确认',
          last_checked_at TEXT,
          last_change TEXT NOT NULL DEFAULT '',
          source_confirmed INTEGER NOT NULL DEFAULT 0,
          favorite INTEGER NOT NULL DEFAULT 0,
          match_level TEXT NOT NULL DEFAULT '待评估',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (organization_id) REFERENCES job_organizations(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS job_snapshots (
          id TEXT PRIMARY KEY NOT NULL,
          posting_id TEXT NOT NULL,
          content_hash TEXT NOT NULL,
          page_title TEXT NOT NULL DEFAULT '',
          content_text TEXT NOT NULL DEFAULT '',
          checked_at TEXT NOT NULL,
          http_status INTEGER NOT NULL DEFAULT 200,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS job_changes (
          id TEXT PRIMARY KEY NOT NULL,
          posting_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '页面变化',
          summary TEXT NOT NULL,
          before_text TEXT NOT NULL DEFAULT '',
          after_text TEXT NOT NULL DEFAULT '',
          detected_at TEXT NOT NULL,
          is_important INTEGER NOT NULL DEFAULT 0,
          acknowledged INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS job_applications (
          id TEXT PRIMARY KEY NOT NULL,
          posting_id TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT '待了解',
          applied_at TEXT,
          next_action TEXT NOT NULL DEFAULT '',
          next_action_at TEXT,
          resume_version TEXT NOT NULL DEFAULT '',
          material_completeness INTEGER NOT NULL DEFAULT 0,
          missing_materials TEXT NOT NULL DEFAULT '',
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (posting_id) REFERENCES job_postings(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS application_events (
          id TEXT PRIMARY KEY NOT NULL,
          application_id TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '网申',
          title TEXT NOT NULL,
          start_at TEXT NOT NULL,
          end_at TEXT,
          place TEXT NOT NULL DEFAULT '',
          link TEXT NOT NULL DEFAULT '',
          reminder_days INTEGER NOT NULL DEFAULT 1,
          status TEXT NOT NULL DEFAULT '待完成',
          schedule_id TEXT,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE CASCADE
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS application_documents (
          id TEXT PRIMARY KEY NOT NULL,
          application_id TEXT,
          name TEXT NOT NULL,
          kind TEXT NOT NULL DEFAULT '简历',
          version TEXT NOT NULL DEFAULT 'V1',
          status TEXT NOT NULL DEFAULT '可用',
          last_modified_at TEXT,
          object_key TEXT UNIQUE,
          filename TEXT,
          content_type TEXT,
          size INTEGER NOT NULL DEFAULT 0,
          note TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (application_id) REFERENCES job_applications(id) ON DELETE SET NULL
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS alert_rules (
          id TEXT PRIMARY KEY NOT NULL,
          kind TEXT NOT NULL DEFAULT '截止提醒',
          target_id TEXT,
          title TEXT NOT NULL,
          trigger_at TEXT,
          lead_days TEXT NOT NULL DEFAULT '[7,3,1,0]',
          priority TEXT NOT NULL DEFAULT '普通',
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(`
        CREATE TABLE IF NOT EXISTS monitor_runs (
          id TEXT PRIMARY KEY NOT NULL,
          target_type TEXT NOT NULL DEFAULT '岗位',
          target_id TEXT,
          started_at TEXT NOT NULL,
          completed_at TEXT,
          status TEXT NOT NULL DEFAULT '进行中',
          checked_count INTEGER NOT NULL DEFAULT 0,
          changed_count INTEGER NOT NULL DEFAULT 0,
          message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS feed_items_updated_idx ON feed_items(updated_at)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS feed_items_category_idx ON feed_items(category)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS research_papers_status_idx ON research_papers(reading_status)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS paper_signals_paper_idx ON paper_signals(paper_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS job_postings_deadline_idx ON job_postings(deadline_at)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS job_snapshots_posting_idx ON job_snapshots(posting_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS job_changes_posting_idx ON job_changes(posting_id)",
      ),
      DB.prepare(
        "CREATE INDEX IF NOT EXISTS application_events_start_idx ON application_events(start_at)",
      ),
    ]);

    const feedColumns = await DB.prepare("PRAGMA table_info(feed_items)").all<{
      name: string;
    }>();
    if (!feedColumns.results.some((column) => column.name === "image_url")) {
      await DB.prepare(
        "ALTER TABLE feed_items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
      ).run();
    }

    const defaultSources = [
      {
        id: "default-cn-xinhua",
        name: "新华网 · 国内",
        url: "https://www.news.cn/politics/",
        kind: "国内",
        authority: "官方媒体",
      },
      {
        id: "default-cn-cctv",
        name: "央视新闻 · 国内",
        url: "https://news.cctv.com/china/",
        kind: "国内",
        authority: "官方媒体",
      },
      {
        id: "default-cn-stats",
        name: "国家统计局 · 最新发布",
        url: "https://www.stats.gov.cn/sj/zxfb/rss.xml",
        kind: "国内",
        authority: "政府官方",
      },
      {
        id: "default-world-un",
        name: "联合国新闻 · 中文",
        url: "https://news.un.org/feed/subscribe/zh/news/all/rss.xml",
        kind: "国际",
        authority: "国际组织官方",
      },
      {
        id: "default-world-npr",
        name: "NPR World",
        url: "https://feeds.npr.org/1004/rss.xml",
        kind: "国际",
        authority: "国际主流媒体",
      },
    ];
    for (const source of defaultSources) {
      await DB.prepare(
        `INSERT OR IGNORE INTO feed_sources
         (id, name, url, kind, authority, enabled, check_frequency)
         VALUES (?, ?, ?, ?, ?, 1, '每日')`,
      )
        .bind(
          source.id,
          source.name,
          source.url,
          source.kind,
          source.authority,
        )
        .run();
    }

    const defaults = [
      ["研究主题", "Encrypted Traffic Classification", "研究"],
      ["研究主题", "Malicious Traffic Detection", "研究"],
      ["研究主题", "Multi-Agent Systems", "研究"],
      ["研究主题", "Shortcut Learning", "研究"],
      ["研究主题", "Robustness", "研究"],
      ["研究主题", "Uncertainty Estimation", "研究"],
      ["研究主题", "Risk-Aware Decision", "研究"],
      ["研究主题", "Mixture of Experts", "研究"],
      ["研究主题", "Cloud-Edge Computing", "研究"],
      ["研究主题", "LLM Agent Evaluation", "研究"],
      ["研究主题", "Network Security", "研究"],
      ["关键词", "银行秋招", "求职"],
      ["关键词", "银行科技岗", "求职"],
      ["关键词", "教师招聘", "求职"],
      ["关键词", "教育政策", "新闻"],
    ];
    for (const [kind, value, scope] of defaults) {
      await DB.prepare(
        `INSERT OR IGNORE INTO topic_subscriptions
         (id, kind, value, scope, priority, enabled)
         VALUES (?, ?, ?, ?, '重点', 1)`,
      )
        .bind(`default-${encodeURIComponent(value)}`, kind, value, scope)
        .run();
    }
  })();
  return intelligenceSchemaPromise;
}
