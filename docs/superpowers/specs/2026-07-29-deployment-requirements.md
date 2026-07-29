---
Date: 2026-07-29
Change: deployment
Status: REVIEWED
HAS_UI_SURFACE: yes
---

# deployment Requirements

## Goals

- 把已在本地跑通的三层（Next.js → FastAPI → Supabase Postgres）部署到云端：Vercel + Render 免费档 + Supabase 云项目
- 建立**持续部署**：`git push main` 后代码自动上线，数据库 migration 也自动应用，不依赖人工记得敲命令
- 补上线上必需但本地无所谓的错误处理：`error.tsx` + `loading.tsx`，让 Render 冷启动失败时有像样的界面而不是白屏
- 落实环境变量清单（`.env.example`），让"哪些变量必须配、配在哪个平台"有据可查

## Non-Goals

- **不做访问控制** —— 单独一个 change（见下方 Constraints 里的硬护栏）
- 不做保活（keep-alive ping）—— 明确接受 Render 免费档冷启动
- 不做 staging / preview 环境的后端隔离 —— 现阶段只有 production 一套后端
- 不做部署编排（"migration 成功才允许代码上线"）—— 三条流水线各自独立，接受其并行风险
- 不做自定义域名 —— 用 Vercel / Render 默认分配的域名
- 不往生产库导入任何数据（真实的或虚构的）—— 生产库保持空表

## Constraints

- **硬护栏：访问控制 change 落地之前，不得向生产库导入任何真实学员数据。** 本 change 部署后系统在公网可读且无任何认证；此刻安全的唯一原因是生产库是空的（`supabase/seed.sql` 是 CLI 本地专用文件，`db push` 不会推送）。这条护栏失效就等于真实学员的姓名/邮箱/微信号公网裸奔，违反 CLAUDE.md 隐私条款。
- 架构纪律不变：浏览器只与 Next.js 通信；`BACKEND_URL` 是 server-side only，不得带 `NEXT_PUBLIC_` 前缀
- migration 唯一来源仍是 `supabase/migrations/*.sql`；推送到生产用 `supabase db push`，由 GitHub Actions 自动执行
- 推送到生产的 migration 必须先在本地 `supabase db reset` 验证过（apply 阶段的既有纪律）
- Supabase CLI 没有 down migration —— 自动 migration 意味着 `push main` 即改生产 schema 且无 undo。现阶段（空库）可接受，有真实数据后需重新评估
- 生产环境的 `DATABASE_URL` 必须能被 SQLAlchemy 正确解析为 psycopg v3 驱动 —— Supabase 控制台给出的是 `postgresql://` 前缀，SQLAlchemy 见此前缀会去找未安装的 `psycopg2`
- 所有凭证（Supabase 连接串、access token）只存在于 Vercel / Render / GitHub Secrets 的后台，不入库

## Success Criteria

1. `curl https://<render-url>/api/students` 返回 `200` + `[]` —— 证明 FastAPI 真的连上了 Supabase 云库（连不上会 500，空库和连不上由此区分）
2. `curl https://<render-url>/api/students/nobody@example.com` 返回 `404` —— 证明详情端点也正常
3. Vercel 上的 `/students` 页面能打开，渲染"暂无学员"空状态，浏览器控制台无报错
4. Render 冷启动导致后端不可达时，页面显示可读的错误提示（而非白屏或未捕获异常），且提供重试入口 —— 重试机制即 Next.js `error.tsx` 收到的 `reset()` prop，不额外造轮子
5. 加载态（`loading.tsx`）需在文案上为长等待做预期管理 —— 冷启动可能等约 1 分钟，只显示"加载中"会让人以为卡死
6. `supabase db push` 能通过 GitHub Actions 在 `push main` 时自动执行成功
7. 仓库根有 `.env.example`（或前后端各一份），列出全部必需环境变量及其归属平台
8. 生产库 `students` 表存在且为空（migration 应用成功、seed 未被推送）

## User Stories

- 作为讲师，我想在自己的设备上打开一个公网 URL 就能访问学员管理系统，不用在本机起 Docker 和两个服务
- 作为合作伙伴，我想用自己的设备访问同一个系统，看到和讲师完全一样的数据
- 作为 developer，我想 `git push` 之后代码和数据库 schema 都自动上线，不用记住"这次带了 migration 要手工推"

## Open Questions

（无阻塞性问题。以下两条是需在 apply 阶段实测确认的技术事实，非待决策项：）

- Supabase 连接串用 pooler 还是 direct connection —— 记忆中 Supabase 直连已是 IPv6-only 而 Render 出站可能不支持 IPv6，因此**优先 pooler**；apply 阶段以实际能否连通为准
- Supabase 免费项目的自动暂停策略（记忆中约一周无活动会 pause，恢复需手工在控制台操作）—— apply 阶段确认后写入运维文档

## Referenced Capabilities

- 本 change 不新增也不修改任何 capability 的 SHALL 行为 —— `student-roster` 的对外契约不变，改变的只是它运行在哪里。
  产出物是部署配置、CI workflow、错误边界组件与环境变量文档。

## 已知风险（接受，不在本 change 解决）

- **冷启动**：Render 免费档 15 分钟无请求休眠，冷启约 50 秒。已明确接受 —— 靠 Success Criteria #4 的错误页兜住，用户刷新即可。不做保活。
- **三条流水线并行无顺序保证**：`push main` 同时触发 GitHub Actions（migration）、Render（后端）、Vercel（前端），三者独立。理论上新代码可能早于 migration 上线，产生短暂 500 窗口。实践中 Render 构建较慢、Actions 较快，大概率不会撞上，但这是巧合而非保证。
- **Actions 失败不阻止代码部署**：三个独立 webhook，`db push` 失败时 Vercel / Render 仍会照常上线新代码。需要人工留意 Actions 的失败通知。

## Design System

沿用既有实现（claude.ai/design 项目「讲武堂学员管理系统」导入，见 `frontend/app/globals.css` 的 token）。
本 change 新增的 `error.tsx` / `loading.tsx` 需复用同一套 token 与组件（`Card`、`Button`），不引入新视觉语言。

Phase 4 的**风格选择**（awesome-design-md）跳过——设计系统已由 claude.ai/design 确定，不是预设风格库里的条目，重选无意义（同 `student-management` change 的处理）。
**视觉 mock 照常产出**，因为这两个页面尚不存在：`docs/superpowers/specs/mocks/2026-07-29-deployment-mocks.html`。
