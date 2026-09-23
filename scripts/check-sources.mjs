#!/usr/bin/env node
/**
 * scripts/check-sources.mjs
 *
 * 检查所有条目的 sources 链接是否还活着。
 *
 *   node scripts/check-sources.mjs
 *   node scripts/check-sources.mjs --content <dir>
 *   node scripts/check-sources.mjs --json > sources-report.json
 *
 * 为什么不放进 CI 主流程：构建不该依赖外网。链接腐烂是慢性病，
 * 定期手动跑（或单独的定时工作流）比让每次部署都可能因第三方站点抖动而失败更合适。
 *
 * 用 Node 内置 fetch —— 本机 curl 与 Invoke-WebRequest 的 TLS 层不通。
 */
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./lib/content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? resolve(process.cwd(), argv[i + 1]) : fallback;
};
const asJson = argv.includes("--json");

const contentDir = argOf("--content", join(root, "content"));
const { entries } = await loadContent(contentDir);

/** url → 引用它的条目列表（同一 URL 可能被多条引用，只测一次） */
const byUrl = new Map();
for (const e of entries) {
  for (const s of e.data.sources ?? []) {
    if (!s?.url) continue;
    if (!byUrl.has(s.url)) byUrl.set(s.url, []);
    byUrl.get(s.url).push({ entry: e.data.title, label: s.label });
  }
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function probe(url) {
  try {
    // 有些政府站点对 HEAD 不友好，直接 GET
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    const body = await res.text();
    return { url, status: res.status, finalUrl: res.url, bytes: body.length };
  } catch (err) {
    return { url, status: 0, error: err.message };
  }
}

// 限制并发，避免把对方站点打疼
const urls = [...byUrl.keys()];
const CONCURRENCY = 6;
const results = [];
for (let i = 0; i < urls.length; i += CONCURRENCY) {
  const batch = urls.slice(i, i + CONCURRENCY);
  results.push(...(await Promise.all(batch.map(probe))));
}

const ok = results.filter((r) => r.status >= 200 && r.status < 400);
const dead = results.filter((r) => r.status >= 400);
const failed = results.filter((r) => r.status === 0);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        total: results.length,
        ok: ok.length,
        dead: dead.length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  );
  process.exit(dead.length || failed.length ? 1 : 0);
}

console.log(`检查 ${results.length} 个来源链接（来自 ${entries.length} 条目）\n`);

if (dead.length) {
  console.log(`✗ 死链 ${dead.length} 个——必须修掉或替换：`);
  for (const r of dead) {
    console.log(`  ${r.status}  ${r.url}`);
    for (const ref of byUrl.get(r.url)) console.log(`         ← 《${ref.entry}》${ref.label ? ` · ${ref.label}` : ""}`);
  }
  console.log("");
}

if (failed.length) {
  console.log(`? 请求失败 ${failed.length} 个（可能是对方限流或临时故障，稍后重试）：`);
  for (const r of failed) {
    console.log(`  ERR  ${r.url}`);
    console.log(`       ${r.error}`);
    for (const ref of byUrl.get(r.url)) console.log(`         ← 《${ref.entry}》`);
  }
  console.log("");
}

const redirected = ok.filter((r) => r.finalUrl && r.finalUrl !== r.url);
if (redirected.length) {
  console.log(`→ 发生跳转 ${redirected.length} 个（可用，但值得确认跳到哪了）：`);
  for (const r of redirected) console.log(`  ${r.status}  ${r.url}\n       → ${r.finalUrl}`);
  console.log("");
}

console.log(`✓ 正常 ${ok.length} 个`);
process.exit(dead.length || failed.length ? 1 : 0);
