## Context

`interactions` 目前是纯只读聚合视图：数据全部来自 `nudge_events` 表，由催作业流程（`markNudged`/`skipNudge`/`unskipNudge`）自动写入。三处消费方——`/interactions` 独立页、`(app)/layout.tsx` 里的侧边栏最近 7 天徽标、学员详情面板"最近互动"卡片——都从这份数据读。这次要开第一个手动写入口。

`frontend/lib/api.ts` 的 `backendRequestInit()` 对所有请求都设了 `cache: "no-store"`（`frontend/lib/api.ts:70`），所以数据获取本身永远是新鲜的——`revalidatePath` 在这个项目里管的是 Next.js 客户端 Router Cache（软导航时不刷新页面也能看到新数据），不是让后端数据变新鲜。

## Goals / Non-Goals

**Goals:**
- 新增 `POST /api/interactions`，写一条 `event_type="manual"` 的 `nudge_events` 记录
- 学员详情面板加一个手动录入入口，外观复用 `EnrollmentModal.tsx`
- 写入后三处消费方（详情面板/独立页/侧边栏徽标）都能反映新记录，不需要用户手动刷新

**Non-Goals:**
- 不做"答疑"类型（下一轮）
- 不支持编辑、删除、补录历史时间
- 不改 `nudge_events` 表结构

## Decisions

1. **复用 `nudge_events` 表，新增 `event_type="manual"`**——该字段本来就是 `str` 不是 `Literal`，`nudge` 能力 design.md 明确留了这个口子。不新建表，不加迁移。

2. **`course_id` 下拉限定为该学员已报的课程**——复用 `students/page.tsx` 已经拉取的 `enrollments` 数据在客户端过滤，不需要后端新增查询接口。跟 `EnrollmentModal` 选课程的范围一致（对比：`EnrollmentModal.tsx` 是"排除已下线课程"，这里是"只保留该学员已报的课程"——两种过滤逻辑不同，各自服务各自的场景）。

3. **后端独立校验 `note` 非空**——前端拦截空提交只是体验优化，不是唯一防线；后端 schema 用 `field_validator` 拒绝空白字符串（`"   "` 这种也算空），避免绕过前端直接调接口写出一条没有内容的记录。

4. **`event_type` 由后端固定写死，不接受请求体指定**——`POST /api/interactions` 的请求 schema 不包含 `event_type` 字段。防止调用方伪造 `nudged`/`skipped` 之类的值，混进催作业流程本该独占的语义空间。

5. **写入后按既有 layout 粒度先例做两次 `revalidatePath`：`revalidatePath("/students", "layout")` + `revalidatePath("/interactions")`**——`/students` 的 layout 粒度调用同时覆盖详情面板（页面本身）和侧边栏徽标（`(app)/layout.tsx`，`students/actions.ts` 顶部注释已经解释过这个机制）；但侧边栏徽标覆盖不等于 `/interactions` 独立页覆盖——那是另一个 route 的 page-level 缓存条目，需要单独 revalidate。这是 requirements.md 里标记为"design 阶段要定"的那处不确定边界的结论：**不是只 revalidate 一处**，是两次调用各自覆盖各自的缓存条目。

   （备注：现有 `nudge` 能力的 `markNudged`/`skipNudge`/`unskipNudge` 只 `revalidatePath("/nudge", "layout")`，没有再顺带 revalidate `/interactions` 独立页——这是这些动作写入时就已经存在的口子，不在这次改动范围内，但本次新增的写入口不应该重复这个疏漏。）

6. **表单校验失败的报错展示跟 `EnrollmentModal` 一致**——inline 在弹窗底部，不是单独的 toast/错误区（requirements.md 里第二个 Open Question 的结论）。

7. **渠道文案复用现有 `channelLabel`**——不新增第三个渠道选项（requirements.md 第一个 Open Question 的结论）。

## Risks / Trade-offs

- [手动记录跟已催记录长得像，讲师可能混淆来源] → 用一个新的徽标颜色（mock 里定的蓝色系）区分，不复用已催/跳过/取消跳过三色中的任何一个
- [两次 revalidatePath 调用分散在同一个 action 里，未来这条链路再加第四个消费方容易漏改] → 无自动化保障，靠代码审查；这次不引入统一的"广播式 revalidate 辅助函数"，因为目前只有两个调用点，抽象为时过早

## Migration Plan

无数据库迁移。`event_type` 字段值域是运行时约定，不是 DB 约束，新增 `"manual"` 取值不需要变更表结构或已有数据。

## Open Questions

（无——requirements.md 里的两个 Open Question 已在 Decisions 6/7 定稿）
