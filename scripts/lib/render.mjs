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

/** 首屏前执行：决定主题、字号、对比度，避免闪白 */
const THEME_BOOT = `(function(){try{
var e=document.documentElement;
var t=localStorage.getItem("hh-theme")||"auto";
var d=window.matchMedia("(prefers-color-scheme: dark)").matches;
e.dataset.theme=(t==="auto")?(d?"dark":"light"):t;
e.style.setProperty("--reading-scale",localStorage.getItem("hh-scale")||"1");
e.dataset.contrast=localStorage.getItem("hh-contrast")||"normal";
}catch(_){}})();`;

export function createRenderer({ config, categories, evidenceLabel }) {
  const base = config.base;
  const url = (p = "") => base + p;
  const footerNav = [...(config.nav ?? []), ...(config.footerNav ?? [])];

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
<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div class="site-footer__disclaimer">
        <h2>关于本手册</h2>
        <p class="disclaimer-short">本站是个人整理的医学常识参考，<strong>不构成诊断或治疗建议</strong>，也不能替代面诊。</p>
      </div>
      <div>
        <h2>导航</h2>
        <ul>
          ${footerNav.map((i) => `<li><a href="${url(i.href)}">${esc(i.label)}</a></li>`).join("\n          ")}
        </ul>
      </div>
      <div>
        <h2>许可</h2>
        <ul>
          <li>内容：<a href="${esc(config.license.contentUrl)}" rel="license noopener">${esc(config.license.content)}</a></li>
          <li>代码：${esc(config.license.code)}</li>
        </ul>
        <div class="controls" style="margin-top:var(--space-s)">
          <button class="control" type="button" data-scale="-1" aria-label="缩小字号">A−</button>
          <button class="control" type="button" data-scale="1" aria-label="放大字号">A+</button>
          <button class="control" type="button" data-toggle-contrast aria-pressed="false">高对比</button>
          <button class="control" type="button" data-toggle-theme>深色</button>
        </div>
      </div>
    </div>
  </div>
</footer>
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
${intro}
${sections}`;

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
    const stale = d.review_due && d.review_due < new Date().toISOString().slice(0, 10);

    const sources = (d.sources ?? [])
      .map(
        (s) => `<li><span class="sources__label">${esc(s.label)}${s.year ? `（${esc(s.year)}）` : ""}</span>
<span class="sources__url">${esc(s.url)}</span></li>`,
      )
      .join("\n");

    const relatedList = related.length
      ? `<section class="section">
  <h2 class="section__title">同一分类下的其他条目</h2>
  ${entryList(related)}
</section>`
      : "";

    const unverified =
      d.verified === false
        ? `<div class="callout callout--warn">
  <p class="callout__title">这批数据的来源标注不完整</p>
  <p>${esc(d.verification_note ?? "")}</p>
</div>`
        : "";

    const body = `${breadcrumb([
      { label: config.title, href: url() },
      { label: meta?.label ?? entry.category, href: meta?.hidden ? undefined : url(`${entry.category}/`) },
      { label: d.title },
    ])}
<article class="entry">
  <header class="entry-head">
    <p class="entry-head__eyebrow">${esc(meta?.label ?? entry.category)} · <span class="badge badge--evidence-${esc(d.evidence)}">${esc(evidenceLabel[d.evidence] ?? d.evidence)}</span></p>
    <h1>${esc(d.title)}</h1>
  </header>
  <p class="entry__lead">${esc(d.summary)}</p>
  ${unverified}
  ${bodyHtml}
  <footer class="entry-meta">
    <span class="entry-meta__item"><span class="entry-meta__label">最后复核</span><span class="entry-meta__value">${esc(d.updated)}</span></span>
    <span class="entry-meta__item"><span class="entry-meta__label">下次复核</span><span class="entry-meta__value${stale ? " entry-meta__stale" : ""}">${esc(d.review_due)}${stale ? "（已过期，请谨慎参考）" : ""}</span></span>
  </footer>
  <h2>来源</h2>
  <ol class="sources">
${sources}
  </ol>
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

  /* -------------------------------------------------------- 免责声明页 */
  function disclaimerPage() {
    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: "免责与许可" }])}
<article class="entry">
  <h1>免责与许可</h1>

  <h2>这不是医疗建议</h2>
  <p>本站是个人整理的医学常识参考，<strong>不是诊断、不是处方、不能替代面诊</strong>。任何关于用药、停药的决定，都必须由给你看病的医生做出。本站刻意不提供个体化的诊断结论，也不提供任何「患病可能性」的估算——因为没有查体与化验，那种数字只是编出来的。</p>

  <h2>唯一的紧急提示</h2>
  <p>本站不处理急症，也没有任何急症分诊功能。<strong>如果你或身边的人正在出现急症，请立即拨打 ${esc(config.emergencyNumber)}</strong>，不要在这里查。</p>

  <h2>内容可能出错，也可能过期</h2>
  <p>每条内容都标了来源与最后复核日期，并设有下次复核日期。但医学指南会更新，转述会有偏差。请以原始来源为准；发现错误请到仓库提 issue。如果页脚显示「已过期，请谨慎参考」，请优先信任你的医生。</p>
  <p>少数内容的来源标注是<strong>不完整</strong>的——这类条目页面上会显著标出来，并写明缺的是哪一环。这比标一个好看但撑不住的来源诚实。</p>

  <h2>数值的体系</h2>
  <p>体检指标与生活方式里的量化建议，<strong>以中国标准为准</strong>。中国没有对应标准的数值，会保留国际来源并<strong>标明是哪一套体系</strong>（例如 WHO、NICE、美国 CDC）——它们不能混着看，也不能互相换算。</p>

  <h2>许可</h2>
  <p>本站内容采用 <a href="${esc(config.license.contentUrl)}" rel="license noopener">${esc(config.license.content)}</a> 许可：可以转载，须署名、非商业用途、<strong>不得删改后重新发布</strong>。最后这一条是刻意加的——医学内容被删掉上下文再传播，是会害人的。</p>
  <p>站点代码采用 ${esc(config.license.code)} 许可。</p>

  <h2>图片来源</h2>
  <p>本站不使用来源不明的图片。凡使用历史资料的公有领域图像，均在 <code>docs/ATTRIBUTION.md</code> 中逐件登记来源与许可状态。</p>
</article>`;

    return layout({ title: "免责与许可", description: "本站不是医疗建议", path: "disclaimer/", body, active: "" });
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
    disclaimerPage,
    stubPage,
  };
}
