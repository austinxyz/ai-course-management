# CLAUDE.md

学员管理系统 —— 北美华人 Claude AI 课程的学员档案、报课、作业与互动管理。

> 需求见 [docs/requirements.md](docs/requirements.md)。本文件只规定**怎么建**，不重复"建什么"。

## 项目定位

这是 [docs/phase1-notion-design.md](docs/phase1-notion-design.md) 规划的 **Phase 2**：把 Phase 1 的 Notion 方案迁移到自建 web app，并补上 Phase 1 未覆盖的报课数据与催作业链路。

使用者是讲师本人与合作伙伴，**不面向学员**。

## 架构纪律（不可违反）

- 浏览器只与 Next.js 通信。**不直连 FastAPI，不直连 Supabase。**
- 前端通过 Server Component 内的 server-side fetch 调用 FastAPI，统一封装于 `frontend/lib/api.ts`。
- 只有 FastAPI 可以访问数据库。
- Supabase 仅作托管 Postgres 使用。不使用 RLS，不使用其自动生成的 REST API。
- migration 唯一来源：`supabase/migrations/*.sql`。不使用 Alembic。

违反以上任一条，视为架构违规，evaluator 应直接 BLOCK。

## 技术栈

| 层 | 技术 |
|---|---|
| frontend/ | Next.js 15 App Router + TypeScript + Tailwind |
| backend/ | FastAPI + Python 3.12 + SQLModel |
| DB | Supabase 托管 Postgres |
| 测试 | pytest + httpx TestClient / vitest + React Testing Library |
| 部署 | Vercel（前端）+ Render 免费档（FastAPI）+ Supabase 云库 |

> Render 免费档 15 分钟无请求会休眠，冷启动约几十秒。内部工具可接受；
> 若未来对首次响应延迟敏感（比如催作业批量任务），再考虑升级到 Render 付费档或换 Fly.io。

## 认证

**不做多用户隔离。** 讲师与合作伙伴共享同一份数据，各自看到的内容完全相同。

因此：
- **不要**在表上预留 `user_id` 列（这点与参考项目 `opsx-new-project` 不同）
- 一层"防裸奔"的访问控制，已于 2026-07-29 落地（见 `openspec/specs/access-control/`）：
  整站 HTTP Basic Auth（共享密码）+ 后端共享 secret header。**不做**每人一身份、限流、登出
- 不做学员端登录

## 领域约束

### 邮箱是唯一主键

所有学员数据以**邮箱**关联。报课数据（EliteCoach101）与作业数据（grades.csv）同源使用邮箱，可直接 join。

### 微信昵称不可作为标识

微信昵称会变。2026-07-26 实测三份群名单，至少 3 人改名后无法按名字匹配（老沈→踢球吧、Sophi→曲素会、弓长张→Simo），最终靠头像比对才识别。

因此：
- 微信号是**人工一次性对齐后存库的属性**，不是标识
- 任何"按微信名找人"的逻辑都是错的
- 系统必须能列出未对齐微信号的学员

详见 [docs/requirements.md](docs/requirements.md) §5。

### 评分维度按课程变化

各课作业评分项无交集（S1 是 A1–D2 共 10 项，S4 是 K1–M2 共 8 项）。**新增课程不得要求修改数据库结构。**

## 数据来源

| 数据 | 来源 | 备注 |
|---|---|---|
| 报课 | EliteCoach101 平台 | 导出方式待确认，接入层须与具体方式解耦 |
| 作业成绩 | `ai-course/tools/homework-grader/session*/grades.csv` | 保留现有链路 |
| 微信对齐 | `ai-course/feedback/students/学员名单-*.md` | 初始对齐数据 |
| 历史学员/互动 | Notion（Phase 1） | 一次性导入后停用 |

跨仓库读取的数据一律**先导入本系统数据库**，不做运行时跨仓库依赖。

## 测试规则

- 所有外部依赖（EliteCoach101、邮件发送、Notion API）在测试中必须 mock，不得发出真实网络请求。
- 涉及外部 API 的功能，必须有超时与异常路径的测试。
- 涉及**发送邮件**的功能，测试中必须验证不会真实发信。

## 隐私

本系统存储真实学员的姓名、邮箱、微信号。

