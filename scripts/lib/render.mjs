/**
 * scripts/lib/render.mjs
 * HTML 模板层。所有输出都是静态字符串，没有运行时依赖。
 *
 * 结构：三个模块（药品速查 / 体检指标速查 / 养生）+ 一组隐藏分类。
 * 隐藏分类仍然生成页面（老 URL 不能断），只是不进导航、并加 noindex。
 */
import { drugAnchor } from "./content.mjs";

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

/** 首屏前执行：决定主题，避免闪白。（字号与对比度两档控件已删，这里也不再读它们） */
const THEME_BOOT = `(function(){try{
var e=document.documentElement;
var t=localStorage.getItem("hh-theme")||"auto";
var d=window.matchMedia("(prefers-color-scheme: dark)").matches;
e.dataset.theme=(t==="auto")?(d?"dark":"light"):t;
}catch(_){}})();`;

export function createRenderer({ config, categories }) {
  const base = config.base;
  const url = (p = "") => base + p;

  /* ---------------------------------------------------------------- 外壳 */
  function layout({ title, description, path = "", body, active = "", noindex = false }) {
    const fullTitle = path ? `${esc(title)} · ${esc(config.title)}` : `${esc(config.title)} · ${esc(config.tagline)}`;
    const canonical = config.site.replace(/\/$/, "") + url(path);

    const nav = config.nav
      .map((item) => {
        const href = url(item.href);
        const isActive = item.href === active;
        return `<a href="${href}"${isActive ? ' aria-current="page"' : ""}>${esc(item.label)}</a>`;
      })
      .join("\n        ");

    return `<!doctype html>
<html lang="${esc(config.lang)}" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${fullTitle}</title>
<meta name="description" content="${esc(description || config.tagline)}">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex, follow">' : ""}
<meta property="og:type" content="${path ? "article" : "website"}">
<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:locale" content="zh_CN">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description || config.tagline)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(config.site.replace(/\/$/, "") + url("og.png"))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(config.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#f5f0e4">
<link rel="stylesheet" href="${url("styles.css")}">
<script>${THEME_BOOT}</script>
</head>
<body>
<a class="skip-link" href="#main">跳到主要内容</a>
<header class="site-header">
  <div class="wrap site-header__inner">
    <button class="theme-toggle" type="button" data-toggle-theme aria-label="切换主题"></button>
    <p class="site-title"><a href="${url()}">${esc(config.title)}</a></p>
    <p class="site-tagline">${esc(config.tagline)}</p>
    <nav class="site-nav" aria-label="主导航">
        ${nav}
    </nav>
  </div>
</header>
<main class="main" id="main">
<div class="wrap">
${body}
</div>
</main>
<script type="module" src="${url("assets/controls.js")}"></script>
</body>
</html>`;
  }

  /* ------------------------------------------------------------ 面包屑 */
  function breadcrumb(items) {
    const lis = items
      .map((it, i) =>
        it.href
          ? `<li><a href="${it.href}">${esc(it.label)}</a></li>`
          : `<li aria-current="page">${esc(it.label)}</li>`,
      )
      .join("");
    return `<nav class="breadcrumb" aria-label="当前位置"><ol>${lis}</ol></nav>`;
  }

  /* -------------------------------------------------------------- 条目列表 */
  function entryList(entries) {
    return `<ul class="entry-list">
${entries
  .map(
    (e) => `  <li><a href="${url(`${e.category}/${e.data.slug}/`)}">
    <span class="entry-list__title">${esc(e.data.title)}</span>
    <p class="entry-list__summary">${esc(e.data.summary)}</p>
  </a></li>`,
  )
  .join("\n")}
</ul>`;
  }

  /* -------------------------------------------------------------- 首页 */
  function homePage({ cards, total, hiddenCount }) {
    const cardHtml = cards
      .map(
        (c) => `<a class="card" href="${url(c.href)}">
  <p class="card__eyebrow">${esc(c.eyebrow ?? "")}</p>
  <h3 class="card__title">${esc(c.title)}</h3>
  <p class="card__desc">${esc(c.desc ?? "")}</p>
  <p class="card__count">${esc(c.count)}</p>
</a>`,
      )
      .join("\n");

    const body = `<h1>${esc(config.title)}</h1>
<p class="lede">三个模块，一个搜索框。这是给自己和家里人用的一本速查手册——<strong>不写诊断，不给可能性，只写事实与门槛</strong>。每条都标了来源与复核日期。</p>

<section class="section">
  <div class="grid grid--2">
${cardHtml}
  </div>
</section>

<p class="lede">站上共 ${total} 条内容；另有 ${hiddenCount} 条常识（常见疾病、用药与检查）不在导航里，但<strong>搜索得到</strong>，老链接也打得开。</p>`;
    return layout({ title: "", description: config.tagline, path: "", body, active: "" });
  }

  /* -------------------------------------------------- 模块页 / 分类页 */
  /**
   * 模块页与隐藏分类的列表页共用这一个模板。
   * groups 是一个模块下的若干分类；只有一个分类时不再多套一层标题。
   */
  function listingPage({ title, description, path, active, groups, noindex = false, moduleKey, intro = "" }) {
    const multiple = groups.length > 1;
    const sections = groups
      .map((g) => {
        const heading = multiple
          ? `<h2 class="section__title">${esc(g.meta.section ?? g.meta.label)}</h2>
<p class="lede">${esc(g.meta.description ?? "")}</p>`
          : "";
        return `<section class="section">
  ${heading}
  ${entryList(g.entries)}
</section>`;
      })
      .join("\n");

    const crumb = moduleKey
      ? breadcrumb([{ label: config.title, href: url() }, { label: title }])
      : breadcrumb([{ label: config.title, href: url() }, { label: title }]);

    const body = `${crumb}
<h1>${esc(title)}</h1>
<p class="lede">${esc(description ?? "")}</p>
${sections}
${intro}`;

    return layout({ title, description, path, body, active, noindex });
  }

  /* ------------------------------------------------------------ 药品表 */
  /**
   * 药品对照表由 frontmatter 的结构化数据渲染——不是手写表格。
   * 每一行有稳定锚点，搜索命中某一种药时可以直接跳到这里的那一行。
   */
  function drugTable(items) {
    const rows = items
      .map((d) => {
        const anchor = drugAnchor(d.name);
        const aliases = (d.aliases ?? []).filter(Boolean);
        const brands = (d.brands ?? []).filter(Boolean);
        return `<tr id="${esc(anchor)}">
  <th scope="row">
    <span class="drug__name">${esc(d.name)}</span>
    ${aliases.length ? `<span class="drug__alias">俗名：${esc(aliases.join("、"))}</span>` : ""}
  </th>
  <td class="drug__effect">${esc(d.effect)}</td>
  <td class="drug__brands">${brands.length ? esc(brands.join("、")) : "—"}</td>
</tr>`;
      })
      .join("\n");

    return `<section class="section">
  <h2 class="section__title">对照表</h2>
  <p class="lede">「名称」是药盒上印的通用名；「俗名」是大家平时那么叫、但药盒上不一定印的名字；最右一列是常见的商品名。</p>
  <div class="table-scroll">
    <table class="drug-table">
      <thead>
        <tr>
          <th scope="col">名称（通用名）</th>
          <th scope="col">主要作用</th>
          <th scope="col">常见商品名</th>
        </tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
</section>`;
  }

  /** 正文里的 <!--DRUGS_TABLE--> 标记换成真表格 */
  function injectDrugTable(bodyHtml, items) {
    // marked 会把单独一行的 HTML 注释当成 HTML 块原样输出，不包 <p>；
    // 但也不排除某些情况下被包进段落。两种都接受。
    const marker = /(?:<p>\s*)?<!--\s*DRUGS_TABLE\s*-->(?:\s*<\/p>)?/;
    if (!marker.test(bodyHtml)) return null;
    return bodyHtml.replace(marker, drugTable(items));
  }

  /* ------------------------------------------------------------ 条目页 */
  function entryPage({ entry, bodyHtml, related }) {
    const d = entry.data;
    const meta = categories[entry.category];
    const noindex = Boolean(meta?.hidden);

    const relatedList = related.length
      ? `<section class="section">
  <h2 class="section__title">同一分类下的其他条目</h2>
  ${entryList(related)}
</section>`
      : "";

    const body = `${breadcrumb([
      { label: config.title, href: url() },
      { label: meta?.label ?? entry.category, href: meta?.hidden ? undefined : url(`${entry.category}/`) },
      { label: d.title },
    ])}
<article class="entry">
  <header class="entry-head">
    <p class="entry-head__eyebrow">${esc(meta?.label ?? entry.category)}</p>
    <h1>${esc(d.title)}</h1>
  </header>
  <p class="entry__lead">${esc(d.summary)}</p>
  ${bodyHtml}
</article>
${relatedList}`;

    return layout({
      title: d.title,
      description: d.summary,
      path: `${entry.category}/${d.slug}/`,
      body,
      active: meta?.hidden ? "" : `${meta?.module ?? entry.category}/`,
      noindex,
    });
  }

  /* ------------------------------------------------------------ 搜索页 */
  function searchPage() {
    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: "搜索" }])}
