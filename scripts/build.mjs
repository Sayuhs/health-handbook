/**
 * scripts/build.mjs
 *
 * 全站构建：内容校验 → 渲染页面 → 生成搜索索引 → 处理样式与字体 → 写 dist/
 *
 *   node scripts/build.mjs
 *   node scripts/build.mjs --content <dir> --out <dir>   # 测试用
 *
 * 校验不过就中止，绝不让缺来源的内容上线。
 */
import { readFile, writeFile, mkdir, rm, copyFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import MiniSearch from "minisearch";

import { CATEGORIES, EVIDENCE_LABEL, SEVERITY_LABEL, loadContent } from "./lib/content.mjs";
import { buildStyles, FONT_FILES } from "./lib/assets.mjs";
import { createRenderer } from "./lib/render.mjs";
import { renderOgImage } from "./lib/og.mjs";
import { SEARCH_OPTIONS } from "../src/client/tokenize.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? resolve(process.cwd(), argv[i + 1]) : fallback;
};

const contentDir = argOf("--content", join(root, "content"));
const outDir = argOf("--out", join(root, "dist"));
const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));

/* ---------------------------------------------------- 1. 校验内容 */
const { entries, errors, warnings } = await loadContent(contentDir);

if (warnings.length) {
  console.log(`! ${warnings.length} 个警告：`);
  for (const w of warnings) console.log(`   ${w.file} [${w.field}] ${w.msg}`);
}

if (errors.length) {
  console.error(`\n✗ 内容校验失败，构建中止（${errors.length} 个错误）：`);
  for (const e of errors) console.error(`   ${e.file} [${e.field}] ${e.msg}`);
  process.exit(1);
}
console.log(`✓ 内容校验通过，共 ${entries.length} 条`);

/* ---------------------------------------------------- 2. 渲染 */
marked.setOptions({ gfm: true, breaks: false });

// 只渲染合法条目（校验已通过，所以全部合法）
const renderer = createRenderer({
  config,
  categories: CATEGORIES,
  severityLabel: SEVERITY_LABEL,
  evidenceLabel: EVIDENCE_LABEL,
});

const files = new Map(); // 相对路径 → 内容

const outPath = (rel) => join(outDir, rel);
const put = (rel, html) => files.set(rel, html);

// 条目页
for (const entry of entries) {
  const bodyHtml = marked.parse(entry.body);
  const related = entries
    .filter((e) => e.category === entry.category && e !== entry)
    .slice(0, 6);
  put(
    `${entry.category}/${entry.data.slug}/index.html`,
    renderer.entryPage({ entry, bodyHtml, related }),
  );
}

// 分类页
const groups = Object.entries(CATEGORIES)
  .map(([key, meta]) => ({ key, meta, entries: entries.filter((e) => e.category === key) }))
  .filter((g) => g.entries.length > 0);

for (const g of groups) {
  put(`${g.key}/index.html`, renderer.categoryPage({ key: g.key, meta: g.meta, entries: g.entries }));
}

// 首页
put("index.html", renderer.homePage({ groups, total: entries.length }));

// 免责声明页
put("disclaimer/index.html", renderer.disclaimerPage());

// 搜索页
put("search/index.html", renderer.searchPage());

// ---- 紧急速查：由各条目的 quickref 汇总，按严重度排序 ----
const quickItems = [];
for (const e of entries) {
  for (const q of e.data.quickref ?? []) {
    quickItems.push({
      situation: q.situation,
      action: q.action,
      detail: q.detail,
      level: q.level ?? 1,
      href: `${config.base}${e.category}/${e.data.slug}/`,
      title: e.data.title,
      summary: e.data.summary,
    });
  }
}
quickItems.sort((a, b) => a.level - b.level);
put("quickref/index.html", renderer.quickrefPage({ items: quickItems }));

