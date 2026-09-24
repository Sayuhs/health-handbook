/**
 * scripts/lib/content.mjs
 *
 * 内容的加载与校验。零依赖（除 yaml 这个纯 JS 解析器）。
 * 校验不过 = 构建失败，这是刻意的：医学内容宁可不上线，也不能少来源。
 *
 * 「模块」= 导航上的一格；「分类」= 内容目录。一个模块可以含多个分类
 * （养生 = foods + lifestyle），一个分类只属于一个模块。
 * 隐藏分类仍然构建、仍然可被站内搜索到，只是不进导航、并加 noindex。
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

export const MODULES = {
  drugs: {
    label: "药品速查",
    order: 1,
    note: "认成分与商品名",
    description: "拿着药盒认不出是什么？先认成分。",
    categories: ["drugs"],
  },
  labs: {
    label: "体检指标速查",
    order: 2,
    note: "看数值、看体系",
    description:
      "报告单上的箭头意味着什么，哪些需要管，哪些可以再看一年。数值以中国标准为准；中国没有对应标准的，会标明是哪一套体系。",
    categories: ["labs"],
  },
  wellness: {
    label: "养生",
    order: 3,
    note: "吃什么、怎么生活",
    description:
      "没有单一「最养生」的食物。这里说的是长期吃什么、怎么生活，以及哪些流行说法其实站不住。",
    categories: ["foods", "lifestyle"],
  },
};

export const CATEGORIES = {
  drugs: {
    module: "drugs",
    label: "药品速查",
    order: 1,
    description: "同一种成分有几十个商品名。永远以药盒上印的「通用名」为准。",
  },
  labs: {
    module: "labs",
    label: "体检指标速查",
    order: 2,
    description: "不同医院、不同检测方法的参考区间不同——以你本人化验单上印的为准。",
  },
  foods: {
    module: "wellness",
    section: "吃什么",
    label: "吃什么",
    order: 3,
    description: "长期吃的方向，以及哪些东西其实不必买。",
  },
  lifestyle: {
    module: "wellness",
    section: "怎么生活",
    label: "怎么生活",
    order: 4,
    description: "有证据支持的生活方式，以及被证据否定的流行说法。",
  },
  diseases: {
    hidden: true,
    label: "常见疾病常识",
    order: 5,
    description: "家里最常出现的那些诊断：是什么、怎么看。",
  },
  medications: {
    hidden: true,
    label: "用药与检查常识",
    order: 6,
    description: "吃药、体检、看化验单之前该知道的事——以及最常见的误解。",
  },
};

/** 隐藏分类：仍然构建、仍然可搜、老 URL 仍然可开，只是不进导航并加 noindex */
export const HIDDEN_CATEGORIES = Object.entries(CATEGORIES)
  .filter(([, meta]) => meta.hidden)
  .map(([key]) => key);

/**
 * 旧地址存根。
 *
 * 重构前的页面地址不能直接 404——收藏过的人、搜索引擎里的旧链接都还指着它们。
 * 所以每个旧地址留一个自动跳转的存根，并加 noindex（跳转页不该被收录）。
 * 构建与产物自检共用这一份清单，避免两边各写一份然后漂移。
 */
export const LEGACY_STUBS = [
  {
    from: "quickref/",
    fromLabel: "紧急速查",
    to: "",
    toLabel: "首页",
    note: "这个站不再提供急症分诊。真出现急症，请直接拨打 120，不要在这里查。",
  },
  {
    from: "check/",
    fromLabel: "自测",
    to: "",
    toLabel: "首页",
    note: "这个站不再提供按症状勾选的行动档位判定。",
  },
  {
    from: "foods/",
    fromLabel: "食物选择",
    to: "wellness/",
    toLabel: "养生",
    note: "「吃什么」和「怎么生活」现在合成一个模块了。",
  },
  {
    from: "lifestyle/",
    fromLabel: "养生",
    to: "wellness/",
    toLabel: "养生",
    note: "「吃什么」和「怎么生活」现在合成一个模块了。",
  },
];

export const EVIDENCE_LEVELS = ["strong", "moderate", "limited", "none"];
export const AGE_GROUPS = ["child", "adult", "older", "pregnant"];

export const EVIDENCE_LABEL = {
  strong: "证据充分",
  moderate: "证据中等",
  limited: "证据有限",
  none: "无可靠证据",
};

/**
 * 剂量守卫。
 *
 * 本站不收录剂量，这条规则以前靠人自觉，现在靠机器兜住：
 * 药品条目的结构化字段里出现任何疑似剂量的字样，构建直接失败。
 * 只作用于结构化字段（好核对、来源单一），不作用于说明性正文——
 * 正文里出现「你一次吃两种药」这类句子是正常的。
 *
 * 三条规则的边界是踩出来的，改动前先看懂为什么：
 *
 * 1. 数字 + 真单位（mg / g / ml / IU…）。**这里故意不包括「片」「粒」**——
 *    「维生素B1片」「维生素B12片」里也有数字加片，那是药名不是剂量。
 * 2. 数字 + 剂型量词，但**数字前面不能紧跟拉丁字母**，同样是为了放过
 *    「维生素B1片」这类命名。真实剂量写法（「吃2片」「2片」）前面是汉字或行首，照样命中。
 * 3. 剂量字眼（每日 / 每次 / 一次 / 剂量 / 用法…）。**这里不包括「口服」「外用」「含服」**——
 *    那三个是给药途径，不是剂量；药品的「主要作用」里写「外用抗生素」是完全正常的。
 */