<h1>搜索</h1>
<p class="lede">输入药品名、商品名、指标名称或身体感受。索引覆盖站上全部内容，包括不在导航里的那些条目。</p>

<div class="search">
  <div class="search__field">
    <input class="search__input" type="search" id="q" placeholder="例如：泰诺林、血压、尿酸、睡眠" autocomplete="off" aria-label="搜索关键词">
  </div>
  <p class="search__hint" id="search-hint">输入两个字以上开始搜索。索引在首次输入时才加载。</p>
  <ul class="search__results" id="results" hidden></ul>
</div>
<script type="module" src="${url("assets/search.js")}"></script>`;

    return layout({ title: "搜索", description: "站内全文搜索", path: "search/", body, active: "search/" });
  }

  /* ------------------------------------------------------------ 跳转存根 */
  /** 旧地址不 404：一个自动跳转的存根，比一片空白好。 */
  function stubPage({ fromLabel, to, toLabel, note }) {
    const target = url(to);
    const canonical = config.site.replace(/\/$/, "") + url(to);
    return `<!doctype html>
<html lang="${esc(config.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=${target}">
<link rel="canonical" href="${esc(canonical)}">
<title>${esc(fromLabel)}已移动 · ${esc(config.title)}</title>
<link rel="stylesheet" href="${url("styles.css")}">
</head>
<body>
<main class="main" id="main">
<div class="wrap">
<h1>${esc(fromLabel)}已经不在这个位置了</h1>
<p class="lede">${esc(note ?? "")}</p>
<p>正在跳转：<a href="${target}">${esc(toLabel)}</a></p>
</div>
</main>
</body>
</html>`;
  }

  return {
    layout,
    homePage,
    listingPage,
    entryPage,
    drugTable,
    injectDrugTable,
    searchPage,
    stubPage,
  };
}
