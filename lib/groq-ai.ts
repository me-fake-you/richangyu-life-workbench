import { env } from "cloudflare:workers";

function setting(name: string) {
  const value = (env as unknown as Record<string, unknown>)[name];
  if (typeof value === "string" && value.trim()) return value.trim();
  return typeof process !== "undefined" ? process.env[name]?.trim() || "" : "";
}

export function groqConfigured() {
  return Boolean(setting("GROQ_API_KEY"));
}

export function groqModel() {
  return setting("GROQ_MODEL") || "openai/gpt-oss-120b";
}

export class GroqError extends Error {
  constructor(message: string, public status = 503, public retryAfter = 0) {
    super(message);
    this.name = "GroqError";
  }
}

export async function generateGroqText({
  system, prompt, signal, maxTokens = 1400, json = false,
}: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  maxTokens?: number;
  json?: boolean;
}) {
  const key = setting("GROQ_API_KEY");
  if (!key) throw new GroqError("免费 AI 尚未连接，请联系工作台管理员配置。", 503);
  if (system.length + prompt.length > 6200) {
    throw new GroqError("本次内容超过免费模式的单次输入预算，请缩短问题或减少记录范围。", 413);
  }
  const base = new URL(setting("GROQ_BASE_URL") || "https://api.groq.com/openai/v1");
  if (base.protocol !== "https:" || base.hostname !== "api.groq.com" ||
      base.pathname.replace(/\/$/, "") !== "/openai/v1" || base.username || base.password) {
    throw new GroqError("免费 AI 的服务地址配置有误。", 503);
  }
  const model = groqModel();
  let response: Response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(75_000)]) : AbortSignal.timeout(75_000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        temperature: 0.25,
        max_completion_tokens: Math.min(2300, Math.max(400, maxTokens)),
        ...(model.startsWith("openai/gpt-oss-") ? { reasoning_effort: "low", include_reasoning: false } : {}),
        ...(json ? { response_format: { type: "json_object" } } : {}),
        stream: false,
      }),
    });
  } catch {
    if (signal?.aborted) throw new GroqError("这次请求已取消，尚未保存任何日程。", 499);
    throw new GroqError("免费 AI 暂时连接不上或响应超时。内容已保留，请稍后手动重试。", 504);
  }
  if (!response.ok) {
    if (response.status === 429) {
      const raw = response.headers.get("retry-after");
      const seconds = raw && /^\d+(\.\d+)?$/.test(raw)
        ? Number(raw) : raw ? Math.ceil((Date.parse(raw) - Date.now()) / 1000) : 60;
      throw new GroqError("Groq 免费额度或请求频率达到限制，请稍后再试。本工作台不会自动切换付费模型。", 429,
        Number.isFinite(seconds) ? Math.min(86400, Math.max(10, seconds)) : 60);
    }
    if (response.status === 401 || response.status === 403) {
      throw new GroqError("免费 AI 的连接凭据失效，请联系管理员更新。", 503);
    }
    throw new GroqError(response.status === 400 || response.status === 413
      ? "AI 无法处理这次输入，请缩短内容后重试。" : "免费 AI 服务暂时不可用，请稍后重试。", 503);
  }
  const payload = await response.json() as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
  };
  const choice = payload.choices?.[0];
  if (choice?.finish_reason === "length" && json) {
    throw new GroqError("计划草稿超出本次输出预算，请减少安排项数后重试。", 422);
  }
  const text = choice?.message?.content?.trim();
  if (!text) throw new GroqError("AI 本次没有返回可用结果，请稍后重试。", 503);
  return { text, provider: "groq" as const, model };
}

async function signingKey() {
  const secret = setting("GROQ_API_KEY");
  if (!secret) throw new GroqError("免费 AI 尚未连接。", 503);
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signAssistantDraft(payload: string) {
  const bytes = new TextEncoder().encode(`workbench-plan-v1:${payload}`);
  const result = new Uint8Array(await crypto.subtle.sign("HMAC", await signingKey(), bytes));
  return Array.from(result, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function verifyAssistantDraft(payload: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, (value) => parseInt(value, 16));
  return crypto.subtle.verify("HMAC", await signingKey(), bytes,
    new TextEncoder().encode(`workbench-plan-v1:${payload}`));
}
