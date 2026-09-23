/**
 * scripts/lib/render.mjs
 * HTML 模板层。所有输出都是静态字符串，没有运行时依赖。
 */

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

export function createRenderer({ config, categories, severityLabel, evidenceLabel }) {
  const base = config.base;
  const url = (p = "") => base + p;

  /* ---------------------------------------------------------------- 外壳 */
  function layout({ title, description, path = "", body, active = "" }) {
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
<main class="main main--with-sticky-bar" id="main">
<div class="wrap">
${body}
</div>
</main>
<footer class="site-footer">
  <div class="wrap">
    <div class="site-footer__grid">
      <div>
        <h2>关于本手册</h2>
        <p class="disclaimer-short">本站是个人整理的医学常识参考，<strong>不构成诊断或治疗建议</strong>，也不能替代面诊。出现急症请立即拨打 ${esc(config.emergencyNumber)}。</p>
      </div>
      <div>
        <h2>导航</h2>
        <ul>
          ${config.nav.map((i) => `<li><a href="${url(i.href)}">${esc(i.label)}</a></li>`).join("\n          ")}
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
<a class="emergency-bar" href="${url("quickref/")}"><span class="emergency-bar__mark">紧急速查</span> · 出现这些情况立即拨打 ${esc(config.emergencyNumber)}</a>
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

  /* -------------------------------------------------------------- 首页 */
  function homePage({ groups, total }) {
    const cards = groups
      .map(
        (g) => `<a class="card" href="${url(`${g.key}/`)}">
  <p class="card__eyebrow">${esc(g.meta.note ?? "")}</p>
  <h3 class="card__title">${esc(g.meta.label)}</h3>
  <p class="card__desc">${esc(g.meta.description ?? "")}</p>
  <p class="card__count">${g.entries.length} 条</p>
</a>`,
      )
      .join("\n");

    const body = `<h1>${esc(config.title)}</h1>
<p class="lede">这里收录 ${total} 条常见医学常识：能自查什么、什么情况必须马上就医、哪些流行说法站不住。每条都标了来源与复核日期。</p>

<div class="callout callout--danger" style="max-width:var(--measure)">
<p class="callout__title">如果你或家人现在就有紧急症状</p>
<p>不要在这里查。先看<a href="${url("quickref/")}">紧急速查</a>，或者直接拨打 ${esc(config.emergencyNumber)}。</p>
</div>

<section class="section">
  <h2 class="section__title">按分类浏览</h2>
  <div class="grid grid--2">
${cards}
  </div>
</section>`;
    return layout({ title: "", description: config.tagline, path: "", body, active: "" });
  }

  /* ------------------------------------------------------------ 分类页 */
  function categoryPage({ key, meta, entries }) {
    const list = entries
      .map(
        (e) => `<li><a href="${url(`${e.category}/${e.data.slug}/`)}">
  <span class="entry-list__title">${esc(e.data.title)}</span>
  <p class="entry-list__summary">${esc(e.data.summary)}</p>
</a></li>`,
      )
      .join("\n");

    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: meta.label }])}