- 仓库**不得**提交任何真实学员数据（含测试夹具）
- 测试数据一律使用明显虚构的姓名与 `@example.com` 邮箱
- 数据库连接串、邮件凭证只走环境变量，不入库
- **生产库自 2026-07-29 起存放真实数据**（护栏已解除，见 README）。因此排查生产问题时，
  探针脚本不要整行 dump 学员记录——`console.log` 出去的姓名邮箱会留在终端输出、CI 日志和对话记录里。
  要计数就只打计数，要找特定记录就只打匹配到的那几条的邮箱前缀

## 开发流程

走 opsx 四阶段：`explore → propose → apply → archive`。

- `openspec/specs/` —— 能力源头
- `openspec/changes/` —— 进行中的变更
- `openspec/changes/archive/` —— 已归档变更

**`spec.md` 里的 Scenario（Given/When/Then）由 agent 起草，人工 review 后确认或修改再定稿。** 不是人工从零手写，也不是 agent 一次定稿不经 review——agent 出草稿时要主动列出自己不确定、可能遗漏边界的地方，供人工重点检查。

## Pitfalls

<!-- archive 阶段向此处追加。内容必须来自真实发生过的事（evaluator 发现、实测踩坑、
     部署事故），不得编造，也不得从"理论上可能出问题"推演。 -->

**只读响应字段不要用 Pydantic `Literal` 校验没有 DB CHECK 约束的枚举列**（student-management group 2，evaluator BLOCK）。
`region`/`level`/`source` 这类字段如果 DB 层是纯 `TEXT`（没有 CHECK 约束，为了给未来加枚举值留口子），
那么 API 的 `response_model` 用 `Literal[...]` 声明就是隐患：任意一行数据落在枚举集合外，
FastAPI 会在这一整个响应上抛 `ResponseValidationError`，`GET` 列表接口直接全灭（500），不是那一行出错。
只读端点该用 `str`，`Literal` 留给未来的写接口做请求体校验。

**子目录的 `.gitignore` 会吃掉根目录的否定规则**（deployment group 3，evaluator HIGH finding）。
根 `.gitignore` 写了 `!.env.example`，但 `create-next-app` 在 `frontend/.gitignore` 里生成了 `.env*`——
**根目录的否定例外管不到子目录自己的规则**，于是 `frontend/.env.example` 静默地进不了仓库，
文件在磁盘上、`git add` 也不报错，只是永远没被跟踪。以后每加一个带自带 `.gitignore` 的子包
（Next.js、Vite 等脚手架都会生成），都要检查一遍：`git check-ignore -v <路径>` 会直接告诉你是哪一行拦的。

**部署配置类的环境变量，缺失时要启动即失败，不要留 localhost 兜底**（deployment，实际部署中暴露）。
`DATABASE_URL` 原本在缺失时回落到 `127.0.0.1:54322` 图本地方便。这在云上是灾难性的沉默失败：
**进程正常启动、平台健康检查通过**，然后每个请求 500，日志写着"连接 127.0.0.1 被拒绝"——
在云环境里看到这句话根本不会联想到"变量没配"。改为缺失即抛错，本地便利性交给 `.env` + `load_dotenv()`。

**Next.js 的 `error.tsx` 要用 `unstable_retry()` 而不是 `reset()`**（deployment group 2，查文档才发现）。
本项目 Next.js 16.2：`reset()` 只重渲染子树、**不重新拉取数据**；`unstable_retry()` 才会重新 fetch。
Server Component 取数失败时用 `reset()` 做重试按钮，点了会原地不动停在错误页——
恰好在"后端刚醒过来"这个最需要它工作的场景失效。

**Server Component 的 fetch 必须设显式超时，且要短于平台函数执行上限**（deployment 决策 #2）。
否则后端冷启动时 fetch 一直挂着直到平台把整个函数杀掉，`error.tsx` **根本没机会渲染**，
用户看到的是平台的 504 而不是你写的错误界面。宁可主动放弃（15s）并给重试按钮。

