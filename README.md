# 医学自查手册

常见医学常识与养生参考的静态站点。**不是医疗建议**，不能替代面诊——每个页面的页脚都这么写着，这不是客套话。

线上地址：<https://sayuhs.github.io/health-handbook/>

## 它解决什么问题

半夜三点、或者家人突然不舒服的时候，需要的不是一篇科普长文，而是三件事：

1. **现在该做什么**——「紧急速查」页只有动作，没有解释，可以打印出来贴墙上。
2. **什么情况必须去医院**——每条内容都有固定的「何时必须就医」一节，写的是门槛，不是可能性。
3. **这个说法到底靠不靠谱**——每条都带「常见误区」，而且是列出来否定它，不是绕开。

站点刻意**不提供**诊断结论和患病概率。原因写在「免责与许可」页里：没有查体、化验和病史，那种数字是编出来的，而编出来的概率会让人延误就医。

## 怎么用

```bash
pnpm install          # 三个纯 JS 依赖，不需要编译
pnpm validate         # 内容体检：缺来源、缺日期、slug 重复都会在这里失败
pnpm build            # 生成 dist/
pnpm dev              # 本地预览（会模拟 /health-handbook/ 子路径）
pnpm fonts            # 重新抓取拉丁衬线字体（一般不需要）
```

`pnpm dev` 会打印 <http://localhost:4173/health-handbook/>。**不要直接双击 `dist/index.html` 看效果**——站点用绝对路径链接，脱离 base path 会全部断掉，你会以为是样式写错了。

## 目录

```
content/              内容本体，一条一个 Markdown，六个分类子目录
  README.md           写作规范（先读这个）
src/styles/           设计系统：tokens / base / layout / prose / components
src/client/           浏览器脚本：阅读模式、搜索、自测
src/fonts/            自托管的拉丁衬线子集（3 个 woff2，约 109 KiB）
scripts/
  build.mjs           全站构建
  validate-content.mjs 内容体检（CI 的第一道门禁）
  serve.mjs           本地预览（模拟 base path）
  lib/                内容加载校验、模板、资源处理
  fetch-fonts.mjs     字体抓取
docs/                 归属登记与给协作者的说明
.github/workflows/    推送到 main 后自动构建并部署到 Pages
```

## 部署

推送到 `main` 即自动部署。首次需要在仓库 **Settings → Pages → Source** 里选择 **GitHub Actions**，这一步只能人工做一次。

流水线的顺序是刻意的：**先跑内容体检，再构建**。内容缺来源或缺日期，就直接失败，不会有「先上线回头再补」的版本。

## 内容怎么加

读 `content/README.md`。三条最要紧的：

- 每条必须有一条**能打开的**来源链接（付费墙内容只能用于交叉核对，不能当来源）
- 每条必须写 `updated` 与 `review_due`，到期后页面页脚会出现醒目提示
- 不确定的数字写「未确认」，**不许编**

## 许可

- 内容：[CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.zh)——可转载，须署名、非商业、**不得删改后重新发布**。最后一条是刻意的：医学内容被删掉「何时必须就医」再传播是会害人的。
- 代码：MIT，见 `LICENSE`。

## 免责

本站是个人整理的资料，不构成诊断或治疗建议。出现胸痛、呼吸困难、意识改变、大出血、一侧肢体无力或言语不清，**立即拨打 120**，不要在这里查。
