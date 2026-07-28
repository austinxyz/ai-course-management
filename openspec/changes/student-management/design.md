## Context

前端已有完整交互原型（`frontend/app/students/`，源自 claude.ai/design），当前数据源是硬编码的
`DATA` 常量，且整个组件树标了 `"use client"`。项目里还没有 `backend/`、没有 `supabase/migrations/`，
也没有任何数据库 schema。这是第一个把 Next.js → FastAPI → Supabase 三层真正连起来的 change。

## Goals / Non-Goals

**Goals:**
- 学员表 schema 落地，本地 Supabase（Docker）能跑起来
- FastAPI 提供两个只读端点，SQLModel 定义 ORM 模型
- 前端页面改为 Server Component 发起初始数据获取，交互状态保留在子级 Client Component
- 本地全链路可跑：`supabase start` → FastAPI → `npm run dev` → 浏览器看到真实数据

**Non-Goals:**
- 不做任何写接口（新增/编辑/归档）——原型里这些控件保留在 UI 上，但点击后不产生持久化效果
- 不做部署、不做访问控制、不做 EliteCoach101/grades.csv 数据接入

## Decisions

**1. 邮箱作为字面主键，不设代理 `id`。**
`students` 表用 `email TEXT PRIMARY KEY`，不额外加 `uuid id` 列。
理由：需求文档明确"邮箱是唯一主键"，现在只有一张表、没有其它表要 FK 关联它，代理主键此刻是纯粹的
预防性复杂度。等后续报课/作业表出现真实 FK 需求时，再评估是否要迁移到代理主键（`email` 上仍会保留
唯一约束，FK 可以指向它，代理主键不是唯一选项）。

**2. 区域/基础/来源用 TEXT 列，无 DB 层 CHECK 约束，只在 Pydantic 用 `Literal` 校验。**
备选方案是给 TEXT 列加 `CHECK (region IN (...))`，能在 DB 层兜底非法值，但每次加新枚举值都要
`ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`，和 explore 阶段"枚举以后会加更多，不want
migration 摩擦"的决定直接冲突。选择完全不加 DB 约束，代价是绕过 API 直接写 DB 的话可能塞入非法值——
但浏览器本来就不能直连 DB（架构纪律），风险可接受。

**3. 微信号等文本字段用 `NOT NULL DEFAULT ''`，不用 `NULL`。**
对应 spec 里"空微信号返回 `\"\"`"的决定。`gender`/`age`/`industry` 这几个原型里也会显示"—"占位的
字段，同样用 `NOT NULL DEFAULT '—'`，跟前端现有的占位符约定保持一致。

**4. `tz`（时区）不入库，后端按 `region` 动态算。**
前端原型里 `tz` 是从 `region` 查表算出来的（`TZ_BY_REGION`），不是学员自己的属性。存成列会有
"改了 region 忘记同步 tz"的数据一致性风险。后端复刻同一份查表逻辑，响应里算出来拼给前端，
不单独建列。

**5. `tags` 用 `jsonb` 列。**
已在 requirements 阶段定（Q-01），JSON 数组，不用 Postgres `text[]`。

**6. 后端目录结构。**
```
backend/
  pyproject.toml          # uv 管理依赖
  app/
    main.py               # FastAPI app 入口
    db.py                 # engine / session
    models.py             # SQLModel: Student
    routers/students.py   # GET /api/students, GET /api/students/{email}
  tests/
    test_students.py
```

**7. 前端拆分：Server Component 外壳 + Client Component 内核。**
`frontend/app/students/page.tsx` 改为无 `"use client"` 的 async Server Component，
调用 `frontend/lib/api.ts` 的 `getStudents()` 做 server-side fetch，把结果当 prop 传给
`StudentsClient`（现有 `page.tsx` 里的全部状态逻辑原样搬进这个新文件，不改内部实现）。
`frontend/lib/api.ts` 是浏览器不可见的 server-only 模块，统一读 `process.env.BACKEND_URL`
（无 `NEXT_PUBLIC_` 前缀）。

**8. 邮箱查询大小写不敏感。**
`GET /api/students/{email}` 用 `lower(email) = lower(:param)` 匹配（或 Postgres `citext`
扩展——本 change 先用 `lower()` 比较，不引入新扩展类型，保持 schema 简单）。

## Risks / Trade-offs

- **[Risk]** 绕过 API 直接写 DB 可能塞入非法枚举值（无 CHECK 约束）→ **Mitigation**：浏览器不直连
  DB，唯一写入路径目前只有 `supabase/seed.sql`（人工维护，值受控）；后续如果真出现脏数据问题，
  再补 CHECK 约束或数据校验任务，不在本 change 预防性处理。
- **[Risk]** 邮箱作为字面主键，将来如果需要支持"改邮箱"操作会比代理主键麻烦（要处理所有 FK 级联）→
  **Mitigation**：需求文档没有"改邮箱"这个功能点，属于当前不存在的场景，出现时再评估。
- **[Risk]** Server/Client Component 拆分如果做得不干净，可能回归原型现有交互（筛选、详情面板选中态）→
  **Mitigation**：只改数据入口（prop 替换硬编码 import），`StudentsClient` 内部状态/回调逻辑保持不动，
  拆分后跑一遍原有的手工验证清单（筛选、详情面板、新增弹窗——后两者虽不接后端但 UI 交互应该不受影响）。

## Migration Plan

1. `supabase init`（若未初始化）→ `supabase start` 起本地 Postgres
2. 新增 `supabase/migrations/<timestamp>_create_students_table.sql`：建 `students` 表
3. 新增 `supabase/seed.sql`：插入原型里那 10 条虚构学员（本地专用，`supabase db push` 不会带上线）
4. `supabase db reset` 验证 migration + seed 组合能从空库跑出预期状态
5. 本 change 不推送到任何云端 Supabase 项目——不涉及生产环境，因此没有生产回滚步骤
6. 本地回滚：改错了就再写一条修正 migration（Supabase CLI 没有原生 down migration），或者
   `supabase db reset` 到上一个良好状态重跑

## Open Questions

无——所有阻塞性问题已在 Decisions 中解决。