const DOSAGE_PATTERNS = [
  /\d+\s*(?:mg|μg|ug|mcg|g|kg|ml|mL|IU|U)(?![A-Za-z])/i,
  /(?<![A-Za-z0-9])\d+\s*(?:片|粒|丸|袋|支|滴|喷|贴|次|日|天|周|小时)/,
  /(?:每日|每天|每次|一天|一日|一次|用量|剂量|用法|顿服|首剂|维持量|极量)/,
];

/** 给定一段文字，返回第一个命中的疑似剂量片段；没有则返回 null */
export function findDosage(text) {
  for (const re of DOSAGE_PATTERNS) {
    const m = re.exec(String(text ?? ""));
    if (m) return m[0];
  }
  return null;
}

/** 通用名 → 锚点 id。同一份数据在构建端与索引端共用，避免两端漂移。 */
export function drugAnchor(name) {
  const s = String(name ?? "")
    .normalize("NFKC")
    .replace(/[^\p{Script=Han}\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return s || "drug";
}

/** 正文里不该出现的「行动指令」祈使句。见 validateEntry 里的说明。 */
const ACTION_DEMANDS = [
  "立即就医",
  "尽快就医",
  "必须就医",
  "马上就医",
  "立即就诊",
  "尽快就诊",
  "拨打 120",
  "拨 120",
  "呼叫急救",
  "立即呼叫",
  "立即急诊",
  "立即前往急诊",
  "需住院评估",
  "必须去医院",
];

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
  for (const key of ["title", "slug", "summary", "evidence", "updated", "review_due"]) {
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

  // ---- verified: false 必须交代清楚 ----
  // 用于「来源并不真正支撑这批数据」的内容：可以留在站上，但必须标明，
  // 而且必须留下说明。宁可难看，不可含糊。
  if (data.verified === false) {
    if (typeof data.verification_note !== "string" || !data.verification_note.trim()) {
      err("verification_note", "verified: false 时必须写明 verification_note，说明哪里没核过");
    }
    // 这里**不**发警告：页面已经会显著标出来，而这个状态会长期存在，
    // 每次都刷一条警告只会让警告通道变得没人看。留 error 就够了。
  } else if (data.verified !== undefined && data.verified !== true) {
    err("verified", "只能是 true 或 false");
  }

  // ---- 药品：结构化数据 ----
  if (data.drugs !== undefined || dirCategory === "drugs") {
    validateDrugItems({ data, err, warn });
  }

  // ---- 药品：正文必须留一个表格占位标记 ----
  // 对照表由 frontmatter 的数据渲染出来，不是手写在 markdown 里的。
  // 留个显式标记，位置才可控，也不会有人以为表格被误删了。
  if (dirCategory === "drugs" && !/<!--\s*DRUGS_TABLE\s*-->/.test(body ?? "")) {
    err(
      "body",
      "药品条目的正文里必须有 <!--DRUGS_TABLE--> 占位标记（对照表从 frontmatter 的 drugs 数据渲染）",
    );
  }

  // ---- 正文里的 [N] 引用必须能落到某个来源上 ----
  //
  // 站上有两套编号约定（见 content/README.md）：
  //   · foods：编号直接写在 label 开头（"[23] 中国营养学会 — …"），跨条目统一编号
  //   · 其余：`[N]` 指 sources 数组里第 N 条（从 1 开始）
  //
  // 后者是很脆的：只要有人重排 sources、插一条、删一条，正文里的编号就**静默错位**——
  // 构建不报错，页面上「来源」那一栏和正文里的 [3] 对不上，而且没人看得出来。
  // 所以在这里拦住。只认 1~2 位数字，免得把 [2022] 这类当引用。
  if (Array.isArray(data.sources) && data.sources.length) {
    const labelled = new Set();
    for (const s of data.sources) {
      const m = typeof s?.label === "string" ? s.label.match(/^\s*\[(\d+)\]/) : null;
      if (m) labelled.add(Number(m[1]));
    }
    const refs = [...String(body ?? "").matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1]));
    const uniq = [...new Set(refs)];
    const bad = uniq.filter((n) =>
      labelled.size ? !labelled.has(n) : !(n >= 1 && n <= data.sources.length),
    );
    if (bad.length) {
      err(
        "body",
        `正文引用了 [${bad.join("] [")}]，但${
          labelled.size
            ? "没有任何来源的 label 以这个编号开头"
            : `sources 只有 ${data.sources.length} 条（正文里用的是数组序号）`
        }。重排或增删 sources 会让引用静默错位，页面上看不出来`,
      );
    }
  }

  // ---- 行动指令守卫（只报警告，不拦构建）----
  //
  // 这个站不做急症：没有分诊、没有行动档位、没有急症提示。正文里也就不该出现
  // 「立即就医」「拨打 120」这类**祈使句**——那是给读者的行动要求，不是知识。
  // 免责页整页已删，全站不再有任何急症提示或行动指令。
  //
  // 为什么是警告而不是错误：有些句子在**转述来源原文**，需要人工看一眼。
  // 但它一旦出现就该被看见——**留着零警告，说明这条规则是活的。**
  const demands = ACTION_DEMANDS.filter((p) =>
    `${data.summary ?? ""}\n${body ?? ""}`.includes(p),
  );
  if (demands.length) {
    warn(
      "body",
      `出现行动指令「${demands.join("、")}」。本站不做急症，正文只写事实，不写「你该去做什么」`,
    );
  }

  // ---- 正文长度兜底 ----
  // 药品条目的实质内容在 frontmatter 的结构化数据里，正文只剩一个表格占位标记，
  // 所以这一类不按字数算，按「有没有那批药」算。
  const plain = String(body ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, "");
  const plainLength = charLength(plain);
  const hasStructuredDrugs = Array.isArray(data.drugs) && data.drugs.length > 0;
  if (plainLength < 150 && !hasStructuredDrugs) {
    warn("body", `正文只有 ${plainLength} 字，可能还没写完`);
  }

  return { errors, warnings };
}

