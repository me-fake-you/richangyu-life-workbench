import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Compile the actual module in isolation so no provider or Cloudflare binding is used.
const source = await readFile(
  new URL("../lib/intelligence-briefing.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function metadataReader(fetchMock) {
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(specifier) {
      assert.equal(specifier, "./ai-provider");
      return {
        async generateProviderText() {
          throw new Error("Metadata discovery must not invoke AI.");
        },
      };
    },
    URL,
    AbortSignal,
    fetch: fetchMock,
  }, { timeout: 1000 });
  assert.equal(typeof exports.discoverArticleMetadata, "function");
  return exports.discoverArticleMetadata;
}

function item(overrides = {}) {
  return {
    title: "A public article",
    summary: "",
    url: "https://news.example/articles/story",
    imageUrl: "",
    publishedAt: "2026-10-03T00:00:00.000Z",
    ...overrides,
  };
}

function htmlResponse(html) {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

test("complete article metadata avoids extra network and AI calls", async () => {
  const input = item({
    summary: "Existing summary",
    imageUrl: "https://news.example/cover.jpg",
  });
  const discover = metadataReader(async () => {
    assert.fail("Complete metadata must not fetch an article.");
  });
  assert.equal(await discover(input), input);
});

test("Open Graph images and descriptions support reversed attributes and entities", async () => {
  const calls = [];
  const discover = metadataReader(async (url, options) => {
    calls.push({ url: String(url), options });
    return htmlResponse(
      '<meta content="../media/cover.jpg#preview" property="og:image">' +
      '<meta name="description" content="Research &amp; life">',
    );
  });
  const result = await discover(item());
  assert.equal(result.imageUrl, "https://news.example/media/cover.jpg");
  assert.equal(result.summary, "Research & life");
  assert.equal(result.title, "A public article");
  assert.equal(result.publishedAt, "2026-10-03T00:00:00.000Z");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.redirect, "manual");
  assert.ok(calls[0].options.signal instanceof AbortSignal);
});

test("Twitter images fill only missing images and preserve an existing summary", async () => {
  const discover = metadataReader(async () => htmlResponse(
    '<meta name="twitter:image" content="/twitter.png">' +
    '<meta name="description" content="Replacement summary">',
  ));
  const result = await discover(item({ summary: "Keep this summary" }));
  assert.equal(result.imageUrl, "https://news.example/twitter.png");
  assert.equal(result.summary, "Keep this summary");
});

test("missing summaries are enriched without replacing an existing image", async () => {
  const discover = metadataReader(async () => htmlResponse(
    '<meta property="og:image" content="/replacement.jpg">' +
    '<meta property="og:description" content="New description">',
  ));
  const result = await discover(item({ imageUrl: "https://news.example/original.jpg" }));
  assert.equal(result.imageUrl, "https://news.example/original.jpg");
  assert.equal(result.summary, "New description");
});

test("article image elements are a fallback when social metadata is absent", async () => {
  const discover = metadataReader(async () => htmlResponse(
    '<img data-src="/fallback.jpg">',
  ));
  const result = await discover(item());
  assert.equal(result.imageUrl, "https://news.example/fallback.jpg");
  assert.equal(result.summary, "");
});

test("non-HTTP image candidates are not accepted", async () => {
  for (const candidate of ["javascript:alert(1)", "data:image/png;base64,AA=="]) {
    const discover = metadataReader(async () => htmlResponse(
      '<meta property="og:image" content="' + candidate + '">',
    ));
    const result = await discover(item());
    assert.equal(result.imageUrl, "");
  }
});

test("network errors and unsuccessful responses leave the article unchanged", async () => {
  const input = item({ summary: "Keep this summary" });
  const failed = metadataReader(async () => { throw new Error("Network unavailable"); });
  assert.equal(await failed(input), input);
  const notFound = metadataReader(async () => new Response(null, { status: 404 }));
  assert.equal(await notFound(input), input);
});

test("known local article addresses are rejected before fetching", async () => {
  const discover = metadataReader(async () => {
    assert.fail("Local article addresses must not be fetched.");
  });
  for (const url of [
    "http://127.0.0.1/article",
    "http://10.0.0.1/article",
    "http://192.168.1.1/article",
    "http://169.254.169.254/latest/meta-data",
    "http://server.local/article",
  ]) {
    const input = item({ url });
    assert.equal(await discover(input), input);
  }
});

test("a redirect into a private address is rejected without a second fetch", async () => {
  const input = item();
  let calls = 0;
  const discover = metadataReader(async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
    });
  });
  assert.equal(await discover(input), input);
  assert.equal(calls, 1);
});

test("relative image URLs resolve against the final public redirect destination", async () => {
  const urls = [];
  const discover = metadataReader(async (url) => {
    urls.push(String(url));
    if (urls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://articles.example/posts/final" },
      });
    }
    return htmlResponse('<meta property="og:image" content="../media/final.png">');
  });
  const result = await discover(item());
  assert.equal(result.imageUrl, "https://articles.example/media/final.png");
  assert.deepEqual(urls, [
    "https://news.example/articles/story",
    "https://articles.example/posts/final",
  ]);
});

test("redirect loops stop at the existing request limit", async () => {
  const input = item();
  let calls = 0;
  const discover = metadataReader(async () => {
    calls += 1;
    return new Response(null, {
      status: 302,
      headers: { location: "/loop" },
    });
  });
  assert.equal(await discover(input), input);
  assert.equal(calls, 3);
});
