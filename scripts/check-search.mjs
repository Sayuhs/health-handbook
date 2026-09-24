#!/usr/bin/env node
/**
 * scripts/check-search.mjs — 搜索实测
 *
 * 用**真实索引**跑一批代表性查询，检查召回与排序。
 * 与浏览器端共用同一份 tokenize 与搜索参数（src/client/tokenize.js），
 * 所以这里的结果就是用户在搜索框里会看到的结果。
 *
 * 现在它**有断言**：MUST_HIT 里任何一个查询零命中，脚本以非零码退出。
 * 搜索退化必须被拦住，而不是被人「看一眼觉得还行」。
 *
 *   node scripts/check-search.mjs
 *   node scripts/check-search.mjs <索引文件>
 */
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import MiniSearch from "minisearch";
import { SEARCH_OPTIONS } from "../src/client/tokenize.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const indexFile = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(root, "dist", "search-index.json");

const raw = await readFile(indexFile, "utf8");
const index = MiniSearch.loadJSON(raw, SEARCH_OPTIONS);

/** 必须命中的查询。任何一个零命中 = 失败。 */
const MUST_HIT = [
  // —— 商品名反查：药品速查的核心用途，拿着药盒认成分 ——
  "泰诺林", "芬必得", "洛赛克", "吗丁啉", "开瑞坦", "顺尔宁", "西乐葆", "思密达",
  "百多邦", "达克宁", "扶他林",
  // —— 通用名 ——
  "布洛芬", "奥美拉唑", "对乙酰氨基酚", "孟鲁司特", "莫匹罗星",
  // —— 俗名（frontmatter 的 aliases 栏） ——
  "扑热息痛", "消炎痛",
  // —— 疾病（隐藏分类，但必须搜得到） ——
  "痛风", "哮喘", "乙肝", "青光眼", "脂肪肝", "骨质疏松", "贫血", "幽门螺杆菌", "反流",
  // —— 体检指标 ——
  "血压", "血糖", "血脂", "尿酸", "甲状腺",
  // —— 养生 ——
  "膳食纤维", "全谷物", "坚果", "含糖饮料", "久坐",
  // —— 分词压力测试（只有靠 bigram 才可能命中） ——
  "压高", "感觉没有",
];

/**
 * 已知空洞：这些查询**以前能命中，现在不行了**，原因是设计决定而非回归。
 *
 * `symptoms` 与 `redflags` 两个分类整个删除（15 个文件），连同它们承载的
 * 急症词汇一起从站上消失。这里显式列出来，是**为了别让以后的人把它当 bug 去修**。
 */
const KNOWN_GAPS = ["止血", "止血带", "发烧", "抽搐", "惊厥", "脖子硬", "雷击样", "120"];

/**
 * 药品锚点专项：搜一个商品名，结果应当**直接落到某一行药**，
 * 而不是落到「解热镇痛类」这张表上。这是 141 种药单独进索引的意义。
 */
const ANCHOR_QUERIES = ["泰诺林", "芬必得", "百多邦", "思密达", "开瑞坦"];

console.log(`索引文件：${indexFile}`);
console.log(`文档数：${index.documentCount}\n`);

/* ---------------------------------------------------------- 断言部分 */
let failed = 0;
console.log("必须命中：");
for (const q of MUST_HIT) {
  const hits = index.search(q).slice(0, 3);
  if (hits.length === 0) failed++;
  const shown = hits.length
    ? hits.map((h) => `${h.id.split("/").pop()}(${h.score.toFixed(0)})`).join("  ")
    : "✗ 无命中";
  console.log(`  ${q.padEnd(10, "　")} ${shown}`);
}
console.log(`\n${MUST_HIT.length} 个必中查询，${failed} 个零命中。`);

/* ------------------------------------------------------------ 锚点专项 */
let anchorFailed = 0;
console.log("\n药品锚点专项（应直接落到某一行药）：");
for (const q of ANCHOR_QUERIES) {
  const hits = index.search(q).slice(0, 1);
  const top = hits[0];
  const landed = Boolean(top && String(top.id).includes("#"));
  if (!landed) anchorFailed++;
  console.log(
    `  ${q.padEnd(10, "　")} ${top ? (landed ? `✓ 落到 #${String(top.id).split("#").pop()}` : `✗ 只落到整张表：${top.id}`) : "✗ 无命中"}`,
  );
}

/* ------------------------------------------------------------ 已知空洞 */
console.log("\n已知空洞（删除急症分类造成的，属设计决定，不是回归）：");
for (const q of KNOWN_GAPS) {
  const hits = index.search(q).slice(0, 2);
  console.log(
    `  ${q.padEnd(10, "　")} ${
      hits.length
        ? `有命中，但那是 bigram 噪声（${hits.map((h) => h.id.split("/").pop()).join(", ")}）——站上已经没有对应的内容了，别据此把它挪进必中列表`
        : "（无命中，符合预期）"
    }`,
  );
}

const problems = failed + anchorFailed;
console.log(
  problems
    ? `\n✗ ${problems} 处不合格（必中零命中 ${failed}，锚点未落行 ${anchorFailed}）`
    : "\n✓ 全部通过",
);
process.exit(problems ? 1 : 0);
