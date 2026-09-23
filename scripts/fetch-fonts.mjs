/**
 * scripts/fetch-fonts.mjs
 *
 * 从 Google Fonts 取「拉丁」子集的 woff2，落到 src/fonts/，
 * 并生成 src/styles/fonts.css（本地相对路径，Vite 会处理 base path）。
 *
 * 为什么只取拉丁：中文走系统宋体栈。把 3 MiB 的中文字体塞进静态站点，
 * 换来的是亲戚在 4G 下等 3 秒 —— 不值得。
 *
 * 需要联网（Node 内置 fetch 通道）。可重复执行：文件同名覆盖。
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const fontDir = join(root, "src", "fonts");
const cssOut = join(root, "src", "styles", "fonts.css");

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const API =
  "https://fonts.googleapis.com/css2" +
  "?family=EB+Garamond:wght@400;600" +
  "&family=Playfair+Display:wght@600" +
  "&display=swap";

// 只取 latin：中文站点的拉丁字符仅用于标题与数字，
// latin-ext（每片 111 KiB）覆盖的带音标字符几乎不会出现，不值得进仓库。
const KEEP_SUBSETS = new Set(["latin"]);

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

async function main() {
  await mkdir(fontDir, { recursive: true });

  const cssRes = await fetch(API, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(30000),
  });
  if (!cssRes.ok) throw new Error(`Google Fonts CSS ${cssRes.status}`);
  const css = await cssRes.text();

  const blocks = [
    ...css.matchAll(/\/\*\s*([a-z0-9-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/gi),
  ];
  if (blocks.length === 0) throw new Error("未从 CSS 中解析出 @font-face 分片");

  const out = [
    "/* 由 scripts/fetch-fonts.mjs 自动生成，请勿手改 —— 重跑脚本即可 */",
    `/* 来源：${API} */`,
    "",
  ];
  const manifest = [];

  for (const [, subset, body] of blocks) {
    if (!KEEP_SUBSETS.has(subset.toLowerCase())) continue;

    const family = (body.match(/font-family:\s*'([^']+)'/) || [])[1];
    const style = (body.match(/font-style:\s*([a-z]+)/) || [])[1] || "normal";
    const weight = (body.match(/font-weight:\s*(\d+)/) || [])[1] || "400";
    const url = (body.match(/src:\s*url\(([^)]+)\)\s*format\('woff2'\)/) || [])[1];
    const range = (body.match(/unicode-range:\s*([^;]+);/) || [])[1];
    if (!family || !url || !range) continue;

    const name = `${slug(family)}-${subset.toLowerCase()}-${weight}-${style}.woff2`;
    const buf = Buffer.from(
      await (await fetch(url, { signal: AbortSignal.timeout(30000) })).arrayBuffer(),
    );
    await writeFile(join(fontDir, name), buf);
    manifest.push({ name, family, weight, style, subset, bytes: buf.length });

    out.push(
      "@font-face {",
      `  font-family: "${family}";`,
      `  font-style: ${style};`,
      `  font-weight: ${weight};`,
      "  font-display: swap;",
      `  src: url("../fonts/${name}") format("woff2");`,
      `  unicode-range: ${range.trim()};`,
      "}",
      "",
    );
  }

  await writeFile(cssOut, out.join("\n"), "utf8");

  let total = 0;
  for (const f of manifest) {
    total += f.bytes;
    console.log(
      `  ${f.name}  ${(f.bytes / 1024).toFixed(1)} KiB  (${f.family} ${f.weight} ${f.style} / ${f.subset})`,
    );
  }
  console.log(`共 ${manifest.length} 个字体文件，合计 ${(total / 1024).toFixed(1)} KiB`);
  console.log(`已写出 ${cssOut}`);
}

await main();
