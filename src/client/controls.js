/**
 * src/client/controls.js
 * 阅读模式：字号三档、高对比、深浅主题。全部存在 localStorage，不上传任何东西。
 */
const SCALES = ["1", "1.125", "1.25"];
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

const currentScale = () => read("hh-scale", "1");
const currentTheme = () => read("hh-theme", "auto");
const currentContrast = () => read("hh-contrast", "normal");

function applyScale(scale) {
  const value = SCALES.includes(scale) ? scale : "1";
  root.style.setProperty("--reading-scale", value);
  write("hh-scale", value);
  sync();
}

function applyTheme(theme) {
  const value = THEME_ORDER.includes(theme) ? theme : "auto";
  const dark =
    value === "dark" ||
    (value === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.dataset.theme = dark ? "dark" : "light";
  write("hh-theme", value);
  sync();
}

function applyContrast(mode) {
  const value = mode === "high" ? "high" : "normal";
  root.dataset.contrast = value;
  write("hh-contrast", value);
  sync();
}

function sync() {
  const scale = currentScale();
  const theme = currentTheme();
  const contrast = currentContrast();

  document.querySelectorAll("[data-scale]").forEach((btn) => {
    const dir = Number(btn.dataset.scale);
    const idx = SCALES.indexOf(scale);
    btn.disabled = dir < 0 ? idx <= 0 : idx >= SCALES.length - 1;
    btn.setAttribute("aria-pressed", String(false));
  });

  const contrastBtn = document.querySelector("[data-toggle-contrast]");
  if (contrastBtn) {
    contrastBtn.setAttribute("aria-pressed", String(contrast === "high"));
    contrastBtn.textContent = contrast === "high" ? "正常对比" : "高对比";
  }

  const themeBtn = document.querySelector("[data-toggle-theme]");
  if (themeBtn) {
    themeBtn.textContent = THEME_LABEL[theme] ?? "跟随系统";
    themeBtn.setAttribute("aria-label", `当前主题：${THEME_LABEL[theme] ?? "跟随系统"}，点击切换`);
  }
}

document.addEventListener("click", (event) => {
  const scaleBtn = event.target.closest("[data-scale]");
  if (scaleBtn) {
    const idx = SCALES.indexOf(currentScale());
    const next = Math.min(Math.max(idx + Number(scaleBtn.dataset.scale), 0), SCALES.length - 1);
    applyScale(SCALES[next]);
    return;
  }

  if (event.target.closest("[data-toggle-contrast]")) {
    applyContrast(currentContrast() === "high" ? "normal" : "high");
    return;
  }

  if (event.target.closest("[data-toggle-theme]")) {
    const idx = THEME_ORDER.indexOf(currentTheme());
    applyTheme(THEME_ORDER[(idx + 1) % THEME_ORDER.length]);
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (currentTheme() === "auto") applyTheme("auto");
});

sync();
