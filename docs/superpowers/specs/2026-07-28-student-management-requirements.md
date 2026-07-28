---
Date: 2026-07-28
Change: student-management
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# student-management Requirements

## Goals

- 学员列表页由真实数据驱动：浏览器 → Next.js server-side fetch → FastAPI → 本地 Supabase Postgres，走通完整链路
- 建立学员表的 schema 与本地开发环境（`supabase/migrations/*.sql` + `supabase/seed.sql`），验证本地 `supabase start` 后端到前端全跑通
- 详情面板改为只读展示真实记录（点击列表行 → 显示该学员完整字段）
- 区域 / 基础 / 来源三个字段用应用层枚举（Pydantic `Literal`），不用 Postgres 原生 `ENUM` 类型，为将来加值留口子

## Non-Goals

- 不做字段编辑、标签编辑、备注编辑（`frontend/app/students/` 现有原型里的这些交互先保留在前端展示层，但不接后端写接口）
- 不做归档 / 恢复流程
- 不做新增学员（含邮箱查重跳转）
- 不做 EliteCoach101 报课数据导入、grades.csv 作业数据关联——这些是后续 change
- 不做访问控制（讲需求文档 §9.3 未决，本地开发阶段不需要）
- 不部署到 Vercel/Render——这一步的验收标准是"本地跑通"，不含线上部署

## Constraints

- 架构纪律不可违反：浏览器不直连 FastAPI/Supabase；只有 FastAPI 访问数据库；migration 唯一来源是 `supabase/migrations/*.sql`
- 不在表上加 `user_id` 列（CLAUDE.md 认证章节已定）
- 区域/基础/来源字段：DB 列类型为 `TEXT`，取值范围由 FastAPI Pydantic `Literal` 校验，不用 Postgres `ENUM`
- 种子数据放 `supabase/seed.sql`（Supabase CLI 本地专用文件，`supabase db push` 不会推到线上），不与 schema migration 混在一起
- 前端 `frontend/app/students/` 已有的 UI 代码复用，把 mock 数据源换成真实 API 调用，不重写页面结构
- 测试所有外部依赖需 mock（本 change 不涉及外部 API，此条暂不适用，留给后续 change）
- `tags` 字段用 JSON（Postgres `jsonb` 列）存，不用 `text[]` 数组类型
- FastAPI 项目依赖管理用 `uv`
- 邮箱列 `NOT NULL UNIQUE`；微信号允许为空（`NULL` 是合法状态，不是异常）
- 详情面板只展示学员表自身字段——不展示"报课记录/作业提交"这类占位统计（那些依赖报课表和作业表，本 change 不建）

## Success Criteria

- `docker` 起 Docker Desktop 后，`supabase start` 能在本地跑出 Postgres + Studio
- `supabase/migrations/*.sql` 建出学员表，字段覆盖：姓名、邮箱（唯一）、微信号、微信昵称、区域、基础、来源、标签、备注
- `supabase/seed.sql` 载入种子数据后，`GET /api/students`（FastAPI）返回这批学员
- 本地跑 `npm run dev`（frontend）+ FastAPI 后端，浏览器打开学员列表页，看到的是种子数据而非硬编码 mock
- 点击列表任一行，右侧详情面板显示该学员完整字段（只读，无编辑控件生效）
- 空库场景（`supabase db reset` 后不跑 seed）页面显示"暂无学员"
- 前后端各自的单元测试跑绿（pytest + vitest）

## User Stories

- 作为讲师（admin），我想看到学员列表反映的是数据库里的真实记录，而不是写死在前端的 mock 数据，这样后续导入报课数据后名单会自动更新
- 作为 developer，我想有一套能跑起来的本地开发环境（本地 DB + 本地后端 + 本地前端），这样后续每个 change 都能在这套环境上继续开发和验证

## Open Questions

（无——explore 阶段讨论中已全部解决，见 Constraints）

## Referenced Capabilities

- ADD student-roster —— `openspec/specs/student-roster/spec.md`（新能力：学员列表查询、只读详情）

## Design System

来源：claude.ai/design 项目「讲武堂学员管理系统」（`ClaudeAI课程学员管理页.dc.html`），
非 awesome-design-md 预设风格，自定义暖白/赤陶配色。已实现于 `frontend/app/students/`。
Phase 4（style 选型 + 画 mock）跳过——设计与前端实现已在此 change 之前完成。
