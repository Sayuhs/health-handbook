#!/usr/bin/env node
/**
 * scripts/validate-content.mjs
 *
 * 内容体检。构建流程的第一步，**任何 error 都会让构建中止**。
 *
 *   node scripts/validate-content.mjs              # 校验 content/
 *   node scripts/validate-content.mjs <dir>        # 校验指定目录（测试用）
 */
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadContent, CATEGORIES } from "./lib/content.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const target = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(root, "content");

const { entries, errors, warnings } = await loadContent(target);

const rel = (p) => relative(root, p).split("\\").join("/");
console.log(`校验目录：${rel(target)}`);
console.log("");

if (entries.length === 0) {
  console.log("（目录里还没有任何条目）");
}

// 按分类统计
const byCategory = new Map();
for (const e of entries) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + 1);

for (const [key, meta] of Object.entries(CATEGORIES)) {
  const n = byCategory.get(key) ?? 0;
  const bar = n > 0 ? "█".repeat(Math.min(n, 20)) : "";
  console.log(`  ${String(meta.order).padStart(2)}. ${meta.label.padEnd(9, "　")} ${String(n).padStart(2)} 条  ${bar}`);
}
console.log(`\n合计 ${entries.length} 条`);

if (errors.length) {
  console.log(`\n✗ ${errors.length} 个错误（构建会中止）：`);
  for (const e of errors) console.log(`  ${e.file}  [${e.field}]  ${e.msg}`);
}

if (warnings.length) {
  console.log(`\n! ${warnings.length} 个警告（不阻塞）：`);
  for (const w of warnings) console.log(`  ${w.file}  [${w.field}]  ${w.msg}`);
}

if (!errors.length && !warnings.length && entries.length) {
  console.log("\n✓ 全部通过");
}

process.exit(errors.length ? 1 : 0);
