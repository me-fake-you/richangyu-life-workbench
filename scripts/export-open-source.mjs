import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const packageMetadata = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const git =
  process.env.GIT_BINARY ||
  (process.platform === "win32" ? "git.exe" : "git");

function runGit(args, options = {}) {
  const result = spawnSync(git, args, {
    cwd: root,
    encoding: "utf8",
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} 执行失败`);
  }
  return result.stdout;
}

const status = runGit(["status", "--porcelain"]);
if (status.trim()) {
  throw new Error("工作区仍有未提交修改。请先提交并验证，再生成公开源码包。");
}

const files = runGit(["ls-files"])
  .split(/\r?\n/)
  .filter(Boolean);
const forbiddenFiles = [".env.local", ".env", ".openai/hosting.json"];
for (const filename of forbiddenFiles) {
  if (files.includes(filename)) {
    throw new Error(`拒绝导出：${filename} 不应出现在公开源码中。`);
  }
}

const textExtensions = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".sql",
  ".svg",
  ".ts",
  ".tsx",
  ".txt",
  ".yml",
  ".yaml",
]);
const forbiddenPatterns = [
  { label: "个人 Sites 项目 ID", pattern: /appgprj_[a-z0-9]+/i },
  { label: "个人账号标识", pattern: /liu1787417508/i },
  { label: "旧内部域名", pattern: /richangyu\.internal/i },
  { label: "Windows 用户绝对路径", pattern: /C:\\Users\\/i },
  { label: "本机工作区绝对路径", pattern: /E:\\研究生学习/i },
  { label: "疑似 OpenAI/NVIDIA 密钥", pattern: /\b(?:sk|nvapi)-[A-Za-z0-9_-]{20,}/ },
];

for (const filename of files) {
  if (filename === "scripts/export-open-source.mjs") continue;
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (!textExtensions.has(extension)) continue;
  const content = readFileSync(resolve(root, filename), "utf8");
  for (const rule of forbiddenPatterns) {
    if (rule.pattern.test(content)) {
      throw new Error(`拒绝导出：${filename} 含有${rule.label}。`);
    }
  }
}

const outputDir = resolve(root, "outputs");
mkdirSync(outputDir, { recursive: true });
const outputPath = resolve(
  outputDir,
  `richangyu-life-workbench-v${packageMetadata.version}-source.zip`,
);
runGit(["archive", "--format=zip", `--output=${outputPath}`, "HEAD"]);
console.log(`已生成安全源码包：${outputPath}`);