/** 药品条目里那批结构化数据。字段少、来源单一，所以每条都能校。 */
function validateDrugItems({ data, err, warn }) {
  if (data.drugs === undefined) {
    err("drugs", "药品分类必须带 drugs 结构化列表（通用名 / 俗名 / 主要作用 / 常见商品名）");
    return;
  }
  if (!Array.isArray(data.drugs) || data.drugs.length === 0) {
    err("drugs", "drugs 必须是至少含一条的非空数组");
    return;
  }

  data.drugs.forEach((d, i) => {
    const at = `drugs[${i}]`;
    if (!d || typeof d !== "object" || Array.isArray(d)) {
      err(at, "必须是 { name, aliases, effect, brands } 对象");
      return;
    }
    for (const key of ["name", "effect"]) {
      if (typeof d[key] !== "string" || !d[key].trim()) err(`${at}.${key}`, "必填字段缺失或不是字符串");
    }
    for (const key of ["aliases", "brands"]) {
      if (d[key] === undefined) continue;
      if (!Array.isArray(d[key])) {
        err(`${at}.${key}`, "必须是数组");
        continue;
      }
      d[key].forEach((v) => {
        if (typeof v !== "string" || !v.trim()) err(`${at}.${key}`, "元素必须是非空字符串");
      });
    }
    if (!d.brands || (Array.isArray(d.brands) && d.brands.length === 0)) {
      warn(`${at}.brands`, `「${d.name ?? "?"}」没有常见商品名，确认是漏了还是确实没有`);
    }

    // 剂量守卫：只扫结构化字段
    const fields = [["name", d.name], ["effect", d.effect]];
    for (const key of ["aliases", "brands"]) {
      for (const v of Array.isArray(d[key]) ? d[key] : []) fields.push([key, v]);
    }
    for (const [key, value] of fields) {
      const hit = findDosage(value);
      if (hit) {
        err(`${at}.${key}`, `出现疑似剂量的字样「${hit}」。本站不收录剂量，请改写`);
      }
    }
    if (typeof d.name === "string" && d.name.length > 30) {
      warn(`${at}.name`, `通用名 ${d.name.length} 字，偏长，确认没有把说明写进名字里`);
    }
  });
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
      // 以 `_` 开头的目录与文件不是条目：`content/_modules/` 放的是模块级共享说明。
      if (d.name.startsWith("_")) continue;
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

  // ---- 跨文件：条目 slug 唯一 ----
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

  // ---- 跨文件：药品通用名唯一（锚点会撞车，搜索结果会指错行） ----
  const drugNames = new Map();
  for (const e of entries) {
    for (const d of Array.isArray(e.data?.drugs) ? e.data.drugs : []) {
      const anchor = drugAnchor(d?.name);
      if (drugNames.has(anchor)) {
        errors.push({
          file: e.relPath,
          field: "drugs[].name",
          msg: `通用名「${d?.name}」与 ${drugNames.get(anchor)} 里的同名条目撞锚点（${anchor}）`,
        });
      } else {
        drugNames.set(anchor, e.relPath);
      }
    }
  }

  entries.sort(
    (a, b) =>
      (CATEGORIES[a.category]?.order ?? 99) - (CATEGORIES[b.category]?.order ?? 99) ||
      String(a.data.title ?? "").localeCompare(String(b.data.title ?? ""), "zh-Hans-CN"),
  );

  return { entries, errors, warnings };
}
