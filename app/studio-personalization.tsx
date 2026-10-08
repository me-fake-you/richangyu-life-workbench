"use client";

import {
  ArrowRight, Banknote, BookOpen, CalendarDays, Check, Focus,
  Inbox, Leaf, ListChecks, PencilLine, Settings2, Sparkles, X,
} from "lucide-react";
import { useEffect, useState } from "react";

const spaces = [
  { id: "tasks", title: "任务规划", note: "把事情拆成下一步", icon: ListChecks, tone: "fern" },
  { id: "schedule", title: "日程安排", note: "让重要的事有位置", icon: CalendarDays, tone: "ochre" },
  { id: "timeline", title: "生活记录", note: "回看日常的小确幸", icon: PencilLine, tone: "clay" },
  { id: "review", title: "回顾总结", note: "看见自己的进步", icon: Sparkles, tone: "blue" },
  { id: "topics", title: "专题空间", note: "收藏想深入的事情", icon: BookOpen, tone: "fern" },
  { id: "finance", title: "财务中心", note: "收入与支出心中有数", icon: Banknote, tone: "ochre" },
  { id: "inbox", title: "生活收件箱", note: "先收下，再慢慢整理", icon: Inbox, tone: "blue" },
  { id: "gallery", title: "照片回忆", note: "让美好留下画面", icon: Leaf, tone: "clay" },
  { id: "record", title: "记录此刻", note: "写下刚刚发生的事", icon: PencilLine, tone: "fern" },
];
const defaultSpaces = ["tasks", "schedule", "timeline", "review"];
const storageKey = "richangyu-home-shortcuts";

type Props = {
  compact: boolean;
  onDensity: () => void;
  onView: (view: string) => void;
  onRecord: () => void;
  onNotice: (message: string) => void;
};

export function StudioSpaces({ compact, onDensity, onView, onRecord, onNotice }: Props) {
  const [favorites, setFavorites] = useState(defaultSpaces);
  const [selection, setSelection] = useState(defaultSpaces);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw: unknown = JSON.parse(window.localStorage.getItem(storageKey) || "null");
        if (!Array.isArray(raw)) return;
        const valid = [...new Set(raw.filter((id): id is string => typeof id === "string" && spaces.some(space => space.id === id)))].slice(0, 4);
        if (valid.length) { setFavorites(valid); setSelection(valid); }
      } catch { /* Device preferences are optional. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function save() {
    if (!selection.length) return;
    setFavorites(selection);
    setEditing(false);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(selection));
      onNotice("常用入口已保存到此设备。");
    } catch {
      onNotice("入口已更新，但此设备暂时无法记住设置。");
    }
  }

  return <section className="studio-spaces" aria-label="我的常用入口">
    <header><div><span className="studio-section-kicker">让习惯，有自己的位置</span><h2>我的常用<span>最多 4 个入口</span></h2></div>
      <button className="studio-spaces-edit" aria-expanded={editing} aria-controls="studio-space-picker" onClick={() => {
        if (!editing) setSelection(favorites);
        setEditing(!editing);
      }}><Settings2 size={15} />{editing ? "收起" : "自选"}</button>
    </header>
    {editing ? <div className="studio-space-picker" id="studio-space-picker">
      <fieldset><legend>选出最常去的地方</legend><div>{spaces.map(space => {
        const checked = selection.includes(space.id);
        return <label key={space.id} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} disabled={!checked && selection.length >= 4} onChange={() => {
          setSelection(current => current.includes(space.id) ? current.filter(id => id !== space.id) : current.length < 4 ? [...current, space.id] : current);
        }} /><space.icon size={15} /><span>{space.title}</span>{checked && <Check size={13} />}</label>;
      })}</div></fieldset>
      <small>只保存在此设备，不改变云端数据。</small>
      <footer><button onClick={() => setSelection(defaultSpaces)}>恢复默认</button><button onClick={() => { setSelection(favorites); setEditing(false); }}><X size={13} />取消</button><button disabled={!selection.length} onClick={save}><Check size={13} />保存入口</button></footer>
    </div> : <div className="studio-space-grid">{favorites.map(id => {
      const space = spaces.find(item => item.id === id);
      if (!space) return null;
      return <button key={id} className={`studio-space-link ${space.tone}`} onClick={() => id === "record" ? onRecord() : onView(id)}>
        <span className="studio-space-icon"><space.icon size={19} /></span><strong>{space.title}</strong><small>{space.note}</small><ArrowRight size={14} className="studio-space-arrow" />
      </button>;
    })}</div>}
    <button className="studio-density-toggle" aria-pressed={compact} onClick={onDensity}><Focus size={15} /><span><strong>{compact ? "紧凑布局" : "舒展布局"}</strong><small>{compact ? "更少留白，更多内容" : "给日常留一点呼吸感"}</small></span><span className={`studio-density-switch ${compact ? "on" : ""}`} aria-hidden="true"><i /></span></button>
  </section>;
}

export function StudioIsland() {
  return <div className="studio-island" aria-hidden="true"><svg viewBox="0 0 240 210" fill="none">
    <circle cx="177" cy="53" r="29" fill="#d6ad6e" fillOpacity=".8" />
    <circle cx="177" cy="53" r="39" stroke="#cfa874" strokeOpacity=".35" strokeDasharray="2 7" />
    <path d="M27 159c33-14 54-7 86-15 36-9 56-6 98 10M12 178c46-11 81 8 126-4 25-6 47-6 78 3M40 196c49-6 99 9 151-3" stroke="#8a9b79" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="44" y="54" width="104" height="121" rx="11" transform="rotate(-12 44 54)" fill="#becab1" />
    <rect x="70" y="54" width="104" height="121" rx="11" transform="rotate(8 70 54)" fill="#fffcf4" stroke="#dcd8c6" />
    <path d="M88 83l54 8M84 107l34 5M81 126l60 8M78 148l48 6" stroke="#c0c9b1" strokeWidth="3" strokeLinecap="round" />
    <path d="M137 157c4-24 22-47 37-66M160 116c-2-13 5-23 18-30-1 13-7 22-18 30ZM151 132c-16-2-25-11-27-23 15 1 25 8 27 23ZM147 145c9-13 23-17 36-14-9 13-21 18-36 14Z" fill="#54785b" />
    <circle cx="40" cy="109" r="3" fill="#bb8265" /><path d="M214 113v10m-5-5h10" stroke="#af9870" strokeWidth="1.5" strokeLinecap="round" />
  </svg></div>;
}
