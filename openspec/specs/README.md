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

> 访问控制见下方 `access-control`（2026-07-29 落地，整站已需密码）。

---

### `access-control` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我想让这个存着真实学员联系方式的系统不再对全世界敞开，只有知道密码的人能进
**覆盖需求**: docs/superpowers/specs/2026-07-29-access-control-requirements.md

**后台**: `X-Backend-Secret` 校验放在 FastAPI middleware（默认覆盖所有路由，新增路由自动受保护），`secrets.compare_digest` 常数时间比较；`/docs`、`/openapi.json`、`/redoc` 默认关闭，仅 `ENABLE_API_DOCS` 显式设置时开启
**前台**: 根目录 `frontend/proxy.ts`（本版 Next.js 已把 `middleware` 约定改名为 `proxy`）整站 Basic Auth，matcher 负向排除静态资源；`lib/api.ts` 在 server-side fetch 注入 secret
**关键性质**: 两个变量缺失时**拒绝而非放行**（fail-closed），且认证逻辑**无环境判断分支**——本地与生产同一条路径
**验收标准**: 未带凭据时页面与后端一律 401 且响应体不含学员数据；带正确凭据行为如常；生产 API 文档不可达

> ⚠️ **仍未解除的护栏**：CLAUDE.md 与 README 中"不得导入真实学员数据"的警告**依然有效**。
> 认证虽已工作，但解除护栏是一次单独、明确的决定（见该 change 的 requirements Open Questions），
> 不随本能力自动失效。生产库目前仍为空表。
>
> **本能力不提供**：每人一身份（无法单独吊销某人、互动记录无法区分录入者）、限流（安全性依赖密码长度）、登出。
