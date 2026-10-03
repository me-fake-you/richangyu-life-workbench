"use client";

import {
  BellRing,
  BookOpenCheck,
  Bookmark,
  Check,
  CircleDot,
  Clock3,
  ExternalLink,
  FileSearch,
  Filter,
  FlaskConical,
  Globe2,
  Inbox,
  Layers3,
  LoaderCircle,
  Plus,
  Radar,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  emptyIntelligenceData,
  intelligenceAction,
  type FeedItem,
  type IntelligenceData,
} from "./intelligence-types";
import { MarkdownContent } from "./markdown-content";

type IntelligenceTab =
  | "brief"
  | "news"
  | "research"
  | "inbox"
  | "subscriptions"
  | "report";

function FeedArtwork({
  item,
  compact = false,
}: {
  item: FeedItem;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const sourceInitial = (item.sourceName || item.category || "情")
    .trim()
    .slice(0, 1);
  return (
    <figure
      className={`feed-artwork ${compact ? "compact" : ""} ${
        !item.imageUrl || failed ? "is-placeholder" : ""
      }`}
    >
      {item.imageUrl && !failed ? (
        <img
          src={`/api/intelligence/image?id=${encodeURIComponent(item.id)}`}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{sourceInitial}</span>
      )}
      {!compact && (
        <figcaption>{item.sourceName || "来源图片待补充"}</figcaption>
      )}
    </figure>
  );
}

const newsCategories = [
  "国内",
  "国际",
  "国内重要新闻",
  "国际热点",
  "财经与银行",
  "教育政策",
  "科技与AI",
  "网络安全",
  "就业与招聘",
  "待读资料",
];

const paperStatuses = [
  "新发现",
  "待筛选",
  "准备阅读",
  "正在精读",
  "已读",
  "准备复现",
  "正在复现",
  "已用于论文",
  "暂不相关",
];

function localDateTime(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function dateLabel(value: string | null) {
  if (!value) return "时间待确认";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间待确认"
    : date.toLocaleString("zh-CN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function conciseFeedSummary(item: FeedItem, max = 240) {
  const summary = item.summary.replace(/\s+/g, " ").trim();
  if (summary) {
    return summary.length > max ? `${summary.slice(0, max)}…` : summary;
  }
  return `${item.sourceName || "该来源"}发布了“${item.title}”。原始页面暂未提供可提取摘要，请打开原文核对详细内容。`;
}

function feedPublishedTime(item: FeedItem) {
  const value = item.publishedAt || item.createdAt;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function beijingDayKey(value: Date | number) {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function isTodayNews(item: FeedItem, todayKey: string) {
  const time = feedPublishedTime(item);
  return Boolean(todayKey) && time > 0 && beijingDayKey(time) === todayKey;
}

export function IntelligenceCenter({
  onNotice,
  onWorkspaceReload,
}: {
  onNotice: (notice: string) => void;
  onWorkspaceReload: () => Promise<void>;
}) {
  const [data, setData] = useState<IntelligenceData>(emptyIntelligenceData);
  const [tab, setTab] = useState<IntelligenceTab>("brief");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [readingMode, setReadingMode] = useState<"30s" | "3m" | "deep">("30s");
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  const [dailyLimit, setDailyLimit] = useState(10);
  const [hideRead, setHideRead] = useState(false);
  const [officialFirst, setOfficialFirst] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [todayKey, setTodayKey] = useState("");
  const autoRefreshAttempted = useRef(false);

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/intelligence", { cache: "no-store" });
      const payload = (await response.json()) as IntelligenceData & {
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error || "情报中心读取失败。");
      setData(payload);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "情报中心读取失败。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      autoRefreshAttempted.current = false;
      void load();
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const updateToday = () => setTodayKey(beijingDayKey(new Date()));
    updateToday();
    const timer = window.setInterval(updateToday, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  async function run(
    action: string,
    payload: Record<string, unknown>,
    success: string,
    workspaceChanged = false,
  ) {
    setBusy(action);
    try {
      await intelligenceAction(action, payload);
      await load();
      if (workspaceChanged) await onWorkspaceReload();
      onNotice(success);
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "操作失败。");
    } finally {
      setBusy("");
    }
  }

  async function syncPeopleDaily() {
    setBusy("people.sync");
    try {
      const sourceIds = data.sources
        .filter(
          (source) =>
            source.id === "default-cn-people-daily" ||
            source.id === "default-cn-people-society",
        )
        .map((source) => source.id);
      for (const id of sourceIds.length
        ? sourceIds
        : ["default-cn-people-daily", "default-cn-people-society"]) {
        await intelligenceAction("source.check", { id });
      }
      await load();
      onNotice("人民日报时政与社会热点已经同步。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "人民日报同步失败。");
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    if (
      loading ||
      autoRefreshAttempted.current ||
      (!data.freshness.syncStale && !data.freshness.contentStale)
    ) {
      return;
    }
    autoRefreshAttempted.current = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        setBusy("daily.auto");
        try {
          const result = (await intelligenceAction("daily.refreshIfStale", {
            timezoneOffset: new Date().getTimezoneOffset(),
          })) as { refreshed?: boolean };
          await load();
          if (result.refreshed) {
            onNotice("国内外热点已完成实时补更。");
          }
        } catch (error) {
          onNotice(
            error instanceof Error
              ? error.message
              : "自动更新失败，可以点击“更新今日热点”重试。",
          );
        } finally {
          setBusy("");
        }
      })();
    }, 80);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.freshness.contentStale,
    data.freshness.syncStale,
    loading,
  ]);

  const visibleFeed = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...data.feedItems]
      .filter((item) => category === "全部" || item.category === category)
      .filter((item) => !hideRead || item.readStatus !== "已读")
      .filter(
        (item) =>
          showHistory ||
          isTodayNews(item, todayKey),
      )
      .filter(
        (item) =>
          !needle ||
          [
            item.title,
            item.summary,
            item.importance,
            item.sourceName,
            item.topics.join(" "),
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) => {
        const timeDelta = feedPublishedTime(b) - feedPublishedTime(a);
        if (Math.abs(timeDelta) > 12 * 60 * 60 * 1000) {
          return timeDelta;
        }
        if (officialFirst && a.officialConfirmed !== b.officialConfirmed) {
          return a.officialConfirmed ? -1 : 1;
        }
        return timeDelta;
      });
  }, [
    category,
    data.feedItems,
    hideRead,
    officialFirst,
    query,
    showHistory,
    todayKey,
  ]);

  const todaysBrief = visibleFeed
    .filter((item) => isTodayNews(item, todayKey))
    .slice(0, dailyLimit);
  const latestDailyBrief = data.briefs.find(
    (brief) =>
      brief.kind === "情报日报" &&
      beijingDayKey(new Date(brief.periodStart)) === todayKey,
  );
  const relevantPapers = [...data.papers].sort(
    (a, b) => b.relevance - a.relevance,
  );
  const sourceCoverage = [
    {
      kind: "国内",
      label: "国内权威来源",
      description: "人民日报 / 人民网、新华社、央视与政府公开发布",
      sources: data.sources.filter((source) => source.kind === "国内"),
    },
    {
      kind: "国际",
      label: "国际热点来源",
      description: "联合国、BBC、NPR 与 The Guardian 等公开来源",
      sources: data.sources.filter((source) => source.kind === "国际"),
    },
  ];
  const peopleDailyItems = [...data.feedItems]
    .filter(
      (item) =>
        item.sourceId === "default-cn-people-daily" ||
        item.sourceId === "default-cn-people-society" ||
        item.sourceName.includes("人民日报") ||
        item.sourceName.includes("人民网"),
    )
    .sort(
      (a, b) =>
        feedPublishedTime(b) - feedPublishedTime(a),
    )
    .filter(
      (item) =>
        showHistory ||
        isTodayNews(item, todayKey),
    )
    .slice(0, 3);

  if (loading) {
    return (
      <section className="standard-page intelligence-loading">
        <LoaderCircle className="spin" size={26} />
        <p>正在整理来源、论文与今日情报…</p>
      </section>
    );
  }

  return (
    <section className="standard-page intelligence-center">
      <div className="page-intro intelligence-page-intro">
        <div>
          <span className="eyebrow">INTELLIGENCE CENTER</span>
          <h1>少而有用，把外部信息变成下一步行动</h1>
          <p>
            新闻保留来源与不确定性，论文拆开评价信号；收藏之后可以直接进入阅读、研究或时间表。
          </p>
        </div>
        <div className="intelligence-hero-radar">
          <span><Radar size={28} /></span>
          <div>
            <small>今日待处理</small>
            <strong>
              {data.summary.unreadNews + data.summary.researchToRead}
            </strong>
            <p>未读情报与待读研究</p>
          </div>
        </div>
      </div>

      <div className="intelligence-metrics">
        <article>
          <span><Globe2 size={18} /></span>
          <small>未读热点</small>
          <strong>{data.summary.unreadNews}</strong>
          <p>{data.summary.relevantNews} 条与你的订阅有关</p>
        </article>
        <article>
          <span><FlaskConical size={18} /></span>
          <small>准备精读</small>
          <strong>{data.summary.researchToRead}</strong>
          <p>{data.summary.researchToReproduce} 篇进入复现阶段</p>
        </article>
        <article>
          <span><Target size={18} /></span>
          <small>开放机会</small>
          <strong>{data.summary.openJobs}</strong>
          <p>{data.summary.urgentJobs} 个将在七天内截止</p>
        </article>
        <article>
          <span><BellRing size={18} /></span>
          <small>近期行动</small>
          <strong>{data.summary.upcomingEvents}</strong>
          <p>未来七天的投递、测评与面试</p>
        </article>
      </div>

      <nav className="intelligence-tabs" aria-label="情报中心页面">
        {[
          ["brief", "每日简报", Sparkles],
          ["news", "热点新闻", Globe2],
          ["research", "AI研究雷达", FlaskConical],
          ["inbox", "信息收件箱", Inbox],
          ["subscriptions", "订阅中心", Radar],
          ["report", "情报周报", Layers3],
        ].map(([id, label, Icon]) => (
          <button
            key={String(id)}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id as IntelligenceTab)}
          >
            <Icon size={15} />
            {String(label)}
          </button>
        ))}
      </nav>

      {(tab === "brief" || tab === "news") && (
        <>
          <section className="news-source-coverage" aria-label="国内外新闻来源覆盖">
            {sourceCoverage.map((group) => {
              const healthy = group.sources.filter(
                (source) => !source.health?.consecutiveFailures,
              ).length;
              return (
                <article key={group.kind}>
                  <header>
                    <div>
                      <small>{group.kind === "国内" ? "CHINA" : "WORLD"}</small>
                      <strong>{group.label}</strong>
                    </div>
                    <span>{group.sources.length} 个来源</span>
                  </header>
                  <p>{group.description}</p>
                  <footer>
                    <span>{healthy} 个可用或等待首次检查</span>
                    <button onClick={() => setCategory(group.kind)}>
                      只看{group.kind}
                    </button>
                  </footer>
                </article>
              );
            })}
            <aside>
              <ShieldCheck size={18} />
              <p>
                同一事件优先查看官方原文，再用不同国家和机构的报道交叉核对。
                AI 只整理摘要，不替代来源。
              </p>
            </aside>
          </section>

          <section
            className={`news-freshness-status ${
              data.freshness.syncStale || data.freshness.contentStale
                ? "is-stale"
                : "is-fresh"
            }`}
          >
            <span>
              <RefreshCw
                className={busy === "daily.auto" ? "spin" : ""}
                size={17}
              />
            </span>
            <div>
              <strong>
                {busy === "daily.auto"
                  ? "正在自动补更国内外热点…"
                  : data.freshness.contentStale
                    ? "今天暂时还没有新条目"
                    : `今日热点已同步 ${data.freshness.todayPublishedCount} 条`}
              </strong>
              <p>
                北京时间当天新闻全天每 15 分钟自动检查；打开中的页面每 5 分钟读取最新结果，发现新条目才更新今日简报。
              </p>
            </div>
            <dl>
              <div>
                <dt>最近同步</dt>
                <dd>{dateLabel(data.freshness.lastSuccessfulSyncAt)}</dd>
              </div>
              <div>
                <dt>最新发布</dt>
                <dd>{dateLabel(data.freshness.freshestPublishedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="intelligence-toolbar">
            <label className="intelligence-search">
              <Search size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索主题、来源或关键词"
              />
              {query && (
                <button onClick={() => setQuery("")} aria-label="清空">
                  <X size={13} />
                </button>
              )}
            </label>
            <label>
              <Filter size={14} />
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option>全部</option>
                {newsCategories.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              每日上限
              <select
                value={dailyLimit}
                onChange={(event) => setDailyLimit(Number(event.target.value))}
              >
                {[5, 10, 15, 20].map((item) => (
                  <option value={item} key={item}>{item} 条</option>
                ))}
              </select>
            </label>
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={officialFirst}
                onChange={(event) => setOfficialFirst(event.target.checked)}
              />
              官方来源优先
            </label>
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={hideRead}
                onChange={(event) => setHideRead(event.target.checked)}
              />
              隐藏已读
            </label>
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={showHistory}
                onChange={(event) => setShowHistory(event.target.checked)}
              />
              显示今天以前的新闻
            </label>
            <button
              className="intelligence-refresh-button"
              onClick={() =>
                void run(
                  "daily.refresh",
                  { timezoneOffset: new Date().getTimezoneOffset() },
                  "今日国内外热点已经更新。",
                )
              }
              disabled={busy === "daily.refresh"}
            >
              <RefreshCw
                className={busy === "daily.refresh" ? "spin" : ""}
                size={14}
              />
              {busy === "daily.refresh" ? "正在读取来源…" : "更新今日热点"}
            </button>
          </section>

          {tab === "brief" && latestDailyBrief && (
            <article className="daily-intelligence-report">
              <header>
                <div>
                  <span className="eyebrow">AI SOURCE-BACKED BRIEF</span>
                  <h2>{latestDailyBrief.title}</h2>
                </div>
                <time>{dateLabel(latestDailyBrief.createdAt)}</time>
              </header>
              {todaysBrief.some((item) => item.imageUrl) && (
                <div className="brief-image-strip">
                  {todaysBrief
                    .filter((item) => item.imageUrl)
                    .slice(0, 3)
                    .map((item) => (
                      <FeedArtwork item={item} compact key={item.id} />
                    ))}
                </div>
              )}
              <MarkdownContent content={latestDailyBrief.content} />
              <footer>
                <span>生成方式：{latestDailyBrief.generatedBy}</span>
                <span>点击下方原始条目复核，AI 只负责整理与关联。</span>
              </footer>
            </article>
          )}

          {tab === "brief" && !latestDailyBrief && (
            <div className="daily-brief-empty">
              <Clock3 size={20} />
              <div>
                <strong>今天的简报还没有生成</strong>
                <p>
                  系统不会把昨天或更早的简报冒充成今日内容。点击“更新今日热点”可立即重新同步。
                </p>
              </div>
            </div>
          )}

          <div className="reading-mode-switch">
            <span>阅读方式</span>
            {[
              ["30s", "30 秒简报"],
              ["3m", "3 分钟摘要"],
              ["deep", "深度阅读"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={readingMode === id ? "active" : ""}
                onClick={() => setReadingMode(id as typeof readingMode)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "news" && (
            <>
              <section className="people-daily-channel">
                <header>
                  <div>
                    <span>中央媒体官方</span>
                    <h2>人民日报热点</h2>
                    <p>
                      直接同步人民网时政与社会频道；每条新闻保留原文、配图和简要总结。
                    </p>
                  </div>
                  <div>
                    <button
                      onClick={() => void syncPeopleDaily()}
                      disabled={busy === "people.sync"}
                    >
                      <RefreshCw
                        className={busy === "people.sync" ? "spin" : ""}
                        size={14}
                      />
                      {busy === "people.sync" ? "正在同步…" : "同步人民日报"}
                    </button>
                    <a
                      href="https://www.people.com.cn/"
                      target="_blank"
                      rel="noreferrer"
                    >
                      人民网原站 <ExternalLink size={12} />
                    </a>
                  </div>
                </header>
                {peopleDailyItems.length ? (
                  <div className="people-daily-grid">
                    {peopleDailyItems.map((item) => (
                      <article key={item.id}>
                        <FeedArtwork item={item} compact />
                        <div>
                          <small>{item.sourceName}</small>
                          <h3>{item.title}</h3>
                          <p>{conciseFeedSummary(item, 150)}</p>
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            阅读原文 <ExternalLink size={11} />
                          </a>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="people-daily-empty">
                    <Globe2 size={20} />
                    <p>
                      人民日报来源已经配置。点击“同步人民日报”后，最新条目会直接显示在这里。
                    </p>
                  </div>
                )}
              </section>

              <details className="intelligence-capture" open={!data.feedItems.length}>
                <summary><Plus size={15} /> 保存新闻、公告或网页</summary>
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    await run(
                      "feed.importUrl",
                      Object.fromEntries(new FormData(form).entries()),
                      "网页已经进入信息收件箱。",
                    );
                    form.reset();
                  }}
                >
                  <label className="wide">
                    <span>网页地址</span>
                    <input
                      name="url"
                      type="url"
                      placeholder="https:// 官方新闻、论文、公告或网页"
                      required
                    />
                  </label>
                  <label>
                    <span>类型</span>
                    <select name="kind">
                      <option>新闻</option>
                      <option>公告</option>
                      <option>网页</option>
                      <option>项目更新</option>
                    </select>
                  </label>
                  <label>
                    <span>分类</span>
                    <select name="category">
                      {newsCategories.map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>阅读状态</span>
                    <select name="readStatus" defaultValue="稍后读">
                      <option>未读</option>
                      <option>稍后读</option>
                      <option>已读</option>
                    </select>
                  </label>
                  <label>
                    <span>相关主题</span>
                    <input name="topics" placeholder="银行秋招，AI，网络安全" />
                  </label>
                  <label className="wide">
                    <span>为什么值得看</span>
                    <input
                      name="importance"
                      placeholder="它可能影响你的研究、求职或近期行动"
                    />
                  </label>
                  <button
                    className="primary-button"
                    disabled={busy === "feed.importUrl"}
                  >
                    {busy === "feed.importUrl" ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <FileSearch size={15} />
                    )}
                    读取并保存
                  </button>
                </form>
              </details>
            </>
          )}

          <section className="feed-card-list">
            {(tab === "brief" ? todaysBrief : visibleFeed).length ? (
              (tab === "brief" ? todaysBrief : visibleFeed).map((item) => (
                <article className="feed-card" key={item.id}>
                  <header>
                    <div>
                      <span className={`feed-kind kind-${item.kind}`}>
                        {item.kind}
                      </span>
                      <span>{item.category}</span>
                      <span>{item.eventStatus}</span>
                    </div>
                    <time>
                      发布于 {dateLabel(item.publishedAt || item.createdAt)}
                    </time>
                  </header>
                  <FeedArtwork item={item} />
                  <h2>{item.title}</h2>
                  <div className="feed-summary-block">
                    <strong>简要总结</strong>
                    <p className="feed-summary">{conciseFeedSummary(item)}</p>
                  </div>
                  {readingMode !== "30s" && (
                    <div className="feed-importance">
                      <strong>为什么与你有关</strong>
                      <p>
                        {item.importance ||
                          "尚未补充个性化影响，可以收藏后在研究或求职专题中继续判断。"}
                      </p>
                    </div>
                  )}
                  {readingMode === "deep" && (
                    <div className="source-evidence">
                      <span className={item.officialConfirmed ? "confirmed" : ""}>
                        <ShieldCheck size={13} />
                        {item.officialConfirmed ? "官方已确认" : "尚无官方确认"}
                      </span>
                      <span>
                        <Layers3 size={13} />
                        {item.independentSources} 个独立来源
                      </span>
                      <span>
                        <CircleDot size={13} />
                        {item.unconfirmed || "未确认部分尚未标注"}
                      </span>
                    </div>
                  )}
                  <div className="feed-topics">
                    {item.topics.map((topic) => (
                      <span key={topic}>{topic}</span>
                    ))}
                  </div>
                  <footer>
                    <div>
                      <span>
                        来源：{item.sourceName || "待补充"}
                      </span>
                      <span>
                        同步：{dateLabel(item.updatedAt)}
                      </span>
                    </div>
                    <div className="feed-actions">
                      {item.sourceUrl && (
                        <a href={item.sourceUrl} target="_blank" rel="noreferrer">
                          原文 <ExternalLink size={12} />
                        </a>
                      )}
                      <button
                        className={item.isFavorite ? "active" : ""}
                        onClick={() =>
                          void run(
                            "feed.update",
                            {
                              id: item.id,
                              field: "isFavorite",
                              value: !item.isFavorite,
                            },
                            item.isFavorite ? "已取消收藏。" : "已收藏这条情报。",
                          )
                        }
                      >
                        <Bookmark size={13} />
                        {item.isFavorite ? "已收藏" : "收藏"}
                      </button>
                      <button
                        onClick={() =>
                          void run(
                            "feed.update",
                            {
                              id: item.id,
                              field: "readStatus",
                              value:
                                item.readStatus === "稍后读" ? "已读" : "稍后读",
                            },
                            item.readStatus === "稍后读"
                              ? "已经标为已读。"
                              : "已经放入稍后读。",
                          )
                        }
                      >
                        <Clock3 size={13} />
                        {item.readStatus}
                      </button>
                      <button
                        onClick={() => {
                          const startAt = window.prompt(
                            "安排什么时候阅读？",
                            localDateTime(
                              new Date(Date.now() + 24 * 60 * 60 * 1000),
                            ),
                          );
                          if (startAt) {
                            void run(
                              "feed.toTask",
                              { id: item.id, startAt: new Date(startAt).toISOString() },
                              "阅读任务已经加入时间表。",
                              true,
                            );
                          }
                        }}
                      >
                        <Plus size={13} /> 创建任务
                      </button>
                      <button
                        className="quiet-danger"
                        onClick={() =>
                          void run(
                            "feed.update",
                            {
                              id: item.id,
                              field: "isIgnored",
                              value: true,
                            },
                            "以后不再展示这条情报。",
                          )
                        }
                      >
                        忽略
                      </button>
                    </div>
                  </footer>
                </article>
              ))
            ) : (
              <div className="intelligence-empty">
                <Globe2 size={25} />
                <h3>还没有符合条件的情报</h3>
                <p>添加官方来源或保存一个网页，情报中心会从真实来源开始积累。</p>
                <button onClick={() => setTab("news")}>添加第一条信息</button>
              </div>
            )}
          </section>
        </>
      )}

      {tab === "research" && (
        <div className="research-layout">
          <section className="research-main">
            <header className="section-title-row">
              <div>
                <span className="eyebrow">RESEARCH RADAR</span>
                <h2>论文评价信号分开展示</h2>
              </div>
              <p>热度不等于质量，基准提升也不自动等于研究贡献。</p>
            </header>
            <div className="paper-list">
              {relevantPapers.length ? (
                relevantPapers.map((paper) => (
                  <article className="paper-card" key={paper.id}>
                    <header>
                      <div>
                        <span>{paper.venue || "会议/期刊待补充"}</span>
                        <span>{dateLabel(paper.publishedAt)}</span>
                      </div>
                      <em>{paper.relevance}% 相关</em>
                    </header>
                    <h3>{paper.title}</h3>
                    <p className="paper-authors">
                      {paper.authors || "作者待补充"}
                      {paper.organization ? ` · ${paper.organization}` : ""}
                    </p>
                    <div className="paper-question">
                      <strong>研究问题</strong>
                      <p>{paper.researchQuestion || "尚未拆解研究问题。"}</p>
                    </div>
                    <div className="paper-question">
                      <strong>核心创新</strong>
                      <p>{paper.innovation || "尚未填写创新与方法判断。"}</p>
                    </div>
                    <div className="paper-signals">
                      <span>
                        <small>公开审稿</small>
                        <strong>{paper.signal?.reviewScore || "未公开"}</strong>
                      </span>
                      <span>
                        <small>录用状态</small>
                        <strong>
                          {paper.signal?.acceptanceStatus || "未公开"}
                        </strong>
                      </span>
                      <span>
                        <small>会议等级</small>
                        <strong>{paper.signal?.venueLevel || "待判断"}</strong>
                      </span>
                      <span>
                        <small>引用</small>
                        <strong>{paper.signal?.citations || 0}</strong>
                      </span>
                      <span>
                        <small>可复现性</small>
                        <strong>{paper.reproducibility}</strong>
                      </span>
                    </div>
                    <div className="paper-resources">
                      <span className={paper.signal?.codeAvailable ? "yes" : ""}>
                        代码 {paper.signal?.codeAvailable ? "可用" : "未发现"}
                      </span>
                      <span className={paper.signal?.modelAvailable ? "yes" : ""}>
                        模型 {paper.signal?.modelAvailable ? "可用" : "未发现"}
                      </span>
                      <span className={paper.signal?.dataAvailable ? "yes" : ""}>
                        数据 {paper.signal?.dataAvailable ? "可用" : "未发现"}
                      </span>
                    </div>
                    <footer>
                      <select
                        value={paper.readingStatus}
                        onChange={(event) =>
                          void run(
                            "paper.updateStatus",
                            { id: paper.id, status: event.target.value },
                            `论文状态已更新为“${event.target.value}”。`,
                          )
                        }
                      >
                        {paperStatuses.map((status) => (
                          <option key={status}>{status}</option>
                        ))}
                      </select>
                      <div>
                        {paper.paperUrl && (
                          <a
                            href={paper.paperUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            论文 <ExternalLink size={12} />
                          </a>
                        )}
                        {paper.codeUrl && (
                          <a
                            href={paper.codeUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            代码 <ExternalLink size={12} />
                          </a>
                        )}
                        <button
                          onClick={() => {
                            const startAt = window.prompt(
                              "安排什么时候精读？",
                              localDateTime(
                                new Date(Date.now() + 24 * 60 * 60 * 1000),
                              ),
                          );
                          if (startAt) {
                            void run(
                              "paper.toTask",
                              { id: paper.id, startAt: new Date(startAt).toISOString(), mode: "精读" },
                                "论文精读已经加入时间表。",
                                true,
                              );
                            }
                          }}
                        >
                          <BookOpenCheck size={13} /> 安排精读
                        </button>
                        <button
                          onClick={() => {
                            const startAt = window.prompt(
                              "安排什么时候开始复现？",
                              localDateTime(
                                new Date(Date.now() + 48 * 60 * 60 * 1000),
                              ),
                          );
                          if (startAt) {
                            void run(
                              "paper.toTask",
                              { id: paper.id, startAt: new Date(startAt).toISOString(), mode: "复现实验" },
                                "复现实验已经加入时间表。",
                                true,
                              );
                            }
                          }}
                        >
                          <FlaskConical size={13} /> 创建复现
                        </button>
                      </div>
                    </footer>
                  </article>
                ))
              ) : (
                <div className="intelligence-empty">
                  <FlaskConical size={25} />
                  <h3>研究雷达还没有论文</h3>
                  <p>先保存与你课题相关的论文，逐步补充信号和阅读状态。</p>
                </div>
              )}
            </div>
          </section>

          <aside className="research-capture">
            <span className="eyebrow">ADD PAPER</span>
            <h2>添加研究论文</h2>
            <p>只在确有公开数据时填写审稿分数，不用模糊“AI高分”。</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                await run(
                  "paper.create",
                  Object.fromEntries(new FormData(form).entries()),
                  "论文已经加入研究雷达。",
                );
                form.reset();
              }}
            >
              <label className="wide">
                <span>论文标题</span>
                <input name="title" required />
              </label>
              <label>
                <span>作者</span>
                <input name="authors" />
              </label>
              <label>
                <span>会议或期刊</span>
                <input name="venue" />
              </label>
              <label>
                <span>论文地址</span>
                <input name="paperUrl" type="url" />
              </label>
              <label>
                <span>代码地址</span>
                <input name="codeUrl" type="url" />
              </label>
              <label>
                <span>相关性</span>
                <input
                  name="relevance"
                  type="number"
                  min="0"
                  max="100"
                  defaultValue="80"
                />
              </label>
              <label>
                <span>录用状态</span>
                <select name="acceptanceStatus">
                  <option>未公开</option>
                  <option>在审</option>
                  <option>已录用</option>
                  <option>被拒</option>
                </select>
              </label>
              <label>
                <span>审稿分数</span>
                <input name="reviewScore" placeholder="未公开或公开分数" />
              </label>
              <label>
                <span>可复现性</span>
                <select name="reproducibility">
                  <option>待判断</option>
                  <option>较完整</option>
                  <option>部分可复现</option>
                  <option>难以复现</option>
                </select>
              </label>
              <label className="wide">
                <span>研究问题</span>
                <textarea name="researchQuestion" rows={2} />
              </label>
              <label className="wide">
                <span>核心创新</span>
                <textarea name="innovation" rows={3} />
              </label>
              <label className="wide">
                <span>关联项目</span>
                <input name="relatedProject" placeholder="论文、科研项目或课题" />
              </label>
              <button
                className="primary-button wide"
                disabled={busy === "paper.create"}
              >
                {busy === "paper.create" ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Plus size={15} />
                )}
                加入研究雷达
              </button>
            </form>
          </aside>
        </div>
      )}

      {tab === "inbox" && (
        <section className="intelligence-inbox">
          <header className="section-title-row">
            <div>
              <span className="eyebrow">INTELLIGENCE INBOX</span>
              <h2>暂时没时间看，也不会失去来源</h2>
            </div>
            <span>
              {data.feedItems.filter((item) => item.readStatus === "稍后读").length}
              条稍后读
            </span>
          </header>
          <div className="inbox-feed-grid">
            {data.feedItems
              .filter(
                (item) =>
                  item.readStatus === "稍后读" ||
                  item.readStatus === "准备阅读" ||
                  item.isFavorite,
              )
              .map((item) => (
                <article key={item.id}>
                  <span>{item.category}</span>
                  <h3>{item.title}</h3>
                  <p>{item.summary || "打开原始来源继续阅读。"}</p>
                  <footer>
                    <small>{item.sourceName || "来源待补充"}</small>
                    <button
                      onClick={() =>
                        void run(
                          "feed.update",
                          {
                            id: item.id,
                            field: "readStatus",
                            value: "已读",
                          },
                          "已经完成阅读。",
                        )
                      }
                    >
                      <Check size={13} /> 完成阅读
                    </button>
                  </footer>
                </article>
              ))}
          </div>
        </section>
      )}

      {tab === "subscriptions" && (
        <div className="subscription-layout">
          <section className="subscription-list">
            <header className="section-title-row">
              <div>
                <span className="eyebrow">SUBSCRIPTIONS</span>
                <h2>关注主题、作者、机构与目标单位</h2>
                <p>
                  国内外基础来源已自动配置；这里用于增加你常看的官网、机构或 RSS。
                </p>
              </div>
              <button
                onClick={() =>
                  void run(
                    "source.refreshAll",
                    {},
                    "全部信息来源已经重新读取。",
                  )
                }
                disabled={busy === "source.refreshAll"}
              >
                <RefreshCw
                  className={busy === "source.refreshAll" ? "spin" : ""}
                  size={14}
                />
                读取全部来源
              </button>
            </header>
            <div className="feed-source-list">
              {data.sources.map((source) => (
                <article key={source.id}>
                  <span className={source.authority.includes("官方") ? "official" : ""}>
                    {source.authority}
                  </span>
                  <div>
                    <strong>{source.name}</strong>
                    <p>{source.kind} · {source.checkFrequency}</p>
                    <small>
                      上次读取：{dateLabel(source.lastCheckedAt)}
                    </small>
                    <small
                      className={
                        source.health?.consecutiveFailures
                          ? "source-health issue"
                          : "source-health healthy"
                      }
                    >
                      {source.health?.consecutiveFailures
                        ? `连续失败 ${source.health.consecutiveFailures} 次：${source.health.lastError}`
                        : source.health
                          ? `来源正常 · 本次 ${source.health.itemCount} 条，${source.health.imageCount} 条有图`
                          : "等待首次健康检查"}
                    </small>
                  </div>
                  <button
                    onClick={() =>
                      void run(
                        "source.check",
                        { id: source.id },
                        "信息来源已经读取，最新内容进入简报。",
                      )
                    }
                    disabled={busy === "source.check"}
                  >
                    <RefreshCw
                      className={busy === "source.check" ? "spin" : ""}
                      size={13}
                    />
                    立即读取
                  </button>
                </article>
              ))}
            </div>
            <div className="subscription-groups">
              {["研究", "新闻", "求职", "全部"].map((scope) => {
                const items = data.subscriptions.filter(
                  (item) => item.scope === scope,
                );
                if (!items.length) return null;
                return (
                  <div key={scope}>
                    <h3>{scope}</h3>
                    <div>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          className={item.enabled ? "active" : ""}
                          onClick={() =>
                            void run(
                              "subscription.toggle",
                              { id: item.id, enabled: !item.enabled },
                              item.enabled
                                ? "已经暂停这个订阅。"
                                : "已经恢复这个订阅。",
                            )
                          }
                        >
                          <span>{item.kind}</span>
                          <strong>{item.value}</strong>
                          <em>{item.priority}</em>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <aside className="subscription-form">
            <h2>新增订阅</h2>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                await run(
                  "subscription.create",
                  Object.fromEntries(new FormData(form).entries()),
                  "新的关注主题已经保存。",
                );
                form.reset();
              }}
            >
              <label>
                <span>订阅类型</span>
                <select name="kind">
                  <option>主题</option>
                  <option>关键词</option>
                  <option>作者</option>
                  <option>机构</option>
                  <option>会议期刊</option>
                  <option>数据集</option>
                  <option>模型</option>
                  <option>GitHub项目</option>
                  <option>银行</option>
                  <option>地区</option>
                </select>
              </label>
              <label>
                <span>关注内容</span>
                <input name="value" required />
              </label>
              <label>
                <span>用于</span>
                <select name="scope">
                  <option>研究</option>
                  <option>新闻</option>
                  <option>求职</option>
                  <option>全部</option>
                </select>
              </label>
              <label>
                <span>优先级</span>
                <select name="priority">
                  <option>重点</option>
                  <option>普通</option>
                  <option>低频</option>
                </select>
              </label>
              <button className="primary-button">
                <Plus size={15} /> 保存订阅
              </button>
            </form>
            <div className="subscription-principle">
              <ShieldCheck size={18} />
              <p>
                已读内容不会重复推送；同一事件应优先保留官方和一手来源，不使用不透明真实性分数。
              </p>
            </div>
            <div className="source-form-divider">
              <Globe2 size={16} />
              <div>
                <strong>添加真实信息来源</strong>
                <p>保存官网、实验室、会议或招聘公告页，再按来源能力定期读取。</p>
              </div>
            </div>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                await run(
                  "source.create",
                  Object.fromEntries(new FormData(form).entries()),
                  "信息来源已经加入订阅中心。",
                );
                form.reset();
              }}
            >
              <label>
                <span>来源名称</span>
                <input name="name" placeholder="银行官方招聘 / 实验室主页" required />
              </label>
              <label>
                <span>网址</span>
                <input name="url" type="url" required />
              </label>
              <label>
                <span>来源类型</span>
                <select name="kind">
                  <option>新闻</option>
                  <option>研究</option>
                  <option>就业与招聘</option>
                  <option>教育政策</option>
                  <option>项目更新</option>
                </select>
              </label>
              <label>
                <span>来源级别</span>
                <select name="authority">
                  <option>官方来源</option>
                  <option>一手来源</option>
                  <option>专业媒体</option>
                  <option>普通媒体</option>
                </select>
              </label>
              <label>
                <span>读取频率</span>
                <select name="checkFrequency">
                  <option>每 4 小时</option>
                  <option>每日</option>
                  <option>每周</option>
                  <option>手动</option>
                </select>
              </label>
              <button className="primary-button">
                <Plus size={14} /> 添加来源
              </button>
            </form>
          </aside>
        </div>
      )}

      {tab === "report" && (
        <section className="intelligence-report">
          <header className="section-title-row">
            <div>
              <span className="eyebrow">WEEKLY INTELLIGENCE</span>
              <h2>本周真正值得继续跟进什么</h2>
            </div>
            <div>
              <button
                onClick={() =>
                  void run(
                    "brief.generate",
                    { kind: "情报日报" },
                    "今日情报简报已经生成。",
                  )
                }
                disabled={busy === "brief.generate"}
              >
                <RefreshCw
                  className={busy === "brief.generate" ? "spin" : ""}
                  size={14}
                />
                生成日报
              </button>
              <button
                className="primary-button"
                onClick={() =>
                  void run(
                    "brief.generate",
                    { kind: "情报周报" },
                    "本周情报报告已经生成。",
                  )
                }
                disabled={busy === "brief.generate"}
              >
                <Sparkles size={14} /> 生成周报
              </button>
            </div>
          </header>
          <div className="report-list">
            {data.briefs.length ? (
              data.briefs.map((brief) => (
                <article key={brief.id}>
                  <header>
                    <span>{brief.kind}</span>
                    <time>{dateLabel(brief.createdAt)}</time>
                  </header>
                  <h3>{brief.title}</h3>
                  <MarkdownContent content={brief.content} />
                  <footer>
                    <span>生成方式：{brief.generatedBy}</span>
                    <span>
                      所有结论都应回到来源、论文卡片和岗位页面复核
                    </span>
                  </footer>
                </article>
              ))
            ) : (
              <div className="intelligence-empty">
                <Layers3 size={25} />
                <h3>还没有情报报告</h3>
                <p>积累新闻、论文和岗位后生成第一份周报。</p>
              </div>
            )}
          </div>
        </section>
      )}
    </section>
  );
}
