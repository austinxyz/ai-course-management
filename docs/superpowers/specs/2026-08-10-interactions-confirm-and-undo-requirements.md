---
Date: 2026-08-10
Change: interactions-confirm-and-undo
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# 参与度信号确认框 + 人工录入/参与度信号可删除

## Goals

- 参与度信号点击后先弹确认框，讲师确认后才写入——防止点错学员或点错信号立刻造成一条错误记录。
- 给"人工录入"和"参与度信号"两类记录加删除入口——这两类是讲师手敲的，录错概率比自动事件高，且是这个项目第一次给互动记录开删除口子。

## Non-Goals

- 手动录入（"记一条"表单）不加确认框——表单本身已经有"选人/选类型/写内容/点提交"四步，够谨慎了。
- 系统自动产生的记录（已催/跳过/取消跳过）不开放删除——这些是"已催次数"等派生统计的计数基础，删了会改写历史统计。这次的删除口子只针对`interactions-design-alignment`这一轮新加的两类人工写入路径。
- 不做删除时间窗口限制——不限时间，随时能删。
- 不做批量删除、不做"删除原因"记录。
- 删除入口只放在互动记录独立页的列表里，不加到学员详情面板"最近互动"卡片（那里最多显示 5 条，是摘要视图，不是管理界面）。

## Constraints

- 参与度信号确认框用项目已有的弹窗视觉规范（对齐 `EnrollmentModal.tsx`/已删除的 `ManualInteractionModal.tsx` 那一套：居中弹窗、标题+一句话确认文案、取消/确认两个按钮）。
- 后端新增删除端点，只接受 `event_type` 为 `manual` 或 `participation` 的记录 ID；对 `nudged`/`skipped`/`unskipped` 的删除请求 SHALL 拒绝（422 或 403，具体在 design 阶段定），前端也不提供这些类型的删除按钮，双重挡（后端不能只靠前端不出现按钮就假设安全，因为端点本身可以被直接调用）。
- 删除后同样要保持三处消费方（详情面板/独立页/侧边栏徽标）一致——复用 `interactions-design-alignment` design.md 决定 5 的两次 `revalidatePath` 模式。
- `nudge_events` 表当前没有主键之外可用于前端定位的稳定 ID 吗？需要确认 `InteractionRead` 有没有暴露记录的 `id`——如果目前没有，这次要加上（删除必须按主键定位，不能按"学员+时间+类型"这种可能撞车的组合定位，这是 `CLAUDE.md` 记录的坑：写脚本一律按主键定位）。

## Success Criteria

- 讲师选中学员、点某个参与度信号，先看到"确认给 XX 标记 YY？"的弹窗，点确认才真正写入；点取消什么都不发生。
- 独立页列表里，事件类型是"人工录入"或"参与度"的行，行末有删除按钮；已催/跳过/取消跳过的行没有。
- 点删除后，弹一个确认框（"确认删除这条记录？"），确认后记录从列表消失，详情面板"最近互动"、侧边栏徽标数字同步更新。
- 直接拿 `nudged` 类型的记录 ID 调删除接口，后端拒绝，不会误删自动事件。

## User Stories

- 作为讲师，我在参与度信号区手滑点错了学员，点确认框的"取消"就能收手，不会留一条错的记录。
- 作为讲师，我发现刚才给错学员打了"出席直播"标签，回到列表点这条记录的删除按钮，确认后它就没了。

## Open Questions

- Q-01：删除失败（记录不存在、类型不允许）时的报错怎么展示——inline 在这一行旁边，还是用一个全局的错误提示？留给 design 阶段定，倾向 inline（跟这一行绑定，用户不用去别处找报错对应哪条）。
- Q-02：`InteractionRead`/`Interaction`（前端类型）需要加 `id` 字段吗——需要，删除必须按主键定位。这属于实现细节但影响面较大（所有读取 `Interaction` 的组件都要能拿到这个新字段），design 阶段要确认现有组件（`DetailPanel`/`InteractionsClient`）加这个字段是否会引入意外的破坏性改动。

## Referenced Capabilities

- `interactions`（本变更再次修改：加确认步骤、加删除能力）

## Design System

复用现有 tokens，跳过 awesome-design-md 重新选型——弹窗外观对齐既有规范（`EnrollmentModal.tsx` 那一套）。Mock：`docs/superpowers/specs/mocks/2026-08-10-interactions-confirm-and-undo-mocks.html`。
