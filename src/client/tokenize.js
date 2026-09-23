/**
 * src/client/tokenize.js
 *
 * 中文分词与搜索参数 —— **构建端（scripts/build.mjs）与浏览器端共用这一份实现**。
 *
 * 两端各写一份是这类项目最典型的自伤：一端改了、另一端没改，
 * 于是出现「索引里有、搜不到」的鬼问题，而且极难排查。
 * 所以连搜索参数也从这里导出，避免字段名与权重漂移。
 *
 * 没有依赖，浏览器与 Node 都能直接 import。
 */
const SEGMENTER = new Intl.Segmenter("zh-CN", { granularity: "word" });

export function tokenize(text) {
  const t = String(text ?? "")
    .normalize("NFKC")
    .toLowerCase();

  const tokens = [];
  for (const seg of SEGMENTER.segment(t)) {
    if (seg.isWordLike) tokens.push(seg.segment);
  }

  // 单字兜底：让「压高」「感觉没有」这类非词/乱序子串也能命中。
  // Pagefind 官方 issue #987 承认它做不到这件事（中文子串查询 often return no results），
  // 这正是我们不用 Pagefind 的原因之一。
  for (const ch of t.replace(/[^\u4e00-\u9fff]/g, "")) tokens.push(ch);

  return tokens;
}

export const SEARCH_OPTIONS = {
  fields: ["title", "summary", "tags", "body"],
  storeFields: ["url", "title", "summary", "category"],
  tokenize,
  searchOptions: {
    prefix: true,
    combineWith: "OR",
    boost: { title: 3, summary: 2 },
  },
};
