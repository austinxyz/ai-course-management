---
Date: 2026-07-30
Change: roster-order-spec
Status: REVIEWED
HAS_UI_SURFACE: no
---

# roster-order-spec Requirements

把**已经在跑的**学员名单排序补进 `student-roster` 的 spec。**不含任何代码改动。**

## 为什么

2026-07-30 上午修过一个缺陷：学员编辑之后就跑到名单最后。原因是 `GET /api/students`
没有 `ORDER BY`，Postgres 按堆顺序返回，而 `UPDATE` 是写一条新元组到堆尾 ——
于是"位置"记录的是最后一次写入时间，而不是数据本身的任何属性。

当时按缺陷直接修了（`ORDER BY name, email`），**没有留下依据**：
选了"按姓名"而不是别的，理由只存在于那次对话里。`course-list-order` 给课程补排序需求时
记下了这个洞，`course-page-boundaries` 归档时它仍在。

补它的理由不是形式完整，而是：**排序规则一旦没有依据，下一个人改动列表查询时无从判断
"这个顺序是有意的还是碰巧的"**。课程那条已经写明（按最早场次倒序、未排课优先），
学员这条却是空白，而两者的取值恰好相反（学员按姓名升序，课程按日期倒序）——
没有依据的话，"统一一下"看起来会像是改进。

## Goals

- `student-roster` 增加一条排序需求，写明规则**与理由**（为什么按姓名，为什么要有兜底键）
- 明确"顺序是数据的属性，不随写入抖动"这条不变量

## Non-Goals

- **不改任何代码**。实现（`backend/app/routers/students.py:46`）与两个测试
  （`test_list_order_is_stable_across_an_edit`、`test_list_order_breaks_name_ties_deterministically`）
  都已存在且通过
- **不改排序规则本身**。姓名升序是现状，本 change 只是把它写下来
- **不做前端排序、手动排序、可配置排序**
- **不碰归档名单的排序**（同一个端点，同一条规则，不另立条目）

## Constraints

- 用 **ADDED** 表达，不要 MODIFIED 既有的「学员列表查询」——
  那条讲的是"返回哪些字段"，与顺序是两件事；混进去会让两个断言绑在一个标题下，
  将来任一变化都要动同一个 header（`openspec archive` 按标题匹配，改标题会中止并回滚整次归档）
- 需求文本要包含**兜底键**这一点。只写"按姓名排序"是不够的：同名两人的相对顺序
  仍会随任何写入抖动，而那正是原缺陷的形状
- Scenario 要能对应到既有的两个测试，不新造断言

## Success Criteria

1. `openspec/specs/student-roster/spec.md` 出现一条排序需求，含规则、兜底键与理由
2. 该需求的两个 Scenario 分别对应既有的两个测试（跨编辑稳定、同名以邮箱兜底）
3. `git diff` 显示 **backend/ 与 frontend/ 均无改动**
4. 后端测试套件无回归（应当原样通过，因为什么都没改）

## User Stories

- 作为下一个改动学员列表查询的人，我想知道当前顺序是**有意选的**还是碰巧的，
  以及为什么它和课程列表的顺序规则相反

## Open Questions

（无。规则、理由、表达方式均已确定。）

## Referenced Capabilities

- MODIFY `student-roster` —— 新增（ADDED）一条「学员名单的排序」需求。既有需求一律不动
