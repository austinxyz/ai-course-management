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

然后建后端的本地环境变量文件（**必需**，缺了后端会启动即失败）：

```bash
cp backend/.env.example backend/.env
```

`.env.example` 里已经填好了 `supabase start` 那个固定的本地连接串，通常不用改。

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
   - `RESEND_API_KEY`（催作业真实发信用，见第 3a 节）

**免费档提醒：** 15 分钟无请求自动休眠，冷启动约几十秒。内部工具场景可以接受。

**我能帮：**
- 写 `backend/` 的 build/start 命令、`requirements.txt`
- 写 `.env.example` 列出所有必需环境变量（不含真实值）

---

## 3a. 催作业真实发信（Resend HTTP API）

`nudge` 页详情面板的"发送邮件"按钮通过 [Resend](https://resend.com) 的 HTTPS API 真实发信，发件地址固定 `noreply@austinxyz.ai`。

**为什么不是 SMTP**：最初的实现走 SMTP（Gmail 应用专用密码），部署到 Render 后实测直接 `[Errno 101] Network is unreachable`——Render 免费档对出站 SMTP 端口（587/465/25）有平台级封锁，换账号、换密码都没用。Resend 走普通 443 端口的 HTTPS 请求，不受这条封锁影响。

**为什么不是 OAuth**：单人使用，OAuth 换来的"多用户各自授权"在这里没有价值，只会多出 Google Cloud 项目、同意屏幕审核、refresh token 管理的成本。

### 注册 Resend + 验证域名（你做）

Resend 免费档不需要验证域名就能发信，但**只能发到账号自己的邮箱**——对催学员这个场景没用，必须验证一个域名才能发到任意收件人。

1. [resend.com](https://resend.com) 注册账号
2. 左侧 Domains → Add Domain，填 `austinxyz.ai`
3. Resend 会给一组 DNS 记录（通常是 SPF 的 TXT 记录 + 若干 DKIM 的 CNAME 记录）——去 `austinxyz.ai` 的域名注册商/DNS 服务商后台把这些记录加上
4. 加完等 DNS 生效（一般几分钟到几小时），Resend 的 Domains 页面这个域名状态会从"Pending"变"Verified"——没变绿之前发信会失败
5. 左侧 API Keys → Create API Key，权限选 Sending access 即可，复制生成的 key（`re_` 开头，**只显示一次**，立刻存进密码管理器）

### 配置到 Render（你做）

在第 3 节建的 Render Web Service 上：

1. 打开该服务 → Environment
2. 如果之前配过 `SMTP_USER`/`SMTP_PASSWORD`，删掉——代码已经不读这两个了
3. 加一个环境变量：`RESEND_API_KEY` = 上一步复制的 key
4. 保存后 Render 会自动重新部署这个服务

### 验证

域名状态变成 Verified、Render 部署完成后，在 `/nudge` 页选中一个有邮箱的学员，点"发送邮件"→ 确认。收件箱应该收到一封主题为 `《课程名》作业提醒`、发件人 `noreply@austinxyz.ai` 的纯文本邮件。失败的话界面会就地报错，最常见的原因：

| 报错关键词 | 原因 |
|---|---|
| `RESEND_API_KEY 未配置` | Render 环境变量没填或没生效（改完变量后确认服务重新部署了） |
| 4xx（如 `403`） | 域名还没验证完（Domains 页面看状态是不是 Verified），或 API key 权限不对 |
| 超时 / 连接问题 | 极少见——Resend 走 HTTPS，一般不会被出站封锁；重试或查 Resend 状态页 |

**我能帮：**
- 排查报错信息、看后端日志
- 不能帮：注册 Resend 账号、加 DNS 记录这两步必须你本人操作（涉及登录凭证/域名管理权限）

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
| `RESEND_API_KEY` | backend（Render） | 你，Resend 后台生成的 `re_` 开头的 key（见第 3a 节） |

所有真实值只进 Vercel/Render 的环境变量后台，**不进 git**。
