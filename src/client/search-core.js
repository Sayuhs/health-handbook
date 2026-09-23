/**
 * src/client/search-core.js
 * 索引加载与查询。纯逻辑，不碰 DOM——搜索页与自测页共用。
 */
import MiniSearch from "./minisearch.js";

const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });

/** 与构建端 scripts/build.mjs 里的 tokenize 必须保持一致 */
function tokenize(text) {
  const t = String(text ?? "").normalize("NFKC").toLowerCase();
  const tokens = [];
  for (const seg of segmenter.segment(t)) if (seg.isWordLike) tokens.push(seg.segment);
  // 单字兜底：让「压高」这类非词子串也能命中
  for (const ch of t.replace(/[^\u4e00-\u9fff]/g, "")) tokens.push(ch);
  return tokens;
}

const OPTIONS = {
  fields: ["title", "summary", "tags", "body"],
  storeFields: ["url", "title", "summary", "category"],
  tokenize,
  searchOptions: { prefix: true, combineWith: "OR", boost: { title: 3, summary: 2 } },
};

let indexPromise = null;

/** 懒加载：只有真正要搜的时候才去取索引 */
export function loadIndex() {
  if (!indexPromise) {
    const url = new URL("../search-index.json", import.meta.url);
    indexPromise = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`索引加载失败：${r.status}`);
        return r.text();
      })
      .then((text) => MiniSearch.loadJSON(text, OPTIONS));
  }
  return indexPromise;
}

export async function query(text, limit = 20) {
  const q = String(text ?? "").trim();
  if (q.length < 2) return [];
  const index = await loadIndex();
  return index.search(q).slice(0, limit).map((r) => ({
    url: r.url,
    title: r.title,
    summary: r.summary,
    category: r.category,
    score: r.score,
  }));
}

export function tokenizeForHighlight(text) {
  return tokenize(text).filter((t) => t.length >= 1);
}
