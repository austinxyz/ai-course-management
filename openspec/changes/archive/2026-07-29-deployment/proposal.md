---
Date: 2026-07-29
Change: deployment
HAS_UI_SURFACE: yes
Requirements: docs/superpowers/specs/2026-07-29-deployment-requirements.md
---

## Why

学员管理系统目前只能在本机跑（Docker + 两个进程）。讲师与合作伙伴要用它，必须能从各自设备打开一个公网地址。
同时需要建立持续部署——否则往后每个 change 都要人工记住"这次带了 migration，得手工推生产库"，而漏推的失败模式是线上崩且症状迷惑。

## What Changes

- 三层部署到云端：Vercel（前端）+ Render 免费档（FastAPI）+ Supabase 云项目（Postgres）
- 新增 GitHub Actions workflow：`push main` 时自动执行 `supabase db push`，让数据库 schema 与代码同步上线
- 新增 `frontend/app/students/error.tsx` 与 `loading.tsx` —— 承接 Render 冷启动导致的后端不可达，替代当前的白屏/未捕获异常
- 修正 `backend/app/db.py` 的连接串处理：Supabase 控制台给出的是 `postgresql://` 前缀，SQLAlchemy 见此会去找未安装的 `psycopg2` 而崩溃，需归一化到 psycopg v3 驱动
- 新增 `.env.example`，列出全部必需环境变量及其归属平台

**无 BREAKING 变更** —— `student-roster` 的既有 API 契约（列表 / 详情 / 404 / 空数组）不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `student-roster` —— 补充"数据源不可达时的降级行为"：后端不可达时前端 SHALL 呈现可读错误与重试入口，
  加载中 SHALL 对可能的长等待做预期管理。

> **与 requirements 文档的出入（有意为之）：** requirements 的 Referenced Capabilities 一节写的是
> "不新增也不修改任何 capability 的 SHALL 行为"。propose 阶段复核后判定该结论过于保守——
> requirements 自己的 Success Criteria #4 / #5 就是可测的用户可见行为（错误态、加载态文案），
> 属于 SHALL 范畴，应当落进 spec 而非停留在实现层。故此处按 MODIFIED 处理。
> 部署配置与 CI workflow 本身仍不构成 capability（基础设施，无对外行为契约）。

## Impact

- `backend/app/db.py` —— 连接串 scheme 归一化
- `frontend/app/students/` —— 新增 `error.tsx`、`loading.tsx`
- `.github/workflows/` —— 新增 migration 自动推送 workflow
- `.env.example`（前后端）—— 新增
- `render.yaml` 或 Render 控制台配置 —— 新增（design 阶段定形式）
- 平台侧（不在仓库内）：Supabase 云项目、Render Web Service、Vercel Project、GitHub Secrets

## Out of Scope

- **访问控制** —— 单独 change。本 change 部署后系统公网可读且无认证；
  硬护栏：该 change 落地前不得向生产库导入任何真实学员数据（生产库保持空表，`seed.sql` 不会被 `db push` 推送）
- 保活（keep-alive）—— 明确接受 Render 免费档冷启动
- 部署编排（"migration 成功才允许代码上线"）—— 三条流水线各自独立，接受其并行风险
- staging / preview 环境的后端隔离 —— 现阶段只有一套 production 后端
- 自定义域名 —— 用平台默认分配的域名
- 向生产库导入任何数据（真实的或虚构的）
