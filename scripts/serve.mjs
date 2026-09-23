#!/usr/bin/env node
/**
 * scripts/serve.mjs — 本地预览
 *
 * 关键点：它把 dist/ 挂载在 /health-handbook/ 下面，**模拟 GitHub Pages 的子路径**。
 * 如果在本地直接双击 HTML 文件看，那些绝对路径链接会全断，
 * 你会以为是自己写错了样式，其实只是没在真实路径下打开。
 *
 *   node scripts/serve.mjs
 *   node scripts/serve.mjs .notes/fixtures/dist
 *   PORT=5000 node scripts/serve.mjs
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const config = JSON.parse(await readFile(join(root, "site.config.json"), "utf8"));

const outDir = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : join(root, "dist");
const base = config.base;
const port = Number(process.env.PORT ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://localhost:${port}`).pathname);

  // 根路径重定向到 base，模拟 Pages 的行为
  if (pathname === "/") {
    res.writeHead(302, { location: base });
    res.end();
    return;
  }

  if (!pathname.startsWith(base)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 — 站点挂载在 ${base} 下，请访问 http://localhost:${port}${base}`);
    return;
  }

  let rel = pathname.slice(base.length);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";

  // 防目录穿越
  const target = join(outDir, normalize(rel));
  if (!target.startsWith(outDir + sep) && target !== outDir) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("403");
    return;
  }

  try {
    const info = await stat(target);
    if (info.isDirectory()) {
      res.writeHead(302, { location: pathname.replace(/\/?$/, "/") + "index.html" });
      res.end();
      return;
    }
    const body = await readFile(target);
    res.writeHead(200, {
      "content-type": MIME[extname(target).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end(`404 — ${rel} 不存在。先跑 node scripts/build.mjs 了吗？`);
  }
});

server.listen(port, () => {
  console.log(`本地预览（已模拟 base path）：`);
  console.log(`  http://localhost:${port}${base}`);
  console.log(`  产物目录：${outDir}`);
});
