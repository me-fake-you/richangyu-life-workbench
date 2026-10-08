"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, Check, LoaderCircle, MessageCircle, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import type { CalendarChoice, PlanPreview } from "../lib/assistant-plan";
import { MarkdownContent } from "./markdown-content";
import { ChatCaptureCard } from "./chat-capture-card";
import { needsFinancialApproval } from "../lib/assistant-capture-types";
import type { CapturePreview } from "../lib/assistant-capture-types";

type Message = { role: "user" | "assistant"; text: string };
type Status = { ready: boolean; model: string; schedules: CalendarChoice[] };
function timeLabel(value: string) {
  return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

async function fetchAssistantStatus(days: number, signal?: AbortSignal): Promise<Status> {
  const response = await fetch(`/api/assistant?days=${days}`, { cache: "no-store", signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "日程读取失败。");
  return body as Status;
}

export function WorkbenchAssistant() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "plan">("chat");
  const [prompt, setPrompt] = useState("");
  const [days, setDays] = useState(7);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [includeCalendar, setIncludeCalendar] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const [saved, setSaved] = useState(false);
  const [capture, setCapture] = useState<CapturePreview | null>(null);
  const [captureSaved, setCaptureSaved] = useState(false);
  const [captureSource, setCaptureSource] = useState("");
  const [allowFinancial, setAllowFinancial] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const chatEnd = useRef<HTMLDivElement | null>(null);
  const statusRequest = useRef(0);
  const financialApprovalNeeded = mode === "chat" && (capture?.requiresFinancialConsent || needsFinancialApproval(prompt + captureSource + messages.slice(-4).map((item) => item.text).join(" ")));

  // Event handlers can refresh the status without coupling the effect to setters.
  async function load(signal?: AbortSignal) {
    const revision = ++statusRequest.current;
    try {
      const body = await fetchAssistantStatus(days, signal);
      if (signal?.aborted || revision !== statusRequest.current) return;
      setStatus(body);
    } catch (reason) {
      if (!signal?.aborted && revision === statusRequest.current) {
        setError(reason instanceof Error ? reason.message : "日程读取失败。");
      }
    } finally {
      if (!signal?.aborted && revision === statusRequest.current) setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    const revision = ++statusRequest.current;
    // Only settled network callbacks update the interface.
    void fetchAssistantStatus(days, request.signal)
      .then((body) => {
        if (!request.signal.aborted && revision === statusRequest.current) setStatus(body);
      })
      .catch((reason: unknown) => {
        if (!request.signal.aborted && revision === statusRequest.current) {
          setError(reason instanceof Error ? reason.message : "日程读取失败。");
        }
      })
      .finally(() => {
        if (!request.signal.aborted && revision === statusRequest.current) setLoading(false);
      });
    return () => request.abort();
  }, [open, days]);

  useEffect(() => {
    if (!open) return;
    const oldOverflow = document.body.style.overflow;
    const returnFocus = trigger.current;
    document.body.style.overflow = "hidden";
    input.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')];
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", onKey);
      returnFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  useEffect(() => { chatEnd.current?.scrollIntoView({ block: "nearest" }); }, [messages, busy]);
  useEffect(() => () => controller.current?.abort(), []);

  async function request(body: Record<string, unknown>, signal?: AbortSignal) {
    const response = await fetch("/api/assistant", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal,
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 429) setCooldown(Math.max(10, Number(result.retryAfter) || 60));
      throw new Error(result.error || "请求未完成，请稍后重试。");
    }
    return result;
  }

  async function submit() {
    const question = prompt.trim();
    if (!question || busy || cooldown || loading || !status?.ready) return;
    if (mode === "chat" && financialApprovalNeeded && !allowFinancial) {
      setError("这条包含金额或收款信息。请先勾选本次金额识别授权，再发送；尚未发送给 AI。");
      return;
    }
    setBusy(mode); setError("");
    const task = new AbortController(); controller.current = task;
    try {
      const result = await request({ action: mode, prompt: question, days, includeCalendar,
        scheduleIds: includeCalendar ? selected : [], history: messages.slice(-4), captureSource, allowFinancial,
        previousDraft: preview && !saved ? JSON.stringify({ summary: preview.summary, operations: preview.operations.map(({ action, id, title, startAt, endAt, category }) => ({ action, id, title, startAt, endAt, category })) }) : "",
      }, task.signal);
      if (mode === "chat") {
        setMessages((values) => [...values, { role: "user", text: question }, { role: "assistant", text: result.answer }]);
        setCapture(result.capture || null); setCaptureSaved(false); setCaptureSource(result.pendingSource || "");
        setPrompt("");
      } else {
        setPreview(result.preview as PlanPreview); setSaved(false);
      }
    } catch (reason) {
      setError(task.signal.aborted ? "本次生成已取消，输入已保留。尚未保存日程。" : reason instanceof Error ? reason.message : "请求未完成。");
    } finally { controller.current = null; setBusy(""); }
  }

  async function apply() {
    if (!preview || saved || busy || preview.warnings.length) return;
    if (Date.now() > preview.expiresAt) { setError("草稿已过期，请重新生成后再确认。"); return; }
    setBusy("apply"); setError("");
    try {
      await request({ action: "apply", confirmed: true, payload: preview.payload, signature: preview.signature });
      setSaved(true);
      setLoading(true);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存失败。"); }
    finally { setBusy(""); }
  }

  async function confirmCapture() {
    if (!capture || captureSaved || busy || capture.warnings.length) return;
    if (Date.now() > capture.expiresAt) { setError("待确认内容已过期，请重新发送或补充。"); return; }
    if (capture.requiresFinancialConsent && !allowFinancial) { setError("请先确认本次金额处理授权。"); return; }
    setBusy("capture.apply"); setError("");
    try {
      await request({ action: "capture.apply", confirmed: true, payload: capture.payload, signature: capture.signature, allowFinancial });
      setCaptureSaved(true); setCaptureSource(""); setPrompt("");
      setLoading(true);
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存没有完成。"); }
    finally { setBusy(""); }
  }

  const examples = mode === "chat"
    ? ["今天下午两点去兼职，做两个小时", "今天兼职已结束，很累，帮我记下来", "今天家教兼职收入120元已经到账，帮我记账", "今天想读论文、运动，帮我安排时间"]
    : ["明天安排 90 分钟论文阅读、30 分钟运动，留出休息时间", "把我勾选的单次日程调整到明天下午，不要重叠"];
  return <>
    <button className="wa-trigger" ref={trigger} onClick={() => { setLoading(true); setError(""); setStatus(null); setOpen(true); }} aria-haspopup="dialog" aria-expanded={open} aria-controls="workbench-assistant">
      <Sparkles size={19} /><span>AI 助手</span>
    </button>
    {open && <div className="wa-backdrop" onClick={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="wa-panel" ref={panel} id="workbench-assistant" role="dialog" aria-modal="true" aria-labelledby="wa-title">
        <header className="wa-header">
          <div className="wa-emblem"><Sparkles size={24} /></div>
          <div><h2 id="wa-title">你的日常 AI 助手</h2><p>说说今天，记录和安排都从这里开始</p></div>
          <button className="wa-close" onClick={() => setOpen(false)} aria-label="关闭 AI 助手"><X size={22} /></button>
        </header>
        <nav className="wa-tabs" aria-label="助手功能">
          <button aria-pressed={mode === "chat"} disabled={Boolean(busy)} className={mode === "chat" ? "active" : ""} onClick={() => { setMode("chat"); setError(""); }}><MessageCircle size={18} />聊天记事</button>
          <button aria-pressed={mode === "plan"} disabled={Boolean(busy)} className={mode === "plan" ? "active" : ""} onClick={() => { setMode("plan"); setError(""); }}><CalendarDays size={18} />安排计划</button>
          <span className="wa-free">Groq · 免费方案</span>
        </nav>
        <div className="wa-body">
          <div className="wa-settings">
            <label className="wa-range">计划范围<select value={days} disabled={Boolean(busy)} onChange={(event) => { const nextDays = Number(event.target.value); if (nextDays === days) return; setLoading(true); setError(""); setStatus(null); setDays(nextDays); setSelected([]); }}><option value={1}>未来 1 天</option><option value={7}>未来 7 天</option><option value={30}>未来 30 天</option></select></label>
            <label className="wa-consent"><input type="checkbox" checked={includeCalendar} disabled={Boolean(busy)} onChange={(event) => setIncludeCalendar(event.target.checked)} /><span>结合我勾选的日程</span></label>
          </div>
          <p className="wa-privacy"><ShieldCheck size={15} />{includeCalendar ? "只发送勾选日程的标题、分类和时间给 Groq，最多 8 项。" : "默认不发送站内记录给 Groq，仅发送本次问题与最近对话。"}</p>
          {financialApprovalNeeded && <label className="wa-capture-consent"><input type="checkbox" checked={allowFinancial} disabled={Boolean(busy)} onChange={(event) => setAllowFinancial(event.target.checked)} /><span>本次同意发送输入的金额与兼职信息给 Groq 识别</span></label>}
          {includeCalendar && <div className="wa-calendar">
            {loading ? <p>正在读取你的日程...</p> : status?.schedules.length ? status.schedules.map((item) => <label key={`${item.id}-${item.startAt}`}>
              <input type="checkbox" disabled={Boolean(busy) || (!selected.includes(item.id) && selected.length >= 8)} checked={selected.includes(item.id)} onChange={(event) => setSelected((values) => event.target.checked ? [...new Set([...values, item.id])] : values.filter((value) => value !== item.id))} />
              <span><strong>{item.title}</strong><small>{timeLabel(item.startAt)} · {item.editable ? "可调整单次日程" : "仅作为参考，不改打卡与重复规则"}</small></span>
            </label>) : <p>这个时间范围还没有日程，可以直接让助手制定新计划。</p>}
          </div>}
          {mode === "chat" && <div className="wa-conversation" aria-live="polite">
            {!messages.length && <div className="wa-empty"><MessageCircle size={30} /><h3>说一句话，就能记事和安排</h3><p>已经做完的事整理为记录，准备去做的事整理为日程；缺信息先补问，你确认后才保存。也可以问学习与生活问题，但没有实时联网搜索。</p></div>}
            {messages.map((message, index) => <article className={`wa-message ${message.role}`} key={index}><span>{message.role === "user" ? "你" : "日常助手"}</span>{message.role === "assistant" ? <MarkdownContent content={message.text} /> : <p>{message.text}</p>}</article>)}
            <div ref={chatEnd} />
          </div>}
          {mode === "chat" && capture && <ChatCaptureCard capture={captureSaved ? { ...capture, title: "已保存到工作台" } : capture} busy={Boolean(busy)} saved={captureSaved} allowFinancial={allowFinancial} onConfirm={() => void confirmCapture()} onDiscard={() => { setCapture(null); setCaptureSaved(false); setCaptureSource(""); setError(""); }} onEdit={() => { setPrompt(""); input.current?.focus(); }} />}
          {mode === "plan" && !preview && <div className="wa-empty"><CalendarDays size={30} /><h3>先看草稿，再写进日程</h3><p>告诉我目标、可用时间与需要休息的间隔。最多安排 8 项，所有时间按北京时间显示。</p></div>}
          {mode === "plan" && preview && <section className="wa-preview" aria-labelledby="wa-preview-title">
            <header><h3 id="wa-preview-title">{saved ? "已保存到工作台" : "计划草稿，尚未保存"}</h3><span>{preview.operations.length} 项</span></header>
            <p>{preview.summary}</p>
            <div className="wa-plan-list">{preview.operations.map((item, index) => <article key={item.id}>
              <span className="wa-step">{index + 1}</span><div><span className="wa-action">{item.action === "create" ? "新增" : "调整"} · {item.category}</span><h4>{item.title}</h4>
                {item.before && <p className="wa-before">原安排：{item.before.title} · {timeLabel(item.before.start_at)}</p>}
                <p>{timeLabel(item.startAt)} 至 {timeLabel(item.endAt)}</p>{item.note && <p className="wa-note">{item.note}</p>}
              </div>
            </article>)}</div>
            {preview.warnings.length > 0 && <div className="wa-warning" role="alert"><strong>先解决时间冲突</strong>{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}<p>在下方说明怎么调整，再点击“修改草稿”。</p></div>}
            {!saved ? <div className="wa-confirm"><p>草稿 15 分钟内有效。确认后会写入真实日程；不会删除你的记录或更改重复规则。</p><button disabled={Boolean(busy) || Boolean(preview.warnings.length)} onClick={() => void apply()}>{busy === "apply" ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}确认保存到日程</button><button className="wa-discard" disabled={Boolean(busy)} onClick={() => { setPreview(null); setError(""); }}>放弃草稿</button></div>
              : <div className="wa-success" role="status"><Check size={18} />日程已保存。<button onClick={() => window.location.reload()}>刷新工作台查看</button><button onClick={() => { setPreview(null); setSaved(false); setPrompt(""); }}>安排下一份计划</button></div>}
          </section>}
          {loading && <p className="wa-thinking" role="status"><LoaderCircle className="spin" size={17} />正在读取连接状态与日程...</p>}
          {error && <div className="wa-error" role="alert"><p>{error}</p><button disabled={Boolean(busy)} onClick={() => { setError(""); setLoading(true); setStatus(null); void load(); }}>重新读取连接状态</button></div>}
          {status && !status.ready && <p className="wa-warning">免费 AI 尚未配置完成，现在不会发起模型调用。</p>}
          {busy && <p className="wa-thinking" role="status"><LoaderCircle className="spin" size={17} />{busy === "apply" || busy === "capture.apply" ? "正在保存，请勿重复提交..." : "免费 AI 正在思考，请稍等..."}{busy !== "apply" && busy !== "capture.apply" && <button onClick={() => controller.current?.abort()}>取消生成</button>}</p>}
          {!messages.length && !preview && <div className="wa-examples">{examples.map((example) => <button key={example} disabled={Boolean(busy)} onClick={() => { setPrompt(example); input.current?.focus(); }}>{example}</button>)}</div>}
        </div>
        <form className="wa-composer" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <label className="wa-input-label" htmlFor="wa-prompt">{mode === "chat" ? captureSource ? "补充一下，或告诉我怎么修改" : "今天发生了什么，或想做什么？" : preview && !saved ? "想怎样修改这份草稿？" : "你想安排什么？"}</label>
          <div className="wa-input-row"><textarea ref={input} id="wa-prompt" value={prompt} maxLength={800} rows={3} disabled={Boolean(busy)} placeholder={mode === "chat" ? "例如：今天做完兼职很累，帮我记下来；或下午两点去兼职两小时" : "例如：明天上午读论文，晚上运动，别排得太满"} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void submit(); } }} />
            <button type="submit" disabled={!prompt.trim() || Boolean(busy) || Boolean(cooldown) || loading || !status?.ready}>{busy && busy !== "apply" ? <LoaderCircle className="spin" size={20} /> : <Send size={20} />}<span>{cooldown ? `${cooldown} 秒后重试` : mode === "chat" ? "发送" : preview && !saved ? "修改草稿" : "生成草稿"}</span></button>
          </div><footer><span>{prompt.length}/800 · Shift + Enter 换行</span><span>本次对话不保存为历史 · 免费额度有限</span></footer>
        </form>
      </section>
    </div>}
  </>;
}
