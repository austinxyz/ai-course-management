---
Date: 2026-07-31
Change: homework
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-31-homework-requirements.md
---

## Why

作业成绩是这套系统里**唯一已经完整存在、却完全没进库**的一块 —— 28 行真实批改结果躺在
另一个仓库的 `grades.csv` 里。更要紧的是，§4.4 催作业的核心判据是「有报课记录但无提交记录」，
而这个判断今天**根本算不出来**，因为提交记录不在库里。作业是催作业的前置条件，不是并列功能。

`enrollment-backfill` 已经用掉了这些数据的一个比特（有没有成绩），把总分、分项、亮点、
改进建议、回复状态全丢了。现在把整行取回来。

## What Changes

- 新增 `homework_submissions` 表：一条 =「某人某门课的最新一次提交」。分项评分整列存进
  `scores`（**JSONB 有序数组**），新增课程只是多一套 item 名，**不动表结构**
- 新增只读接口 `GET /api/homework`（按课程过滤）与写入接口 `PUT /api/homework`（幂等 upsert，
  供同步工具调用）
- 新增本地 CLI `tools/homework-sync/`：读 `grades.csv`，`--course` 显式指定课程，
  支持 `--dry-run`，输出**两份分开的**跳过清单
- `/homework` 从占位页变成真实页面：按课程看名单、四态、三种筛选、选中看完整评分。**全只读**
- 前端 `lib/api.ts` 增加 `getHomework`

**非破坏性。** 不改任何既有表、接口或页面行为。

## Capabilities

### New Capabilities

- `homework` —— 作业提交记录的镜像与呈现

### Modified Capabilities

无。

`enrollment` 已有的「作业按人计，不按报课记录计」是**面向本能力写的前瞻约束**，
本次是去满足它，不是改它。同理 `app-shell` 的导航与占位页规则本就是通用的，
把占位页换成真实页面不触及它的任何一条需求。

## Impact

| 层 | 文件 |
|---|---|
| migration | `supabase/migrations/` 新增一支：建表 + 两个索引 |
| 后端模型 | `backend/app/models.py` 增 `HomeworkSubmission` |
| 后端 schema | `backend/app/schemas.py` 增 `HomeworkRead` / `HomeworkUpsert` / `ScoreItem` |
| 后端路由 | `backend/app/routers/homework.py`（新）；`main.py` 注册 |
| 后端复用 | `routers/courses.py` 的 `derive_session_state` —— 判「场次已结束」只此一处 |
| 工具 | `tools/homework-sync/`（新）：`parsing.py` / `sync.py` / 测试 / README |
| 前端 | `app/(app)/homework/`（新，替换占位）；`lib/api.ts`；侧边导航项指向真实路由 |
| 测试 | `backend/tests/test_homework_*.py`、`test_query_roundtrips.py` 加一条断言、前端组件测试 |

## Out of Scope

- **催作业全链路（§4.4）** —— 算名单之后的起草文案、发邮件、回写互动记录、已催次数。
  另开 change。本次只把「谁没交」变得**可计算**
- **互动记录（§4.5）** —— 表都还不存在
- **在网页上触发同步。** `grades.csv` 在另一个仓库，Render 上的后端看不到那些文件；
  跨仓库数据先导入、不做运行时依赖是既定纪律。稿子上那个「重新同步」按钮**有意不做**
- **各分项满分、分数条形图、`11 / 15` 这种写法** —— 满分不在 csv 里，在 `rubric.md` 里
  （而 `session3/` 与 `session4/` 的那两份还是对调的）
- **历史版本**（覆盖前留旧值、「第 2 次提交 +6 分」）
- **「截止后交 / 按时交」** —— 需要给 `courses` 加「作业截止日期」列。那个字段对催作业
  （「已过 N 天」）更有用，跟着催作业那个 change 一起加
- **作业原文与批改报告**（`submissions/*.md`、`*_report.md`）—— 只镜像 `grades.csv` 的汇总
- **任何写入界面。** 页面全只读；改成绩要回 `ai-course` 仓库改 csv 再同步
- **`enrollment-import`**（EliteCoach101 平台导入）—— 仍阻塞于导出方式未知
