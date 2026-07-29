# 环境搭建 Setup

**日期：** 2026-07-28
**状态：** backend/ 还没建（C1 walking-skeleton 会建），下面标了 ⏳ 的步骤要等 backend/ 有了才做。

账号注册、绑卡、OAuth 授权这类必须由你本人操作——涉及登录凭证的事 agent 不能代做。
下面每一步标了「你做」还是「我能帮」。

---

## 1. Supabase（托管 Postgres）

本地开发和线上用**不同的 Postgres**，靠 Supabase CLI 本地栈隔离——不用申请第二个云项目，
本地数据和真实学员数据物理隔离，也不占云端免费配额。前提：Docker Desktop（你已经有了 ✓）。

### 1a. 线上项目（你做）

1. [supabase.com](https://supabase.com) 注册 → New Project
2. 记录 Project 的：
   - `Project URL`
   - `anon` key（暂时用不到，本项目不用 Supabase 自动 REST API）
   - **Database → Connection string**（`postgresql://...`，这是 Render 上 FastAPI 要用的 `DATABASE_URL`）
3. 把 `DATABASE_URL` 存进密码管理器，先别写进任何文件

### 1b. 本地开发栈（我能帮你跑，⏳ 等 backend/ 建好、有 migration 文件后执行）

```bash
supabase init          # 生成 supabase/config.toml，migrations 目录已存在
supabase start         # Docker 起本地 Postgres + Studio，打印本地 DATABASE_URL
```

本地 `.env` 的 `DATABASE_URL` 填 `supabase start` 打印出的那个本地连接串
（固定是 `postgresql://postgres:postgres@127.0.0.1:54322/postgres`）。

迭代 migration 的流程：
1. 新 migration 写进 `supabase/migrations/*.sql`
2. 本地跑 `supabase db reset` 验证（本地库重建 + 应用全部 migration）
3. 确认没问题后 `supabase link --project-ref <线上项目ref>` 关联一次，之后 `supabase db push` 推到线上

`supabase stop` 可以关掉本地 Docker 容器，不用时不占资源。

**我能帮：**
- ⏳ `supabase/migrations/*.sql` 的编写与执行（C1 apply 阶段）
- 检查 `.env.example` 里有没有漏字段

---

## 2. Vercel（前端）

**你做：**
1. [vercel.com](https://vercel.com) 用 GitHub 账号登录
2. Import 这个仓库 → Root Directory 选 `frontend/`
3. 首次部署前不用填环境变量（当前 frontend/ 还没接后端）
4. ⏳ backend 建好后，回来加一个环境变量：`BACKEND_URL`（Render 的服务地址，server-side only，**不要**加 `NEXT_PUBLIC_` 前缀）

**我能帮：**
- 检查 `frontend/lib/api.ts` 有没有正确读 `BACKEND_URL`
- 检查有没有意外把后端地址/密钥写成 `NEXT_PUBLIC_*` 泄露到浏览器

---

## 3. Render（FastAPI，免费档）

⏳ 等 `backend/` 建好（C1 apply）再做这一步。

**你做：**
1. [render.com](https://render.com) 用 GitHub 账号登录
2. New → Web Service → 选这个仓库，Root Directory 填 `backend/`
3. Runtime 选 Python 3.12，Build Command / Start Command 到时候我会在 PR 里写好，照抄即可
4. Instance Type 选 **Free**
5. 环境变量里加：
   - `DATABASE_URL`（第 1 步 Supabase 的连接串）
   - `DEMO_USER_ID`（随便一个占位字符串，本项目不做多用户认证）
   - 邮件发送相关的 SMTP/Gmail 凭证（催作业功能上线时再定具体字段）

**免费档提醒：** 15 分钟无请求自动休眠，冷启动约几十秒。内部工具场景可以接受。

**我能帮：**
- 写 `backend/` 的 build/start 命令、`requirements.txt`
- 写 `.env.example` 列出所有必需环境变量（不含真实值）

---

## 4. 访问控制（防止公网裸奔）

需求文档留了这个开放问题（§9.3），explore 阶段会定下来，大概率是"共享密码"或"邮箱白名单登录"里选一个,不需要现在先决定。

---

## 环境变量清单（持续更新）

| 变量 | 用在哪 | 谁填 |
|---|---|---|
| `DATABASE_URL` | backend（Render） | 你，从 Supabase 复制 |
| `DEMO_USER_ID` | backend（Render） | 你，随便定一个占位值 |
| `BACKEND_URL` | frontend（Vercel，server-side only） | 你，从 Render 复制服务地址 |
| SMTP/Gmail 凭证 | backend（Render） | 你，做催作业邮件功能时再定 |

所有真实值只进 Vercel/Render 的环境变量后台，**不进 git**。
