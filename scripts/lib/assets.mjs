/**
 * scripts/lib/assets.mjs
 * 把 src/styles 与 src/fonts 处理成可以直接放在 GitHub Pages 子路径下的产物。
 *
 * 之所以自己合并 CSS：站点部署在 /health-handbook/ 子路径下，
 * CSS 里 url("../fonts/x.woff2") 这类相对路径必须重写成带 base 的绝对路径，
 * 否则字体静默 404，排版退化到系统字体——而且不会有人发现。
 */

export const HEADER = "/* 由 scripts/build.mjs 合并生成，请勿手改。改样式请改 src/styles/ */\n";

/** 读取 global.css，按 @import 顺序内联，并重写字体路径 */
export async function buildStyles({ root, stylesDir, base, readFile }) {
  const path = await import("node:path");
  const entry = path.join(stylesDir, "global.css");
  const raw = await readFile(entry, "utf8");

  const imports = [...raw.matchAll(/@import\s+["']([^"']+)["']\s*;/g)].map((m) => m[1]);
  if (imports.length === 0) throw new Error("global.css 里没有找到任何 @import");

  const parts = [HEADER];
  for (const rel of imports) {
    let css = await readFile(path.join(stylesDir, rel), "utf8");
    css = css.replace(/url\(\s*["']?\.\.\/fonts\/([^"')]+)["']?\s*\)/g, `url("${base}fonts/$1")`);
    parts.push(`\n/* ================= ${rel} ================= */\n${css}`);
  }
  return parts.join("\n");
}

/** 字体文件名清单（供复制与预加载提示） */
export const FONT_FILES = [
  "ebgaramond-latin-400-normal.woff2",
  "ebgaramond-latin-600-normal.woff2",
  "playfairdisplay-latin-600-normal.woff2",
];
