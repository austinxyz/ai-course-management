## Context

`HomeworkSubmission` 的 `reply_status` 是导入时整列覆盖的纯镜像字段。讲师需要一个
不受重新导入影响、可来回切换的"已回复"标记。参考先例：`Student` 的
`archive`/`restore`（POST 动作式端点、无请求体、时间戳服务端盖）与 `Enrollment` 的
`status`（存人决定的部分，「已完成」由派生得出而不入库）。

## Goals / Non-Goals

**Goals:**
- 新增 `replied` / `replied_at` 两列，`_classify` 的整行覆盖逻辑不碰这两列
- 一个动作式端点切换标记，时间戳服务端盖
- 「待回复」筛选改用新字段

**Non-Goals:**
- 不做批量标记、不做列表行内标记
- 不改 `reply_status` 本身的存储与展示

## Decisions

**1. 端点用动作式 `POST /api/homework/submissions/{id}/reply` 与
`.../unreply`，不用通用 `PATCH`。**

跟 `Student.archive`/`restore` 同一个理由：这个操作只携带一个事实——
"讲师标记了这件事发生"，没有其他可选字段，动作式端点比通用 PATCH 更直接地表达
"这是一次状态切换动作"而不是"改一个字段"。请求体为空，时间戳服务端盖
（`datetime.now(UTC)`，与 `archive_student` 一致）。

备选：复用 `Enrollment` 那种通用 `PATCH` + `model_fields_set` 判断。放弃：这里只有
一个布尔值要切换，判断"提供了哪些字段"这套机制是为多字段场景设计的，用在单一动作上
是多余的间接层。

**2. `_classify` 的字段覆盖显式排除 `replied`/`replied_at`。**

现有代码：

```python
fields = {key: value for key, value in row.items() if key != "student_email"}
```

`row` 来自 `homework_parsing.parse()` 的输出，本来就不含 `replied`/`replied_at`
这两个键（解析层根本不知道它们的存在）——`row.items()` 遍历的是解析出来的列，
不是模型的全部字段，所以两列天然不在覆盖范围内，**不需要额外排除逻辑**。这一点
写进 group 1 的 RED 测试里直接断言（标记后重新导入不清空），比只读代码更可靠。

**3. Migration 用 `ALTER TABLE ... ADD COLUMN` 加两列，均可空/带默认值。**

```sql
ALTER TABLE homework_submissions
  ADD COLUMN replied boolean NOT NULL DEFAULT false,
  ADD COLUMN replied_at timestamptz;
```

`replied` 非空带默认值（已有行不会因为加列变成 NULL 状态不明）；`replied_at`
可空（未标记时没有时间戳）。不需要回填脚本——默认值本身就是"变更上线前的既有记录
默认未标记"这条 spec 要求的正确状态。

## Risks / Trade-offs

- **[风险] 两个端点（reply/unreply）比一个通用端点多写一点样板代码**
  → 接受：与现有 `archive`/`restore` 先例保持一致比省几行代码更重要——
  读这个路由文件的人已经见过这个模式一次。
- **[风险] `replied_at` 允许为空，读取时要判断 `replied=true` 但 `replied_at=null`
  的不一致状态（理论上不该出现，除非绕过 API 直写库）**
  → 缓解：两个端点总是同时设置这两个字段（`reply` 设两者，`unreply` 都清空），
  不给中间态留口子；API 层没有能单独改其中一个的入口。

## Migration Plan

新增一条 migration（`ALTER TABLE` 加两列，均有默认值或可空，无需回填、不锁表）。
部署后立即生效。回滚：新的 migration `ALTER TABLE ... DROP COLUMN`（这两列没有
被其他表引用，可以安全撤销）。

## Open Questions

（无——explore 阶段的 Open Question 已在这里定：动作式端点，参照 `Student` 的
`archive`/`restore` 先例。）
