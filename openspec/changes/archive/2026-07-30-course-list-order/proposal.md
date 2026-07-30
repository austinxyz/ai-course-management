---
Date: 2026-07-30
Change: course-list-order
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-30-course-list-order-requirements.md
---

## Why

课程导入完成后讲师试用，指出两处：

1. **课程列表变成了上下堆叠。** 设计稿是左右两栏（左栏固定 264px、`border-right`、独立滚动），
   我实现成了课程 chip 横排在上、详情在下。四门课勉强能看，课程一多就换行堆叠、
   把详情越推越低。这是实现漂移，不是设计变更。
2. **顺序应当按「第一次开课时间」倒序。** 现在按课程名排 —— 而讲师找的是"最近在上的那门"，
   名字的字典序对他没有意义。

第 2 条之所以需要一次 change 而不是直接改：`course-catalog` 的 spec 里**没有任何关于课程顺序的条款**，
这是当时明确留白的（该 spec 起草说明原话：「没有规定课程排序……若你希望固定，说一声」）。
直接改会让这条规则无据可查，将来很可能被"顺手改回按名字排"。

## What Changes

- **课程按最早一场的日期倒序**（最新在前）；**还没排课的排最前**；
  日期相同以课程名、再以 id 兜底
- 排序在**后端**完成并体现在 `GET /api/courses` 的返回顺序里；前端不重新排序
- **课程页改回左右布局**：左栏固定宽度、独立滚动；右侧详情独立滚动
- 场次内部排序不变（仍按上课日期升序）

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `course-catalog` —— 新增一条「课程列表排序」需求。其余需求不变；布局不入 spec

## Impact

- `backend/app/routers/courses.py` —— `list_courses` 的排序
- `backend/tests/test_courses_api.py` —— 四条排序断言
- `frontend/app/courses/CoursesClient.tsx` —— 左右两栏布局，课程列表移入左栏
- `frontend/app/courses/CoursesClient.test.tsx` —— 列表容器可被定位（左栏存在且可滚动）

## Out of Scope

- **学员名单的排序** —— `ORDER BY name, email` 至今不在 `student-roster` 的 spec 里，
  同一类洞，但属另一条能力。要不要补另行决定
- **手动排序 / 拖拽** —— 顺序由数据推出，不由人摆
- **课程搜索、筛选、分页** —— 课程是个位数
- **把布局写进 spec** —— 视觉基准是设计稿，spec 描述像素只会过时
- **改场次排序** —— 仍按日期升序。与课程相反是有意的：课程列表回答"最近在上什么"，
  场次列表回答"这门课怎么走过来的"
