#!/usr/bin/env node
/**
 * scripts/fetch-source-years.mjs
 *
 * 给 sources 里缺 `year` 的条目补上**页面自己声明的**更新/复核年份。
 *
 *   node scripts/fetch-source-years.mjs            # 只报告（默认）
 *   node scripts/fetch-source-years.mjs --write    # 写回文件
 *
 * 原则：只读页面里的日期文本，**抓不到就留空**，绝不推测。
 * 这也是为什么默认不写回 —— 改文件必须先看清楚它要改什么。
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent } from "./lib/content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const args = process.argv.slice(2);
const doWrite = args.includes("--write");
const contentDirArg = args.indexOf("--content");
const contentDir = contentDirArg >= 0 ? resolve(process.cwd(), args[contentDirArg + 1]) : join(root, "content");

const { entries } = await loadContent(contentDir);

const targets = [];
for (const entry of entries) {
  (entry.data.sources ?? []).forEach((s, idx) => {
    if (s?.url && !s.year) targets.push({ entry, idx, url: s.url, label: s.label });
  });
}

if (targets.length === 0) {
  console.log("✓ 所有来源都已标注年份。");
  process.exit(0);
}

console.log(`缺 year 的来源：${targets.length} 个，逐个去页面读它自己写的日期…\n`);

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** 只认页面自己声明的日期文本，按可信度排列 */
const PATTERNS = [
  /page last reviewed[:\s]*(\d{1,2}\s+[A-Za-z]+\s+20\d\d)/i,
  /last reviewed[:\s]*(\d{1,2}\s+[A-Za-z]+\s+20\d\d)/i,
  /page last updated[:\s]*(\d{1,2}\s+[A-Za-z]+\s+20\d\d)/i,
  /last updated[:\s]*(\d{1,2}\s+[A-Za-z]+\s+20\d\d)/i,
  /(?:published|updated)[:\s]*(\d{1,2}\s+[A-Za-z]+\s+20\d\d)/i,
  /(20\d\d)\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/,
  /(20\d\d)-\d{2}-\d{2}/,
];

async function findYear(url) {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

    for (const re of PATTERNS) {
      const m = text.match(re);
      if (!m) continue;
      const raw = (m[1] ?? m[0]).trim();
      const y = raw.match(/(20\d\d)/);
      if (y) return { year: Number(y[1]), evidence: raw };
    }
    return { error: "页面上没找到可识别的日期" };
  } catch (err) {
    return { error: err.message };
  }
}

const CONCURRENCY = 4;
const results = [];
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY);
  const got = await Promise.all(batch.map((t) => findYear(t.url)));
  got.forEach((g, k) => results.push({ ...batch[k], ...g }));
}

// ---- 报告 ----
const found = results.filter((r) => r.year);
const missing = results.filter((r) => !r.year);

for (const r of found) {
  console.log(`  ✓ ${r.year}  ${r.entry.data.title} · ${(r.label ?? "").slice(0, 40)}`);
  console.log(`        ${r.url}`);
  console.log(`        依据：${r.evidence}`);
}
console.log("");

for (const r of missing) {
  console.log(`  ? 未取到  ${r.entry.data.title} · ${(r.label ?? "").slice(0, 40)}`);
  console.log(`        ${r.url}`);
  console.log(`        原因：${r.error}`);
}
console.log("");

if (!doWrite) {
  console.log(`（dry-run）共 ${found.length} 个可补，${missing.length} 个取不到。`);
  console.log(`确认无误后重跑并加 --write 写回文件。`);
  process.exit(0);
}

// ---- 写回：只在对应 url 行之后插入 year ----
const byFile = new Map();
for (const r of found) {
  if (!byFile.has(r.entry.file)) byFile.set(r.entry.file, []);
  byFile.get(r.entry.file).push(r);
}

let changed = 0;
for (const [file, items] of byFile) {
  let text = await readFile(file, "utf8");
  for (const it of items) {
    const escaped = it.url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // 已经有 year 就不动
    if (new RegExp(`url:\\s*${escaped}\\s*\\n\\s*year:`, "i").test(text)) continue;
    const re = new RegExp(`(\\n([ \\t]*)url:\\s*${escaped}[ \\t]*)(\\r?\\n)`, "i");
    if (!re.test(text)) {
      console.log(`  ! 在 ${file} 里找不到 url 行，跳过：${it.url}`);
      continue;
    }
    text = text.replace(re, (m, head, indent, nl) => `${head}${nl}${indent}year: ${it.year}${nl}`);
    changed++;
  }
  await writeFile(file, text, "utf8");
}

console.log(`已写回 ${byFile.size} 个文件，共补 ${changed} 处 year。`);
console.log(`复核：node scripts/validate-content.mjs`);
