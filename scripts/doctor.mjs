import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { loadLocalEnv } from "./env.mjs";

const root = process.cwd();
loadLocalEnv(root);

const checks = [];
const add = (ok, label, advice = "") => checks.push({ ok, label, advice });
const majorMinor = process.versions.node.split(".").slice(0, 2).map(Number);
const supportedNode =
  majorMinor[0] > 22 || (majorMinor[0] === 22 && majorMinor[1] >= 13);

add(
  supportedNode,
  `Node.js ${process.versions.node}`,
  "请安装 Node.js 22.13 或更高版本。",
);

for (const pathname of [
  "package.json",
  "app/page.tsx",
  "worker/index.ts",
  "db/schema.ts",
  "drizzle",
]) {
  add(existsSync(resolve(root, pathname)), `项目文件 ${pathname}`, "源码不完整，请重新下载。");
}

const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
add(
  gitignore.includes(".env*"),
  "本地 API 密钥已被 Git 忽略",
  "请勿提交 .env.local。",
);
add(
  !existsSync(resolve(root, ".env.local")) ||
    Boolean(
      process.env.NVIDIA_TEXT_API_KEY ||
        process.env.NVIDIA_VISION_API_KEY ||
        process.env.OPENAI_API_KEY,
    ),
  "AI 配置（可选）",
  ".env.local 已存在但未检测到 API 密钥；本地规则仍可使用。",
);

const hasD1 = Boolean(process.env.D1_DATABASE_ID);
add(
  hasD1,
  "Cloudflare D1 独立部署（可选）",
  "公开自部署前请在 .env.local 填写 D1_DATABASE_ID。",
);

const failed = checks.filter((check) => !check.ok && !check.label.includes("可选"));
console.log("\n日常屿环境检查\n");
for (const check of checks) {
  const optional = check.label.includes("可选");
  const icon = check.ok ? "✓" : optional ? "○" : "✗";
  console.log(`${icon} ${check.label}`);
  if (!check.ok && check.advice) console.log(`  ${check.advice}`);
}

console.log("\n可用运行方式");
console.log("- 本地开发：npm run dev");
console.log("- 完整验证：npm run validate");
console.log("- Cloudflare 独立部署：npm run deploy:cloudflare");
console.log("- OpenAI Sites：使用已连接站点的托管发布流程");
console.log("\n安全提醒：个人数据站点上线前，请配置 Cloudflare Access 或等效访问控制。\n");

if (failed.length) process.exitCode = 1;
