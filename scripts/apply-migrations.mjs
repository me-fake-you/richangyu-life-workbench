import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const configPath = resolve(root, "dist/server/wrangler.self-host.json");
if (!existsSync(configPath)) {
  throw new Error("尚未生成独立部署配置，请先运行 npm run cloudflare:configure。");
}

const config = JSON.parse(readFileSync(configPath, "utf8"));
const database = config.d1_databases?.find((item) => item.binding === "DB");
if (!database?.database_name) throw new Error("部署配置中缺少 DB 绑定。");

const wranglerPath = resolve(root, "node_modules/wrangler/bin/wrangler.js");
const result = spawnSync(
  process.execPath,
  [
    wranglerPath,
    "d1",
    "migrations",
    "apply",
    database.database_name,
    "--remote",
    "--config",
    configPath,
    "--migrations-dir",
    resolve(root, "drizzle"),
  ],
  { cwd: root, stdio: "inherit" },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
