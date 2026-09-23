/**
 * scripts/lib/content.mjs
 *
 * 内容的加载与校验。零依赖（除 yaml 这个纯 JS 解析器）。
 * 校验不过 = 构建失败，这是刻意的：医学内容宁可不上线，也不能少来源。
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export const CATEGORIES = {
  symptoms: {
    label: "常见症状自查",
    order: 1,
    description: "哪些常见不适可以先观察，哪些不能等。不写诊断，只写门槛。",
  },
  redflags: {
    label: "红旗警示",
    order: 2,
    pinned: true,
    note: "必须立即就医的情况",
    description: "会要命的情况。这一类不是知识，是必须记住的动作。",
  },
  diseases: {
    label: "常见疾病常识",
    order: 3,
    description: "家里最常出现的那些诊断：是什么、怎么看、什么情况下要升级处理。",
  },
  medications: {
    label: "用药与检查常识",
    order: 4,
    description: "吃药、体检、看化验单之前该知道的事——以及最常见的误解。",
  },
  drugs: {
    label: "常见药物速查",
    order: 5,
    note: "认成分与商品名",
    description: "拿着药盒认不出是什么？先认成分。这里不给剂量，也不判断适不适合你。",
  },
  labs: {
    label: "体检指标解读",
    order: 6,
    description: "报告单上的箭头到底意味着什么，哪些需要管，哪些可以再看一年。",
  },
  foods: {
    label: "食物选择",
    order: 7,
    note: "吃什么、少买什么",
    description: "没有单一「最养生」的食物。这里说的是长期吃什么，以及哪些其实不必买。",
  },
  lifestyle: {
    label: "养生",
    order: 8,
    description: "有证据支持的生活方式，以及被证据否定的流行说法。",
  },
};

export const SEVERITIES = ["routine", "see-doctor", "urgent", "emergency"];
export const EVIDENCE_LEVELS = ["strong", "moderate", "limited", "none"];
export const AGE_GROUPS = ["child", "adult", "older", "pregnant"];

export const SEVERITY_LABEL = {
  routine: "常规",
  "see-doctor": "建议就诊",
  urgent: "尽快就医",
  emergency: "紧急",
};

export const EVIDENCE_LABEL = {
  strong: "证据充分",
  moderate: "证据中等",
  limited: "证据有限",
  none: "无可靠证据",
};

/** 正文字段：emergency 级条目必须出现在「何时必须就医」 */
export const REQUIRED_SECTION = "何时必须就医";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function splitFrontmatter(raw) {
  const text = String(raw).replace(/^\uFEFF/, "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: null, body: text };
  let data;
  try {
    data = parseYaml(m[1]);
  } catch (err) {
    return { data: null, body: m[2], yamlError: err.message };
  }
  return { data: data ?? {}, body: m[2] };
}

const charLength = (s) => Array.from(String(s ?? "")).length;

/**
 * 校验单个条目。
 * @returns {{errors: Array<{file:string, field:string, msg:string}>, warnings: Array}}
 */
export function validateEntry({ data, body, relPath }) {
  const errors = [];
  const warnings = [];
  const err = (field, msg) => errors.push({ file: relPath, field, msg });
  const warn = (field, msg) => warnings.push({ file: relPath, field, msg });

  if (data === null) {
    err("frontmatter", "缺少 frontmatter，或 YAML 无法解析");
    return { errors, warnings };
  }

  // ---- 必填字符串 ----
  for (const key of ["title", "slug", "summary", "severity", "evidence", "updated", "review_due"]) {
    if (typeof data[key] !== "string" || data[key].trim() === "") {
      err(key, `必填字段缺失或不是字符串`);
    }
  }

  // ---- category 与目录一致 ----
  const dirCategory = relPath.split("/")[0];
  if (!CATEGORIES[dirCategory]) {
    err("category", `目录 "${dirCategory}" 不是合法分类（${Object.keys(CATEGORIES).join(" / ")}）`);
  } else if (data.category !== dirCategory) {
    err("category", `frontmatter 里是 "${data.category}"，但文件在 "${dirCategory}/" 目录下，两者必须一致`);
  }

  // ---- 枚举 ----
  if (data.severity && !SEVERITIES.includes(data.severity)) {
    err("severity", `"${data.severity}" 不在允许值内：${SEVERITIES.join(" | ")}`);
  }
  if (data.evidence && !EVIDENCE_LEVELS.includes(data.evidence)) {
    err("evidence", `"${data.evidence}" 不在允许值内：${EVIDENCE_LEVELS.join(" | ")}`);
  }

  // ---- slug ----
  if (typeof data.slug === "string" && !SLUG_RE.test(data.slug)) {
    err("slug", `"${data.slug}" 只能是小写字母、数字与连字符`);
  }

  // ---- 日期 ----
  for (const key of ["updated", "review_due"]) {
    const v = data[key];
    if (typeof v === "string" && !DATE_RE.test(v)) {
      err(key, `"${v}" 不是 YYYY-MM-DD 格式`);
    } else if (typeof v === "string" && Number.isNaN(Date.parse(v))) {
      err(key, `"${v}" 不是有效日期`);
    }
  }
  if (DATE_RE.test(data.updated ?? "") && DATE_RE.test(data.review_due ?? "")) {
    if (data.review_due <= data.updated) {
      err("review_due", `下次复核日期（${data.review_due}）必须晚于最后复核日期（${data.updated}）`);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (data.review_due < today) {
      warn("review_due", `已过期（${data.review_due}），内容需要复核`);
    }
  }

  // ---- summary 长度 ----
  if (typeof data.summary === "string" && charLength(data.summary) > 60) {
    err("summary", `一句话结论 ${charLength(data.summary)} 字，超过 60 字上限`);
  }

  // ---- age_group ----
  if (data.age_group !== undefined) {
    if (!Array.isArray(data.age_group)) err("age_group", "必须是数组");
    else {
      for (const g of data.age_group) {
        if (!AGE_GROUPS.includes(g)) err("age_group", `"${g}" 不在允许值内：${AGE_GROUPS.join(" | ")}`);
      }
    }
  }

  // ---- sources：至少一条，且有 url ----
  if (data.sources === undefined) {
    err("sources", "缺少来源。每条内容至少需要一条可公开访问的来源");
  } else if (!Array.isArray(data.sources) || data.sources.length === 0) {
    err("sources", "sources 必须是非空数组");
  } else {
    data.sources.forEach((s, i) => {
      if (!s || typeof s !== "object") {
        err(`sources[${i}]`, "必须是 { label, url, year } 对象");
        return;
      }
      if (typeof s.label !== "string" || !s.label.trim()) err(`sources[${i}].label`, "缺少来源名称");
      if (typeof s.url !== "string" || !/^https?:\/\//.test(s.url)) {
        err(`sources[${i}].url`, "url 缺失或不是 http(s) 链接");
      }
      if (s.year !== undefined && !Number.isInteger(s.year)) {
        err(`sources[${i}].year`, "year 必须是整数年份");
      }
      if (!s.year) warn(`sources[${i}].year`, "建议写明来源版本年份");
    });
  }

  // ---- triage：自测用的勾选项（可选，但一旦出現就必须合法） ----
  if (data.triage !== undefined) {
    if (!Array.isArray(data.triage)) err("triage", "必须是数组");
    else {
      data.triage.forEach((t, i) => {
        if (!t || typeof t !== "object") {
          err(`triage[${i}]`, "必须是 { label, level, group } 对象");
          return;
        }
        if (typeof t.label !== "string" || !t.label.trim()) err(`triage[${i}].label`, "缺少勾选项文字");
        if (![1, 2, 3, 4].includes(t.level)) {
          err(`triage[${i}].level`, `level 必须是 1（立即 120）/ 2（24 小时内就医）/ 3（尽快就诊）/ 4（可先观察）`);
        }
        if (typeof t.group !== "string" || !t.group.trim()) err(`triage[${i}].group`, "缺少分组名");
      });
    }
  }

  // ---- quickref ----
  if (data.quickref !== undefined) {
    if (!Array.isArray(data.quickref)) err("quickref", "必须是数组");
    else {
      data.quickref.forEach((q, i) => {
        if (!q || typeof q !== "object" || !q.situation || !q.action) {
          err(`quickref[${i}]`, "每条需要 situation 与 action");
        }
      });
    }
  }

  // ---- emergency 级必须有「何时必须就医」段 ----
  // 接受若干等价标题：药物速查类说「什么时候该问医生药师」比「何时必须就医」准确得多，
  // 不该为了迁就校验器去写一句不自然的话。
  const SECTION_ALIASES = [
    REQUIRED_SECTION,
    "什么时候该问医生药师",
    "什么时候该问医生或营养师",
    "什么时候该问医生",
    "何时该问医生药师",
    "何时该问医生",
    "何时必须问医生",
  ];
  const hasSection = SECTION_ALIASES.some((alias) =>
    new RegExp(`^##\\s*${alias}\\s*$`, "m").test(body ?? ""),
  );
  if (data.severity === "emergency" && !hasSection) {
    err("body", `severity 为 emergency 的条目必须在正文里包含「## ${REQUIRED_SECTION}」或等价标题`);
  }
  if (!hasSection) {
    warn("body", `正文里没有「## ${REQUIRED_SECTION}」或等价标题，建议补上`);
  }

  // ---- 正文长度兜底 ----
  const plain = String(body ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  if (charLength(plain) < 150) {
    warn("body", `正文只有 ${charLength(plain)} 字，可能还没写完`);
  }

  return { errors, warnings };
}

const posix = (p) => p.split("\\").join("/");

/** 递归收集 content/ 下所有 .md（跳过 README.md） */
export async function loadContent(contentDir) {
  const entries = [];
  const errors = [];
  const warnings = [];

  async function walk(dir) {
    let dirents = [];
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const full = join(dir, d.name);
      if (d.isDirectory()) await walk(full);
      else if (d.name.endsWith(".md") && d.name !== "README.md") {
        const raw = await readFile(full, "utf8");
        const relPath = posix(full.slice(contentDir.length + 1));
        const { data, body } = splitFrontmatter(raw);
        const result = validateEntry({ data, body, relPath });
        errors.push(...result.errors);
        warnings.push(...result.warnings);
        entries.push({
          relPath,
          file: full,
          data: data ?? {},
          body,
          category: relPath.split("/")[0],
        });
      }
    }
  }

  await walk(contentDir);

  // ---- 跨文件：slug 唯一 ----
  const seen = new Map();
  for (const e of entries) {
    const key = `${e.category}/${e.data.slug}`;
    if (seen.has(key)) {
      errors.push({
        file: e.relPath,
        field: "slug",
        msg: `slug 与 ${seen.get(key)} 重复（URL 会互相覆盖）`,
      });
    } else {
      seen.set(key, e.relPath);
    }
  }

  entries.sort(
    (a, b) =>
      (CATEGORIES[a.category]?.order ?? 99) - (CATEGORIES[b.category]?.order ?? 99) ||
      String(a.data.title ?? "").localeCompare(String(b.data.title ?? ""), "zh-Hans-CN"),
  );

  return { entries, errors, warnings };
}
