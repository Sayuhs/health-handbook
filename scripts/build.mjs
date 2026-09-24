/**
 * scripts/build.mjs
 *
 * 全站构建：内容校验 → 渲染页面 → 生成搜索索引 → 处理样式与字体 → 写 dist/
 *
 *   node scripts/build.mjs
 *   node scripts/build.mjs --content <dir> --out <dir>   # 测试用
 *
 * 校验不过就中止，绝不让缺来源的内容上线。
 *
 * 结构：三个模块（drugs / labs / wellness）+ 一组隐藏分类（diseases / medications）。
 * 隐藏分类照样生成页面与索引，只是不进导航、并加 noindex。
 */
import { readFile, writeFile, mkdir, rm, copyFile, stat } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import MiniSearch from "minisearch";

import {
  CATEGORIES,
  MODULES,
  HIDDEN_CATEGORIES,
  LEGACY_STUBS,
  EVIDENCE_LABEL,
  drugAnchor,
  loadContent,
  splitFrontmatter,
} from "./lib/content.mjs";
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

/**
 * marked 的删除线分词器把**单个 `~`** 也当成分隔符（正则里捕获的是 `~` 或 `~~`），
 * 于是「18.5~23.9」「140~159」这类范围会被渲染成 `18.5<del>23.9</del>`——
 * 数字还在，但它们之间的文字全被划掉了，而且**构建不报错、颜色上也不显眼**。
 * 这个站通篇是数值范围，所以必须在这里挡住。
 *
 * 只转义落单的 `~`；成对的 `~~`（真的想用删除线）原样保留。
 * 交替顺序很重要：`~~` 必须排在 `~` 前面，否则成对的会被拆开。
 */
function escapeLoneTildes(markdown) {
  return String(markdown ?? "").replace(/~~|~/g, (m) => (m === "~~" ? "~~" : "\\~"));
}

const renderMarkdown = (markdown) => marked.parse(escapeLoneTildes(markdown));

const renderer = createRenderer({
  config,
  categories: CATEGORIES,
  evidenceLabel: EVIDENCE_LABEL,
});

const files = new Map(); // 相对路径 → 内容
const outPath = (rel) => join(outDir, rel);
const put = (rel, html) => files.set(rel, html);
const entriesOf = (key) => entries.filter((e) => e.category === key);

// ---- 条目页 ----
for (const entry of entries) {
  let bodyHtml = renderMarkdown(entry.body);

  // 药品的对照表来自 frontmatter 的结构化数据
  if (Array.isArray(entry.data.drugs) && entry.data.drugs.length) {
    const injected = renderer.injectDrugTable(bodyHtml, entry.data.drugs);
    if (injected === null) {
      console.error(`✗ ${entry.relPath} 正文里找不到 <!--DRUGS_TABLE--> 占位标记，构建中止`);
      process.exit(1);
    }
    bodyHtml = injected;
  }

  const related = entries
    .filter((e) => e.category === entry.category && e !== entry)
    .slice(0, 6);

  put(
    `${entry.category}/${entry.data.slug}/index.html`,
    renderer.entryPage({ entry, bodyHtml, related }),
  );
}

// ---- 三个模块页 ----
/**
 * 模块级的说明文字。存在 `content/_modules/<模块>.md` 里，没有就返回空。
 * 之所以需要它：十个药品分类各自的「使用这张表要注意的」原本逐字节相同——
 * 同一段话抄十遍，不是内容，是重复。共享的部分放这里，只出现一次。
 */
async function moduleIntro(moduleKey) {
  try {
    const raw = await readFile(join(contentDir, "_modules", `${moduleKey}.md`), "utf8");
    const { body } = splitFrontmatter(raw);
    return `<div class="entry">${renderMarkdown(body)}</div>`;
  } catch {
    return "";
  }
}

