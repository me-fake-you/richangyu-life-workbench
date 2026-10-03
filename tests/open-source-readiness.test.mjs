import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { assertSupportedProjectVersion } from "./helpers/project-version.mjs";

test("the repository exposes a safe, self-hostable v1 baseline", async () => {
  const [pkgRaw, gitignore, envExample, hostingExample, readme, englishReadme, security, deployment, tutorialPage, pagesWorkflow, ciWorkflow] =
    await Promise.all([
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../.gitignore", import.meta.url), "utf8"),
      readFile(new URL("../.env.example", import.meta.url), "utf8"),
      readFile(new URL("../.openai/hosting.example.json", import.meta.url), "utf8"),
      readFile(new URL("../README.md", import.meta.url), "utf8"),
      readFile(new URL("../README.en.md", import.meta.url), "utf8"),
      readFile(new URL("../SECURITY.md", import.meta.url), "utf8"),
      readFile(new URL("../docs/deployment-cloudflare.md", import.meta.url), "utf8"),
      readFile(new URL("../public/tutorial/index.html", import.meta.url), "utf8"),
      readFile(new URL("../.github/workflows/tutorial-pages.yml", import.meta.url), "utf8"),
      readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8"),
    ]);

  const pkg = JSON.parse(pkgRaw);
  assertSupportedProjectVersion(pkg.version);
  assert.equal(pkg.license, "MIT");
  assert.match(pkg.scripts.validate, /typecheck.*lint.*test.*build/);
  assert.match(pkg.scripts["deploy:cloudflare"], /wrangler\.self-host\.json/);
  assert.match(pkg.scripts["release:source"], /export-open-source/);
  assert.match(pkg.scripts["check:encoding"], /check-encoding/);

  assert.match(gitignore, /\.env\*/);
  assert.match(gitignore, /\.openai\/hosting\.json/);
  assert.doesNotMatch(envExample, /\b(?:sk|nvapi)-[A-Za-z0-9_-]{20,}/);
  assert.equal(JSON.parse(hostingExample).project_id, "");

  for (const doc of [readme, englishReadme, security, deployment]) {
    assert.match(doc, /Cloudflare/i);
  }
  assert.match(readme, /个人生活操作系统/);
  assert.match(readme, /me-fake-you\.github\.io\/richangyu-life-workbench/);
  assert.match(englishReadme, /personal life operating system/i);
  assert.match(tutorialPage, /<video[\s\S]*controls/);
  assert.match(tutorialPage, /richangyu-quick-start\.vtt/);
  assert.match(pagesWorkflow, /actions\/deploy-pages@v4/);
  assert.match(ciWorkflow, /outputs\/richangyu-life-workbench-v\*-source\.zip/);
  assert.match(security, /Cloudflare Access/);
  assert.match(deployment, /D1_DATABASE_ID/);
});

test("deployment-specific files are not tracked when git is available", (t) => {
  const git = process.env.GIT_BINARY || "git";
  const result = spawnSync(git, ["ls-files"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });
  if (result.status !== 0) {
    t.skip("git executable is not available in this runtime");
    return;
  }
  const tracked = result.stdout.split(/\r?\n/);
  assert(!tracked.includes(".env.local"));
  assert(!tracked.includes(".openai/hosting.json"));
});
