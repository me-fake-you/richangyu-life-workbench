"use client";

import { CalendarDays, Check, FileText, LoaderCircle, Wallet } from "lucide-react";
import type { CapturePreview } from "../lib/assistant-capture-types";

export function ChatCaptureCard({ capture, busy, saved, allowFinancial, onConfirm, onDiscard, onEdit }: {
  capture: CapturePreview; busy: boolean; saved: boolean; allowFinancial: boolean;
  onConfirm: () => void; onDiscard: () => void; onEdit: () => void;
}) {
  const Icon = capture.kind === "schedule" ? CalendarDays : capture.kind === "income" ? Wallet : FileText;
  return <section className="wa-preview wa-capture" aria-label="聊天识别待确认内容">
    <header><h3><Icon size={18} />{saved ? "已保存" : "待你确认，尚未保存"}</h3><span>{capture.kind === "schedule" ? "日程" : capture.kind === "income" ? "兼职收入" : "生活记录"}</span></header>
    <p>{capture.title}</p>
    <p className="wa-capture-destination">保存到：{capture.destination}</p>
    <dl className="wa-capture-fields">{capture.fields.map((field, index) => <div key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
    {capture.warnings.length > 0 && <div className="wa-warning" role="alert"><strong>需要先调整</strong>{capture.warnings.map((warning) => <p key={warning}>{warning}</p>)}<p>先补充怎么修改，不会强行保存冲突日程。</p></div>}
    {!saved ? <div className="wa-confirm"><p>15 分钟内有效。只有点击确认才写入工作台；重复点击同一份内容不会重复添加。</p>
      {capture.requiresFinancialConsent && !allowFinancial && <p className="wa-capture-approval">这份内容涉及金额，请勾选本次金额处理授权后再确认。</p>}
      <button disabled={busy || Boolean(capture.warnings.length) || (capture.requiresFinancialConsent && !allowFinancial)} onClick={onConfirm}>{busy ? <LoaderCircle size={18} className="spin" /> : <Check size={18} />}确认添加到工作台</button>
      <button className="wa-discard" disabled={busy} onClick={onEdit}>补充或修改</button>
      <button className="wa-discard" disabled={busy} onClick={onDiscard}>不保存</button>
    </div> : <div className="wa-success" role="status"><Check size={18} />已写入{capture.destination}。<button onClick={() => window.location.reload()}>刷新工作台查看</button><button onClick={onDiscard}>继续聊天</button></div>}
  </section>;
}
