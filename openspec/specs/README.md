# 能力清单

`openspec/specs/` 下每个目录是一个已归档的能力（capability）。这里维护一份清单，方便快速找到"这功能是哪个 change 做的、覆盖了什么"。

---

### `student-roster` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我想看到学员列表反映数据库里的真实记录，而不是写死在前端的 mock 数据；并且能从任意设备打开一个公网地址访问，不用在本机起 Docker
**覆盖需求**:
- docs/superpowers/specs/2026-07-28-student-management-requirements.md（查询能力）
- docs/superpowers/specs/2026-07-29-deployment-requirements.md（上线与降级）

**后台**: FastAPI `GET /api/students`（列表）、`GET /api/students/{email}`（按邮箱查单条，大小写不敏感）；Supabase Postgres `students` 表，邮箱为主键。`DATABASE_URL` 必需且会归一化到 psycopg v3 驱动，缺失即启动失败
**前台**: `frontend/app/students/` —— Server Component 拉真实数据，`StudentsClient` 渲染列表 + 只读详情面板；`error.tsx` / `loading.tsx` 承接后端不可达（fetch 15s 超时，避免被平台函数上限掐死）
**部署**: Vercel（前端）+ Render 免费档（FastAPI）+ Supabase 云项目。`git push main` 后代码由平台自动部署，DB schema 由 `.github/workflows/db-migrate.yml` 自动 `supabase db push`
**验收标准**: 生产 `GET /api/students` 返回 `200 []`（区别于连不上的 500）；冷启动时页面呈现自家错误卡片与可用的重试，而非平台 504

> ⚠️ **当前无任何访问控制** —— 公网可读。生产库刻意保持空表（`seed.sql` 是本地专用，`db push` 不会推送）。
> **在访问控制 change 落地之前，不得导入任何真实学员数据。**
