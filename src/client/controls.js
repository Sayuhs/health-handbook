/**
 * src/client/controls.js
 *
 * 只有一件事：主题切换（浅色 / 深色 / 跟随系统）。
 * 存在 localStorage，不上传任何东西。
 *
 * 字号三档与高对比两个控件已经删掉——站主的话是「我要的只有主题切换」。
 * 对应的 `--reading-scale` 与 `data-contrast` 也不再读写了，免得没人能关掉
 * 以前存下来的设置。
 */
const THEME_ORDER = ["light", "dark", "auto"];
const THEME_LABEL = { light: "浅色", dark: "深色", auto: "跟随系统" };

const root = document.documentElement;

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 隐私模式下写不进去也不该崩 */
  }
};

const currentTheme = () => read("hh-theme", "auto");

function applyTheme(theme) {
  const value = THEME_ORDER.includes(theme) ? theme : "auto";
  const dark =
    value === "dark" ||
    (value === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  write("hh-theme", value);
  sync();
}

function sync() {
  const btn = document.querySelector("[data-toggle-theme]");
  if (!btn) return;
  const theme = currentTheme();
  const label = THEME_LABEL[theme] ?? "跟随系统";
  // 钉在 header 右上角的那个按钮只有一行字，所以它同时要说出「现在是什么」和
  // 「点一下会变成什么」——没有别的地方可以解释。
  btn.textContent = `${label} ⇄`;
  btn.setAttribute("aria-label", `当前主题：${label}，点击切换`);
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("[data-toggle-theme]")) return;
  const idx = THEME_ORDER.indexOf(currentTheme());
  applyTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentTheme() === "auto") applyTheme("auto");
});

sync();