<h1>${esc(meta.label)}</h1>
<p class="lede">${esc(meta.description ?? "")}</p>
<ul class="entry-list">
${list}
</ul>`;
    return layout({
      title: meta.label,
      description: meta.description,
      path: `${key}/`,
      body,
      active: `${key}/`,
    });
  }

  /* ------------------------------------------------------------ 条目页 */
  function entryPage({ entry, bodyHtml, related }) {
    const d = entry.data;
    const meta = categories[entry.category];
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
  <ul class="entry-list">
    ${related.map((r) => `<li><a href="${url(`${r.category}/${r.data.slug}/`)}"><span class="entry-list__title">${esc(r.data.title)}</span><p class="entry-list__summary">${esc(r.data.summary)}</p></a></li>`).join("\n    ")}
  </ul>
</section>`
      : "";

    const body = `${breadcrumb([
      { label: config.title, href: url() },
      { label: meta.label, href: url(`${entry.category}/`) },
      { label: d.title },
    ])}
<article class="entry">
  <header class="entry-head">
    <p class="entry-head__eyebrow">${esc(meta.label)} · <span class="badge badge--${esc(d.severity)}">${esc(severityLabel[d.severity] ?? d.severity)}</span></p>
    <h1>${esc(d.title)}</h1>
  </header>
  <p class="entry__lead">${esc(d.summary)}</p>
  ${bodyHtml}
  <footer class="entry-meta">
    <span class="entry-meta__item"><span class="entry-meta__label">最后复核</span><span class="entry-meta__value">${esc(d.updated)}</span></span>
    <span class="entry-meta__item"><span class="entry-meta__label">下次复核</span><span class="entry-meta__value${stale ? " entry-meta__stale" : ""}">${esc(d.review_due)}${stale ? "（已过期，请谨慎参考）" : ""}</span></span>
    <span class="entry-meta__item"><span class="entry-meta__label">证据强度</span><span class="entry-meta__value">${esc(evidenceLabel[d.evidence] ?? d.evidence)}</span></span>
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
      active: `${entry.category}/`,
    });
  }

  /* ------------------------------------------------------------ 速查页 */
  function quickrefPage({ items }) {
    const rows = items
      .map(
        (it) => `<div class="quickref__item">
  <p class="quickref__situation">${esc(it.situation)}</p>
  <p class="quickref__action"><strong>${esc(it.action)}</strong>${it.detail ? ` ${esc(it.detail)}` : ""}</p>
</div>`,
      )
      .join("\n");

    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: "紧急速查" }])}
<h1>紧急速查</h1>
<p class="lede">这一页可以打印出来贴在墙上。它不解释原因，只告诉你现在该做什么。打印时这里的所有装饰都会自动去掉。</p>

<div class="callout callout--danger">
<p class="callout__title">只有一个原则</p>
<p>只要出现下面任何一条，<strong>先打 ${esc(config.emergencyNumber)}，不要自己开车去医院，也不要等天亮</strong>。如果你还在犹豫要不要打，那就是该打。</p>
</div>

<section class="section quickref">
${rows}
</section>

<section class="section">
  <h2 class="section__title">相关详条目</h2>
  <ul class="entry-list">
    ${items.map((it) => (it.href ? `<li><a href="${it.href}"><span class="entry-list__title">${esc(it.title)}</span><p class="entry-list__summary">${esc(it.summary ?? "")}</p></a></li>` : "")).join("\n    ")}
  </ul>
</section>
<div class="controls no-print" style="margin-top:var(--space-l)">
  <button class="control" type="button" onclick="window.print()">打印这一页</button>
</div>`;

    return layout({ title: "紧急速查", description: "出现这些情况立即拨打 120", path: "quickref/", body, active: "quickref/" });
  }

  /* ------------------------------------------------------------ 搜索页 */
  function searchPage() {
    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: "搜索" }])}
<h1>搜索</h1>
<p class="lede">输入症状、病名或指标名称。搜不到就先看<a href="${url("quickref/")}">紧急速查</a>。</p>

<div class="search">
  <div class="search__field">
    <input class="search__input" type="search" id="q" placeholder="例如：血压、头晕、化验单、尿酸" autocomplete="off" aria-label="搜索关键词">
  </div>
  <p class="search__hint" id="search-hint">输入两个字以上开始搜索。索引在首次输入时才加载。</p>
  <ul class="search__results" id="results" hidden></ul>
</div>
<script type="module" src="${url("assets/search.js")}"></script>`;

    return layout({ title: "搜索", description: "站内全文搜索", path: "search/", body, active: "search/" });
  }

  /* ------------------------------------------------------------ 自测页 */
  function triagePage({ groups }) {
    const fieldsets = groups
      .map(
        (g) => `<fieldset data-group="${esc(g.key)}">
  <legend>${esc(g.legend)}<span class="hint">${esc(g.hint ?? "")}</span></legend>
  <div class="triage-options${g.columns === 2 ? " triage-options--2" : ""}">
