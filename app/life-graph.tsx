"use client";

import {
  Archive,
  BookOpen,
  BriefcaseBusiness,
  CalendarClock,
  Camera,
  ChevronRight,
  FolderKanban,
  MapPin,
  Network,
  Search,
  Tag,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";

type GraphEvent = {
  id: string;
  title: string;
  content: string;
  kind: string;
  tags: string[];
  person: string;
  place: string;
  project: string;
  happenedAt: string;
  photos: Array<{ id: string }>;
};

type GraphSchedule = {
  id: string;
  title: string;
  category: string;
  person: string;
  place: string;
  project: string;
  startAt: string;
};

type EntityType = "人物" | "地点" | "项目" | "主题";

type Entity = {
  key: string;
  type: EntityType;
  label: string;
  eventIds: string[];
  scheduleIds: string[];
  photoCount: number;
  firstAt: string;
  lastAt: string;
};

const entityIcon = {
  人物: UserRound,
  地点: MapPin,
  项目: FolderKanban,
  主题: Tag,
};

function createKey(type: EntityType, label: string) {
  return `${type}:${label.trim().toLowerCase()}`;
}

function allPairs(event: GraphEvent) {
  return [
    ...(event.person ? [["人物", event.person] as const] : []),
    ...(event.place ? [["地点", event.place] as const] : []),
    ...(event.project ? [["项目", event.project] as const] : []),
    ...event.tags.map((tag) => ["主题", tag] as const),
    ...(event.kind ? [["主题", event.kind] as const] : []),
  ];
}

export function LifeGraph({
  events,
  schedules,
  onView,
}: {
  events: GraphEvent[];
  schedules: GraphSchedule[];
  onView: (view: string) => void;
}) {
  const [filter, setFilter] = useState<"全部" | EntityType>("全部");
  const [query, setQuery] = useState("");
  const entities = useMemo(() => {
    const map = new Map<string, Entity>();
    function ensure(type: EntityType, label: string, date: string) {
      const normalized = label.trim();
      if (!normalized) return null;
      const key = createKey(type, normalized);
      const current = map.get(key) ?? {
        key,
        type,
        label: normalized,
        eventIds: [],
        scheduleIds: [],
        photoCount: 0,
        firstAt: date,
        lastAt: date,
      };
      if (new Date(date) < new Date(current.firstAt)) current.firstAt = date;
      if (new Date(date) > new Date(current.lastAt)) current.lastAt = date;
      map.set(key, current);
      return current;
    }
    for (const event of events) {
      for (const [type, label] of allPairs(event)) {
        const entity = ensure(type, label, event.happenedAt);
        if (!entity) continue;
        entity.eventIds.push(event.id);
        entity.photoCount += event.photos.length;
      }
    }
    for (const schedule of schedules) {
      const pairs: Array<[EntityType, string]> = [
        ["人物", schedule.person],
        ["地点", schedule.place],
        ["项目", schedule.project],
        ["主题", schedule.category],
      ];
      for (const [type, label] of pairs) {
        const entity = ensure(type, label, schedule.startAt);
        if (entity) entity.scheduleIds.push(schedule.id);
      }
    }
    return [...map.values()].sort(
      (a, b) =>
        b.eventIds.length +
        b.scheduleIds.length -
        (a.eventIds.length + a.scheduleIds.length),
    );
  }, [events, schedules]);
  const visible = entities.filter(
    (entity) =>
      (filter === "全部" || entity.type === filter) &&
      entity.label.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const [selectedKey, setSelectedKey] = useState("");
  const selected =
    visible.find((entity) => entity.key === selectedKey) ??
    entities.find((entity) => entity.key === selectedKey) ??
    visible[0];
  const relatedEvents = selected
    ? events
        .filter((event) => selected.eventIds.includes(event.id))
        .sort(
          (a, b) =>
            new Date(b.happenedAt).getTime() - new Date(a.happenedAt).getTime(),
        )
    : [];
  const relatedSchedules = selected
    ? schedules
        .filter((item) => selected.scheduleIds.includes(item.id))
        .sort(
          (a, b) =>
            new Date(b.startAt).getTime() - new Date(a.startAt).getTime(),
        )
    : [];
  const neighborCounts = new Map<string, number>();
  for (const event of relatedEvents) {
    for (const [type, label] of allPairs(event)) {
      const key = createKey(type, label);
      if (key === selected?.key) continue;
      neighborCounts.set(key, (neighborCounts.get(key) ?? 0) + 1);
    }
  }
  const neighbors = [...neighborCounts.entries()]
    .map(([key, count]) => ({
      entity: entities.find((item) => item.key === key),
      count,
    }))
    .filter((item): item is { entity: Entity; count: number } => Boolean(item.entity))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  return (
    <section className="standard-page graph-page">
      <div className="page-intro">
        <div>
          <span className="eyebrow">LIFE GRAPH</span>
          <h1>看见人、地点、项目和经历之间的关系</h1>
          <p>图谱从生活记录和时间表的关联字段自动生成，不需要重复整理。</p>
        </div>
        <div className="graph-overview">
          <strong>{entities.length}</strong>
          <span>个生活节点</span>
        </div>
      </div>

      <div className="graph-toolbar">
        <div className="segmented-control">
          {(["全部", "人物", "地点", "项目", "主题"] as const).map((item) => (
            <button
              key={item}
              className={filter === item ? "active" : ""}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <label>
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索图谱节点"
          />
        </label>
      </div>

      {entities.length === 0 ? (
        <div className="graph-empty">
          <Network size={32} />
          <h2>关系网络会随着记录自然生长</h2>
          <p>记录生活时填写人物、地点、项目或标签，这里就会自动出现关联。</p>
          <button onClick={() => onView("timeline")}>去记录第一条关联</button>
        </div>
      ) : (
        <div className="graph-layout">
          <div className="graph-node-cloud">
            {visible.map((entity, index) => {
              const Icon = entityIcon[entity.type];
              const weight = Math.min(
                3,
                Math.ceil((entity.eventIds.length + entity.scheduleIds.length) / 3),
              );
              return (
                <button
                  key={entity.key}
                  className={`graph-node weight-${weight} ${
                    selected?.key === entity.key ? "active" : ""
                  } tone-${index % 5}`}
                  onClick={() => setSelectedKey(entity.key)}
                >
                  <Icon size={16 + weight * 2} />
                  <strong>{entity.label}</strong>
                  <span>{entity.type} · {entity.eventIds.length + entity.scheduleIds.length}</span>
                </button>
              );
            })}
          </div>

          {selected && (
            <aside className="graph-detail">
              <header>
                {(() => {
                  const Icon = entityIcon[selected.type];
                  return <Icon size={23} />;
                })()}
                <div>
                  <span>{selected.type}</span>
                  <h2>{selected.label}</h2>
                </div>
              </header>
              <div className="graph-stats">
                <span><strong>{selected.eventIds.length}</strong>条记录</span>
                <span><strong>{selected.scheduleIds.length}</strong>项日程</span>
                <span><strong>{selected.photoCount}</strong>张照片</span>
              </div>
              <p className="graph-time-range">
                从 {new Date(selected.firstAt).toLocaleDateString("zh-CN")} 到{" "}
                {new Date(selected.lastAt).toLocaleDateString("zh-CN")}
              </p>

              <div className="graph-neighbors">
                <h3>经常一起出现</h3>
                {neighbors.length ? (
                  <div>
                    {neighbors.map(({ entity, count }) => (
                      <button key={entity.key} onClick={() => setSelectedKey(entity.key)}>
                        {entity.label}<span>{count}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>继续记录后，会看到更多关系。</p>
                )}
              </div>

              <div className="graph-history">
                <h3>关联经历</h3>
                {[...relatedEvents.slice(0, 4).map((event) => ({
                  id: event.id,
                  title: event.title || event.content.slice(0, 40) || "生活记录",
                  date: event.happenedAt,
                  type: "记录",
                  icon: event.photos.length ? Camera : Archive,
                })), ...relatedSchedules.slice(0, 3).map((item) => ({
                  id: item.id,
                  title: item.title,
                  date: item.startAt,
                  type: "日程",
                  icon: CalendarClock,
                }))]
                  .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                  .slice(0, 5)
                  .map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => onView(item.type === "日程" ? "schedule" : "timeline")}
                    >
                      <item.icon size={15} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{new Date(item.date).toLocaleDateString("zh-CN")} · {item.type}</small>
                      </span>
                      <ChevronRight size={14} />
                    </button>
                  ))}
              </div>

              {selected.type === "项目" && (
                <button className="graph-topic-link" onClick={() => onView("topics")}>
                  <BriefcaseBusiness size={15} />
                  在专题空间中打开
                  <ChevronRight size={14} />
                </button>
              )}
              {selected.type === "主题" && (
                <button className="graph-topic-link" onClick={() => onView("tables")}>
                  <BookOpen size={15} />
                  用表格继续整理
                  <ChevronRight size={14} />
                </button>
              )}
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
