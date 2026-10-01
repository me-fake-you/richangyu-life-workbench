import { env } from "cloudflare:workers";
import { generateGroqText, groqConfigured } from "./groq-ai";

type ProviderResult = {
  provider: "openai" | "nvidia" | "groq";
  model: string;
  text: string;
};

type MealItemEstimate = {
  name: string;
  portion: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type MealEstimate = {
  provider: "openai" | "nvidia" | "local";
  model: string;
  summary: string;
  confidence: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  items: MealItemEstimate[];
};

export type PhotoVisionAnalysis = {
  provider: "openai" | "nvidia";
  model: string;
  title: string;
  caption: string;
  tags: string[];
  scene: string;
  suggestedPlace: string;
  containsSensitiveInfo: boolean;
};

function setting(name: string) {
  const bindings = env as unknown as Record<string, unknown>;
  const fromBinding = bindings[name];
  if (typeof fromBinding === "string" && fromBinding.trim()) {
    return fromBinding.trim();
  }
  if (typeof process !== "undefined") {
    const fromProcess = process.env[name];
    if (fromProcess?.trim()) return fromProcess.trim();
  }
  return "";
}

function nvidiaTextApiKey() {
  return setting("NVIDIA_TEXT_API_KEY") || setting("NVIDIA_API_KEY");
}

function nvidiaVisionApiKey() {
  return setting("NVIDIA_VISION_API_KEY") || setting("NVIDIA_API_KEY");
}

export function configuredAiProvider(capability: "vision"): "openai" | "nvidia" | "local";
export function configuredAiProvider(capability?: "text"): "openai" | "nvidia" | "groq" | "local";
export function configuredAiProvider(
  capability: "text" | "vision" = "text",
) {
  const preferred = setting("AI_PROVIDER").toLowerCase();
  if (preferred === "groq") {
    // Free text mode must not silently call another, potentially paid provider.
    if (capability === "vision") return "local" as const;
    return groqConfigured() ? "groq" as const : "local" as const;
  }
  const nvidiaApiKey =
    capability === "vision" ? nvidiaVisionApiKey() : nvidiaTextApiKey();
  if (
    (preferred === "openai" || !preferred) &&
    setting("OPENAI_API_KEY")
  ) {
    return "openai" as const;
  }
  if (
    (preferred === "nvidia" || !preferred || preferred === "openai") &&
    nvidiaApiKey
  ) {
    return "nvidia" as const;
  }
  if (setting("OPENAI_API_KEY")) return "openai" as const;
  if (nvidiaApiKey) return "nvidia" as const;
  return "local" as const;
}

function extractOpenAIText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  return output
    .flatMap((item) => {
      const record = item as Record<string, unknown>;
      return Array.isArray(record.content) ? record.content : [];
    })
    .map((part) => {
      const record = part as Record<string, unknown>;
      return typeof record.text === "string" ? record.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function extractNvidiaText(payload: Record<string, unknown>) {
  const choices = Array.isArray(payload.choices) ? payload.choices : [];
  const first = (choices[0] ?? {}) as Record<string, unknown>;
  const message = (first.message ?? {}) as Record<string, unknown>;
  return typeof message.content === "string" ? message.content : "";
}

export async function generateProviderText({
  system,
  prompt,
  signal,
  maxTokens = 1800,
}: {
  system: string;
  prompt: string;
  signal?: AbortSignal;
  maxTokens?: number;
}): Promise<ProviderResult | null> {
  const provider = configuredAiProvider();
  if (provider === "local") return null;
  if (provider === "groq") {
    return generateGroqText({ system, prompt, signal, maxTokens });
  }

  if (provider === "openai") {
    const model = setting("OPENAI_MODEL") || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal,
      headers: {
        authorization: `Bearer ${setting("OPENAI_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        instructions: system,
        input: prompt,
        max_output_tokens: maxTokens,
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        String(
          (payload.error as Record<string, unknown> | undefined)?.message ??
            "OpenAI 智能分析暂时不可用。",
        ),
      );
    }
    return { provider, model, text: extractOpenAIText(payload) };
  }

  const model = setting("NVIDIA_MODEL") || "z-ai/glm-5.2";
  const baseUrl =
    setting("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      authorization: `Bearer ${nvidiaTextApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      temperature: 0.25,
      max_tokens: maxTokens,
      stream: false,
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      String(
        (payload.error as Record<string, unknown> | undefined)?.message ??
          "NVIDIA 智能分析暂时不可用。",
      ),
    );
  }
  return { provider, model, text: extractNvidiaText(payload) };
}

function parseJsonObject(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可解析的营养结果。");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}

function normalizeMealEstimate(
  payload: Record<string, unknown>,
  provider: "openai" | "nvidia",
  model: string,
): MealEstimate {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const items = rawItems.slice(0, 12).map((raw) => {
    const item = raw as Record<string, unknown>;
    return {
      name: String(item.name ?? "未识别食物").slice(0, 80),
      portion: String(item.portion ?? "份量待确认").slice(0, 80),
      calories: Math.max(0, Number(item.calories) || 0),
      proteinG: Math.max(0, Number(item.proteinG ?? item.protein_g) || 0),
      carbsG: Math.max(0, Number(item.carbsG ?? item.carbs_g) || 0),
      fatG: Math.max(0, Number(item.fatG ?? item.fat_g) || 0),
    };
  });
  const sum = (field: keyof Pick<MealItemEstimate, "calories" | "proteinG" | "carbsG" | "fatG">) =>
    items.reduce((total, item) => total + item[field], 0);
  return {
    provider,
    model,
    summary: String(payload.summary ?? "已根据照片估算，请核对菜品和份量。").slice(
      0,
      1000,
    ),
    confidence: Math.min(1, Math.max(0, Number(payload.confidence) || 0.55)),
    calories: Math.max(0, Number(payload.calories) || sum("calories")),
    proteinG: Math.max(0, Number(payload.proteinG ?? payload.protein_g) || sum("proteinG")),
    carbsG: Math.max(0, Number(payload.carbsG ?? payload.carbs_g) || sum("carbsG")),
    fatG: Math.max(0, Number(payload.fatG ?? payload.fat_g) || sum("fatG")),
    items,
  };
}

export async function analyzeMealWithVision({
  bytes,
  contentType,
  note,
}: {
  bytes: ArrayBuffer;
  contentType: string;
  note: string;
}): Promise<MealEstimate | null> {
  const provider = configuredAiProvider("vision");
  if (provider === "local") return null;
  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;
  const instruction = [
    "你是一名谨慎的饮食记录助手。识别照片中可见的食物和大致份量，估算热量与三大营养素。",
    "只返回 JSON 对象，不要 Markdown。字段必须是：summary, confidence, calories, proteinG, carbsG, fatG, items。",
    "items 是数组，每项字段：name, portion, calories, proteinG, carbsG, fatG。",
    "不要把估算表达成医学结论；看不清时降低 confidence，并在 summary 中指出需要用户确认的部分。",
    note ? `用户补充描述：${note}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (provider === "openai") {
    const model = setting("OPENAI_VISION_MODEL") || setting("OPENAI_MODEL") || "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${setting("OPENAI_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
        max_output_tokens: 1400,
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        String(
          (payload.error as Record<string, unknown> | undefined)?.message ??
            "OpenAI 餐食识别暂时不可用。",
        ),
      );
    }
    return normalizeMealEstimate(
      parseJsonObject(extractOpenAIText(payload)),
      provider,
      model,
    );
  }

  const model =
    setting("NVIDIA_VISION_MODEL") ||
    "nvidia/nemotron-nano-12b-v2-vl";
  const baseUrl =
    setting("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${nvidiaVisionApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1400,
      stream: false,
    }),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      String(
        (payload.error as Record<string, unknown> | undefined)?.message ??
          "NVIDIA 餐食识别暂时不可用。",
      ),
    );
  }
  return normalizeMealEstimate(
    parseJsonObject(extractNvidiaText(payload)),
    provider,
    model,
  );
}

function normalizePhotoVisionAnalysis(
  payload: Record<string, unknown>,
  provider: "openai" | "nvidia",
  model: string,
): PhotoVisionAnalysis {
  const tags = Array.isArray(payload.tags)
    ? payload.tags
        .map((tag) => String(tag ?? "").trim().slice(0, 24))
        .filter(Boolean)
        .slice(0, 10)
    : [];
  return {
    provider,
    model,
    title: String(payload.title ?? "一张生活照片").trim().slice(0, 80),
    caption: String(
      payload.caption ?? "已识别照片内容，请确认后保存。",
    )
      .trim()
      .slice(0, 800),
    tags,
    scene: String(payload.scene ?? "").trim().slice(0, 80),
    suggestedPlace: String(
      payload.suggestedPlace ?? payload.suggested_place ?? "",
    )
      .trim()
      .slice(0, 120),
    containsSensitiveInfo: Boolean(
      payload.containsSensitiveInfo ?? payload.contains_sensitive_info,
    ),
  };
}

export async function analyzePhotoWithVision({
  bytes,
  contentType,
  context,
}: {
  bytes: ArrayBuffer;
  contentType: string;
  context?: string;
}): Promise<PhotoVisionAnalysis | null> {
  const provider = configuredAiProvider("vision");
  if (provider === "local") return null;

  const base64 = Buffer.from(bytes).toString("base64");
  const dataUrl = `data:${contentType};base64,${base64}`;
  const instruction = [
    "你是谨慎的私人照片整理助理。只描述照片中清楚可见的内容，不猜测人物身份、关系、年龄、职业、健康状况或其他敏感属性。",
    "只返回一个 JSON 对象，不要使用 Markdown。字段必须是 title, caption, tags, scene, suggestedPlace, containsSensitiveInfo。",
    "title 是简短照片标题；caption 是一至三句可直接用于个人相册的客观说明；tags 是最多 10 个简短中文标签；scene 是场景类别。",
    "只有画面中出现明确地标、店名或地址文字时才填写 suggestedPlace，否则返回空字符串。",
    "如果照片像截图、证件、票据、聊天记录、银行卡、二维码、医疗或工作文档，containsSensitiveInfo 返回 true。",
    context ? `已有上下文（仅供辅助）：${context.slice(0, 500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  if (provider === "openai") {
    const model =
      setting("OPENAI_VISION_MODEL") ||
      setting("OPENAI_MODEL") ||
      "gpt-5-mini";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${setting("OPENAI_API_KEY")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: instruction },
              { type: "input_image", image_url: dataUrl },
            ],
          },
        ],
        max_output_tokens: 1200,
      }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      throw new Error(
        String(
          (payload.error as Record<string, unknown> | undefined)?.message ??
            "OpenAI 照片理解暂时不可用。",
        ),
      );
    }
    return normalizePhotoVisionAnalysis(
      parseJsonObject(extractOpenAIText(payload)),
      provider,
      model,
    );
  }

  const model =
    setting("NVIDIA_VISION_MODEL") ||
    "nvidia/nemotron-nano-12b-v2-vl";
  const baseUrl =
    setting("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1";
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${nvidiaVisionApiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.15,
        max_tokens: 1200,
        stream: false,
      }),
    },
  );
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      String(
        (payload.error as Record<string, unknown> | undefined)?.message ??
          "NVIDIA 照片理解暂时不可用。",
      ),
    );
  }
  return normalizePhotoVisionAnalysis(
    parseJsonObject(extractNvidiaText(payload)),
    provider,
    model,
  );
}

