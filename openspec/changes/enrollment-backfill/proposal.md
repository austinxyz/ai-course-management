---
Date: 2026-07-30
Change: enrollment-backfill
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-30-enrollment-backfill-requirements.md
---

## Why

`enrollment-core` 上线了报课的数据主干，但**生产库里一条报课都没有**。这些记录其实已经存在，
只是躺在另一个地方：**一个学员如果有某门课的作业成绩，他必然报过那门课。**
批次不知道，但"谁上过哪门课"这个连接现在就能建立 —— 模型本来就为它准备好了，
`session_id` 可空、「未定场次」是一等状态。

同时 `/enroll` 还是占位页：22 条报课散在二十个学员详情里，没有任何地方能一眼看到全貌，
更别说"哪些人还没定场次"。

还有一个 `enrollment-core` 留下的缺口：PATCH / DELETE 端点做了却**没有界面入口**，
于是倒推出来的记录在界面上无路可走。

## What Changes

- `enrollment.source` 新增第三个值 `derived`（从作业成绩倒推），并写明平台导入对
  `manual` 与 `derived` 的**不同处置** —— 前者不得覆盖，后者可以
- 新增 `tools/enrollment-backfill/`：读 `ai-course/tools/homework-grader/session*/grades.csv`，
  按别名匹配课程，为每个 (学员, 课程) 建一条未定场次的报课。dry-run 默认，`--apply` 才写
- `/enroll` 从占位页变成**只读**的报课总表：课程筛选 + 表格（学员 / 课程·场次 / 报课日期 /
  状态 / 来源 / 备注）
- 学员详情的报课区块新增**逐条编辑**：改场次（含清空）、删除

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `enrollment` —— 三处：
  - MODIFIED「报课记录把学员挂到课程，场次可空」：其需求文本写着来源是"手工补录 / 平台同步"
    两种，现在是三种。整块复制该需求再改，标题不变
  - ADDED「报课总表」
  - ADDED「已有报课可改、可删」
- `student-roster` —— ADDED 学员详情报课区块的逐条编辑入口

## Impact

- `supabase/migrations/` —— 无 schema 变更（`source` 是 `text`，没有 CHECK 约束）
- `backend/app/routers/enrollments.py` —— 补录时 `source` 可指定；校验取值
- `frontend/app/(app)/enroll/` —— 从占位页改为真实页面（`placeholder-routes.test.tsx` 要跟着改）
- `frontend/app/(app)/students/EnrollmentRows.tsx` —— 增加改场次 / 删除入口
- 新增 `tools/enrollment-backfill/`
- **跨仓库读取**：`grades.csv` 一次性读入，不建立运行时依赖

## Out of Scope

- **EliteCoach101 的平台导入**（CSV / 手工粘贴 / API 三通道、待处理队列、`raw_payload` 留档）
  —— 仍叫 `enrollment-import`，阻塞于导出方式未知（目前只知道"后台看得到表格"，表头未知）
- **批量指派场次** —— 集中成批指派归 `enrollment-import`；本片只做逐条改
- **在总表上编辑** —— 总表只读。写入路径分散成两处是这个项目吃过亏的形状
- **自动新建学员** —— 匹配不到的 5 人跳过并列出。`students` 的 `region`/`level`/`source`
  都是必填而 CSV 里没有，自动建就得编值
- **导入作业成绩本身**（分数、评分项）—— 那是作业能力
- **`session4` → S4 的映射** —— 该文件 0 行且表头与 session3 高度重合，映射无证据，不做