**Next.js 的 `middleware.ts` 在本版已弃用、改名为 `proxy.ts`**（access-control 决策 #1）。
文件放根目录、与 `app/` 同级，导出名为 `proxy` 的函数或默认导出。用旧名字的话文件**根本不会被执行**，
而症状是"页面照常打开"——与认证正常工作**外观完全一致**。所以认证类改动**不能以"能打开页面"作为配置成功的判据**，
必须实测未授权请求确实被拒。另注意 `WWW-Authenticate` 的 realm 必须是 ASCII：
HTTP header 值是 ByteString，中文 realm 会在构造响应时抛 `TypeError`，把 401 变成 500。

**认证/密钥类的环境变量，缺失时必须 fail-closed（拒绝），且判断要拆成两步**（access-control 决策 #3）。
易错写法 `if (expected && provided !== expected) deny()` 在变量未设时**放行所有人**。
这跟 `DATABASE_URL` 那条同源但更隐蔽：数据库连不上会 500 当场暴露，认证静默失效**什么征兆都没有**，
页面照常打开，可能数月无人察觉。因此"缺变量时被拒"要写成独立的测试断言——
而且这类测试若是在实现之后补的，必须**故意把实现改错、确认测试真的失败**再恢复，否则它只是"碰巧通过"。

**端口被占时 uvicorn 会静默退出，探针会打到旧进程上**（access-control 实测踩到）。
新进程绑定失败后退出，curl 打的是**上一轮的旧代码**，日志里 `[Errno 10048] only one usage of each socket address`
才是真相。表现为"改了代码但行为没变"，极易误判成实现有问题。同理 Next.js dev server：
新增根目录文件（如 `proxy.ts`）或改 `.env` 后要重启，热重载不覆盖这些。
**验证任何改动前，先确认打的是新进程/新构建。**

**Server Action 抛出的错误，生产构建里信息会被抹掉**（student-write，生产验收才发现）。
把"邮箱已存在 / 属于已归档学员"做成抛异常、再在客户端正则匹配 `error.message` 区分两者——
本地 dev 完全正常，生产上 Next 只传一个 digest 过来，正则永远匹配不上，
"前往「已归档」"的引导**静默消失**。Next 文档对此有明文规定：预期内的结果用**返回值**表达，不要抛。
判断标准是"用户正常操作能不能撞到"：能，就是返回值；不能（如未授权），才抛。
推论：**任何依赖跨 Server Action 边界传递错误内容的逻辑，本地测试都验证不了**。

**验收脚本必须在"新建"那一步就填可选字段**（student-write，用户手工试用时发现）。
新建学员时只送了必填的 5 个字段，弹窗收的另外 5 个（含微信号）被静默丢弃——后端有默认值所以不报错。
而我的验收流程是"建记录（只填姓名邮箱）→ 编辑微信号 → …"，于是**新建路径的字段处理从头到尾没被走到**。
同理，前端字段名与后端不一致时（`wxName` vs `wx_name`）漏了映射，后端会静默忽略，和没发一模一样。

**`supabase db reset` 会让正在跑的后端连接池全废，但进程仍在监听**（student-write 多次踩到）。
表现为端口有人听、每个请求 500、日志里是 `connection ... closed`。极易误判成代码问题。
`db reset` 之后**必须重启后端进程**（按 PID 杀，`pkill -f uvicorn` 在 Windows 上不可靠）。

**e2e 里"等写入完成"的信号不能盯按钮文案**（student-write，生产才暴露）。
`归档学员` 在点开二次确认后被 `确认归档` 替换、`恢复为在读` 在进行中变成 `正在恢复…`——
按原文案找的定位器**立刻就返回 0**，等待条件瞬间满足，随后导航把还在飞的请求掐断。
要盯只在成功后才发生的状态变化（如详情面板卸载）。另：写入后的断言要给足超时，
Playwright 默认 5s，而 Render 免费档冷启动要几十秒——**超时不足的失败长得跟功能缺失一模一样**。

**只读响应字段用 `None` 当"未提供"哨兵时，要挡住客户端显式传 `null`**（student-write group 1，evaluator BLOCK）。
`StudentUpdate` 每个字段是 `str | None = None`，`None` 表示"这次请求没提到它"（配合 `exclude_unset`）。
但客户端显式传 `{"wechat": null}` 时 Pydantic 照收，`None` 被写进 NOT NULL 列 → 未捕获的 500。
哨兵值和合法值撞了，且没有第三种状态可用，只能在边界上拒绝。
