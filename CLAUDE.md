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

**操作"当前选中项"的脚本会改错人，因为改名会让列表重排**（roster-editing，本地实测毁了两条 seed 记录）。
列表按 `ORDER BY name, email`，改名后该行移位；reload 之后详情面板选中的是**排序首条**（初始选中固定为首行）。
我的"改名 → reload → 改回原名"脚本第三步于是把另一个人的姓名覆盖成了第一个人的原名，
且两步都返回 200、看不出异常。**任何写脚本都要按邮箱（主键）重新定位目标**，
不能沿用上一步打开的面板。系统不留痕，改错没有第二处可查——原值必须先读出来存好。

**列表接口没有 `ORDER BY` 时，编辑过的记录会跑到名单最后**（roster-editing）。
Postgres 按堆顺序返回，而 `UPDATE` 是写一条新元组到堆尾——于是"位置"记录的是最后一次写入时间，
而不是数据本身的任何属性。表现为"改了个字段，这人就从名单中间消失了"。
排序键要能打破并列（本项目 `name, email`），否则同名两人的相对顺序仍会随任何写入抖动。

**生产站点密码与本地 `.env.local` 那份不同，用错只表现为 401**（roster-editing，验收时撞到）。
`SITE_PASSWORD` 在 Vercel 环境变量里，与本地开发那份不是一个值。自动化验收脚本拿本地值去打生产
会一路 401，而 401 长得跟"还没部署完"、"realm 不对"、"用户名错了"完全一样，看不出是哪份凭据的问题。
判据要选**只有新构建才有的可观察差异**（本次用搜索框 placeholder 文案），而不是"页面能打开"。

**`uv` 托管的 Python 被清理后，`.venv` 变成空壳且报错指向不存在的路径**（roster-editing 开工第一步就撞到）。
`uv run` 报 `No Python at '...cpython-3.12.13-windows-x86_64-none\python.exe'`——venv 还在、指向的解释器没了。
`uv python install 3.12 && uv sync` 即可重建。这类失败与"依赖没装"外观相似但成因不同，
别急着 `pip install`；同理 `python -m uvicorn` 报 `No module named uvicorn` 时，
先确认自己用的是不是项目那个 venv 的解释器。

**`openspec archive` 按 UTC 命名目录，本机在 PT —— 傍晚归档会命名成明天**（roster-editing，PT 21:00 归档时发现）。
这台机器与项目全部时间基准都是 PT（PDT，UTC-7）：`date`、git commit 时间戳、`docs/log/` 文件名都是 PT 日期，
只有归档目录名走 UTC，于是 **PT 17:00 之后归档，目录名比其余一切早一天**。
表现为归档目录与同一次归档提交里的开发日志差一天，看着像手误。
归档后核一眼目录名；不对就 `git mv` 并同步改 `.openspec.yaml` 的 `created`。

**写入失败的信息必须渲染在触发它的那块界面上，而承载它的界面不能先消失**（course-catalog group 6，evaluator RETRY 后又 BLOCK 一次才补齐）。
同一个缺陷从四个出口漏出来：场次写入的失败塞进了课程弹窗的 state（行内编辑时弹窗是关的，于是**什么都不显示**）；
新建课程"提交即关窗"；保存中点「取消」也能关窗；别名按钮没被 `busy` 挡住、连点发两遍。
四者的共同形状是**失败信息与承载它的组件生命周期脱钩**。规则：关闭/收起只在成功回调里做，
写入期间禁用所有出口（含取消），错误状态按对象分开存（本例按场次 id，`new` 给新增表单）。
测试要用**挂住不 resolve 的 promise** 断言 `disabled`，只断言最终态的测试对这类回归全盲。

**全库唯一的键会让本地手工数据把测试搞红**（course-catalog，为截图建了一条数据就红了 20 个）。
`course_aliases` 主键是归一化后的别名，全库唯一。我为截图在本地建了一门带别名 `S1` 的课，
之后所有用 `S1` 的测试都 409 —— 而测试本身在会回滚的事务里，看不出是外部数据造成的。
修法是在测试开始时于同一事务内清空相关表（`delete(...)`），**不要改用随机别名**：
"别名撞了"本身就是被测行为，随机化会把它一起绕过去。学员那边不需要这条，因为邮箱只在同一封邮箱上撞。

**验夏令时不能拿美西比美东**（course-catalog，起草验收标准时我自己写错过一次）。
美国两地同日切换，美西→美东恒为 3 小时 —— 那条断言无论换算实现对错都会通过，是个假测试。
中国不用夏令时，所以美西→上海的时差在 **15 与 16 小时之间跳**：两场同为美西 19:30、
一场 10 月一场 12 月，上海分别是次日 10:30 与 11:30。断言写死这两个值，别写"两者不同"。
同理，凡是跨时区功能，**存墙上时间 + IANA 时区名**，绝对时刻读取时派生；存固定偏移会在换季后集体错一小时。

**SQLModel 会把显式 `None` 发成 SQL NULL，盖掉列的 DB 默认值**（course-catalog group 2）。
`created_at: datetime | None = Field(default=None)` 配 `created_at timestamptz not null default now()`
→ 插入时报 `NotNullViolation`，而报错位置离"我明明给了默认值"很远。
应用不读不写的列**干脆不要映射到模型**；主键 uuid 用 `default_factory=uuid.uuid4` 自己生成。

**Playwright 的 `waitUntil: "networkidle"` 在会冷启动的后端上可能永远不达成**（course-catalog 生产验收）。
Render 免费档唤醒期间请求持续在飞，`networkidle` 等到超时，而报错指向后面那个 `waitFor`，
看着像"页面没渲染出来"。用 `domcontentloaded` + 等一段**只有数据到位才会出现的文案**。