const moduleSummaries = [];
for (const [moduleKey, moduleMeta] of Object.entries(MODULES).sort((a, b) => a[1].order - b[1].order)) {
  const groups = moduleMeta.categories
    .map((key) => ({ key, meta: CATEGORIES[key], entries: entriesOf(key) }))
    .filter((g) => g.entries.length > 0);
  if (!groups.length) continue;

  put(
    `${moduleKey}/index.html`,
    renderer.listingPage({
      title: moduleMeta.label,
      description: moduleMeta.description,
      path: `${moduleKey}/`,
      active: `${moduleKey}/`,
      groups,
      moduleKey,
      intro: await moduleIntro(moduleKey),
    }),
  );

  const drugCount = groups.reduce(
    (n, g) => n + g.entries.reduce((m, e) => m + (Array.isArray(e.data.drugs) ? e.data.drugs.length : 0), 0),
    0,
  );
  const entryCount = groups.reduce((n, g) => n + g.entries.length, 0);
  moduleSummaries.push({
    href: `${moduleKey}/`,
    eyebrow: moduleMeta.note ?? "",
    title: moduleMeta.label,
    desc: moduleMeta.description,
    count:
      drugCount > 0 && moduleKey === "drugs"
        ? `${drugCount} 种药 · ${entryCount} 张分类对照表`
        : `${entryCount} 条`,
  });
}

// ---- 隐藏分类的列表页（老 URL 不能断，但要 noindex）----
for (const key of HIDDEN_CATEGORIES) {
  const list = entriesOf(key);
  if (!list.length) continue;
  put(
    `${key}/index.html`,
    renderer.listingPage({
      title: CATEGORIES[key].label,
      description: CATEGORIES[key].description,
      path: `${key}/`,
      active: "",
      groups: [{ key, meta: CATEGORIES[key], entries: list }],
      noindex: true,
    }),
  );
}

// ---- 首页 ----
const hiddenCount = HIDDEN_CATEGORIES.reduce((n, key) => n + entriesOf(key).length, 0);
put("index.html", renderer.homePage({ cards: moduleSummaries, total: entries.length, hiddenCount }));

// ---- 免责声明页 / 搜索页 ----
put("disclaimer/index.html", renderer.disclaimerPage());
put("search/index.html", renderer.searchPage());

// ---- 旧地址存根：不 404 ----
for (const s of LEGACY_STUBS) {
  put(s.from + "index.html", renderer.stubPage(s));
}

/* ---------------------------------------------------- 3. 搜索索引 */
// tokenize 与搜索参数都与浏览器端共用同一份实现（src/client/tokenize.js），
// 避免两端漂移导致「索引里有、搜不到」。

const entryDocs = entries.map((e) => ({
  id: `${e.category}/${e.data.slug}`,
  url: `${config.base}${e.category}/${e.data.slug}/`,
  title: e.data.title,
  summary: e.data.summary,
  category: CATEGORIES[e.category]?.module ? MODULES[CATEGORIES[e.category].module].label : e.category,
  tags: (e.data.tags ?? []).join(" "),
  body: e.body.replace(/<[^>]+>/g, " ").replace(/[#*`>|【】]/g, " "),
}));

// 每一种药单独成一条索引：搜「泰诺林」要命中那一行，不是命中一整张表。
const drugDocs = [];
for (const e of entries) {
  for (const d of Array.isArray(e.data.drugs) ? e.data.drugs : []) {
    const anchor = drugAnchor(d.name);
    drugDocs.push({
      id: `${e.category}/${e.data.slug}#${anchor}`,
      url: `${config.base}${e.category}/${e.data.slug}/#${anchor}`,
      title: d.name,
      summary: d.effect,
      category: "药品速查",
      tags: [...(d.aliases ?? []), ...(d.brands ?? [])].join(" "),
      body: [d.effect, ...(d.aliases ?? []), ...(d.brands ?? [])].join(" "),
    });
  }
}

const mini = new MiniSearch(SEARCH_OPTIONS);
mini.addAll([...entryDocs, ...drugDocs]);

put("search-index.json", JSON.stringify(mini.toJSON()));

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
console.log(`  索引       ${(JSON.stringify(mini.toJSON()).length / 1024).toFixed(1)} KiB（${entryDocs.length} 条内容 + ${drugDocs.length} 种药）`);
for (const m of moduleSummaries) console.log(`  模块       ${m.title}：${m.count}`);
console.log(`  隐藏分类   ${HIDDEN_CATEGORIES.map((k) => `${CATEGORIES[k].label}(${entriesOf(k).length})`).join(" ")}`);
console.log(`  旧地址存根 ${LEGACY_STUBS.map((s) => s.from).join(" ")}`);
console.log(`\n预览：node scripts/serve.mjs`);
