"use client";

import {
  BookmarkPlus,
  CalendarDays,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  LoaderCircle,
  Paperclip,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type SearchType =
  | "event"
  | "task"
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

export type GlobalSearchResult = {
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

type SearchPayload = {
  results: GlobalSearchResult[];
  total: number;
  counts: Record<string, number>;
  parsed: SearchRequest;
  appliedFilters: string[];
  privacyNote: string;
  error?: string;
};

type SearchRequest = {
  q?: string;
  text?: string;
  types?: SearchType[];
  dateFrom?: string;
  dateTo?: string;
  kind?: string;
  mood?: string;
  person?: string;
  place?: string;
  project?: string;
  tags?: string[];
  hasPhoto?: boolean;
  hasAttachment?: boolean;
  sort?: "relevance" | "newest" | "oldest";
};

type SavedSearch = {
  id: string;
  name: string;
  query: SearchRequest;
  createdAt: string;
};

const typeOptions: Array<{ id: SearchType; label: string }> = [
  { id: "event", label: "生活记录" },
  { id: "task", label: "任务" },
  { id: "schedule", label: "时间表" },
  { id: "inbox", label: "收件箱" },
  { id: "table", label: "表格" },
  { id: "project", label: "项目" },
  { id: "summary", label: "总结" },
  { id: "meal", label: "饮食" },
  { id: "finance", label: "财务" },
  { id: "sideHustle", label: "兼职" },
  { id: "intelligence", label: "情报" },
  { id: "paper", label: "论文" },
  { id: "job", label: "求职" },
];

const examples = [
  "2026年7月 + 教学 + 有照片",
  "去年暑假我去了哪些地方",
  "最近三个月读了什么书",
  "找出我第一次上课时的记录",
];

function dateText(value: string | null) {
  if (!value) return "时间未设置";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "时间未设置"
    : parsed.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

function emptyRequest(): SearchRequest {
  return {
    q: "",
    types: [],
    dateFrom: "",
    dateTo: "",
    kind: "",
    mood: "",
    person: "",
    place: "",
    project: "",
    tags: [],
    hasPhoto: false,
    hasAttachment: false,
    sort: "relevance",
  };
}

export function GlobalSearchPanel({
  query,
  onQueryChange,
  onClose,
  onOpenResult,
  onNotice,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onOpenResult: (result: GlobalSearchResult) => void;
  onNotice: (notice: string) => void;
}) {
  const [filters, setFilters] = useState<SearchRequest>(() => emptyRequest());
  const [payload, setPayload] = useState<SearchPayload | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const request = useMemo(
    () => ({
      ...filters,
      q: query,
      timezoneOffset: new Date().getTimezoneOffset(),
      limit: 60,
    }),
    [filters, query],
  );
  const hasExplicitFilters = Boolean(
    filters.types?.length ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.kind ||
      filters.mood ||
      filters.person ||
      filters.place ||
      filters.project ||
      filters.tags?.length ||
      filters.hasPhoto ||
      filters.hasAttachment ||
      filters.sort !== "relevance",
  );
  const shouldSearch = Boolean(query.trim() || hasExplicitFilters);

  async function loadSavedSearches() {
    try {
      const response = await fetch("/api/search", { cache: "no-store" });
      const body = (await response.json()) as {
        savedSearches?: SavedSearch[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error);
      setSavedSearches(body.savedSearches ?? []);
    } catch {
      setSavedSearches([]);
    }
  }

  useEffect(() => {
    inputRef.current?.focus();
    const loadTimer = window.setTimeout(() => void loadSavedSearches(), 0);
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(loadTimer);
      window.removeEventListener("keydown", closeOnEscape);
    };
    // The panel owns this one-time setup while it is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shouldSearch) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        const body = (await response.json()) as SearchPayload;
        if (!response.ok) throw new Error(body.error);
        setPayload(body);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPayload({
          results: [],
          total: 0,
          counts: {},
          parsed: request,
          appliedFilters: [],
          privacyNote: "",
          error: error instanceof Error ? error.message : "搜索暂时不可用。",
        });
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [request, shouldSearch]);

  function patchFilters(patch: Partial<SearchRequest>) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function toggleType(type: SearchType) {
    const current = filters.types ?? [];
    patchFilters({
      types: current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type],
    });
  }

  function applySaved(saved: SavedSearch) {
    const next = { ...emptyRequest(), ...saved.query };
    onQueryChange(String(next.q ?? next.text ?? ""));
    setFilters({ ...next, q: undefined, text: undefined });
    setSaveMode(false);
    onNotice(`已载入“${saved.name}”。`);
  }

  async function saveCurrent() {
    const name = saveName.trim() || query.trim();
    if (!name) {
      onNotice("先输入搜索内容，再保存这个视图。");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/search", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          query: {
            ...filters,
            q: query,
          },
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error);
      await loadSavedSearches();
      setSaveMode(false);
      setSaveName("");
      onNotice("这个组合搜索已经保存，并会在手机与电脑间同步。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "保存搜索失败。");
    } finally {
      setSaving(false);
    }
  }

  async function removeSaved(id: string) {
    try {
      const response = await fetch(`/api/search?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error);
      }
      setSavedSearches((items) => items.filter((item) => item.id !== id));
      onNotice("已删除保存的搜索。");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "删除搜索失败。");
    }
  }

  function clearAll() {
    onQueryChange("");
    setFilters(emptyRequest());
    setPayload(null);
    setLoading(false);
  }

  return (
    <div className="search-panel-layer">
      <button
        className="search-panel-backdrop"
        onClick={onClose}
        aria-label="关闭全局搜索"
      />
      <section
        className="global-search-panel"
        role="dialog"
        aria-modal="true"
        aria-label="全局搜索"
      >
        <header className="global-search-heading">
          <div className="global-search-input">
            {loading ? (
              <LoaderCircle className="spin" size={21} />
            ) : (
              <Search size={21} />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索生活，或直接说：去年暑假我去了哪些地方？"
              aria-label="搜索全部生活数据"
            />
            {(query || hasExplicitFilters) && (
              <button onClick={clearAll} aria-label="清空全部搜索条件">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            className="search-panel-close"
            onClick={onClose}
            aria-label="关闭搜索"
          >
            <X size={19} />
          </button>
        </header>

        <div className="global-search-toolbar">
          <button
            className={advanced ? "active" : ""}
            onClick={() => setAdvanced((value) => !value)}
          >
            <SlidersHorizontal size={15} />
            组合筛选
            {hasExplicitFilters && <em>已启用</em>}
          </button>
          <button
            onClick={() => {
              setSaveMode((value) => !value);
              if (!saveName) setSaveName(query.trim());
            }}
            disabled={!shouldSearch}
          >
            <BookmarkPlus size={15} />
            保存搜索
          </button>
          <span>
            <ShieldCheck size={14} />
            私密内容默认隔离
          </span>
        </div>

        {saveMode && (
          <div className="search-save-row">
            <input
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
              placeholder="给这个搜索起一个名字"
            />
            <button onClick={() => void saveCurrent()} disabled={saving}>
              {saving ? "保存中…" : "确认保存"}
            </button>
          </div>
        )}

        {advanced && (
          <div className="search-filter-panel">
            <div className="search-filter-block full">
              <label>内容范围</label>
              <div className="search-type-chips">
                {typeOptions.map((option) => (
                  <button
                    key={option.id}
                    className={
                      filters.types?.includes(option.id) ? "active" : ""
                    }
                    onClick={() => toggleType(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <label>
              开始日期
              <input
                type="date"
                value={filters.dateFrom ?? ""}
                onChange={(event) =>
                  patchFilters({ dateFrom: event.target.value })
                }
              />
            </label>
            <label>
              结束日期
              <input
                type="date"
                value={filters.dateTo ?? ""}
                onChange={(event) =>
                  patchFilters({ dateTo: event.target.value })
                }
              />
            </label>
            <label>
              分类
              <input
                value={filters.kind ?? ""}
                onChange={(event) => patchFilters({ kind: event.target.value })}
                placeholder="例如：教学、旅行"
              />
            </label>
            <label>
              心情
              <select
                value={filters.mood ?? ""}
                onChange={(event) => patchFilters({ mood: event.target.value })}
              >
                <option value="">全部心情</option>
                {["开心", "平静", "疲惫", "焦虑", "低落", "充实", "兴奋"].map(
                  (mood) => (
                    <option key={mood}>{mood}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              人物
              <input
                value={filters.person ?? ""}
                onChange={(event) =>
                  patchFilters({ person: event.target.value })
                }
                placeholder="同行人、同事、朋友"
              />
            </label>
            <label>
              地点
              <input
                value={filters.place ?? ""}
                onChange={(event) =>
                  patchFilters({ place: event.target.value })
                }
                placeholder="城市、学校、景点"
              />
            </label>
            <label>
              项目
              <input
                value={filters.project ?? ""}
                onChange={(event) =>
                  patchFilters({ project: event.target.value })
                }
                placeholder="论文、旅行、备考"
              />
            </label>
            <label>
              标签
              <input
                value={(filters.tags ?? []).join("，")}
                onChange={(event) =>
                  patchFilters({
                    tags: event.target.value
                      .split(/[，,]/)
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="多个标签用逗号分隔"
              />
            </label>
            <label>
              排序
              <select
                value={filters.sort ?? "relevance"}
                onChange={(event) =>
                  patchFilters({
                    sort: event.target.value as SearchRequest["sort"],
                  })
                }
              >
                <option value="relevance">最相关</option>
                <option value="newest">最新优先</option>
                <option value="oldest">最早优先</option>
              </select>
            </label>
            <div className="search-checks">
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(filters.hasPhoto)}
                  onChange={(event) =>
                    patchFilters({ hasPhoto: event.target.checked })
                  }
                />
                <ImageIcon size={14} /> 只看有照片
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={Boolean(filters.hasAttachment)}
                  onChange={(event) =>
                    patchFilters({ hasAttachment: event.target.checked })
                  }
                />
                <Paperclip size={14} /> 只看有附件
              </label>
            </div>
          </div>
        )}

        {payload?.appliedFilters.length ? (
          <div className="search-applied-filters">
            <Sparkles size={14} />
            <span>已理解：</span>
            {payload.appliedFilters.map((filter) => (
              <em key={filter}>{filter}</em>
            ))}
          </div>
        ) : null}

        <div className="global-search-body">
          <aside className="saved-search-column">
            <div>
              <strong>保存的搜索</strong>
              <small>自动同步到所有设备</small>
            </div>
            {savedSearches.length ? (
              savedSearches.map((saved) => (
                <article key={saved.id}>
                  <button onClick={() => applySaved(saved)}>
                    <Clock3 size={14} />
                    <span>{saved.name}</span>
                  </button>
                  <button
                    onClick={() => void removeSaved(saved.id)}
                    aria-label={`删除${saved.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </article>
              ))
            ) : (
              <p>还没有保存搜索。常用筛选可以保存在这里。</p>
            )}
          </aside>

          <main className="search-result-column">
            {!shouldSearch ? (
              <div className="search-empty-state">
                <span>
                  <Search size={24} />
                </span>
                <h3>一句话找回生活里的任何片段</h3>
                <p>可以写关键词，也可以直接使用时间、人物、地点和照片条件。</p>
                <div>
                  {examples.map((example) => (
                    <button key={example} onClick={() => onQueryChange(example)}>
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            ) : loading && !payload ? (
              <div className="search-loading">
                <LoaderCircle className="spin" size={22} />
                正在连接你的生活线索…
              </div>
            ) : payload?.error ? (
              <div className="search-loading">{payload.error}</div>
            ) : payload?.results.length ? (
              <>
                <div className="search-result-summary">
                  <span>
                    找到 <strong>{payload.total}</strong> 条结果
                  </span>
                  <small>{payload.privacyNote}</small>
                </div>
                <div className="search-result-list">
                  {payload.results.map((result) => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => onOpenResult(result)}
                    >
                      <span className={`search-type-dot ${result.type}`}>
                        {result.typeLabel}
                      </span>
                      <div>
                        <header>
                          <strong>{result.title}</strong>
                          <time>
                            <CalendarDays size={12} />
                            {dateText(result.occurredAt)}
                          </time>
                        </header>
                        <p>{result.snippet}</p>
                        <footer>
                          <span>来源：{result.source}</span>
                          {result.meta && <span>{result.meta}</span>}
                          {result.matchedFields.map((field) => (
                            <em key={field}>命中{field}</em>
                          ))}
                          {result.hasAttachment && (
                            <em>
                              <Paperclip size={11} /> 有附件
                            </em>
                          )}
                        </footer>
                      </div>
                      <ChevronRight size={16} />
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="search-empty-state compact">
                <span>
                  <Search size={22} />
                </span>
                <h3>暂时没有匹配结果</h3>
                <p>试试减少一个条件，或者换成人物、地点、标签和时间范围。</p>
              </div>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}
