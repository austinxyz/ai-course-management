## Context

三层已在本地跑通（`supabase start` + uvicorn + `next dev`），但从未部署过。仓库里没有任何部署配置、
没有 CI、没有 `.env.example`，`frontend/app/students/` 也没有错误边界——本地后端一直在，从没暴露过这个缺口。

本 change 把这套栈搬到云上，并建立"push 即上线"的机制（代码与 DB schema 都算）。

## Goals / Non-Goals

**Goals:**
- 三层跑在 Vercel + Render 免费档 + Supabase 云项目上，公网可访问
- `push main` 后代码与数据库 schema 都自动上线
- 后端不可达时前端有可读的降级界面，而非白屏或平台级 504
- 环境变量清单进仓库（`.env.example`）

**Non-Goals:**
- 访问控制（单独 change）；保活；部署编排；staging 后端隔离；自定义域名

## Decisions

**1. `DATABASE_URL` 在代码里归一化，而非依赖人工填对格式。**

Supabase 控制台给出的连接串是 `postgresql://…`。SQLAlchemy 见到这个前缀会去加载 `psycopg2`——
本项目装的是 psycopg **v3**，于是启动即 `ModuleNotFoundError`。本地能跑只是因为当初手写成了
`postgresql+psycopg://`。

选择在 `db.py` 里把 `postgresql://` 与 `postgres://` 都改写成 `postgresql+psycopg://`，
而不是"在文档里叮嘱运维填对"。理由：这不是配置偏好，是驱动选型的内部细节，不该泄露给填环境变量的人；
而且失败模式是启动崩溃，代价远大于一行字符串替换。已带 `+psycopg` 的串原样透传。

*备选（已否决）：* 仅写进 `.env.example` 注释。人会直接从 Supabase 控制台复制粘贴，注释拦不住。

**2. fetch 设显式超时，且必须短于 Vercel 函数执行上限。** ← 本设计最关键的一条

`error.tsx` 只能捕获**渲染期间抛出的错误**。如果 Server Component 里的 fetch 一直挂着直到 Vercel
函数执行上限，整个函数被平台终止——Next.js 没有机会渲染 `error.tsx`，用户看到的是平台的 504 页面。
那样的话本 change 精心设计的错误态形同虚设，而冷启动恰恰是它最该生效的场景。

因此 `getStudents()` / `getStudent()` 必须带 `AbortSignal.timeout(...)`，超时值取一个明显小于函数上限的数
（design 阶段暂定 15 秒量级，apply 阶段结合实测的 Vercel Hobby 上限敲定）。fetch 主动 abort → 抛错 →
`error.tsx` 在函数存活期内渲染成功。

代价：冷启动本来可能 50 秒能醒，现在 15 秒就放弃了。但这是**有意的取舍**——与其让用户盯着白屏等 50 秒
再吃一个平台 504，不如 15 秒给出一个说明清楚、可点重试的界面。重试时后端往往已经醒了。

**3. Render 配置用 `render.yaml`（Blueprint），不用控制台手点。**

版本化、可复现、code review 可见。构建链路：
```
Build:  pip install uv && uv sync --frozen --no-dev
Start:  uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT
Root:   backend
```
`$PORT` 由 Render 注入，必须用它而不是硬编码 8000。`--host 0.0.0.0` 不可省，否则只监听回环地址、
平台健康检查连不上。

*待 apply 实测：* `uv sync` 的 `--no-dev` flag 在目标 uv 版本上的准确拼写；Render 构建环境能否直接
`pip install uv`。

*备选（已否决）：* 导出 `requirements.txt` 走 pip。会造成 `pyproject.toml` 与 `requirements.txt`
两份依赖真相，迟早漂移。

**4. GitHub Actions 每次 push main 都跑 `db push`，不加 `paths` 过滤。**

`supabase db push` 对"没有新 migration"是幂等 no-op，跑一次约一分钟，GitHub 免费额度下可忽略。
加 `paths: supabase/migrations/**` 过滤看起来更聪明，但过滤写错的失败模式是**migration 静默不部署**——
正是本 change 要消灭的那个问题。宁可多跑。

Secrets：`SUPABASE_ACCESS_TOKEN`、`SUPABASE_DB_PASSWORD`、`SUPABASE_PROJECT_REF`（存 GitHub Secrets）。

**5. 重试用 `unstable_retry()`，不是 `reset()`。**（apply 阶段查阅 Next.js 16.2 文档后修正）

requirements 与本文档先前都写的是"重试机制即 `error.tsx` 收到的 `reset()` prop"——**这是错的**。
本项目 Next.js 16.2 的 `error.js` 文档写明：

