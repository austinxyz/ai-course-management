---
Date: 2026-07-29
Change: course-catalog
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-29-course-catalog-requirements.md
---

## Why

报课（`docs/requirements.md` §4.2）没法先做：一条报课记录要按平台别名匹配到**某门课**、
再挂到**某一场**，而课程与场次两张表都不存在。系统现在只有 `students` 一张表。

课程页的设计已经定稿（2026-07-29 从 claude.ai/design 重新导入，见
`docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html`），
且引入了「每场独立讲师与学员」这一层 —— 一门课多场、每场自己的讲师，
报满后加场、为亚洲时区加晚场都是真实发生过的排课方式。

## What Changes

- **新增 `course-catalog` 能力**：课程与场次的读写
- **三张新表**（`supabase/migrations/` 加一个文件）
  - `courses` —— 独立 id 主键；课程名、简称、一句话定位、课程介绍、每场时长、
    作业题目、上架状态
  - `course_aliases` —— 平台别名，**全局唯一**（去空白+转小写后判重），导入时的匹配入口
  - `course_sessions` —— 一门课下的场次：**美西本地日期 + 本地时间 + IANA 时区名**、
    讲师（字符串）、状态覆盖、备注
- **场次状态是派生值**：默认按美西当天与场次日期比较得出 `pending` / `done`，
  人工可覆盖为 `cancelled`（或修正），并能「恢复跟随日期」清掉覆盖
- **跨时区换算走 IANA 时区名**，不存固定 UTC 偏移
- **新增课程页**（`/courses`）与新建/编辑课程弹窗；侧栏 `NavKey` 增 `courses`
- 课程只有上架/下线，**没有删除**；场次可删

## Capabilities

### New Capabilities

- `course-catalog` —— 课程 CRUD（无删除）、别名增删与唯一性、场次 CRUD、
  状态派生与覆盖、跨时区时间换算的正确性

### Modified Capabilities

（无。`student-roster` 不变 —— 课程与学员在本 change 里没有关联，关联发生在报课）

## Impact

- `supabase/migrations/<ts>_create_courses.sql` —— 三张表 + 别名唯一索引
- `backend/app/models.py` —— `Course` / `CourseAlias` / `CourseSession`
- `backend/app/schemas.py` —— 读写 schema；沿用「只读响应用 `str`，写请求用 `Literal`」的既有分工
- `backend/app/routers/courses.py` —— 新 router
- `backend/app/main.py` —— 挂载 router
- `backend/tests/test_courses_*.py` —— 表约束、别名唯一、状态派生、时区换算
- `frontend/lib/api.ts` —— 课程与场次的 server-side fetch 封装
- `frontend/app/courses/` —— 页面、客户端组件、Server Actions
- `frontend/app/students/vocab.ts` + `Sidebar.tsx` —— `NavKey` 增 `courses`，
  从 `PAGES` 占位表里移除该项
- `frontend/lib/tz.ts` —— 时区换算工具（前端展示用）

## Out of Scope

- **报课** —— 报课表、导入中间格式、手工补录弹窗，全部下一个 change。
  直接后果：场次卡片上设计里的「已报 N 人」本 change **不显示**（显示 0 会被读成「没人报」）
- **删除已有报课的场次要被拒绝** —— 本 change 没有报课表，无从实现；
  这是留给报课 change 的必办项，否则报课会指向不存在的场次
- **作业评分** —— 课程上只有「作业题目」一条元数据；评分维度仍不落列
- **讲师实体** —— 讲师是场次上的字符串，选项从已有场次去重
- **批量排课**（如"每周三连开 6 场"）
- **课程删除** —— 只有上架/已下线
- **回头统一 `region`/`level`/`source` 的中文枚举** —— 新枚举列用英文 key，
  旧的三个字段有生产数据，为一致性做迁移不值得
