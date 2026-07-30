import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { loadLocalEnv } from "./env.mjs";

const root = process.cwd();
loadLocalEnv(root);

const sourcePath = resolve(root, "dist/server/wrangler.json");
const outputPath = resolve(root, "dist/server/wrangler.self-host.json");
const databaseId = process.env.D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error(
    "缺少 D1_DATABASE_ID。请复制 .env.example 为 .env.local，并填写 Cloudflare D1 数据库 ID。",
  );
}

const config = JSON.parse(readFileSync(sourcePath, "utf8"));
const workerName = process.env.CLOUDFLARE_WORKER_NAME?.trim() || "life-workbench";
const databaseName = process.env.D1_DATABASE_NAME?.trim() || "life-workbench";
const bucketName = process.env.R2_BUCKET_NAME?.trim() || "life-workbench-media";

config.name = workerName;
config.topLevelName = workerName;
config.d1_databases = [
  {
    binding: "DB",
    database_name: databaseName,
    database_id: databaseId,
  },
];
config.r2_buckets = [{ binding: "MEDIA", bucket_name: bucketName }];
config.vars = {
  ...(config.vars || {}),
  AI_PROVIDER: process.env.AI_PROVIDER || "local",
  NVIDIA_BASE_URL:
    process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  NVIDIA_MODEL: process.env.NVIDIA_MODEL || "z-ai/glm-5.2",
  NVIDIA_VISION_MODEL:
    process.env.NVIDIA_VISION_MODEL || "nvidia/nemotron-nano-12b-v2-vl",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5-mini",
  OPENAI_VISION_MODEL: process.env.OPENAI_VISION_MODEL || "gpt-5-mini",
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
console.log(`已生成 ${outputPath}`);
console.log("API 密钥不会写入部署配置，请使用 wrangler secret put 单独设置。");
