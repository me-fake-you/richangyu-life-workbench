"use client";

import {
  BookOpen,
  CalendarDays,
  Camera,
  ChevronRight,
  Clock3,
  Download,
  Heart,
  History,
  Landmark,
  LoaderCircle,
  MapPin,
  Sparkles,
  Target,
  TrendingUp,
  WalletCards,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

type CountItem = { label: string; count: number };
type ReviewPayload = {
  range: {
    startDate: string;
    endDate: string;
    startAt: string;
    endAt: string;
  };
  years: number[];
  overview: {
    eventCount: number;
    activeDays: number;
    photoCount: number;
    placeCount: number;
    personCount: number;
    averageEnergy: number;
    plannedMinutes: number;
    actualMinutes: number;
    scheduleCount: number;
    completedSchedules: number;
    completionRate: number;
    mealCount: number;
    averageCalories: number;
    workMinutes: number;
    expectedIncome: number;
    workCost: number;
    totalIncome: number;
    totalExpense: number;
    net: number;
    includeFinance: boolean;
    milestoneCount: number;
  };
  narrative: string;
  domains: CountItem[];
  moods: CountItem[];
  places: CountItem[];
  people: CountItem[];
  projects: CountItem[];
  weekdays: CountItem[];
  trend: Array<{
    month: string;
    events: number;
    photos: number;
    plannedMinutes: number;
    actualMinutes: number;
    income: number;
    expense: number;
    workMinutes: number;
    calories: number;
  }>;
  chapters: Array<{
    month: string;
    title: string;
    eventCount: number;
    photoCount: number;
    topKind: string;
    topMood: string;
    topPlace: string;
    sourceIds: string[];
  }>;
  highlights: Array<{
    id: string;
    sourceType: "event" | "milestone";
    title: string;
    note: string;
    kind: string;
    happenedAt: string;
    photoCount: number;
  }>;
  onThisDay: Array<{
    id: string;
    title: string;
    kind: string;
    mood: string;
    place: string;
    happenedAt: string;
    photoCount: number;
  }>;
  summaries: Array<{
    id: string;
    kind: string;
    periodStart: string;
    periodEnd: string;
    title: string;
    content: string;
    sourceIds: string[];
    generatedBy: string;
    createdAt: string;
  }>;
  goals: Array<{
    id: string;
    title: string;
    kind: string;
    status: string;
    progress: number;
    targetAt: string | null;
  }>;
  sourceIds: string[];
  error?: string;
};

function localInputDate(value: Date) {
  const offset = value.getTimezoneOffset() * 60000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 10);
}