${g.options
  .map(
    (o) => `    <label class="triage-option"><input type="checkbox" name="${esc(g.key)}" value="${esc(o.value)}" data-level="${o.level}"><span>${esc(o.label)}</span></label>`,
  )
  .join("\n")}
  </div>
</fieldset>`,
      )
      .join("\n");

    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: "自测" }])}
<h1>自测</h1>
<p class="lede"><strong>这里不给诊断，也不给可能性。</strong>你勾选自己身上出现的情况，它只回答一件事：<em>现在应该做什么</em>——是立刻打 ${esc(config.emergencyNumber)}、24 小时内就医、尽快就诊，还是可以先观察。</p>

<div class="callout callout--note">
<p class="callout__title">为什么没有「你可能是某某病」</p>
<p>因为没有你的查体、化验和病史，任何概率都是编出来的。这个页面能负责的只有一件事：<strong>把你推到该去的地方，而不是让你安心地留在家裡。</strong></p>
</div>

<form class="triage-form" id="triage">
${fieldsets}
<div class="triage-actions">
  <button class="btn btn--primary" type="submit">看结果</button>
  <button class="btn btn--quiet" type="reset">清空</button>
</div>
</form>

<div id="triage-result" aria-live="polite"></div>
<script type="module" src="${url("assets/triage.js")}"></script>`;

    return layout({ title: "自测", description: "按症状选择合适的行动档位", path: "check/", body, active: "check/" });
  }

  /* -------------------------------------------------------- 免责声明页 */
  function disclaimerPage() {
    const body = `${breadcrumb([{ label: config.title, href: url() }, { label: "免责与许可" }])}
<article class="entry">
  <h1>免责与许可</h1>

  <h2>这不是医疗建议</h2>
  <p>本站是个人整理的医学常识参考，<strong>不是诊断、不是处方、不能替代面诊</strong>。任何关于用药、停药、剂量的决定，都必须由给你看病的医生做出。本站刻意不提供个体化的诊断结论，也不提供任何「患病可能性」的估算——因为没有查体与化验，那种数字只是编出来的。</p>

  <h2>内容可能出错，也可能过期</h2>
  <p>每条内容都标了来源与最后复核日期，并设有下次复核日期。但医学指南会更新，转述会有偏差。请以原始来源为准；发现错误请到仓库提 issue。如果页脚显示「已过期，请谨慎参考」，请优先信任你的医生。</p>

  <h2>紧急情况</h2>
  <p>出现胸痛、呼吸困难、意识改变、大出血、一侧肢体无力或言语不清等情况，<strong>立即拨打 ${esc(config.emergencyNumber)}</strong>，不要在本站查询。</p>

  <h2>许可</h2>
  <p>本站内容采用 <a href="${esc(config.license.contentUrl)}" rel="license noopener">${esc(config.license.content)}</a> 许可：可以转载，须署名、非商业用途、<strong>不得删改后重新发布</strong>。最后这一条是刻意加的——医学内容被删掉「何时必须就医」那一段再传播，是会害人的。</p>
  <p>站点代码采用 ${esc(config.license.code)} 许可。</p>

  <h2>图片来源</h2>
  <p>本站不使用来源不明的图片。凡使用历史资料的公有领域图像，均在 <code>docs/ATTRIBUTION.md</code> 中逐件登记来源与许可状态。</p>
</article>`;

    return layout({ title: "免责与许可", description: "本站不是医疗建议", path: "disclaimer/", body, active: "disclaimer/" });
  }

  return { layout, homePage, categoryPage, entryPage, quickrefPage, searchPage, triagePage, disclaimerPage };
}
