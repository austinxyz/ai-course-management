## Context

上一轮 `interactions-manual-entry` 把手动录入做成了学员详情面板的弹窗，渠道二选一（微信/邮件）。权威设计稿（`ClaudeAI课程学员管理页.dc.html` 的 `isInteractions` 区块）画的是完全不同的交互：手动录入是互动记录独立页右侧常驻的"记一条"面板，分类维度是事情性质（1:1 沟通/咨询/技术支持/作业反馈），还有一个我们完全没做的"参与度信号"快捷打标区块。这次对齐设计稿，同时补上参与度信号。

`nudge_events` 表结构：`event_type: str`（不是 `Literal`，本来就是为扩展留的口子）、`channel: str | None`、`note: str`（默认 `""`）、`course_id` 必填外键。

## Goals / Non-Goals

**Goals:**
- 手动录入搬到独立页常驻面板，类型从渠道换成事情性质四选一
- 手动录入与参与度信号都不再要求讲师选课程——后端自动取该学员未退课报课记录里 `enrolledAt` 最大的一条
- 新增参与度信号：5 个固定标签，选中学员后点击即写
- 独立页筛选换成来源 tab + 搜索框
- 列表加来源徽标与归属列

**Non-Goals:**
- 不新增数据库表或字段——完全复用 `nudge_events` 现有列
- 不做参与度信号标签的后台配置
- 不做多用户身份——归属固定"Austin"

## Decisions

1. **不改表结构，复用 `channel` 列表达"手动录入的类型"和"参与度信号的具体信号"，`note` 列的含义因 `event_type` 而不同**——这是本次设计最关键的一步，列名不再字面对应"渠道"，而是变成"每种 `event_type` 各自的子分类"：

   | `event_type` | `channel` 存什么 | `note` 存什么 |
   |---|---|---|
   | `nudged` | `wechat` \| `email`（不变） | 可选备注（不变） |
   | `skipped` / `unskipped` | `null`（不变） | 可选备注（不变） |
   | `manual` | 类型 key：`1on1` \| `consult` \| `tech_support` \| `hw_feedback` | 必填自由文本（原来就是） |
   | `participation` | 信号 key：`live` \| `group_join` \| `group_lead` \| `group_active` \| `demo_day` | 固定 `""` |

   为什么可行：`note` 字段的含义本来就随 `event_type` 变化（`skipped` 是可选备注，`manual` 是必填内容）——`channel` 现在也走同一条路，不是新模式。响应 schema（`InteractionRead`）不需要改字段，只是前端按 `event_type` 决定怎么解释 `channel`/`note` 的值（`manual` 走类型 label 映射表，`participation` 走信号 label 映射表，`nudged` 走既有 `channelLabel`）。

   备选方案（新增 `sub_type` 列）被放弃：需要 migration，而复用 `channel` 零迁移就能做到同样效果——跟 `nudge` 能力 design.md"给未来扩展留口子"的原意一致（`event_type` 本来就不是 `Literal`，`channel` 的用法也不该被字面名字锁死）。

2. **`event_type="participation"` 单值 + `channel` 存信号 key，不是每个信号一个 `event_type`**（回答 requirements.md Q-01）——来源 tab 的"参与度"要能一次查出全部 5 种信号，单一 `event_type` 一次 `WHERE` 就够；5 个 `event_type` 需要 `IN (...)`，多一层维护成本换不来任何好处。

3. **来源 tab 映射**（回答 requirements.md Q-02）：`全部` = 不过滤；`系统自动` = `event_type IN (nudged, skipped, unskipped)`；`人工录入` = `event_type = manual`；`参与度` = `event_type = participation`。这四个 tab 的计数在前端用已经拉取到的全量列表现算，不新增后端聚合接口（跟 `interactions` design.md 决定 1 一致——数据一次性整体取回，筛选在前端做）。