- `unstable_retry()` —— "will try to **re-fetch** and re-render"（v16.2.0 新增）
- `reset()` —— "re-render the error boundary's children **without re-fetching**"

我们的 spec 要求点重试后"重新发起该页面的数据获取"。照 `reset()` 实现会做出一个**点了不会真正重试的按钮**：
只重渲染同一个失败态，用户看到的还是这张错误卡。冷启动场景下后端明明已经醒了却依然显示失败——
恰好在这个 change 最该生效的地方失效。

因此实现用 `unstable_retry`。代价是依赖了带 `unstable_` 前缀的 API，未来 Next 升级可能改名；
但备选（`reset` 不满足 spec、或自行 `router.refresh()` 拼装）都更差。

**6. `error.tsx` / `loading.tsx` 按全屏居中卡片实现，不重构布局以保留侧边栏。**

侧边栏当前位于 `StudentsClient` 内部，而 `page.tsx` 的 fetch 一旦抛错，整个 page（含
`StudentsClient`）都不会渲染，`error.tsx` 顶替的是整段。要让错误态也带侧边栏，得把 `Sidebar` 提到
`layout.tsx`——那是布局重构，超出本 change 范围。mock 已按无侧边栏定稿。

**7. Supabase 连接优先 pooler 的 session 模式（5432），而非直连。**

Supabase 直连地址已转为 IPv6-only，Render 出站是否支持 IPv6 存疑（apply 阶段实测为准）。
pooler 提供 IPv4 入口，是更稳妥的默认。

选 **session 模式（5432）** 而非 transaction 模式（6543）：transaction 模式不支持 prepared statements，
而 psycopg3 默认会用；要走 6543 就得额外设 `prepare_threshold=None`。后端是常驻进程、
SQLAlchemy 自己管连接池，session 模式天然契合。

**8. `.env.example` 放前后端各一份，紧邻使用处。**

`backend/.env.example`（`DATABASE_URL`）与 `frontend/.env.example`（`BACKEND_URL`）。
比集中放一份更不容易在改目录结构时失联。`docs/setup.md` 已有的环境变量表继续作为"配在哪个平台"的索引。

## Risks / Trade-offs

- **[Vercel 函数超时抢在 `error.tsx` 之前]** → 决策 2 的显式 fetch 超时。apply 阶段必须实测验证：
  人为让后端不可达，确认看到的是我们的错误卡片而非平台 504 页
- **[15 秒超时导致本可成功的冷启动被放弃]** → 有意接受。重试按钮承接；重试时后端通常已醒
- **[Actions 失败不阻止代码上线]** → requirements 已明确接受。三个独立 webhook，无编排。
  缓解：Actions 失败会发通知，需人工留意
- **[自动 migration 无 undo]** → Supabase CLI 无 down migration。现阶段生产库为空、无真实数据，风险可控。
  硬护栏：真实数据导入前需重新评估此机制
- **[三条流水线并行，migration 可能晚于代码上线]** → 已接受。实践中 Render 构建慢于 Actions，
  大概率不会撞上，但无保证
- **[归一化 `postgres://` 可能掩盖真正的配置错误]** → 风险很低：这两个前缀都是合法的 Postgres URL scheme，
  归一化只影响驱动选择，不改变主机/库/凭证任何一项

## Migration Plan

**首次部署顺序（有依赖，不可乱序）：**

1. 建 Supabase 云项目 → 取 pooler 连接串（**人工**，涉及账号）
2. `supabase link --project-ref <ref>` → `supabase db push` → 生产库建表（首次手工执行，
   验证 migration 在云端可用；此后由 Actions 接管）
3. 配 GitHub Secrets（**人工**）→ 合入 Actions workflow
4. Render 建 Web Service，配 `DATABASE_URL`（**人工**触发，配置来自 `render.yaml`）
5. 取 Render 分配的 URL → 配进 Vercel 的 `BACKEND_URL`
6. Vercel 建 Project，Root Directory 指向 `frontend`（**人工**）

顺序约束：Render 需要第 1 步的连接串；Vercel 需要第 4 步产出的 URL。

**回滚：**
- 代码：Vercel 与 Render 都保留历史部署，控制台可一键回滚到上一版
- 数据库：**无自动回滚**（Supabase CLI 无 down migration）。改错了只能追加一条修正 migration。
  现阶段生产库为空，最坏情况是重建项目
- 本 change 不涉及既有生产数据，因此没有数据迁移风险

## Open Questions

无阻塞项。以下三条在 apply 阶段以实测结论为准，不影响设计成立：
- Vercel Hobby 档函数执行上限的确切数值（决定 fetch 超时取值）
- Render 出站是否支持 IPv6（决定 pooler 是必需还是仅为优选）
- `uv sync` 在 Render 构建环境的确切调用方式