// ---- 自测：规则表由条目的 triage 字段汇聚，可逐条追溯到来源条目 ----
const triageGroups = new Map();
for (const e of entries) {
  for (const t of e.data.triage ?? []) {
    if (!triageGroups.has(t.group)) {
      triageGroups.set(t.group, { key: slugify(t.group), legend: t.group, hint: "勾选现在正在发生的", columns: 2, options: [] });
    }
    triageGroups.get(t.group).options.push({
      value: `${e.data.slug}--${slugify(t.label).slice(0, 24)}`,
      label: t.label,
      level: t.level,
      source: e.data.title,
      slug: e.data.slug,
      category: e.category,
    });
  }
}
put(
  "check/index.html",
  renderer.triagePage({ groups: [...triageGroups.values()] }),
);

function slugify(s) {
  return String(s)
    .normalize("NFKD")
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "g";
}

/* ---------------------------------------------------- 3. 搜索索引 */
// tokenize 与搜索参数都与浏览器端共用同一份实现（src/client/tokenize.js），
// 避免两端漂移导致「索引里有、搜不到」。

const docs = entries.map((e) => ({
  id: `${e.category}/${e.data.slug}`,
  url: `${config.base}${e.category}/${e.data.slug}/`,
  title: e.data.title,
  summary: e.data.summary,
  category: CATEGORIES[e.category]?.label ?? e.category,
  tags: (e.data.tags ?? []).join(" "),
  body: e.body.replace(/<[^>]+>/g, " ").replace(/[#*`>|【】]/g, " "),
}));

const mini = new MiniSearch(SEARCH_OPTIONS);
mini.addAll(docs);

put("search-index.json", JSON.stringify(mini.toJSON()));
put(
  "assets/triage-rules.json",
  JSON.stringify({
    generatedFrom: "各条目的 triage 字段",
    total: [...triageGroups.values()].reduce((n, g) => n + g.options.length, 0),
  }),
);

/* ---------------------------------------------------- 4. 样式与字体 */
put("styles.css", await buildStyles({ root, stylesDir: join(root, "src", "styles"), base: config.base, readFile }));

/* ---------------------------------------------------- 5. 落盘 */
await rm(outDir, { recursive: true, force: true });
for (const [rel, content] of files) {
  const target = outPath(rel);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
}

// 分享图：纯线条生成，无图像库依赖（微信/社交卡片用）
await writeFile(join(outDir, "og.png"), renderOgImage());

// 字体
await mkdir(join(outDir, "fonts"), { recursive: true });
for (const f of FONT_FILES) {
  await copyFile(join(root, "src", "fonts", f), join(outDir, "fonts", f));
}

// 客户端脚本（含 MiniSearch 的 ESM 构建——浏览器直接 import，无需打包器）
await mkdir(join(outDir, "assets"), { recursive: true });
const clientAssets = [
  [join(root, "src", "client", "controls.js"), "controls.js"],
  [join(root, "src", "client", "tokenize.js"), "tokenize.js"],
  [join(root, "src", "client", "search-core.js"), "search-core.js"],
  [join(root, "src", "client", "search.js"), "search.js"],
  [join(root, "src", "client", "triage.js"), "triage.js"],
  [join(root, "node_modules", "minisearch", "dist", "es", "index.js"), "minisearch.js"],
  [join(root, "node_modules", "minisearch", "dist", "es", "SearchableMap.js"), "SearchableMap.js"],
];
for (const [src, name] of clientAssets) {
  try {
    await copyFile(src, join(outDir, "assets", name));
  } catch {
    console.log(`   （跳过缺失的文件 ${name}）`);
  }
}

/* ---------------------------------------------------- 6. 报告 */
let htmlCount = 0;
let bytes = 0;
for (const rel of files.keys()) {
  if (!rel.endsWith(".html")) continue;
  htmlCount++;
  bytes += (await stat(outPath(rel))).size;
}
console.log(`\n=== 产物（${outDir}）===`);
console.log(`  页面      ${htmlCount}`);
console.log(`  HTML 合计 ${(bytes / 1024).toFixed(1)} KiB`);
console.log(`  索引       ${(JSON.stringify(mini.toJSON()).length / 1024).toFixed(1)} KiB`);
console.log(`  速查条目   ${quickItems.length}`);
console.log(`  自测选项   ${[...triageGroups.values()].reduce((n, g) => n + g.options.length, 0)}`);
console.log(`\n预览：node scripts/serve.mjs`);
