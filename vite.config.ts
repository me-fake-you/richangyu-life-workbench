import vinext from "vinext";
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

type HostingConfig = {
  project_id?: string;
  d1?: string;
  r2?: string;
};

function readHostingConfig(): HostingConfig {
  const path = new URL("./.openai/hosting.json", import.meta.url);
  if (!existsSync(path)) return { d1: "DB", r2: "MEDIA" };
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HostingConfig;
  } catch {
    throw new Error(
      ".openai/hosting.json 不是有效 JSON。请参考 .openai/hosting.example.json。",
    );
  }
}

const { d1 = "DB", r2 = "MEDIA" } = readHostingConfig();

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name:
            process.env.D1_DATABASE_NAME || "life-workbench-local",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name:
            process.env.R2_BUCKET_NAME || "life-workbench-media-local",
        },
      ]
    : [],
  triggers: {
    crons: ["*/15 * * * *"],
  },
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
