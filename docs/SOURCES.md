# 来源实录：哪些能用，哪些是陷阱

这份文档记录的是**实测结果**，不是常识。每一条都是在这台机器上用 `fetch` 打过、看过状态码与页面标题之后写下来的。

意义在于：**医学来源的可信度问题，一半是「权威不权威」，另一半是「它是不是它自称的那个东西」。** 后者更危险——页面标题正常、语句通顺、只是内容完全不相干，你看不出来。

## 一、可直接使用（已实测 200，且内容与标题相符）

| 来源 | 用途 | 注意 |
| --- | --- | --- |
| `who.int/news-room/fact-sheets/detail/...` | 疾病实况报道、膳食/钠/身体活动建议 | **个别专题页不可用**，见第三节 |
| `cdc.gov` | 症状与体征、指标切点、统计 | 改版频繁，旧路径常 404 |
| `nhs.uk/conditions/...` | 症状、就诊阈值、处理路径 | `/diagnosis/`、`/treatment/` 子路径常与主页**字节完全相同**，只引主页 |
| `nice.org.uk/guidance/...` | 临床指南（NG 系列） | 偶发 ECONNRESET，重试 1–3 次可成功；**部分条目已被新编号取代** |
| `medlineplus.gov` | 药物与检验指标释义 | 美国国家医学图书馆，中文无 |
| `niddk.nih.gov` / `niams.nih.gov` / `nhlbi.nih.gov` | 肾、骨关节、血液 | 权威且稳定 |
| `kdigo.org` | 慢性肾脏病分期（KDIGO 2024） | PDF，含完整 CGA 分级表 |
| `gi.org`（ACG） | 幽门螺杆菌等消化科指南 | PDF 含给药方案，**本站只引「谁该治/谁该查」** |
| `monographs.iarc.who.int` | 致癌物分级 | 分类列表 PDF 可用 |
| `osteoporosis.foundation` (IOF) | 骨密度 T 值定义 | WHO 自己的原始文件取不到，只能引这里的转述 |
| `msdmanuals.cn` | 中文药物与疾病信息 | 唯一好用的中文权威入口 |
| `www.gov.cn` | 中国政府网政策原文 | 见下方检索接口 |
| `sja.org.uk`（St John Ambulance） | 急救操作 | NHS 的 `/conditions/first-aid/` 现已 302 跳到这里 |
| 省市级卫健委 / 地方政府门户 | 中文科普 | **必须标注来源层级**：这些不是国家级指南原文 |

### 中国政府网站内检索接口

```
https://sousuo.www.gov.cn/search-gov/data?t=zhengce&q=<关键词>
```

返回 JSON。这是绕过 `nhc.gov.cn` 全站 412 拿政府原文的路子。**但它只覆盖政策类文件**——检索「幽门螺杆菌」返回 0 条。

## 二、确定不可用（不要浪费时间）

| 来源 | 状态 | 后果 |
| --- | --- | --- |
| `www.nhc.gov.cn` | **412 全站 WAF** | 中国国家级指南原文全部拿不到，加 header、换 UA 均无效 |
| `cochranelibrary.com` | 412 | 系统评价无法引用 |
| AHA 全站（`cpr.heart.org` / `heart.org` / `stroke.org`） | **403** | CPR 操作参数的最权威来源缺失 |
| `acc.org` | 安全网关页 | 美国心脏病学会不可用 |
| NICE CKS | 403 | 临床知识摘要不可用 |
| `iris.who.int` | fetch 失败 | WHO 原始出版物取不到 |
| 百度 / 搜狗 | 反爬空壳 | — |
| `lite.duckduckgo.com` | 人机挑战 | 可用 360 搜索发现官方地址（**不引用其结果页**） |

## 三、名实不符的陷阱（本项目已实际撞到 16 处）

**引用前必须核对页面的 `<title>` 与引用意图是否相符。** 以下是真实案例：

