# CLAUDE.md

学员管理系统 —— 北美华人 Claude AI 课程的学员档案、报课、作业与互动管理。

> 需求见 [docs/requirements.md](docs/requirements.md)。本文件只规定**怎么建**，不重复"建什么"。

## 项目定位

这是 [docs/phase1-notion-design.md](docs/phase1-notion-design.md) 规划的 **Phase 2**：把 Phase 1 的 Notion 方案迁移到自建 web app，并补上 Phase 1 未覆盖的报课数据与催作业链路。

使用者是讲师本人与合作伙伴，**不面向学员**。

## 架构纪律（不可违反）

- 浏览器只与 Next.js 通信。**不直连 FastAPI，不直连 Supabase。**
- 前端通过 Server Component 内的 server-side fetch 调用 FastAPI，统一封装于 `frontend/lib/api.ts`。
- 只有 FastAPI 可以访问数据库。
- Supabase 仅作托管 Postgres 使用。不使用 RLS，不使用其自动生成的 REST API。
- migration 唯一来源：`supabase/migrations/*.sql`。不使用 Alembic。

违反以上任一条，视为架构违规，evaluator 应直接 BLOCK。

## 技术栈

| 层 | 技术 |
|---|---|
| frontend/ | Next.js 15 App Router + TypeScript + Tailwind |
| backend/ | FastAPI + Python 3.12 + SQLModel |
| DB | Supabase 托管 Postgres |
| 测试 | pytest + httpx TestClient / vitest + React Testing Library |
| 部署 | Vercel（前端）+ Fly.io（FastAPI）+ Supabase 云库 |

## 认证

**不做多用户隔离。** 讲师与合作伙伴共享同一份数据，各自看到的内容完全相同。

因此：
- **不要**在表上预留 `user_id` 列（这点与参考项目 `opsx-new-project` 不同）
- 只需一层访问控制防止公网裸奔，具体方式待 explore 阶段确定
- 不做学员端登录

## 领域约束

### 邮箱是唯一主键

所有学员数据以**邮箱**关联。报课数据（EliteCoach101）与作业数据（grades.csv）同源使用邮箱，可直接 join。

### 微信昵称不可作为标识

微信昵称会变。2026-07-26 实测三份群名单，至少 3 人改名后无法按名字匹配（老沈→踢球吧、Sophi→曲素会、弓长张→Simo），最终靠头像比对才识别。

因此：
- 微信号是**人工一次性对齐后存库的属性**，不是标识
- 任何"按微信名找人"的逻辑都是错的
- 系统必须能列出未对齐微信号的学员

详见 [docs/requirements.md](docs/requirements.md) §5。

### 评分维度按课程变化

各课作业评分项无交集（S1 是 A1–D2 共 10 项，S4 是 K1–M2 共 8 项）。**新增课程不得要求修改数据库结构。**

## 数据来源

| 数据 | 来源 | 备注 |
|---|---|---|
| 报课 | EliteCoach101 平台 | 导出方式待确认，接入层须与具体方式解耦 |
| 作业成绩 | `ai-course/tools/homework-grader/session*/grades.csv` | 保留现有链路 |
| 微信对齐 | `ai-course/feedback/students/学员名单-*.md` | 初始对齐数据 |
| 历史学员/互动 | Notion（Phase 1） | 一次性导入后停用 |

跨仓库读取的数据一律**先导入本系统数据库**，不做运行时跨仓库依赖。

## 测试规则

- 所有外部依赖（EliteCoach101、邮件发送、Notion API）在测试中必须 mock，不得发出真实网络请求。
- 涉及外部 API 的功能，必须有超时与异常路径的测试。
- 涉及**发送邮件**的功能，测试中必须验证不会真实发信。

## 隐私

本系统存储真实学员的姓名、邮箱、微信号。

- 仓库**不得**提交任何真实学员数据（含测试夹具）
- 测试数据一律使用明显虚构的姓名与 `@example.com` 邮箱
- 数据库连接串、邮件凭证只走环境变量，不入库

## 开发流程

走 opsx 四阶段：`explore → propose → apply → archive`。

- `openspec/specs/` —— 能力源头
- `openspec/changes/` —— 进行中的变更
- `openspec/changes/archive/` —— 已归档变更

**`spec.md` 里的 Scenario（Given/When/Then）由人工手写，agent 不得代笔生成 Scenario 内容。** agent 可以指出 Scenario 遗漏了哪些边界，但不得直接代写。

## Pitfalls

<!-- archive 阶段向此处追加。内容必须来自真实的 evaluator retry，不得编造。 -->

（暂无——第一个 change 归档后开始积累）
