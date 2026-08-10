---
Date: 2026-08-09
Change: interactions-manual-entry
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# 手动录入互动记录

## Goals

- 讲师能给某个学员手动补录一条互动记录（比如答疑之外的私聊、临时沟通），不依赖催作业流程自动产生。
- 手动记录和催作业自动产生的记录（已催/跳过/取消跳过）混在同一份 `nudge_events` 数据里，`/interactions` 独立页、侧边栏徽标、学员详情面板"最近互动"三处消费方不用区分来源，天然一起展示。

## Non-Goals

- 不做"答疑"专属的 `event_type`——这次只加一个通用的 `manual` 类型。答疑作为独立来源留到下一轮 opsx。
- 不支持编辑或删除手动记录——跟项目现有"只增不删"原则一致，录错了直接连库改。
- 不支持补录历史时间——时间自动取录入时刻的服务器时间，不提供时间选择器。
- 不允许无课程的互动记录——`nudge_events.course_id` 目前是必填外键，这轮不改表结构，手动记录也必须挂在一门课程下。

## Constraints

- 复用 `nudge_events` 表，不新增表、不改字段结构。`event_type` 字段本来就是 `str` 不是 `Literal`，专门给未来扩展留了口子（`nudge` 能力 design.md 原话），这次直接用上，加一个 `"manual"` 取值。
- 新增一个写入口：`POST /api/interactions`，请求体包含 `student_email`、`course_id`、`channel`（`wechat` | `email` 二选一）、`note`（必填，不能是空字符串）。`event_type` 后端固定写 `"manual"`，不接受调用方指定。
- 课程下拉只列出该学员**已报**的课程，不是全部课程——跟报课补录弹窗（`EnrollDialog`）选课程的范围一致，避免选到学员根本没报的课。
- 前端走 Server Action 模式（跟 `createEnrollmentAction` 一致）：预期内的失败（比如后端校验不过）用返回值表达，不抛错——生产构建下 Server Action 抛出的错误会被 Next.js 抹成 digest，前端拿不到具体原因。
- **一致性风险，design 阶段要定**：手动记录写入后，`/students`（详情面板"最近互动"）、`/interactions` 独立页、侧边栏"互动记录"徽标三处都读同一份 `nudge_events`，写完必须让三处的缓存都失效，不能只 revalidate 详情面板所在的 `/students` 布局。具体走几次 `revalidatePath` 调用、要不要都放在同一个 layout 粒度，留给 design.md 决定。

## Success Criteria

- 讲师在学员详情面板"最近互动"卡片能找到"+ 手动记录"入口，填课程/渠道/内容后提交，卡片立刻出现这条新记录。
- 同一条记录在 `/interactions` 独立页、侧边栏最近 7 天徽标里也能看到（不用手动刷新页面之外的操作）。
- 内容为空时前端拦截，不发请求；后端也独立校验非空（防止绕过前端直接调 API）。

## User Stories

- 作为讲师，我在学员详情面板给某个学员补录一条"微信里聊了下学习进度"的记录，不用先去催作业页走一遍催促流程。
- 作为讲师，我打开 `/interactions` 独立页，能看到刚才手动录入的那条记录混在自动产生的催促记录里，时间倒序排列，不需要额外筛选才能看到。

## Open Questions

- 手动记录的"渠道二选一"和已有的催促记录共用同一套微信/邮件文案吗？（倾向：是，复用 `channelLabel` 现有实现，不新增第三个选项）
- 表单校验失败（比如内容为空、课程没选）的报错文案放哪——inline 在表单里，还是跟报课补录弹窗一样的错误提示区？（倾向：跟 `EnrollDialog` 一致的模式，design 阶段确认）

## Referenced Capabilities

- `interactions`（本变更基于它扩展）
- `nudge`（`nudge_events` 表的原始归属能力，`event_type` 字段的扩展口子来自它的 design.md）

## Design System

复用现有 tokens，跳过 awesome-design-md 重新选型——弹窗外观直接对齐 `EnrollmentModal.tsx`（报课补录弹窗）的既有规范。Mock：`docs/superpowers/specs/mocks/2026-08-09-interactions-manual-entry-mocks.html`。
