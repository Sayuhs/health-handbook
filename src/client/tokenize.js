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

  // 1) 词典分词：能切出词就切词，**只收两个字以上的**
  //
  //    单字在中文里几乎不携带信息：「高」会命中高尿酸、高血压、升高、增高……
  //    实测过：搜「血压 高」因为查询里多了个单字「高」，结果从 13 条炸到 39 条，
  //    还把「尿酸」顶到了第三位。而界面本来就要求输入两个字以上才搜，
  //    所以单字留在索引里没有任何查询会用到它——只有害处。
  for (const seg of SEGMENTER.segment(t)) {
    if (seg.isWordLike && seg.segment.length > 1) tokens.push(seg.segment);
  }

  // 2) 相邻双字组合（bigram）
  //
  //    为什么不用单字兜底：`Intl.Segmenter` 认不出药品商品名这类专有名词——
  //    「泰诺林」会被切成「泰」「诺」「林」，正确页面拿不到完整词的分，
  //    而无关页面靠单字乱命中。实测过：搜「思密达」曾把骨质疏松排到首位，
  //    搜「泰诺林」与 analgesics 并列的是 antiinfective。
  //
  //    bigram 让「泰诺林」同时产生「泰诺」「诺林」两个 token：
  //    既能精确命中，噪音又比单字小得多，体积也相近。
  //    它同时也保住了子串查询能力（「压高」「脖子硬」都能命中）——
  //    这是 Pagefind 官方 issue #987 承认做不到的事。
  //
  //    只对连续的中文段生成，避免把「泰诺林 必理通」跨词拼成「林必」。
  for (const run of t.match(/[\u4e00-\u9fff]+/g) ?? []) {
    for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2));
  }

  return tokens;
}

export const SEARCH_OPTIONS = {
  fields: ["title", "summary", "tags", "body"],
  // `body` 也存下来：结果卡片要能**解释自己**。只给标题和一句话结论的话，
  // 一个只命中正文的结果看起来就毫无道理——实测过：搜「血压」时「老年人防跌倒」
  // 排在第 7 位（那一页真的写了低血压与体位性血压测量），但标题和结论里没有
  // 「血压」二字，高亮什么也高亮不出来，于是看着像乱给。
  storeFields: ["url", "title", "summary", "category", "body"],
  tokenize,
  searchOptions: {
    prefix: true,
    combineWith: "OR",
    boost: { title: 3, summary: 2 },
  },
};
