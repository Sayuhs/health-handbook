#!/usr/bin/env node
/**
 * scripts/check-search.mjs — 搜索实测
 *
 * 用**真实索引**跑一批代表性查询，检查召回与排序。
 * 与浏览器端共用同一份 tokenize 与搜索参数（src/client/tokenize.js），
 * 所以这里的结果就是用户在搜索框里会看到的结果。
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

/** 覆盖：商品名反查 / 完整词 / 非词子串 / 乱序子串 / 数字 / 拉丁 */
const QUERIES = [
  // —— 商品名反查：药物速查栏目的核心用途，拿着药盒认成分 ——
  "泰诺林", "芬必得", "洛赛克", "吗丁啉", "开瑞坦", "顺尔宁", "西乐葆", "思密达",
  // —— 通用名 ——
  "布洛芬", "奥美拉唑", "对乙酰氨基酚", "孟鲁司特",
  // —— 症状与疾病 ——
  "胸痛", "胸口压榨", "心梗", "冷汗",
  "卒中", "中风", "脸歪", "说话不清",
  "呼吸困难", "喘不上气", "哮喘",
  "过敏", "休克", "皮疹",
  "出血", "止血", "止血带",
  "头痛", "雷击样", "脖子硬",
  "发烧", "高热", "惊厥", "抽搐",
  "痛风", "尿酸", "关节", "甲状腺", "结节",
  "干眼", "眼睛", "青光眼", "乙肝",
  "血压", "血糖", "血脂", "脂肪肝",
  "颈椎", "骨质疏松", "贫血", "幽门螺杆菌", "反流",
  // —— 食物与养生 ——
  "膳食纤维", "全谷物", "深色蔬菜", "坚果", "含糖饮料",
  // —— 分词压力测试 ——
  "压高", "感觉没有", "120",
];

console.log(`索引文件：${indexFile}`);
console.log(`文档数：${index.documentCount}\n`);

let empty = 0;
const lines = [];

for (const q of QUERIES) {
  const hits = index.search(q).slice(0, 3);
  if (hits.length === 0) empty++;
  const shown = hits.length
    ? hits.map((h) => `${h.id.split("/").pop()}(${h.score.toFixed(0)})`).join("  ")
    : "（无命中）";
  lines.push(`  ${q.padEnd(10, "　")} ${shown}`);
}

console.log(lines.join("\n"));
console.log(`\n共 ${QUERIES.length} 个查询，零命中 ${empty} 个。`);

// 单字兜底专项：这些查询只有靠单字索引才可能命中
const SUBSTRING = ["压高", "感觉没有", "脖子硬"];
console.log("\n单字兜底专项（Pagefind 官方承认做不到的查询）：");
for (const q of SUBSTRING) {
  const hits = index.search(q).slice(0, 2);
  console.log(`  ${q.padEnd(10, "　")} ${hits.length ? hits.map((h) => h.id.split("/").pop()).join(", ") : "（无命中——需要检查）"}`);
}