const localFoods: Array<MealItemEstimate & { keywords: string[] }> = [
  { name: "米饭", portion: "1碗（约150g）", calories: 174, proteinG: 3.9, carbsG: 38.4, fatG: 0.5, keywords: ["米饭", "饭"] },
  { name: "馒头", portion: "1个（约100g）", calories: 223, proteinG: 7, carbsG: 47, fatG: 1.1, keywords: ["馒头"] },
  { name: "面条", portion: "1碗", calories: 280, proteinG: 10, carbsG: 55, fatG: 3, keywords: ["面条", "面"] },
  { name: "鸡蛋", portion: "1个", calories: 72, proteinG: 6.3, carbsG: 0.4, fatG: 4.8, keywords: ["鸡蛋", "蛋"] },
  { name: "牛奶", portion: "250ml", calories: 135, proteinG: 7.5, carbsG: 12, fatG: 7.5, keywords: ["牛奶", "奶"] },
  { name: "鸡胸肉", portion: "100g", calories: 165, proteinG: 31, carbsG: 0, fatG: 3.6, keywords: ["鸡胸", "鸡肉"] },
  { name: "红烧肉", portion: "100g", calories: 470, proteinG: 12, carbsG: 8, fatG: 43, keywords: ["红烧肉"] },
  { name: "清炒蔬菜", portion: "1盘（约200g）", calories: 140, proteinG: 5, carbsG: 14, fatG: 8, keywords: ["青菜", "蔬菜", "时蔬"] },
  { name: "苹果", portion: "1个", calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3, keywords: ["苹果"] },
  { name: "香蕉", portion: "1根", calories: 105, proteinG: 1.3, carbsG: 27, fatG: 0.4, keywords: ["香蕉"] },
  { name: "豆浆", portion: "300ml", calories: 95, proteinG: 8, carbsG: 8, fatG: 3.5, keywords: ["豆浆"] },
  { name: "包子", portion: "1个", calories: 220, proteinG: 8, carbsG: 35, fatG: 6, keywords: ["包子"] },
];

export function estimateMealFromDescription(description: string): MealEstimate {
  const found = localFoods.filter((food) =>
    food.keywords.some((keyword) => description.includes(keyword)),
  );
  const items = found.length
    ? found.map(
        ({ name, portion, calories, proteinG, carbsG, fatG }) => ({
          name,
          portion,
          calories,
          proteinG,
          carbsG,
          fatG,
        }),
      )
    : [
        {
          name: description.trim() || "未填写餐食",
          portion: "请手动确认份量",
          calories: 0,
          proteinG: 0,
          carbsG: 0,
          fatG: 0,
        },
      ];
  const total = (field: keyof Pick<MealItemEstimate, "calories" | "proteinG" | "carbsG" | "fatG">) =>
    items.reduce((sum, item) => sum + item[field], 0);
  return {
    provider: "local",
    model: "内置常见食物库",
    summary: found.length
      ? "已根据文字描述和常见标准份量估算，请按实际份量修正。"
      : "没有识别到内置食物，请手动填写热量或配置 NVIDIA 视觉模型。",
    confidence: found.length ? 0.48 : 0,
    calories: total("calories"),
    proteinG: total("proteinG"),
    carbsG: total("carbsG"),
    fatG: total("fatG"),
    items,
  };
}
