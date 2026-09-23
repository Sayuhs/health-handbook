# 内容规范

这个目录里每一条 `.md` 就是一页。六个子目录对应六大分类，**文件必须放在与其 `category` 一致的目录里**，否则构建失败。

```
content/
  symptoms/      ① 常见症状自查
  redflags/      ② 红旗警示（必须立即就医）
  diseases/      ③ 常见疾病常识
  medications/   ④ 用药与检查常识
  labs/          ⑤ 体检指标解读
  lifestyle/     ⑥ 养生
```

## 铁律

**一、每条必须有可公开访问的来源。** 至少一条 `sources` 条目，且 `url` 必须能打开。付费墙内容（如 UpToDate）只能用于交叉核对，不能作为链接来源。**构建时校验，缺了就直接失败**，不会上线。

**二、每条必须写明两个日期。** `updated`（最后复核日期）与 `review_due`（下次复核到期）。到期后页面页脚会出现醒目提示——这不是装饰，是防止内容腐烂的闹钟。

**三、不写诊断结论，不给概率。** 输出永远是「行动档位」与「可观察的事实」。所有数值切点必须写明依据文件与版本年份。

**四、来源优先次序**：WHO → 国家卫健委 / 中国疾控中心 / 中国政府网 → 美国 CDC → NICE / NHS → Cochrane → 中华医学会各专业指南 → NMPA 与药品说明书。冲突时按此次序取舍。中国标准与国际标准不一致时（例如血压分级），**两套都写出来并各自标注来源**。

**五、拿不准就写「未确认」，不许编。** 宁缺一个数字，不错一个数字。

## frontmatter

```yaml
---
title: 高血压                      # 必填
category: diseases                # 必填，须与所在目录一致
slug: hypertension                # 必填，URL 片段，仅小写字母/数字/连字符
summary: 一句话结论（≤60 字）        # 必填
severity: routine                 # 必填：routine | see-doctor | urgent | emergency
evidence: strong                  # 必填：strong | moderate | limited | none
updated: 2026-09-24               # 必填，YYYY-MM-DD
review_due: 2027-09-24            # 必填，YYYY-MM-DD
age_group: [adult, older]         # 可选：child | adult | older | pregnant
tags: [心血管, 血压]               # 可选
quickref:                         # 可选：进「紧急速查」卡的一行（症状 → 动作）
  - situation: 胸痛压榨感、伴冷汗
    action: 立即拨打 120
sources:                          # 必填，至少 1 条
  - label: 《中国高血压防治指南》2024 年修订版
    url: https://example.org/...
    year: 2024
---
```

`severity: emergency` 的条目，正文里**必须**有「何时必须就医」这一段，否则构建失败。

## 一个会咬人的细节

YAML 里**值中包含「`: `」（冒号加空格）时必须用引号包起来**，否则解析直接失败，而且报错信息会指向别处（常见的是误报 slug 重复）：

```yaml
# 错：NICE 的标题里带冒号，解析器会把它当成新的键
- label: NICE NG219 Gout: diagnosis and management
# 对
- label: "NICE NG219 Gout: diagnosis and management"
```

来源名里带冒号的情况相当常见（尤其是英文指南标题），直接加引号最省事。

## 正文结构

固定四段（「一句话结论」由 `summary` 自动渲染）：

```markdown
（开头一两段解释这段话是什么、为什么要关心，不要写成教科书）

## 自查要点

- 可自己观察、可自己操作的项目，不写诊断

## 何时必须就医

<div class="callout callout--danger">
<p class="callout__title">出现以下任一情况，立即拨打 120</p>
<ul>
<li>……</li>
</ul>
</div>

## 常见误区

- 「某个流行但错误的说法」——为什么站不住

## 来源

（由 frontmatter 自动渲染，正文里不用重复）
```

## 写作口吻

面向普通读者，包括中老年人。允许并鼓励医学术语的括号解释。

不要写「您应该」「建议您」这种医嘱口气；写「会发生什么」「什么情况下必须去医院」。**这不是在给建议，是在告诉他事实与门槛。**

养生类条目必须标 `evidence` 等级；没有可靠证据的说法只能出现在「常见误区」里，作为被否定的对象。
