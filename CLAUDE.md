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

**正文在 [docs/pitfalls.md](docs/pitfalls.md)。动到哪个领域，先读那一节。**

下面是索引，每行**写的是结论不是标题** —— 只扫索引也该有用。
新增时先在正文里找有没有同根因的条目：有就往它下面加一行症状，不新开一条。

这些坑的共同点是**不报错**。所以正文里每条都写了"症状长什么样"，那才是能用上的部分。

### 数据库与后端

- 读接口必须有能打破并列的 `ORDER BY`；写脚本一律按主键定位，不沿用上一步的选中项
- 结构约束是最后一道不是唯一一道：`NULL` 互不相等会让唯一索引"建了但没挡住"；唯一约束也挡不住"业务上是同一件事"
- 外键管不到"这一场必须属于这门课"这类跨表关系，那道校验只能写在应用层
- 显式 `null` 的拒绝要**按列的可空性分别决定**，一刀切 `field_validator("*")` 会挡死正常功能
- 只读响应字段用 `str` 不用 `Literal` —— DB 没有 CHECK 约束时，一行越界会让整个列表接口 500
- SQLModel 的显式 `None` 会盖掉列的 DB 默认值；应用不读不写的列干脆不映射
- `jsonb` 不保对象键顺序，"顺序有含义"的数据只能存数组，且断言必须比较**有序序列**
- FastAPI 静默忽略不认识的查询参数 —— 新加的开关在旧构建上等于没加
- dry-run 不能写成"照常写、最后 rollback"：回滚会撤销调用方事务里的别的东西
- 「每次请求发几条 SQL」要钉成断言，往返次数就是用户感知的延迟
- migration 的回填在本地永远跑在 0 行上，绿灯不构成证据
- 一段错误处理在"只有 CLI 操作者能看到"时够用，**换了信任边界**（挂到浏览器/MCP 后面）就不够——裸异常会从 500 加 traceback 里冒出来
- "只增不删、覆盖式写入"这条设计原则的代价是没有删除入口——导入错了课程，报课能改，成绩记录只能直接连库删

### Next.js 与前端

- `error.tsx` **接不住同段 `layout.tsx` 自己抛的错**，外壳自己取的数必须不能抛
- layout 里未隔离的取数会阻塞每一次导航，`loading.js` 对它不生效，本地完全看不出来
- 重试按钮用 `unstable_retry()`，`reset()` 不重新取数
- Server Component 的 fetch 必须设显式超时，且短于平台函数执行上限
- 中间件文件叫 `proxy.ts`；用旧名字时症状是"页面照常打开"，与认证正常**外观一致**
- Server Action 抛出的错误在生产构建里只剩 digest —— 预期内的结果用**返回值**表达
- `revalidatePath` 不写路由组前缀，但**粒度**要改成 `"layout"`，否则外壳里的数字不动
- 204 没有 body，公共写请求壳里一句 `res.json()` 会把成功变成失败
- 写入失败的信息要就地渲染，写入期间禁用**所有**出口（含取消）；异步操作引发的**后续**请求也要盖住这段禁用，不只是它自己那次
- `overflow-hidden` + 可压缩 flex 子项 = 内容被静默裁掉且没有滚动条；jsdom 量不出来
- 落地页默认项要按**有没有数据**选，不能按列表顺序——空页面不报错，像功能坏了
- Server Action 的请求体上限默认 1MB 且**在 action 跑起来之前**就拒；比后端自己的上限小的话，那段区间的失败绕过了"返回值表达"的设计
- 写 tasks.md 前先读实现——"这个判断在后端算"这类假设不能靠 spec 措辞猜，实际可能纯在前端算，按错误假设写的任务不报错、只是白写
- 同一件事新旧两个信号并存时，界面上只留旧信号会让用户把"新信号生效了"读成"没反应"——更可信的信号要顶到用户看得见的地方

### 测试与验证

- 本地数据会把测试搞红，而报错落在**不相干的地方**（全库唯一键 / 清表 fixture 漏表 / `@example.com` 撞）
- `vi.clearAllMocks()` 不清 mock 实现，同一断言全量跑与单独跑结果不同
- pytest fixture 每次新建 engine 不 dispose，第 ~100 个测试起连接被拒
- 变异测试别用 `git checkout` 还原，未提交的工作会一起没
- 验收脚本要在"新建"那一步就填**可选字段**，否则新建路径的字段处理没被走到
- e2e 等写入完成不能盯按钮文案；超时不足的失败长得跟功能缺失一样
- `waitUntil: "networkidle"` 在会冷启动的后端上可能永远不达成
- 补写的测试必须**故意改错实现验一遍**，否则它可能只是碰巧通过
- 验夏令时不能拿美西比美东（恒差 3 小时，是个假测试）
- Playwright `setInputFiles` 不等 React 装上 `onChange`；选**同一个**文件重试不会再发 `change`，循环会死锁——重试前先清空

### 脚本与运维

- **验证前先确认打的是新进程/新构建，判据必须是只有新版才有的可观察差异**（栽过三次）
- 部署配置类环境变量缺失时要启动即失败，不要留 localhost 兜底
- 认证/密钥类环境变量必须 fail-closed，且判断拆两步 —— 静默放行什么征兆都没有
- `supabase db reset` 之后**必须重启后端**：端口有人听、每个请求 500
- `uv` 的 Python 被清理后 `.venv` 变空壳，报错指向不存在的路径
- 清理脚本会"成功地什么都没做"：端点不存在时 httpx 不抛异常；判据只能用主键
- 输出中文的命令行脚本要显式 UTF-8 写 stdout，否则 cp1252 下第一行就崩
- 子目录的 `.gitignore` 会吃掉根目录的否定规则，文件静默进不了仓库
- **"他碰巧不在名单里"不是排除，是巧合** —— 要排除就写成显式名单

### 性能测量

- 计时区间里不能有固定 `sleep`，也不该有定位器解析；在页面内部计时
- 别把预取请求当成导航请求；"慢在哪"先抓 CPU profile，`(idle)` 占满是在等 I/O
- 噪声与效应同量级时三次采样会骗人：7 次、看最小值、留一个没改过的接口当对照

### openspec 流程与设计稿

- MODIFIED 按标题匹配，改标题会让 archive **回滚整次归档** —— 行为变了用 REMOVED + ADDED，propose 阶段就核
- `openspec archive` 按 UTC 命名目录，本机在 PT，**PT 17:00 之后归档会命名成明天**
- delta spec 的 Requirement 校验只读标题后**第一行**要不要 SHALL/MUST——句子在这一行被硬换行拆到第二行，校验照样报"缺关键词"，症状是报错引用的文本跟眼睛看到的整段不一样长
- `openspec archive` 生成的归档目录是新文件，不在 git 索引里；改名要用 `mv` 不能用 `git mv`（后者会报 "source directory is empty"）
- 设计稿是布局与语气，**不是取值域、不是数据、也不是待办**：示例值不能当约束、
  假数字比没数字糟、有意的偏离以「已知偏离」清单为准
