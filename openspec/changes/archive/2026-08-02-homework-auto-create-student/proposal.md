---
Date: 2026-08-01
Change: homework-auto-create-student
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-01-homework-auto-create-student-requirements.md
---

## Why

导入 `grades.csv` 时遇到邮箱不在学员表的行，现状是整行跳过、成绩不写，讲师得先手动
建档再重新上传一遍。新学员交作业是正常事件，不该要求讲师先手动建档才能完成一次导入。

## What Changes

- 导入遇到邮箱不在 `students` 表的行时，自动建 `Student` 记录（占位字段：
  `region="美东"`, `level="有基础"`, `source="讲武堂"`；姓名为空时写 `"待定"`）
- 同时自动建 `Enrollment` 记录，`source="derived"`（`enrollment` 能力已定义该取值的语义：
  从既有记录倒推的占位报课），`session_id=None`，`enrolled_at` 取该课程场次最早日期，
  该课程无场次时回退为导入当天
- **BREAKING**：`HomeworkImportResult.skipped_no_student` 字段移除，改为
  `auto_created: list[str]`（自动建档的邮箱列表）；前端同步改字段名与文案
- `dry_run=true` 时同样能预览会自动建哪些人，不真正写库

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `homework` —「无法关联的行被跳过并分类列出」这条 Requirement 中「不在学员表」的处置
  从"跳过、不写"改为"自动建档、正常写入"；两份清单变成「自动建档」与「无报课记录」
- `enrollment` — 补充一条由作业导入触发的 `derived` 报课创建规则（`enrollment` spec
  此前只定义了 `derived` 这个取值的存在，未规定具体触发场景）
- `student-roster` — 补充一条"由作业导入自动创建"的建档路径，与既有「可新增学员」
  的人工表单路径并列，字段默认值不同、且不做重名/归档冲突检查（因为判据不同：
  这里的"未知邮箱"就是"在 `students` 表里完全查不到"，不存在归档冲突的可能）

## Impact

- `backend/app/routers/homework.py`：`_classify` 新增自动建档/建报课逻辑；
  `import_homework` 的返回体字段调整
- `backend/app/schemas.py`：`HomeworkImportResult.skipped_no_student` → `auto_created`
- `backend/app/models.py`：无字段新增，复用 `Student` / `Enrollment` 既有列
- `frontend/app/(app)/homework/`：`ImportDialog.tsx`、`types.ts`、`actions.ts` 里
  `skipped_no_student` 相关的展示与类型
- `frontend/lib/api.ts`：返回类型同步

## Out of Scope

- 不反推具体上课场次（`session_id` 仍为 `None`）
- 不批量回填历史的 `skipped_no_student` 记录，仅影响本变更之后的导入
- 不做"确认后再建档"的半自动人工审核步骤
- 自动建档默认值不做可配置项（硬编码常量，现在只服务一家机构）
