import { ensureIntelligenceSchema } from "../../../../lib/intelligence-store";
import { getLifeBindings } from "../../../../lib/life-store";

function publicImageUrl(value: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("图片地址协议不受支持。");
  }
  const host = parsed.hostname.toLowerCase();
  const blocked =
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^f[cd][0-9a-f]{2}:/i.test(host) ||
    /^fe8[0-9a-f]:/i.test(host);
  if (blocked) throw new Error("不能读取本机或内网图片。");
  parsed.hash = "";
  return parsed;
}

export async function GET(request: Request) {
  try {
    await ensureIntelligenceSchema();
    const id = new URL(request.url).searchParams.get("id")?.slice(0, 200) || "";
    if (!id) return new Response("Missing image id", { status: 400 });
    const { DB } = getLifeBindings();
    const item = await DB.prepare(
      "SELECT image_url FROM feed_items WHERE id = ?",
    )
      .bind(id)
      .first<{ image_url: string }>();
    if (!item?.image_url) return new Response("Image not found", { status: 404 });

    let url = publicImageUrl(item.image_url);
    let response: Response | null = null;
    for (let redirects = 0; redirects < 4; redirects += 1) {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: {
          accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
          "user-agent": "RichangyuIntelligenceImageProxy/1.0",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("图片重定向地址无效。");
      url = publicImageUrl(new URL(location, url).toString());
      response = null;
    }
    if (!response?.ok) {
      return new Response("Image unavailable", { status: 404 });
    }
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
      return new Response("Unsupported image", { status: 415 });
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > 8 * 1024 * 1024) {
      return new Response("Image too large", { status: 413 });
    }
    const body = await response.arrayBuffer();
    if (body.byteLength > 8 * 1024 * 1024) {
      return new Response("Image too large", { status: 413 });
    }
    return new Response(body, {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600, s-maxage=86400",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Image unavailable", { status: 404 });
  }
}
