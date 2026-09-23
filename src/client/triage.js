/**
 * src/client/triage.js — 自测
 *
 * 输出永远只有两种东西：
 *   1. 行动档位（立即 120 / 24 小时内就医 / 尽快就诊 / 可先观察）
 *   2. 可能相关的条目（链接，不是结论）
 * 没有病名，没有概率。这是刻意的设计，不是功能缺失。
 */
import { query } from "./search-core.js";

const form = document.getElementById("triage");
const out = document.getElementById("triage-result");

const LEVELS = {
  1: {
    title: "立即拨打 120",
    reason:
      "你勾选的项目里有属于急症的表现。不要自己开车去医院，不要等天亮，也不要先睡一觉看看会不会好。",
  },
  2: {
    title: "24 小时内就医",
    reason:
      "这些情况不一定是急症，但不该拖过一天。今天就联系医生，或者去急诊分诊台让医生判断。",
  },
  3: {
    title: "尽快就诊",
    reason:
      "安排在这几天内看医生。去之前把症状开始的时间、变化过程、正在吃的药写下来——这比你自己描述有用得多。",
  },
  4: {
    title: "可以先观察",
    reason:
      "你勾选的项目里没有危险信号。继续观察；如果出现新的情况，回到这一页重新勾一遍，或者直接看紧急速查。",
  },
};

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function selected() {
  return [...form.querySelectorAll('input[type="checkbox"]:checked')].map((el) => ({
    label: el.closest(".triage-option")?.querySelector("span")?.textContent.trim() ?? el.value,
    level: Number(el.dataset.level) || 4,
    id: el.value,
  }));
}

function renderAction(items) {
  const worst = Math.min(...items.map((i) => i.level));
  const level = LEVELS[worst] ?? LEVELS[4];

  const triggers = items
    .filter((i) => i.level === worst)
    .map((i) => `<li>${esc(i.label)}</li>`)
    .join("");

  return `<div class="action-level" data-level="${worst}">
  <p class="action-level__label">行动档位</p>
  <p class="action-level__value">${esc(level.title)}</p>
  <p class="action-level__reason">${esc(level.reason)}</p>
  <p class="action-level__label">触发这一档的勾选项</p>
  <ul>${triggers}</ul>
  <p class="action-level__basis">共勾选 ${items.length} 项，取其中最严重的一档。判定依据来自各条目「何时必须就医」一节，可在对应页面核对。</p>
</div>`;
}

async function renderRelated(items) {
  const text = items.map((i) => i.label).join(" ");
  let hits = [];
  try {
    hits = await query(text, 3);
  } catch {
    return "";
  }
  if (!hits.length) return "";

  const links = hits
    .map(
      (h) => `<li><a href="${esc(h.url)}"><span class="entry-list__title">${esc(h.title)}</span><p class="entry-list__summary">${esc(h.summary)}</p></a></li>`,
    )
    .join("");

  return `<details class="disclosure">
  <summary>别人在类似描述下读过的条目（这不是诊断，只是阅读线索）</summary>
  <ul class="entry-list">${links}</ul>
</details>`;
}

async function run(event) {
  if (event) event.preventDefault();
  const items = selected();

  if (!items.length) {
    out.innerHTML = `<div class="action-level" data-level="4">
  <p class="action-level__label">行动档位</p>
  <p class="action-level__value">还没有勾选任何一项</p>
  <p class="action-level__reason">把你现在确实出现的情况勾上。如果一时说不清，就先看<a href="../quickref/">紧急速查</a>——那里只有该立刻做的事。</p>
</div>`;
    return;
  }

  out.innerHTML = renderAction(items);
  const related = await renderRelated(items);
  if (related) out.insertAdjacentHTML("beforeend", related);
}

form.addEventListener("submit", run);
form.addEventListener("reset", () => {
  out.innerHTML = "";
});
