---
Date: 2026-08-02
Change: homework-reply-status
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# homework-reply-status Requirements

作业页加一个讲师手动标记"已回复"的入口，不再只能靠 `grades.csv` 里的「回复状态」列。

## 为什么

`reply_status` 是纯镜像字段，原样取自源文件，每次重新导入整列覆盖。讲师实际是在
系统之外（私信、邮件）回复学员的，批改工具本地那份记录常常没跟着更新，导致页面
显示"待回复"但其实已经回复过了。这个字段本身不该改（它是源文件的忠实镜像），
但讲师需要一个不受重新导入影响的地方记录"我确实回复过这个人"。

## Goals

- 详情面板加一个"标记已回复"控件，讲师点一下即可标记，标记**不随下次导入被覆盖**
- 标记可以来回切换（标错了能改回未回复）
- 时间戳由服务端记录，客户端不能传
- 作业页「待回复」筛选的判据从"reply_status ≠ 已回复"改成"未标记为已回复"
- 源文件的 `reply_status` 列继续原样展示，与新的手动标记是两个独立信号，不合并显示

## Non-Goals

- 不做列表行内的快捷标记控件——只在详情面板
- 不改 `homework_parsing.py` 对 `reply_status` 列的解析逻辑，也不改导入行为
- 不做批量标记
- 不追溯历史：变更上线前已导入的记录，`replied` 一律是初始值（未标记）

## Constraints

- `HomeworkSubmission` 每次导入整行 `setattr` 覆盖（`_classify` 里 `fields.items()` 遍历），
  新字段必须不在这个覆盖范围内，否则下次导入会把标记清空——需要在设计阶段确认写入路径
  不会碰到这个字段
- 遵循既有模式：像 `Enrollment` 的 `status`（人决定的部分单独存，不与派生值混在一起）

## Success Criteria

- 讲师在详情面板点"标记已回复"，刷新页面后仍是已回复；该门课重新导入一次 grades.csv
  （不含这个人的新数据变化），标记仍然是已回复
- 点"标记已回复"之后按钮变成可以点回"标记未回复"，点了之后筛选里这个人重新出现在待回复里
- 「待回复」筛选计数与列表跟标记状态一致，不再看 `reply_status` 原始值

## User Stories

- 作为讲师，我私信回复了学员的作业反馈，回到系统里把这个人标记成"已回复"，
  这样"待回复"名单就不会一直挂着这个人，即使源文件那列还没跟着更新

## Open Questions

- 新端点具体形状（PATCH 通用端点 vs 类似 `archive`/`restore` 的 action 式端点）留到
  design 阶段定，两种都符合现有代码库的先例（`enrollments` 用 PATCH，`students` 用
  action 式端点），不影响这份需求

## Referenced Capabilities

- `homework`（`openspec/specs/homework/spec.md`）—— 本变更在其「回复状态原样取自源文件」
  这条 Requirement 之外，新增一个独立的手动标记信号，不改动该条本身
