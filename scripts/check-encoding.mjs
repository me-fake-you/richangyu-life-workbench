import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

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

const git = process.env.GIT_BINARY || (process.platform === "win32" ? "git.exe" : "git");
const tracked = spawnSync(git, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
  cwd: process.cwd(),
  encoding: "buffer",
});

if (tracked.status !== 0) {
  throw new Error(tracked.stderr?.toString("utf8") || "无法读取 Git 文件列表。");
}

const filenames = tracked.stdout
  .toString("utf8")
  .split("\0")
  .filter((filename) => filename && textExtensions.has(extname(filename).toLowerCase()));
const decoder = new TextDecoder("utf-8", { fatal: true });
const mojibake =
  /(?:\uFFFD|鈥[溾€]|锛[屽哄]|銆[併]|鏃ュ父|鐢熸椿|瀹夎|绉佸瘑|鍚屾)/u;
const failures = [];

for (const filename of filenames) {
  try {
    const bytes = await readFile(filename);
    const content = decoder.decode(bytes);
    if (filename !== "scripts/check-encoding.mjs" && mojibake.test(content)) {
      failures.push(`${filename}：疑似 UTF-8 二次解码乱码`);
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      continue;
    }
    failures.push(`${filename}：${error instanceof Error ? error.message : "不是有效 UTF-8"}`);
  }
}

if (failures.length) {
  throw new Error(`编码检查失败：\n${failures.map((item) => `- ${item}`).join("\n")}`);
}

console.log(`编码检查通过：${filenames.length} 个文本文件均为有效 UTF-8。`);
