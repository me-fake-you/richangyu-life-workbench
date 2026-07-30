/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA: R2Bucket;
  APP_INTERNAL_ORIGIN?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
  async scheduled(
    controller: { scheduledTime: number; cron: string },
    env: Env,
    ctx: ExecutionContext,
  ) {
    ctx.waitUntil(
      (async () => {
        const internalOrigin =
          env.APP_INTERNAL_ORIGIN || "https://life-workbench.internal";
        const requests = [
          new Request(`${internalOrigin}/api/advanced`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action: "automation.run",
                payload: {
                  timezoneOffset: -480,
                  scheduledTime: controller.scheduledTime,
                  cron: controller.cron,
                },
              }),
            }),
          new Request(`${internalOrigin}/api/finance`),
          new Request(`${internalOrigin}/api/ai/tasks`, {
            method: "PUT",
          }),
          new Request(`${internalOrigin}/api/backup/snapshot`, {
            method: "POST",
          }),
        ];
        const responses = await Promise.all(
          requests.map((request) => handler.fetch(request, env, ctx)),
        );
        for (const response of responses) {
          if (!response.ok) {
            throw new Error(
              `日常屿后台任务执行失败：${response.status} ${await response.text()}`,
            );
          }
        }
      })(),
    );
  },
};

export default worker;
