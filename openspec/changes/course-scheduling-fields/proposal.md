---
Date: 2026-07-30
Change: course-scheduling-fields
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-30-course-scheduling-fields-requirements.md
---

## Why

准备把真实课程从 [course-portal](https://austinxyz.github.io/course-portal/) 导入生产时，
发现刚上线的 `course-catalog` 有两个字段**存不下真实数据**——两处都是照设计稿的示例值做的：

1. 每场时长是 `hours int`，校验 1–4 的整小时（设计稿里那四个 chip）。
   四门真实课程**全都是 150 分钟**，2.5 小时存不下。不是边缘情况，是全部数据。
2. 场次时间硬编码「按美西记」，表单标签就是 `时间（美西）`。
   四门真实课程全部排在 **8:30 PM ET**。数据库那层没问题（`tz` 本来就是每场一个字段），
   卡住的是界面：讲师要录美东的课就得自己先把 20:30 换算成 17:30 ——
   而「不用手算时区」正是这个功能存在的理由。

设计稿其实写了「这里只管全课默认时区和时长」，那个默认时区字段我没实现，
直接把美西写死进了 schema 默认值与表单文案。

## What Changes

- **`courses.hours` → `courses.duration_minutes`**（替换，不并存）。migration 回填 `hours * 60` 后删旧列。
  校验 15–600 分钟
- **新增 `courses.default_tz`**，DB 默认 `America/Los_Angeles`（中立值）。
  它**只作为新增场次时的预选值**，不回溯已有场次
- **新增/编辑场次可以选时区**：表单加时区 chip 行（复用 `lib/tz.ts` 的 `ZONE_ROWS`），
  默认选中课程的 `default_tz`，标签从 `时间（美西）` 变成跟随所选值
- 课程弹窗的时长从 1/2/3/4 小时 chip 改为**分钟数字输入**
- 场次的存储与换算逻辑不变：仍是墙上时间 + IANA 时区名，绝对时刻读取时派生

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `course-catalog` —— 「课程可维护」里时长的语义从小时改为分钟并给出取值范围；
  新增课程默认时区的要求；「场次可排，每场独立讲师」补充：录入时可指定该场时区、界面标签跟随。
  跨时区换算与状态派生的要求不变

## Impact

- `supabase/migrations/<ts>_course_duration_minutes_and_default_tz.sql` —— 换列 + 加列
- `backend/app/models.py` —— `Course.hours` → `duration_minutes`，增 `default_tz`
- `backend/app/schemas.py` —— `CourseHours` 退役，新增分钟校验；`CourseCreate/Update` 增 `default_tz`；
  `CourseRead` 字段随之变化
- `backend/tests/test_courses_*.py` —— 分钟边界、默认时区、按美东建场的换算
- `frontend/app/courses/types.ts` / `CoursesClient.tsx` —— 字段改名，事实行显示分钟
- `frontend/app/courses/CourseModal.tsx` —— 时长输入 + 默认时区 chip
- `frontend/app/courses/SessionRows.tsx` —— 新增/编辑场次的时区 chip 行与跟随标签
- `frontend/lib/tz.ts` —— `ZONE_ROWS` 同时供换算行与时区 chip 使用（不新增第二份清单）

## Out of Scope

- **课程数据导入** —— 一次性脚本，见
  `docs/superpowers/specs/2026-07-30-course-import-design.md`。本 change 是它的前置
- **价格与组合价** —— `docs/requirements.md` §2 明确不做支付/对账
- **「期次」字段** —— 「第 N 场」按日期算，补录早期场次会重排，这是期望行为；
  报课记录挂场次 id，不受影响
- **任意时区选择器** —— 界面只给 `ZONE_ROWS` 那四个；API 仍收任意 IANA 名（导入脚本要用）
- **改课程默认时区时回溯已有场次** —— 会在改一个"默认值"时静默改掉历史场次的含义
