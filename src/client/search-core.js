/**
 * src/client/search-core.js
 * 索引加载与查询。纯逻辑，不碰 DOM —— 搜索页与自测页共用。
 */
import MiniSearch from "./minisearch.js";
import { SEARCH_OPTIONS, tokenize } from "./tokenize.js";

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
      .then((text) => MiniSearch.loadJSON(text, SEARCH_OPTIONS));
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
  return tokenize(text);
}
