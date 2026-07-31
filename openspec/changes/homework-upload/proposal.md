---
Date: 2026-07-31
Change: homework-upload
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-31-homework-upload-requirements.md
---

## Why

`homework` 把 `grades.csv` 的镜像做出来了，但导入这条路只能这么走：有 `ai-course` 仓库的
checkout → 在那台机器上 → 记得命令行怎么写。这是个 web app，却有一条能力只在一台电脑上存在。

**上一片的论证是错的。** 当时说「跨仓库数据先导入、不做运行时依赖，所以只能是本地 CLI」——
前半句对，后半句不成立：浏览器上传恰恰**就是**「先导入本系统数据库」。
"后端读不到另一个仓库的文件系统"（真的）被推成了"因此必须是命令行"（不成立）。
设计稿里那个「重新同步 grades.csv」按钮是对的，`.dc.html` 里标成「永久偏离」的那条要翻案。

另有一个已知的下游：批改 skill 将来要通过 MCP 直接上传。因此真正的契约是**后端接口**，
网页只是它的第一个调用方 —— 这决定了业务逻辑必须全部落在 FastAPI 一侧。

## What Changes

- 新增 `POST /api/homework/import`：收 CSV 原文 + 课程（`course_id` 或 `course_alias`），
  服务端解码、解析、校验、分类；`?dry_run=true` 算完不落库
- **解析层从 `tools/homework-sync/` 挪进 `backend/app/`**，测试一并搬迁
- **BREAKING（对内）**：`tools/homework-sync/` 删除。解析挪走后它只剩「读文件 + 发上去」，
  而那件事网页已经能做。无外部消费者
- **BREAKING（对内）**：`PUT /api/homework` 的结构化入口被 `POST /api/homework/import` 取代。
  只有一条进库的路，就不会有"命令行导进去的和网页导进去的不一样"
- 新增 `homework_excluded_emails` 表：「不算作业的邮箱」，全课程通用，取代 CLI 的 `--exclude`
- 新增 `homework_imports` 表：导入的元信息（时间、文件名、行数、结果）。**不存原文**
- 作业页新增「导入 grades.csv」按钮与**预览屏**：编码、行数、去重、将新建/将更新、
  两份跳过清单、表头警告；每行可标「以后不算作业」
- 侧边栏「导入 / 同步 · CSV」改为**「作业 CSV 导入」**并真的跳转（此前是死键）
- 学员页的「导入 CSV」按钮与新建弹窗里的「批量导入请用 CSV 导入」链接**删除**（背后无功能）

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `homework` —— 导入路径从本地命令行变成网页上传；作业页从「完全只读」变成「只有一个写入入口」

`app-shell` 与 `student-roster` 的 spec 都没有写过那几个导入控件，改标签与删死键
不触及它们的任何一条需求，因此不产生 delta。

## Impact

| 层 | 文件 |
|---|---|
| migration | 新增一支：`homework_excluded_emails` + `homework_imports` |
| 后端模型 | `backend/app/models.py` 增两个表 |
| 后端解析 | `backend/app/homework_parsing.py`（从 `tools/homework-sync/parsing.py` 迁入，加解码层） |
| 后端 schema | `backend/app/schemas.py` 增 `HomeworkImportRequest` / `HomeworkImportResult` |
| 后端路由 | `backend/app/routers/homework.py`：新增 import 端点与排除名单端点，移除结构化 `PUT` |
| 前端 | `app/(app)/homework/`：`ImportDialog`、`actions.ts`（Server Action）；`lib/api.ts` |
| 前端清理 | `app/(app)/students/Sidebar.tsx`、`StudentsTable.tsx`、`NewStudentModal.tsx` 的死键 |
| 删除 | `tools/homework-sync/` 整个目录 |
| 测试 | 解析测试迁入 `backend/tests/`；新增解码、排除、导入端点、预览屏、Server Action 鉴权 |

## Out of Scope

- **MCP 服务器本身。** 本片只保证接口的形状适合被它调用（收 alias、返回体自描述）
- **学员导入 / 报课导入。** 报课导入将来可能会有（`enrollment-import`，阻塞于 EliteCoach101
  导出方式未知）；现在为它预留一个通用「导入 / 同步」入口，就是拿不存在的能力占位
- **保存上传的 csv 原文** —— 只记元信息
- **满分与分项条形图** —— 归 `homework-rubric`
- **改变认证模型。** 上传是本片**新增**的写入面：此前密码泄露的最坏情况是被看到，
  之后是能覆盖成绩。仍不做每人一身份、不做限流（2026-07-29 决定），
  但这条风险是新的，写在需求里，不是没想到
- **导出。** 只进不出
