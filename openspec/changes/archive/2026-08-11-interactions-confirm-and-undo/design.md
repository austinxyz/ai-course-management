## Context

`interactions-design-alignment`（已 apply，还没 archive）新增了参与度信号——点即写，没有确认、没有撤销。讲师反馈点错了没法收手。这轮加确认步骤，并且第一次给互动记录开删除口子（只针对`manual`/`participation`两类，这两类是这个项目仅有的"人手敲错"风险来源）。

**依赖顺序**：这个 change 的 spec delta 用 `MODIFIED` 引用"参与度信号快捷打标"这条 Requirement——它目前只存在于 `interactions-design-alignment` 的未归档 delta 里，还没进 `openspec/specs/interactions/spec.md`。`openspec archive` 按标题在**当前 canonical spec** 里找 MODIFIED 目标，所以**这个 change 必须在 `interactions-design-alignment` 归档之后才能归档**，顺序反了会导致 `MODIFIED` 找不到目标标题而报错或静默不生效（`CLAUDE.md` 记录的 archive 坑之一）。apply 阶段不受影响（apply 只是写代码，不碰 canonical spec），只是 archive 顺序要注意。

## Goals / Non-Goals

**Goals:**
- 参与度信号点击后先确认，确认后才写入
- 新增删除能力，只覆盖 `manual`/`participation` 两类，前后端双重挡
- `InteractionRead` 暴露主键 `id`，前端按 `id` 定位删除目标

**Non-Goals:**
- 不改手动录入表单的提交流程（不加确认框）
- 不给系统自动事件开删除口子
- 不做删除时间窗口限制

## Decisions

1. **`InteractionRead` 新增 `id: uuid.UUID`，直接暴露 `NudgeEvent.id`**——这是唯一能安全定位一条记录的字段（`CLAUDE.md`："写脚本一律按主键定位，不沿用上一步的选中项"同一条原则用在读接口暴露的定位符上）。不引入新的复合定位方式。

2. **删除端点 `DELETE /api/interactions/{id}`，校验放在后端，不只放前端**——查出记录后先检查 `event_type in ("manual", "participation")`，不在这个集合里直接 422，不执行删除。前端不给 `nudged`/`skipped`/`unskipped` 的行渲染删除按钮，是体验层面的第一道；后端校验是真正挡住"直接调接口"的第二道。两道都要，互不替代。

3. **参与度信号的确认弹窗是新组件 `SignalConfirmDialog.tsx`，复用现有弹窗规范**——跟 `EnrollmentModal.tsx` 同一套外观（居中、标题+一句话+取消/确认）。不复用 `EnrollmentModal` 本身（字段完全不同），新起一个轻量组件：只有一句确认文案 + 两个按钮，没有表单字段。

4. **删除确认弹窗是另一个新组件 `DeleteConfirmDialog.tsx`**，同样轻量，跟信号确认弹窗视觉一致，唯一区别是确认按钮用 `danger` 变体（不是 `primary`）——颜色区分"这是正常写入操作"和"这是不可逆删除"，避免讲师看错按钮点错。

5. **两个弹窗共用同一套"待确认动作"状态管理，放在 `InteractionsClient.tsx` 里**——不是 `ManualEntryPanel` 自己管理信号确认弹窗、`InteractionsClient` 自己管理删除确认弹窗两套独立状态；而是 `InteractionsClient` 统一持有 `pendingAction: {type:"signal", studentEmail, signal} | {type:"delete", id, summary} | null`，`ManualEntryPanel` 点信号时通过回调把"待确认动作"抛给父组件，父组件渲染对应的确认弹窗。这样两个弹窗的开关逻辑不重复，且弹窗渲染集中在一处方便复用（视觉一致性也更容易保证）。

6. **删除后 revalidate 复用 `interactions-design-alignment` 决定 5 的两次调用**：`revalidatePath("/interactions","layout")` + `revalidatePath("/students","layout")`——写入和删除是同一份数据的两种变更，用同一套刷新逻辑，不新增第三种。

## Risks / Trade-offs

- [MODIFIED 引用一个还没进 canonical spec 的 Requirement 标题] → 上面"依赖顺序"一节已经写明：先归档 `interactions-design-alignment`，再归档这个 change。apply 阶段不受影响。
- [两个弹窗状态集中在 `InteractionsClient`，组件职责变重] → 目前只有两种待确认动作，复杂度可控；如果未来出现第三种确认场景再考虑抽出去，不提前设计

## Migration Plan

无数据库迁移。`id` 字段本来就在 `NudgeEvent` 表里（主键），这次只是在 API 响应里暴露出来，不涉及表结构变更。删除是应用层新增的一个 DELETE 端点，不涉及表结构。

## Open Questions

（无——requirements.md 的 Q-01 留给 apply 阶段实现时按惯例处理：报错 inline 展示在触发操作的那一行/弹窗旁边，跟项目里其他表单的报错展示方式一致；Q-02 已在 Decision 1 定稿）
