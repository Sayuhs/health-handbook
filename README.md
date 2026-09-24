# 医学自查手册

一本给自己和家里人用的静态速查手册。**不是医疗建议**，不能替代面诊——每个页面的页脚都这么写着，这不是客套话。

线上地址：<https://sayuhs.github.io/health-handbook/>

## 它是什么

三个模块，一个搜索框。

1. **药品速查**——141 种药，对照**通用名 / 俗名 / 主要作用 / 常见商品名**。拿着药盒认不出成分时用。每种药都能被搜到、都能被定位到具体那一行。
2. **体检指标速查**——报告单上的箭头意味着什么，哪些需要管、哪些可以再看一年。数值**以中国标准为准**；中国没有对应标准的，标明是哪一套体系。
3. **养生**——长期吃什么、怎么生活，以及哪些流行说法其实站不住。

另外还有 24 条内容（常见疾病常识、用药与检查常识）不在导航里，但**搜索得到**，老链接也打得开。

## 它刻意不做什么

**不处理急症。** 没有分诊、没有行动档位、**也没有任何急症提示**。这不是功能缺失，是设计决定：真到紧急情况，没有人会打开一个网页。

**不给诊断结论，不给患病概率。** 没有查体、化验和病史，那种数字是编出来的，而编出来的概率会让人延误就医。

**不收录剂量。** 这一条由构建时校验把关，不是靠人自觉。药品数据是结构化的，出现剂量字样会直接让构建失败。

**不用来源不明的图片。** 目前一张药品图片都没有，原因是三条路都不通：真实包装照片拿不到、美国 DailyMed 的照片有版权红线、唯一可能有自由许可照片的 Wikimedia 在本环境不可达。**不拿别的东西冒充。**

## 怎么用

```bash
pnpm install          # 三个纯 JS 依赖，不需要编译
pnpm validate         # 内容体检：缺来源、缺日期、slug 重复、药品数据不合法都会在这里失败
pnpm build            # 生成 dist/
pnpm check-search     # 搜索实测：必中查询零命中会退出 1
pnpm dev              # 本地预览（会模拟 /health-handbook/ 子路径）
pnpm fonts            # 重新抓取拉丁衬线字体（一般不需要）
```

`pnpm dev` 会打印 <http://localhost:4173/health-handbook/>。**不要直接双击 `dist/index.html` 看效果**——站点用绝对路径链接，脱离 base path 会全部断掉，你会以为是样式写错了。

## 目录

```
content/              内容本体，一条一个 Markdown
  drugs/              药品速查：10 个分类文件，141 种药（数据在 frontmatter 的结构化列表里）
  labs/               体检指标速查
  foods/ lifestyle/   养生（合并成 /wellness/ 一个模块页）
  diseases/ medications/  隐藏分类：不进导航，但可搜、老 URL 可开、加 noindex
  _modules/           模块级共享说明（以 _ 开头，不算条目）
  README.md           写作规范（先读这个）
src/styles/           设计系统：tokens / base / layout / prose / components
src/client/           浏览器脚本：阅读模式、搜索
src/fonts/            自托管的拉丁衬线子集（3 个 woff2，约 109 KiB）
scripts/
  build.mjs           全站构建
  validate-content.mjs 内容体检（CI 的第一道门禁）
  check-search.mjs    搜索实测（有断言）
  serve.mjs           本地预览（模拟 base path）
  lib/                内容加载校验、模板、资源处理
  fetch-fonts.mjs     字体抓取
docs/                 DESIGN.md（结构决策）、SOURCES.md、ATTRIBUTION.md、AGENTS.md
.notes/               研究过程产物（gitignore，不进公开仓库）
.github/workflows/    推送到 main 后自动构建并部署到 Pages
```

## 部署

推送到 `main` 即自动部署。首次需要在仓库 **Settings → Pages → Source** 里选择 **GitHub Actions**，这一步只能人工做一次。

流水线的顺序是刻意的：**先跑内容体检，再构建，最后跑搜索实测**。内容缺来源或缺日期就直接失败，不会有「先上线回头再补」的版本；搜索索引退化也进不去。

## 内容怎么加

读 `content/README.md`。四条最要紧的：

- 每条必须有一条**能打开的**来源链接（付费墙内容只能用于交叉核对，不能当来源）
- 每条必须写 `updated` 与 `review_due`，到期后页面页脚会出现醒目提示
- 不确定的数字写「未确认」，**不许编**。**「未确认」和「没有」是两件事**——这个站已经因为把两者弄混，漏掉过一个现成的中国数值
- 量化数值以中国标准为准；中国确实没有的，保留国际数值并**标出是哪一套体系**

## 许可

- 内容：[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.zh)——可转载，须署名、非商业、**不得删改后重新发布**。最后一条是刻意的：医学内容被删掉上下文再传播是会害人的。
- 代码：MIT，见 `LICENSE`。
