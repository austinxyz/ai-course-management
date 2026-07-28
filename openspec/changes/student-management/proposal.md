---
Date: 2026-07-28
Change: student-management
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-28-student-management-requirements.md
---

## Why

学员管理系统前端已有一套完整的原型（`frontend/app/students/`，来自 claude.ai/design 导入），
但数据是硬编码 mock，且没有后端、没有数据库。项目需要第一条能在本地跑通的端到端垂直切片，
把 Next.js → FastAPI → 本地 Supabase Postgres 的架构纪律真正落地，后续每个 change 才有地基可续。

## What Changes

- 新建 `backend/`（FastAPI + Python 3.12 + SQLModel，依赖用 `uv` 管理）
- 新建 `supabase/migrations/*.sql` 建学员表；新建 `supabase/seed.sql` 载入虚构种子数据（本地专用，不推生产）
- 新增 `GET /api/students` 和 `GET /api/students/{email}` 两个只读端点
- `frontend/app/students/` 的数据源从硬编码 `DATA` 常量换成 `frontend/lib/api.ts` 里封装的 server-side fetch 调用
- 详情面板改为展示后端返回的真实记录（保持只读，前端已有的编辑/标签/归档控件保留在 UI 但不接后端写接口——点了没有持久化效果）

## Capabilities

### New Capabilities

- `student-roster` —— 学员列表查询、按邮箱查单条记录（只读）

### Modified Capabilities

（无——项目里还没有其它已存在的能力）

## Impact

- `backend/`：全新目录，FastAPI app、SQLModel models、`uv` 项目文件
- `supabase/migrations/`、`supabase/seed.sql`：全新
- `frontend/app/students/page.tsx`：数据源改为真实 fetch，其余组件文件（Sidebar/FilterBar/StudentsTable/DetailPanel/NewStudentModal/PlaceholderPage）结构不变
- `frontend/lib/api.ts`：全新，统一封装 server-side fetch 调用 FastAPI
- `.env.example`（frontend、backend 各一份）：新增 `DATABASE_URL`、`BACKEND_URL` 等变量占位
- `openspec/config.yaml` 的 `test_commands` 届时需要真实可跑（目前是占位）

## Out of Scope

- 学员创建/编辑/归档的写接口 —— 延后到 `student-edit`（占位名，具体切分留给下次 explore）
- EliteCoach101 报课数据导入、grades.csv 作业数据关联 —— 延后到各自的 change
- 访问控制 —— 延后，本地开发阶段不需要
- 部署到 Vercel/Render —— 本 change 验收标准是本地跑通，不含线上部署
