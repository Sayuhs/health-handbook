# AGENTS.md

给接手这个仓库的 AI 协作者。读完 `README.md` 和 `content/README.md` 再看这一份。

## 这个项目是什么

一个**静态**医学科普站点，部署在 GitHub Pages 子路径 `/health-handbook/` 下。没有后端、没有数据库、没有追踪。读者是作者本人和家中长辈，可能是在半夜、在有点慌的状态下用手机打开它。

这句话决定了所有取舍：**可读性 > 观感，正确 > 完整，沉默 > 猜测。**

## 构建链

```
node scripts/validate-content.mjs   →  内容体检（CI 第一道门禁）
node scripts/build.mjs              →  渲染 + 索引 + 样式 → dist/
node scripts/serve.mjs              →  本地预览（模拟 base path）
```

**没有构建框架，也不要有。** 这个 repo 曾经用 Astro，后来撤掉了：本环境无法 spawn 管道子进程，而 Astro 的构建链必经 esbuild，导致每次本地构建都要申请更高权限。现在的生成器是三个纯 JS 依赖（marked / minisearch / yaml），`node scripts/build.mjs` 一秒出结果。

**不要引入任何需要 postinstall 或原生编译的依赖。** 引入前先确认它在受限环境下能跑。

## 硬约束

1. **内容必须有可公开访问的来源。** `scripts/lib/content.mjs` 会在构建时拦截。不要为了让构建通过而放宽校验——要改就改内容。
2. **不输出诊断结论与患病概率。** 自测只给行动档位（立即 120 / 24 小时内就医 / 尽快就诊 / 可先观察）与「相关条目」链接。这不是待补充的功能，是设计底线。
3. **`tokenize` 有两份实现，必须保持一致**：`scripts/build.mjs`（建索引）与 `src/client/search-core.js`（查询）。改一边不改另一边，会出现「索引里有、搜不到」的鬼问题。
4. **所有站内链接与资源必须带 base 前缀。** 构建时由 `site.config.json` 的 `base` 统一拼接；不要在模板里手写 `/xxx`。字体路径由 `scripts/lib/assets.mjs` 在执行时重写——漏了会静默 404，字体退回系统字体，而且没人会发现。
5. **CSS 改 `src/styles/`，不要改 `dist/styles.css`**（那是合并产物，会被覆盖）。

## 内容结构

每条 Markdown 的 frontmatter 字段、正文四段结构、写作口吻，都在 `content/README.md` 里。其中两点容易踩：

- `severity: emergency` 的条目，正文**必须**有 `## 何时必须就医`，否则构建失败。
- 速查卡与自测选项不是单独维护的表格，而是从各条目的 `quickref` / `triage` 字段**汇聚**出来的。改内容时顺手改这两个字段，它们会自动更新。

## 提交与部署

推送到 `main` 自动部署。commit 信息写清楚「为什么」，不要只写「update」。仓库的提交身份已配置为 `101505375+Sayuhs@users.noreply.github.com`（仅本地仓库，未改动全局 git 配置）。

## 目录约定

- `.notes/` —— 研究过程产物与取到的原始证据，**已 gitignore**，不进入公开仓库。里面有一份很详实的查证报告（字体体积、许可条款、Pagefind 的 CJK 缺陷、Astro 7 的 API 事实），改动前值得扫一眼。
- `docs/ATTRIBUTION.md` —— 图片归属登记。加图必须登记。
- `docs/` 之外不要新建笔记类目录。

## 语气

给内容定调时记住读者是谁。不写「建议您」，不写「您应该」。写「会发生什么」「什么情况下必须去医院」。这不是在给建议，是在告诉他事实与门槛。