**设计稿里的示例值不是真实约束**（course-scheduling-fields，导入真实课程时才发现）。
`course-catalog` 的两个字段是照稿子做的：稿上画了 1/2/3/4 小时四个 chip，列就成了 `hours int` 限 1–4；
稿上写着「时间（美西）」，美西就成了 schema 默认值与换算基准。
而真实课程是 **150 分钟、8:30 PM 美东** —— 两个都存不下，且不是边缘情况，是全部四门课。
**实现枚举/范围类字段前，先拿一条真实数据比对**；拿不到真实数据就把范围放宽到"显然够用"，
而不是照抄稿子里那几个示例。稿子表达的是布局与语气，不是取值域。

**openspec 的 MODIFIED 按标题匹配，改标题会让 archive 中止**（course-scheduling-fields 归档时撞到）。
delta 里把「场次时间按**美西**记录…」改成「按**所属时区**记录…」，`openspec archive` 报
`MODIFIED failed for header ... - not found` 并**回滚整次归档**（不留半成品，这点是好的）。
需求标题本身就是一句断言，行为变了就该改标题 —— 正确表达是 **REMOVED（旧标题 + Reason/Migration）+ ADDED（新标题）**，
不是把标题改回去迁就工具。另：archive 会把 ADDED 的条目追加到文件末尾并留下 `---` 分隔线，需要手工归位。

**pytest fixture 每次新建 engine 却不 dispose，第 ~100 个测试开始连接被拒**（course-scheduling-fields）。
`create_engine()` 写在 per-test fixture 里，连接池随测试数累积，Postgres 报
`remaining connection slots are reserved for roles with the SUPERUSER attribute`。
**症状与原因毫无关系**：报错落在某个不相干的测试的 setup 阶段，看着像那个测试坏了。
engine 提到模块级共用一个即可（顺带快一倍）。测试数量跨过某个阈值才出现的失败，先怀疑资源泄漏。

**migration 的回填在本地永远跑在 0 行上**（course-scheduling-fields）。
`supabase db reset` 是在空库上重放，seed 里没有对应数据，所以 `update ... set x = y * 60` 这类回填
**不被任何本地测试覆盖** —— 绿灯不代表回填写对了。真实证据只能来自生产那几行既有数据，
因此这类 migration 的生产验收必须专门列一条"确认既有行的值被正确转换"，而不是只看页面能打开。

**`error.tsx` 接不住**同段** `layout.tsx` 自己抛的错，于是外壳的取数会带走整个外壳**（course-page-boundaries，VISUAL DIFF 才发现，全部单测都是绿的）。
文档原文：error.js「does not wrap the layout.js ... above it in the same segment」。
把侧边栏提进 `(app)/layout.tsx` 并让它取学员数之后，后端一停 —— 计数 promise 一 reject，
**整个外壳死掉、掉到根错误页、侧边栏消失**，恰好发生在冷启动，也就是这套边界存在的理由本身。
外壳自己取的数据**必须不能抛**：就地 `.catch(() => undefined)`，未知值走既有占位（本例 `—`）。
推论：**凡是 layout 渲染的东西，它的失败都不归本段 error.tsx 管**，别指望同级边界兜住。

**layout 里未隔离的取数会阻塞每一次导航，而且不报错、不告警**（course-page-boundaries）。
本版 Next 文档：layout 访问未缓存数据时 `loading.js` **不为它显示 fallback**，且
「Without Cache Components: Navigation blocks until the layout finishes rendering」。
症状只是"哪儿都慢"，**本地后端毫秒级完全看不出来**。解法是把取数留在 page，
或在 layout 内用独立 `<Suspense>` 包住（把 promise 传给客户端组件用 `use()` 展开）。
测试要用**挂住不 resolve 的 promise**；已 resolve 的 promise 无论包没包都通过。
另有一条更强的断言：**layout 函数本身不是 async** —— 同步函数不可能 await 过任何东西。

**`revalidatePath` 的路径不写路由组前缀，但写错只表现为"数字不动"**（course-page-boundaries）。
文档示例是 `revalidatePath('/(main)/post/[slug]', 'layout')`，容易以为搬进 `(app)` 后要跟着写。
实测：`revalidatePath("/students", "layout")` 就对。**粒度**倒是必须改 —— 默认的 page 粒度
不刷新 layout，于是表格更新了、外壳里的徽标不动。两种错法（粒度没改 / 路径写错）
症状完全一样，且都不报错，所以这条只能靠**真实写一条数据看数字变没变**来定论，单测断不出来。

**`vi.clearAllMocks()` 清调用记录但不清 mock 实现**（course-page-boundaries，既有测试里的隐患）。
前面用例设的 `api.createStudent.mockRejectedValue(...)` 会残留到后面的用例，
于是同一个断言**全量跑与单独跑结果不同**（本例：revalidate 调用数 3 vs 4）。
要清实现得用 `resetAllMocks`；更稳的做法是**用例内显式设定自己依赖的返回值**，不吃环境状态。

**清理脚本会"成功地什么都没做"：不存在的端点静默 404 + 按显示名匹配**（course-list-order，VISUAL DIFF 后清场时把本地数据毁了）。
为验左栏滚动临时造了 10 门课，清理时用 `DELETE /api/courses/{id}` —— **课程根本没有删除端点**
（有意设计，下线走 `offline`），于是每个请求 404，脚本照样打印 "deleted 14"。
改用 SQL 直删时又按课程名匹配保留名单，破折号写成 `——` 而真实数据是 `—`，误删了两门真课。
两条通用规则：**写清理脚本前先确认该端点存在**（httpx 不会因 404 抛异常，要显式 `raise_for_status`），
以及**保留/删除的判据只能是主键**，不能是会被排版字符、空格、改名影响的显示名。