4. **课程自动推导——后端新增 `_latest_active_course(session, student_email)` 查询**：从 `Enrollment` 表按 `student_email` 过滤、排除 `state == "withdrawn"`、按 `enrolled_at` 降序取第一条，返回其 `course_id`；查不到时返回 `None`。手动录入与参与度信号的写入端点都调用这个函数；返回 `None` 时端点返回 422，前端据此禁用对应入口（学员详情里"该学员有没有有效报课"这个判断，独立页复用同一份已经通过 `getStudents`/`getEnrollments` 拉取到的数据在客户端算，不额外发请求）。

5. **手动录入与参与度信号共用同一个写入口 `POST /api/interactions`，用请求体里的一个字段区分**——不新增 `POST /api/interactions/signal` 端点。请求体新增 `kind: "manual" | "participation"`：`kind="manual"` 时必须带 `type`（四选一）与 `note`（必填非空）；`kind="participation"` 时必须带 `signal`（五选一），不接受 `note`。后端按 `kind` 分别校验、分别把值写进 `channel` 列，`event_type` 相应固定为 `manual` 或 `participation`。两种写入的响应结构相同（`InteractionRead`），复用同一套刷新逻辑，前端也不需要维护两个几乎一样的 action。

6. **写入后的 revalidate**：`revalidatePath("/interactions", "layout")` + `revalidatePath("/students", "layout")`——前者覆盖独立页自身与共享布局（侧边栏徽标），后者覆盖学员详情面板；两次调用是防御性的，跟上一轮 `interactions-manual-entry` design.md 决定 5 同一个理由（不同 route 的 page-level 缓存条目互相不覆盖）。

7. **前端组件拆分**：`InteractionsClient.tsx` 新增来源 tab 状态、搜索框状态；新增 `ManualEntryPanel.tsx`（"记一条"表单 + 参与度信号区块，二者共享同一个"当前选中学员"下拉，参与度信号按钮的 disabled 状态由这个下拉是否有值、以及该学员是否有有效报课共同决定）；删除 `ManualInteractionModal.tsx`、`DetailPanel.tsx` 的"+ 手动记录"按钮、`StudentsClient.tsx` 里对应的弹窗状态与 props。

8. **深链接**：`interactions/page.tsx` 的 `?student=` 参数改成传给 `InteractionsClient` 作为搜索框的初始值（`initialQuery`），不再是学员筛选下拉的初始值（下拉已经不存在）。

## Risks / Trade-offs

- [`channel` 列被三种完全不同的含义复用，未来读代码的人容易看错] → 每处使用都加注释指明"这里的 channel 不是渠道，是类型/信号 key"；`InteractionRead`/`toInteraction` 附近集中写一段说明
- [搜索框按"学员/类型/内容"模糊匹配，类型是内部 key 还是显示 label 要统一] → 匹配显示 label（用户搜的是"1:1 沟通"这种看得到的字，不是 `1on1`）
- [没有有效报课的学员写入被拒绝，用户体验是"选了人之后突然发现按钮是灰的"] → 面板里紧跟着学员下拉显示说明文案，不是提交后才报错（spec 已经写明这条）

## Migration Plan

无数据库迁移。`event_type` 新增 `participation` 取值，`channel` 列对 `manual`/`participation` 两类记录的含义变化，都是应用层约定，不涉及表结构。风险点：如果生产库里已经有上一轮 `interactions-manual-entry` 写入的 `event_type="manual"`、`channel` 为 `wechat`/`email` 的记录，这批旧记录在新前端下会被按"类型 key"解释（`wechat`/`email` 不在四选一 key 集合里，需要显示兜底文案而不是报错）。apply 阶段先查一次生产库确认有没有这批记录：有的话，`channel` 到类型 label 的映射函数对未知 key 要有 fallback（原样显示 key 或显示"（旧版记录）"），不能因为查不到映射就崩；没有的话不需要特殊处理。

## Open Questions

（无——requirements.md 的 Q-01/Q-02 已在 Decisions 2/3 定稿）
