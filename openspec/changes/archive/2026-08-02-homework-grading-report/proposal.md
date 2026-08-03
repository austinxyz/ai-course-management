---
Date: 2026-08-02
Change: homework-grading-report
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-08-02-homework-grading-report-requirements.md
---

## Why

批改工具产出的逐分项详细报告（`{姓名}_{日期}_report.md`）目前只存在于另一个仓库，
讲师要看只能去翻源文件。`grades.csv` 导入进来的 `highlight`/`improve` 是精简版，
report.md 里的内容更细致（按分项拆开评语），值得让讲师在系统里直接看到。

## What Changes

- 作业详情面板新增"上传批改报告"按钮，讲师为当前选中学员的提交上传一个 `.md` 文件
- 上传后进入预览屏：解析出的逐分项评语**逐条带勾选框**（默认全选），亮点/改进建议
  展示但不单独勾选；分项/总分与现有 `scores`/`total` 不一致的行标黄警告，不阻止确认
- 确认后：勾选的分项评语写入新数据；亮点/改进建议**覆盖**现有 `highlight`/`improve`
- **BREAKING**：`_classify` 的整行覆盖逻辑新增例外——一旦某条提交的
  `highlight`/`improve` 来自 report 导入，之后重新导入这门课的 grades.csv
  SHALL NOT 再覆盖这两个字段
- 详情面板新增"逐分项评语"展示块；亮点/改进建议旁标注"来自批改报告"

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `homework` —「导入接口与调用方无关」附近关于 `_classify` 整行覆盖的既有行为新增
  一条例外；新增上传/预览/解析/展示相关的 Requirement

## Impact

- `supabase/migrations/`：新增一张表存逐分项评语（或等价结构，具体形状见
  design.md），`homework_submissions` 新增一列标记 `highlight`/`improve` 是否
  来自 report 导入
- `backend/app/models.py`：新增模型 / 新增字段
- `backend/app/routers/homework.py`：新增上传解析端点；`_classify` 加覆盖例外判断
- `backend/app/schemas.py`：请求/响应 schema
- `frontend/app/(app)/homework/`：详情面板新增上传按钮、预览对话框、逐分项评语展示块
- `frontend/lib/api.ts`：新增调用

## Out of Scope

- 不解析、不存"讲师回复草稿"段落
- 不解析、不存"作业原文"段落
- 不做批量导入一个 session 目录下所有 report.md 的入口
- 不做文件名到学员/提交的自动匹配
- 不追溯修改历史，report 导入是覆盖式
