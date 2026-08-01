---
Date: 2026-08-01
Change: homework-auto-create-student
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# homework-auto-create-student Requirements

导入 `grades.csv` 时，遇到邮箱不在 `students` 表里的行，从「跳过、等人工先建档再重导」
改成「自动建学员档 + 自动建报课，成绩照常写入」。

## 为什么

现状（`backend/app/routers/homework.py` 的 `_classify`）：邮箱不在 `known` 集合里的行
进 `skipped_no_student` 清单，**成绩不写**，处置方式是"先建学员，再重导"。

新学员提交作业是正常事件，不该要求讲师先手动建档才能把这次导入跑完。
grades.csv 本身就带着邮箱和姓名，足够建一条最小学员记录；报课记录也能从
"这次导入是导给哪门课"直接推出来。

## Goals

- `import_homework` 遇到邮箱不在 `students` 表的行时，自动建 `Student` + `Enrollment`，
  成绩正常写入（不再进 `skipped_no_student` 被跳过）
- 返回体里能看出"这次导入自动建了谁"，讲师需要之后手动回填（微信、地区等真实信息）
- `dry_run=true` 时能预览会自动建哪些人，不真的写库
- 幂等：同一邮箱第二次导入，走已在册学员的 update 路径，不重复建档/建报课

## Non-Goals

- 不做"确认后再建档"的人工审核步骤（半自动方案），本次直接全自动建
- 不反推具体上课场次（`session_id` 仍为 `None`，沿用"未定场次"语义）
- 不改动解析层 `homework_parsing.py` 对姓名的处理（本来就不要求姓名非空）
- 不批量回填历史的 `skipped_no_student` 记录（本变更只影响之后的导入）

## Constraints

- `Student` 表 `region` / `level` / `source` 三列必填、无默认值，grades.csv 拿不到，
  必须给占位默认值
- `Enrollment.enrolled_at`（`date`，必填）grades.csv 也拿不到
- 不能违反既有纪律："不从文件名/路径猜课程"——本变更不新增任何猜测，
  课程本身已由 `_course_of` 显式解析出来，与本变更无关
- 前端 `ImportDialog` 展示 `skipped_no_student`，字段改名/改语义需要同步改前端

## Design（讨论中已定的具体值）

**自动建 `Student`**：
- `email`, `name` — 取自 grades.csv；姓名为空则写 `"待定"`
- `region="美东"`, `level="有基础"`, `source="讲武堂"`（占位默认值，人工后续回填）
- 其余字段用模型默认值（`wechat=""`, `wx_name="—"`, `nick="—"`, `gender="—"`,
  `age="—"`, `industry="—"`, `tags=[]`, `note=""`）

**自动建 `Enrollment`**：
- `student_email`, `course_id`（本次导入目标课程）
- `session_id=None`（未定场次，作业页会归到既有的 `NO_SESSION` 分类，不误催）
- `status="enrolled"`
- `enrolled_at` = 该课程 `course_sessions.local_date` 的最小值；
  该课程一场 session 都没有时，回退为 `date.today()`

**返回体**：`HomeworkImportResult.skipped_no_student` 废弃，改成 `auto_created: list[str]`
（自动建档的邮箱列表），与既有的 `skipped_no_enrollment` 并列 —— 两者都是
"写了，但要看一眼"的语义。`dry_run=true` 时同样能算出会自动建哪些人。

## Success Criteria

- 上传一份含有全新邮箱的 grades.csv，导入后该学员出现在学员表、报课表、
  作业页（`NO_SESSION` 分类），成绩与已在册学员一致地展示
- 同一份文件重复导入，不产生重复的 `Student` / `Enrollment` 记录
- `dry_run=true` 返回体里能看到会自动建的邮箱列表，且真的没有写库
- 前端 `ImportDialog` 正确展示 `auto_created`，不再引用已废弃的 `skipped_no_student`

## User Stories

- 作为讲师，我上传一份新场次的 grades.csv，里面有个从没出现过的学员邮箱，
  导入后这个人的成绩、档案、报课都自动建好了，我不用先手动建档再重新上传一遍
- 作为讲师，我想在正式导入前看一眼这次会不会自动建新学员、建几个，
  避免误传文件把一堆"幽灵学员"建进库

## Open Questions

- 无场次课程下 `enrolled_at` 回退 `date.today()` 是否需要在导入结果里单独标注
  （区别于"从场次推出来的" `enrolled_at`）？—— 待 propose 阶段决定是否值得加字段，
  倾向不加：这是边界情况，加字段的收益不确定
- 自动建档的默认值（美东/有基础/讲武堂）目前是全局硬编码常量还是应该可配置？
  —— 倾向硬编码常量，现在只有一门机构（讲武堂），过度设计成配置项不值得

## Referenced Capabilities

- `homework-upload`（`docs/superpowers/specs/2026-07-31-homework-upload-requirements.md`）
  —— 本变更是它的导入路径上的行为调整，不改上传/解析/预览的既有契约
