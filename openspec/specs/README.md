# 能力清单

`openspec/specs/` 下每个目录是一个已归档的能力（capability）。这里维护一份清单，方便快速找到"这功能是哪个 change 做的、覆盖了什么"。

---

### `student-roster` ✅ 已实现
**用户故事**: 作为讲师，我想看到学员列表反映数据库里的真实记录，而不是写死在前端的 mock 数据
**覆盖需求**: docs/superpowers/specs/2026-07-28-student-management-requirements.md
**后台**: FastAPI `GET /api/students`（列表）、`GET /api/students/{email}`（按邮箱查单条，大小写不敏感）；Supabase 本地 Postgres `students` 表，邮箱为主键
**前台**: `frontend/app/students/` —— Server Component 拉真实数据，`StudentsClient` 渲染列表 + 只读详情面板
**验收标准**: 本地 `supabase start` + FastAPI + `npm run dev` 全链路跑通，浏览器看到的是种子数据而非硬编码 mock
