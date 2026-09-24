#!/usr/bin/env node
/**
 * scripts/check-built.mjs — 产物自检
 *
 * **构建成功不等于产物正确。** 这个脚本对着 `dist/` 断言设计约束：哪些页面该存在、
 * 哪些字样不该出现、锚点数量是否与索引一致、隐藏分类是否真的被 noindex。
 *
 * 有断言就退出 1。能被机器拦住的退化，不该靠人「看一眼觉得还行」——
 * 这个站已经吃过一次亏：`check-search.mjs` 原本只打印结果不断言，搜索退化了也没人知道。
 *
 *   node scripts/check-built.mjs
 *   node scripts/check-built.mjs <dist 目录>
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORIES, HIDDEN_CATEGORIES, MODULES, LEGACY_STUBS } from "./lib/content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const dist = resolve(process.cwd(), process.argv[2] ?? join(root, "dist"));
const contentDir = join(root, "content");

const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));

const fails = [];
const ok = (label, cond, detail = "") => {
  if (!cond) fails.push(`${label}${detail ? ` — ${detail}` : ""}`);
};

if (!existsSync(dist)) {
  console.error(`✗ 找不到 ${dist}，先跑 node scripts/build.mjs`);
  process.exit(1);
}

/* ------------------------------------------------------------ 读全部产物 */
async function walk(dir, base = "") {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${d.name}` : d.name;
    if (d.isDirectory()) out.push(...(await walk(join(dir, d.name), rel)));
    else if (d.name.endsWith(".html")) out.push(rel);
  }
  return out;
}

const pageNames = await walk(dist);
const pages = new Map();
for (const p of pageNames) pages.set(p, await readFile(join(dist, p), "utf8"));

const readDist = (rel) => (existsSync(join(dist, rel)) ? readFile(join(dist, rel), "utf8") : Promise.resolve(null));

/* --------------------------------------------------- 1. 三个模块页存在 */
for (const [key, meta] of Object.entries(MODULES)) {
  ok(`模块页 /${key}/ 存在`, existsSync(join(dist, key, "index.html")), meta.label);
}

const home = await readDist("index.html");
ok("首页存在", home !== null);
if (home) {
  const cards = [...home.matchAll(/class="card"/g)].length;
  ok("首页卡片数 = 模块数", cards === Object.keys(MODULES).length, `实际 ${cards}，模块 ${Object.keys(MODULES).length}`);
  const navLinks = [...(home.match(/<nav class="site-nav"[\s\S]*?<\/nav>/) ?? [""])[0].matchAll(/<a href=/g)].length;
  ok("顶栏项数 = nav 配置项数", navLinks === config.nav.length, `实际 ${navLinks}，配置 ${config.nav.length}`);
}

/* ------------------------------------ 2. noindex 只落在隐藏分类上 */
for (const key of HIDDEN_CATEGORIES) {
  const list = await readDist(`${key}/index.html`);
  ok(`隐藏分类 /${key}/ 存在`, list !== null, CATEGORIES[key].label);
  ok(`隐藏分类 /${key}/ 带 noindex`, Boolean(list && /name="robots" content="noindex/.test(list)));
  for (const p of pageNames.filter((n) => n.startsWith(`${key}/`) && n !== `${key}/index.html`)) {
    ok(`${p} 带 noindex`, /name="robots" content="noindex/.test(pages.get(p)));
  }
}
const STUB_PATHS = new Set(LEGACY_STUBS.map((s) => `${s.from}index.html`));
for (const p of pageNames) {
  const cat = p.split("/")[0];
  if (!CATEGORIES[cat] || CATEGORIES[cat].hidden) continue;
  // 旧地址存根本来就该 noindex（跳转页不该被收录）
  if (STUB_PATHS.has(p)) continue;
  ok(`${p} 不该有 noindex`, !/name="robots" content="noindex/.test(pages.get(p)));
}

/* ------------------------------------------- 3. 删除的功能不得留残渣 */
const FORBIDDEN = [
  ["emergency-bar", "已删除的全站紧急条"],
  ["badge--emergency", "已删除的严重度徽章"],
  ["badge--urgent", "已删除的严重度徽章"],
  ["action-level", "已删除的自测档位"],
  ["triage-form", "已删除的自测表单"],
  ["quickref__", "已删除的紧急速查样式"],
  ["<!--DRUGS_TABLE-->", "未被替换的药品表占位标记"],
];
for (const [needle, why] of FORBIDDEN) {
  const hit = pageNames.filter((p) => pages.get(p).includes(needle));
  ok(`全站不含 ${needle}`, hit.length === 0, `${why}；出现在 ${hit.slice(0, 5).join(", ")}`);
}

/* ------------------- 4. 数值范围没被当成删除线切掉 -------------------
 * marked 的删除线分词器把**单个 `~`** 也当分隔符，于是「18.5~23.9」会被渲染成
 * `18.5<del>23.9</del>` —— 数字还在，中间的文字被划掉了，而且构建不报错、页面上
 * 也不显眼。这个站通篇是数值范围，所以踩得很整齐。
 *
 * 构建端现在会把落单的 `~` 转义掉（scripts/build.mjs 的 escapeLoneTildes）。
 * 这里守住它：产物里出现的每一个 `<del>`，都必须在**源文件里真的写过 `~~`**。
 */
const entryPageRe = /^([^/]+)\/([^/]+)\/index\.html$/;
const sourceHasTildes = async (page) => {
  const m = entryPageRe.exec(page);
  const src = m
    ? await readFile(join(contentDir, m[1], `${m[2]}.md`), "utf8").catch(() => null)
    : m === null && page.endsWith("/index.html") && page.split("/").length === 2
      ? await readFile(join(contentDir, "_modules", `${page.split("/")[0]}.md`), "utf8").catch(() => null)
      : null;
  return src !== null && src.includes("~~");
};

const delPages = [];
for (const p of pageNames) {
  if (!pages.get(p).includes("<del>")) continue;
  if (!(await sourceHasTildes(p))) delPages.push(p);
}
ok(
  "产物里的 <del> 都来自源文件里真写过的 ~~",
  delPages.length === 0,
  `这些页面里的 <del> 找不到出处（多半是某个 ~ 被当成删除线了）：${delPages.slice(0, 5).join(", ")}`,
);

/* ------------------------- 4. 急症提示：全站一处都不留 -------------------------
 * 免责页已经整页删掉（站主：我自己用，天天搞这些干嘛），那一行「急症请拨 120」
 * 跟着一起没了。所以这里不再是「只允许出现在免责页」，而是**全站不许出现**。
 */
const emergencyPages = pageNames.filter((p) => pages.get(p).includes("立即拨打"));
ok("全站不含急症提示", emergencyPages.length === 0, `出现在：${emergencyPages.join(", ") || "（无）"}`);

/* ------------------------------------------------------ 5. 旧地址存根 */
for (const stub of LEGACY_STUBS) {
  const page = await readDist(`${stub.from}index.html`);
  ok(
    `旧地址 /${stub.from} 有跳转存根`,
    Boolean(page && /http-equiv="refresh"/.test(page) && /name="robots" content="noindex/.test(page)),
  );
}

/* --------------------------- 6. 药品锚点数量 = 索引里的药品文档数 */
const indexRaw = await readDist("search-index.json");
let drugDocCount = 0;
let entryDocCount = 0;
if (indexRaw) {
  const docs = JSON.parse(indexRaw);
  // MiniSearch 把 documentIds 序列化成「数字键 → id」的对象，不是数组。
  // 用 Object.keys 拿到的是 "0"、"1"…，所以必须取 values。
  for (const id of Object.values(docs.documentIds ?? {})) {
    if (String(id).includes("#")) drugDocCount++;
    else entryDocCount++;
  }
  ok("索引非空", drugDocCount + entryDocCount > 0, `${entryDocCount} 条内容 + ${drugDocCount} 种药`);
}
const drugsPages = pageNames.filter((p) => p.startsWith("drugs/") && p !== "drugs/index.html");
const rowIds = drugsPages.reduce((n, p) => n + (pages.get(p).match(/<tr id="/g) ?? []).length, 0);
ok("药品行锚点数 = 索引里的药品文档数", rowIds > 0 && rowIds === drugDocCount, `产物 ${rowIds} 行，索引 ${drugDocCount} 条`);

/* --------------------- 7. 模块级共享说明只出现一次（不在每个分类页里） */
const shared = await readFile(join(contentDir, "_modules", "drugs.md"), "utf8").catch(() => null);
if (shared) {
  const heading = (shared.match(/^##\s+(.+)$/m) ?? [])[1];
  if (heading) {
    ok("药品模块页含共享说明", (await readDist("drugs/index.html"))?.includes(heading) ?? false, heading);
    const leaked = drugsPages.filter((p) => pages.get(p).includes(heading));
    ok("共享说明没有漏进各个药品分类页", leaked.length === 0, leaked.slice(0, 5).join(", "));
  }
}

/* --------------------------------------- 8. 每个条目页都带得出来源 */
const entryPages = pageNames.filter((p) => p.split("/").length === 3 && p.endsWith("/index.html"));
for (const p of entryPages) {
  ok(`${p} 列出了来源链接`, /class="sources"/.test(pages.get(p)) && /https?:\/\//.test(pages.get(p)));
}

/* ------------------------------------------------------ 9. 静态资源 */
for (const asset of ["styles.css", "og.png", "fonts/ebgaramond-latin-400-normal.woff2", "assets/search.js", "assets/controls.js"]) {
  ok(`资源 ${asset} 存在`, existsSync(join(dist, asset)));
}
ok("自测脚本不该被打包", !existsSync(join(dist, "assets", "triage.js")));

/* ------------------------------------------------------------ 报告 */
console.log(`产物目录：${dist}`);
console.log(`页面数：${pageNames.length}（其中条目页 ${entryPages.length}）\n`);
if (fails.length) {
  console.error(`✗ ${fails.length} 项不合格：`);
  for (const f of fails) console.error(`   ${f}`);
  process.exit(1);
}
console.log("✓ 产物自检全部通过");