function yearRange(year = new Date().getFullYear()) {
  return { startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function monthRange() {
  const now = new Date();
  return {
    startDate: localInputDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: localInputDate(
      new Date(now.getFullYear(), now.getMonth() + 1, 0),
    ),
  };
}

function quarterRange() {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  return {
    startDate: localInputDate(new Date(now.getFullYear(), quarter * 3, 1)),
    endDate: localInputDate(new Date(now.getFullYear(), quarter * 3 + 3, 0)),
  };
}

function dateText(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "日期待确认"
    : parsed.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function hours(minutes: number) {
  return `${Math.round((minutes / 60) * 10) / 10}h`;
}

function currency(value: number) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function LongTermReviewCenter({
  onNotice,
  onExport,
  onOpenSource,
}: {
  onNotice: (notice: string) => void;
  onExport: () => void;
  onOpenSource: (id: string) => void;
}) {
  const [range, setRange] = useState(yearRange);
  const [includeFinance, setIncludeFinance] = useState(false);
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [busy, setBusy] = useState("");
  const [selectedSummary, setSelectedSummary] = useState<
    ReviewPayload["summaries"][number] | null
  >(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({
      startDate: range.startDate,
      endDate: range.endDate,
      timezoneOffset: String(new Date().getTimezoneOffset()),
      includeFinance: String(includeFinance),
    });
    const busyTimer = window.setTimeout(() => setBusy("load"), 0);
    void fetch(`/api/review?${params}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as ReviewPayload;
        if (!response.ok) throw new Error(payload.error || "读取长期回顾失败。");
        if (!cancelled) setData(payload);
      })
      .catch((error) => {
        if (!cancelled) {
          onNotice(error instanceof Error ? error.message : "读取长期回顾失败。");
        }
      })
      .finally(() => {
        if (!cancelled) setBusy("");
      });
    return () => {
      cancelled = true;
      window.clearTimeout(busyTimer);
    };
  }, [includeFinance, onNotice, range.endDate, range.startDate, refreshKey]);

  const maxTrendValue = useMemo(
    () =>
      Math.max(
        1,
        ...(data?.trend ?? []).map((item) =>
          Math.max(item.events, item.actualMinutes / 60),
        ),
      ),
    [data],
  );
  const maxDomain = data?.domains[0]?.count || 1;
  const maxMood = data?.moods[0]?.count || 1;

  function preset(value: "month" | "quarter" | "year" | "all") {
    if (value === "month") setRange(monthRange());
    if (value === "quarter") setRange(quarterRange());
    if (value === "year") setRange(yearRange());
    if (value === "all") {
      const years = data?.years ?? [new Date().getFullYear()];
      setRange({
        startDate: `${Math.min(...years)}-01-01`,
        endDate: `${Math.max(...years)}-12-31`,
      });
    }
  }

  async function generateSummary(kind: string) {
    setBusy("generate");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          kind,
          startDate: range.startDate,
          endDate: range.endDate,
          timezoneOffset: new Date().getTimezoneOffset(),
          includeFinance,
        }),
      });
      const result = (await response.json()) as {
        content?: string;
        generatedBy?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error || "生成回顾失败。");
      setRefreshKey((value) => value + 1);
      onNotice(
        result.generatedBy === "local"
          ? "已生成可回溯的本地回顾。AI 超时或不可用时不会阻塞保存。"
          : "AI 长期回顾已生成，并保存了全部来源记录。",
      );
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "生成回顾失败。");
    } finally {
      setBusy("");
    }
  }

  async function deleteSummary(id: string) {
    if (!window.confirm("删除这份总结档案？原始生活记录不会被删除。")) return;
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error || "删除总结失败。");
      }
      setSelectedSummary(null);
      setRefreshKey((value) => value + 1);
      onNotice("总结档案已删除，原始记录仍然保留。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除总结失败。");
    }
  }

  if (!data) {
    return (
      <section className="long-review-loading">
        <LoaderCircle className="spin" size={25} />
        <span>正在重读这段生活…</span>
      </section>
    );
  }

  return (
    <section className="long-review">
      <div className="long-review-heading">
        <div>
          <span className="eyebrow">LONG-TERM REFLECTION</span>
          <h1>长期回顾中心</h1>
          <p>从真实记录、计划与实际、照片和里程碑中理解一段生活。</p>
        </div>
        <div className="long-review-actions">
          <button className="secondary-button" onClick={onExport}>
            <Download size={16} /> 备份来源数据
          </button>
          <button
            className="primary-button"
            onClick={() => void generateSummary("长期回顾")}
            disabled={busy === "generate"}
          >
            {busy === "generate" ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Sparkles size={16} />
            )}
            生成正式回顾
          </button>
        </div>
      </div>

      <div className="review-range-bar">
        <div>
          {[
            ["month", "本月"],
            ["quarter", "本季度"],
            ["year", "本年"],
            ["all", "全部人生记录"],
          ].map(([value, label]) => (
            <button key={value} onClick={() => preset(value as "month" | "quarter" | "year" | "all")}>
              {label}
            </button>
          ))}
        </div>
        <label>
          <CalendarDays size={14} />
          <input
            type="date"
            value={range.startDate}
            onChange={(event) =>
              setRange((current) => ({
                ...current,
                startDate: event.target.value,
              }))
            }
          />
          <span>至</span>
          <input
            type="date"
            value={range.endDate}
            onChange={(event) =>
              setRange((current) => ({
                ...current,
                endDate: event.target.value,
              }))
            }
          />
        </label>
        <label className="review-finance-toggle">
          <input
            type="checkbox"
            checked={includeFinance}
            onChange={(event) => setIncludeFinance(event.target.checked)}
          />
          <span>在本次回顾中显示金额</span>
        </label>
      </div>

      {busy === "load" && (
        <div className="review-refreshing">
          <LoaderCircle className="spin" size={14} /> 正在刷新范围…
        </div>
      )}

      <article className="long-review-hero">
        <div>
          <span>
            {range.startDate} — {range.endDate}
          </span>
          <h2>
            {data.overview.eventCount
              ? `这段时间，你保存了 ${data.overview.eventCount} 个真实生活片段`
              : "这段时间还没有记录，但回顾可以从今天开始"}
          </h2>
          <p>{data.narrative}</p>
        </div>
        <div className="long-review-seal">
          <History size={20} />
          <strong>{data.overview.activeDays}</strong>
          <span>个有记录的日子</span>
        </div>
      </article>

      <div className="long-review-metrics">
        {[
          [BookOpen, data.overview.eventCount, "生活记录"],
          [Camera, data.overview.photoCount, "照片"],
          [MapPin, data.overview.placeCount, "地点"],
          [Target, `${data.overview.completionRate}%`, "计划完成率"],
          [Clock3, hours(data.overview.actualMinutes), "实际投入"],
          [Landmark, data.overview.milestoneCount, "人生里程碑"],
        ].map(([Icon, value, label]) => {
          const MetricIcon = Icon as typeof BookOpen;
          return (
            <article key={String(label)}>
              <MetricIcon size={17} />
              <strong>{String(value)}</strong>
              <span>{String(label)}</span>
            </article>
          );
        })}
      </div>

      <div className="review-comparison-grid">
        <section className="review-trend-panel">
          <header>
            <div>
              <span className="eyebrow">LIFE RHYTHM</span>
              <h2>生活节奏</h2>
            </div>
            <TrendingUp size={20} />
          </header>
          {data.trend.length ? (
            <div className="review-trend-chart">
              {data.trend.map((item) => (
                <div key={item.month}>
                  <div className="review-trend-bars">
                    <i
                      title={`${item.events} 条记录`}
                      style={{ height: `${(item.events / maxTrendValue) * 100}%` }}
                    />
                    <b
                      title={`${hours(item.actualMinutes)} 实际投入`}
                      style={{
                        height: `${(item.actualMinutes / 60 / maxTrendValue) * 100}%`,
                      }}
                    />
                  </div>
                  <span>{item.month.slice(5)}月</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="review-empty-copy">这个范围还没有形成月度趋势。</p>
          )}
          <footer>
            <span><i />生活记录</span>
            <span><b />实际投入小时</span>
          </footer>
        </section>

        <section className="plan-actual-panel">
          <header>
            <div>
              <span className="eyebrow">PLAN VS ACTUAL</span>
              <h2>计划与实际</h2>
            </div>
            <Clock3 size={20} />
          </header>
          <div className="plan-actual-ring">
            <div
              style={{
                background: `conic-gradient(var(--purple) ${data.overview.completionRate * 3.6}deg, var(--purple-soft) 0deg)`,
              }}
            >
              <span>
                <strong>{data.overview.completionRate}%</strong>
                <small>完成率</small>
              </span>
            </div>
            <dl>
              <div>
                <dt>计划投入</dt>
                <dd>{hours(data.overview.plannedMinutes)}</dd>
              </div>
              <div>
                <dt>实际投入</dt>
                <dd>{hours(data.overview.actualMinutes)}</dd>
              </div>
              <div>
                <dt>完成事项</dt>
                <dd>
                  {data.overview.completedSchedules}/
                  {data.overview.scheduleCount}
                </dd>
              </div>
            </dl>
          </div>
          <p>
            {data.overview.actualMinutes > data.overview.plannedMinutes
              ? `实际投入比计划多 ${hours(
                  data.overview.actualMinutes -
                    data.overview.plannedMinutes,
                )}，可以检查是否低估了任务时长。`
              : `实际投入比计划少 ${hours(
                  data.overview.plannedMinutes -
                    data.overview.actualMinutes,
                )}，未完成安排可以重新规划。`}
          </p>
        </section>
      </div>

      <div className="review-insight-grid">
        <RankPanel
          title="生活重心"
          icon={<Target size={18} />}
          data={data.domains}
          maximum={maxDomain}
        />
        <RankPanel
          title="心情天气"
          icon={<Heart size={18} />}
          data={data.moods}
          maximum={maxMood}
        />
        <RankPanel
          title="地点足迹"
          icon={<MapPin size={18} />}
          data={data.places}
          maximum={data.places[0]?.count || 1}
        />
      </div>

      {includeFinance && (
        <section className="review-finance-strip">
          <header>
            <WalletCards size={19} />
            <div>
              <strong>本次回顾的财务视角</strong>
              <span>金额仅在你主动开启后显示，不进入默认生活回顾。</span>
            </div>
          </header>
          <div>
            <span><small>收入</small><strong>{currency(data.overview.totalIncome)}</strong></span>
            <span><small>支出</small><strong>{currency(data.overview.totalExpense)}</strong></span>
            <span><small>结余</small><strong>{currency(data.overview.net)}</strong></span>
            <span><small>兼职应赚</small><strong>{currency(data.overview.expectedIncome)}</strong></span>
            <span><small>兼职成本</small><strong>{currency(data.overview.workCost)}</strong></span>
          </div>
        </section>
      )}

      <section className="life-chapters-section">
        <div className="long-review-section-heading">
          <div>
            <span className="eyebrow">LIFE CHAPTERS</span>
            <h2>生活章节</h2>
          </div>
          <p>每个月不是一串统计，而是一段可以重新命名的成长章节。</p>
        </div>
        <div className="life-chapter-list">
          {data.chapters.map((chapter, index) => (
            <article key={chapter.month}>
              <span className="chapter-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <small>{chapter.month}</small>
                <h3>{chapter.title}</h3>
                <p>
                  {chapter.eventCount} 条记录 · {chapter.photoCount} 张照片 ·
                  心情 {chapter.topMood}
                  {chapter.topPlace ? ` · 足迹 ${chapter.topPlace}` : ""}
                </p>
              </div>
              {chapter.sourceIds[0] && (
                <button onClick={() => onOpenSource(chapter.sourceIds[0])}>
                  查看来源 <ChevronRight size={14} />
                </button>
              )}
            </article>
          ))}
          {!data.chapters.length && (
            <p className="review-empty-copy">开始记录后，生活章节会按月形成。</p>
          )}
        </div>
      </section>

      <section className="review-highlight-section">
        <div className="long-review-section-heading">
          <div>
            <span className="eyebrow">SOURCE-BACKED HIGHLIGHTS</span>
            <h2>高光与来源</h2>
          </div>
          <p>每个高光都能点回原始记录，不让总结变成无依据的漂亮话。</p>
        </div>
        <div className="review-highlight-grid">
          {data.highlights.map((highlight, index) => (
            <button
              key={`${highlight.sourceType}-${highlight.id}`}
              onClick={() =>
                highlight.sourceType === "event" && onOpenSource(highlight.id)
              }
              disabled={highlight.sourceType !== "event"}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <small>
                  {dateText(highlight.happenedAt)} · {highlight.kind}
                </small>
                <strong>{highlight.title}</strong>
                <p>{highlight.note || `${highlight.photoCount} 张来源照片`}</p>
              </div>
              {highlight.sourceType === "event" && <ChevronRight size={16} />}
            </button>
          ))}
        </div>
      </section>

      {data.onThisDay.length > 0 && (
        <section className="review-on-this-day">
          <header>
            <History size={18} />
            <div>
              <span className="eyebrow">ON THIS DAY</span>
              <h2>往年今日</h2>
            </div>
          </header>
          <div>
            {data.onThisDay.map((memory) => (
              <button key={memory.id} onClick={() => onOpenSource(memory.id)}>
                <small>{dateText(memory.happenedAt)}</small>
                <strong>{memory.title}</strong>
                <span>
                  {[memory.kind, memory.place, memory.mood]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="review-library-section">
        <div className="long-review-section-heading">
          <div>
            <span className="eyebrow">REFLECTION LIBRARY</span>
            <h2>总结档案</h2>
          </div>
          <div className="review-generate-kinds">
            {["旅行总结", "学期总结", "备考总结", "科研项目总结"].map(
              (kind) => (
                <button key={kind} onClick={() => void generateSummary(kind)}>
                  <Sparkles size={13} /> {kind}
                </button>
              ),
            )}
          </div>
        </div>
        <div className="review-library-grid">
          {data.summaries.map((summary) => (
            <button key={summary.id} onClick={() => setSelectedSummary(summary)}>
              <span>{summary.kind}</span>
              <strong>{summary.title}</strong>
              <p>{summary.content.slice(0, 150)}</p>
              <small>
                {summary.sourceIds.length} 条来源 ·{" "}
                {summary.generatedBy === "local"
                  ? "本地整理"
                  : summary.generatedBy}
              </small>
            </button>
          ))}
          {!data.summaries.length && (
            <p className="review-empty-copy">
              生成一次正式回顾后，它会作为长期档案保存在这里。
            </p>
          )}
        </div>
      </section>

      {selectedSummary && (
        <div
          className="review-summary-backdrop"
          onMouseDown={() => setSelectedSummary(null)}
        >
          <article
            className="review-summary-detail"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <span>{selectedSummary.kind}</span>
                <h2>{selectedSummary.title}</h2>
              </div>
              <button onClick={() => setSelectedSummary(null)}>
                <X size={18} />
              </button>
            </header>
            <p>{selectedSummary.content}</p>
            <footer>
              <span>
                {dateText(selectedSummary.periodStart)} —{" "}
                {dateText(selectedSummary.periodEnd)}
              </span>
              <div>
                <strong>{selectedSummary.sourceIds.length} 条来源记录</strong>
                <button onClick={() => void deleteSummary(selectedSummary.id)}>
                  删除总结
                </button>
              </div>
            </footer>
          </article>
        </div>
      )}
    </section>
  );
}

function RankPanel({
  title,
  icon,
  data,
  maximum,
}: {
  title: string;
  icon: ReactNode;
  data: CountItem[];
  maximum: number;
}) {
  return (
    <section className="review-rank-panel">
      <header>
        <span>{icon}</span>
        <h3>{title}</h3>
      </header>
      {data.length ? (
        data.slice(0, 6).map((item) => (
          <div key={item.label}>
            <strong>{item.label}</strong>
            <i>
              <b style={{ width: `${(item.count / maximum) * 100}%` }} />
            </i>
            <span>{item.count}</span>
          </div>
        ))
      ) : (
        <p className="review-empty-copy">还没有足够的数据。</p>
      )}
    </section>
  );
}