| 你以为打开的是 | 实际内容 |
| --- | --- |
| `nice.org.uk/guidance/ng184`（胃食管反流） | **"Human and animal bites: antimicrobial prescribing"**（动物咬伤抗菌处方） |
| `publications.iarc.fr/.../Helicobacter-Pylori-1994` | **"Automotive Gasoline"**（汽车汽油） |
| `nice.org.uk/guidance/ng24` | "Blood transfusion"（输血） |
| `nice.org.uk/guidance/cg146` | 已自述被 **NG259** 取代 |
| 文件名 `who-sodium-guideline-2023.html` | 贫血血红蛋白阈值指南 |
| 文件名 `who-saturated-trans-fat.html` / `who-total-fat.html` | 都是**5 岁以下儿童身体活动与睡眠指南** |
| 文件名 `who-sodium-benchmark.html` | 成人高血压药物治疗指南网络附件 |
| 文件名 `cn-gov-news-dietguide-2022b.html` | 中央财经委员会会议新闻稿（与膳食无关） |
| `who.int/.../fact-sheets/detail/osteoporosis` | **200，但正文 0 字**（空壳） |
| `ninds.nih.gov/.../disorders/back-pain` | 「Pain」通用疼痛页（请求背痛，给通用页） |
| `stacks.cdc.gov/view/cdc/112700` | 实际返回 `113400`，内容是**霍乱周报** |
| `nhs.uk/live-well/exercise/common-posture-mistakes-and-fixes/` | 实为 `/live-well/exercise/` 栏目总页，无姿势内容 |
| `cdc.gov/niosh/topics/ergonomics/`（含 `default.html`） | **200，但正文 0 字**（207 字节） |
| `who.int/.../fact-sheets/detail/chronic-kidney-disease` | 404 |
| `cn-gov-bp-2008` / `cn-ynsjkj-alt` | 200，但**重定向回首页** |
| 某「甲亢基层诊疗指南」页面 | 正文 34 字符空壳 |
| 某「WHO 抗微生物药物问答」页面 | WHO 新闻列表页（无问答正文） |
| 某「在线化验」页面 | 302 到商业售检站 `testing.com` |

### 三条核对纪律

1. **看 `<title>`**，不要看文件名。文件名是抓取时人起的，会撒谎。
2. **看 `FINAL_URL`**。200 但重定向回首页，等于什么也没拿到。
3. **看正文长度**。空壳页同样返回 200。抓取脚本里最好直接记录字节数。

## 四、另外几类坑

- **静默回退（最危险的一种）**：NHS 的 `/conditions/xxx/treatment/` 这类子路径会**不报错、返回 200、但内容回退到父页**。状态码正常、页面正常、只是缺了一段——没有任何信号。同类还有 `stacks.cdc.gov/view/cdc/112700` 实际返回 `113400`，内容是霍乱周报。
- **内容重复**：NHS 的 `/diagnosis/`、`/treatment/` 子路径抓回来的字节数与主页**一模一样**。多列一条不增加信息量，只增加维护成本。
- **站点改版**：NHS 已大规模迁移，旧 `/conditions/xxx/` 大量 404，新路径在 `/symptoms/`、`/tests-and-treatments/`、`/mental-health/conditions/`。**抓 NHS 必须逐条核对 `FINAL_URL`，不能只看状态码。**
- **路由陷阱（MSD 中文版）**：`/home/brain,-spinal-cord,-and-nerve-disorders/...` 这条**带逗号**的路径对部分文章会 404，真实路径族是 `brain-spinal-cord-and-nerve-disorders`（无逗号）；耳部文章在 `ear-nose-and-throat-disorders` 下。抓之前先从目录页挖真实 slug。
- **页面自标日期与 URL 里的日期不一致**：以**页面自标**为准（例如 URL 含 `20230424`、页面写 2023-04-19）。

## 五、拿不到就是拿不到

以下缺口**没有用记忆补过任何一个数字**，全部在条目里写明「未确认」：

- 中国高血压分级切点、糖尿病 mmol/L 诊断标准、LDL-C 分层目标值、ALT/AST 参考区间、BMI 与腰围切点、CHA₂DS₂-VASc 分值、CKD 分期、COPD 分级、HP 根除共识、骨密度参考值
- **血红蛋白诊断界值**：NHS / MedlinePlus / NHLBI / WHO 四个来源的页面全都只讲意义、不给 g/L 切点
- WHO 自己的 T 值定义原文（官网空壳、`9241208430` 与 `WHO-TRS-843` 均 404）

**这些空白是内容的一部分。** 一个写着「未确认，请以本人化验单为准」的条目，比一个填了貌似合理数字的条目安全得多。
