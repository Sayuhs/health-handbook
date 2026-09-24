/**
 * src/client/search.js — 搜索页 UI
 */
import { query, tokenizeForHighlight } from "./search-core.js";

const input = document.getElementById("q");
const list = document.getElementById("results");
const hint = document.getElementById("search-hint");

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function highlight(text, tokens) {
  let out = esc(text);
  for (const t of [...new Set(tokens)].sort((a, b) => b.length - a.length)) {
    if (t.length < 2) continue; // 单字高亮太吵
    const safe = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(safe, "gi"), (m) => `<mark>${m}</mark>`);
  }
  return out;
}

function renderEmpty(q) {
  list.hidden = false;
  list.innerHTML = `<li class="search__empty">没有找到「${esc(q)}」。换个说法试试——通用名、商品名、俗名、指标名称都能搜。如果身体正不舒服，不要靠搜索。</li>`;
}

/** 在文本里找第一个命中的 token（长的优先，避免被短词抢先） */
function firstHit(text, tokens) {
  const lower = String(text ?? "").toLowerCase();
  for (const t of [...new Set(tokens)].sort((a, b) => b.length - a.length)) {
    const at = lower.indexOf(t);
    if (at >= 0) return { at, len: t.length };
  }
  return null;
}

/**
 * 命中片段：标题与结论里都没有查询词时，从正文里摘一段出来。
 * 目的是让结果**解释自己**——否则读者看到的是一个跟查询词毫无关系的标题。
 */
function snippetFor(body, tokens) {
  const text = String(body ?? "").replace(/\s+/g, " ").trim();
  const hit = firstHit(text, tokens);
  if (!hit) return "";
  const start = Math.max(0, hit.at - 40);
  const end = Math.min(text.length, hit.at + hit.len + 90);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function renderResults(q, hits) {
  const tokens = tokenizeForHighlight(q);
  list.hidden = false;
  list.innerHTML = hits
    .map((h) => {
      // 标题或结论里能看出命中理由，就不必再摘正文
      const explained = firstHit(h.title, tokens) || firstHit(h.summary, tokens);
      const snippet = explained ? "" : snippetFor(h.body, tokens);
      return `<li><a class="search__result" href="${esc(h.url)}">
  <span class="search__result-category">${esc(h.category)}</span>
  <span class="search__result-title">${highlight(h.title, tokens)}</span>
  <p class="search__result-summary">${highlight(h.summary, tokens)}</p>
  ${snippet ? `<p class="search__result-snippet">${highlight(snippet, tokens)}</p>` : ""}
</a></li>`;
    })
    .join("");
}

let timer = null;

async function run() {
  const q = input.value.trim();
  if (q.length < 2) {
    list.hidden = true;
    list.innerHTML = "";
    hint.textContent = "输入两个字以上开始搜索。索引在首次输入时才加载。";
    return;
  }

  hint.textContent = "搜索中…";
  try {
    const hits = await query(q);
    hint.textContent = hits.length ? `找到 ${hits.length} 条` : "";
    if (hits.length) renderResults(q, hits);
    else renderEmpty(q);
  } catch (err) {
    hint.textContent = "";
    list.hidden = false;
    list.innerHTML = `<li class="search__empty">搜索索引加载失败：${esc(err.message)}。刷新页面再试。</li>`;
  }
}

input.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(run, 180);
});

// 支持从别处带查询词跳进来：/search/?q=血压
const preset = new URLSearchParams(location.search).get("q");
if (preset) {
  input.value = preset;
  run();
}
input.focus();
