# 能力清单

`openspec/specs/` 下每个目录是一个已归档的能力（capability）。这里维护一份清单，方便快速找到"这功能是哪个 change 做的、覆盖了什么"。

---

### `student-roster` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我想看到学员列表反映数据库里的真实记录，而不是写死在前端的 mock 数据；能从任意设备打开一个公网地址访问，不用在本机起 Docker；并且在界面上的编辑、新增、归档都真的存进数据库，而不是刷新就没；名字录错（导入来的记录带群昵称残留）能直接改，不必归档重建把备注一起丢掉；拿着微信群名单人工对齐时，能用手上唯一有的信息——群昵称——把人搜出来
**覆盖需求**:
- docs/superpowers/specs/2026-07-28-student-management-requirements.md（查询能力）
- docs/superpowers/specs/2026-07-29-deployment-requirements.md（上线与降级）
- docs/superpowers/specs/2026-07-29-student-write-requirements.md（写入持久化）
- docs/superpowers/specs/2026-07-29-roster-editing-requirements.md（姓名可编辑与检索范围）
- docs/superpowers/specs/2026-07-30-roster-order-spec-requirements.md（名单排序，补写既有行为的依据）
- docs/superpowers/specs/2026-07-30-enrollment-backfill-requirements.md（学员详情的报课记录可逐条编辑）
- docs/superpowers/specs/2026-08-01-homework-auto-create-student-requirements.md（作业导入自动建档路径，与人工新增表单并列、判据不同）

**后台**: FastAPI `GET /api/students`（列表，默认只返回在读，`?archived=true` 取已归档）、`GET /api/students/{email}`（按邮箱查单条，大小写不敏感）、`POST /api/students`（新增，邮箱冲突返回 409 并区分在读/已归档两种情形）、`PATCH /api/students/{email}`（部分更新，`exclude_unset` 区分"未提供"与"显式设为空"）、`POST /api/students/{email}/archive` 与 `/restore`（软删除，`archived_at` 由服务端盖时间）；Supabase Postgres `students` 表，邮箱为主键并有 `lower(email)` 唯一索引，写入时统一转小写；姓名走共享的 `StudentName` 校验（先 trim，空则 422），**新增与更新两条路径共用同一份规则**——只拦一边等于留着从另一边造出空姓名；列表 `ORDER BY name, email`（无排序时 UPDATE 会把该行写到堆尾，编辑过的学员因此跑到名单最后）
**前台**: `frontend/app/students/` —— Server Component 同时拉在读与已归档两份数据，`StudentsClient` 只渲染 props（无本地副本），写操作走 `actions.ts` 的 Server Actions；每个字段独立的保存中/失败态，失败保留用户已输入的内容；`error.tsx` / `loading.tsx` 承接后端不可达（fetch 15s 超时，避免被平台函数上限掐死）；姓名与其余字段同构地排在详情面板字段表首位；检索匹配姓名/邮箱/微信昵称/微信名/微信号五个字段（任一命中、大小写不敏感，**不匹配**标签与备注），placeholder `搜索姓名 / 邮箱 / 微信` 是这件事唯一的可发现处；词表在 `app/students/vocab.ts`（原名 `mock-data.ts`，里面从来没有 mock 数据）
**部署**: Vercel（前端）+ Render 免费档（FastAPI）+ Supabase 云项目。`git push main` 后代码由平台自动部署，DB schema 由 `.github/workflows/db-migrate.yml` 自动 `supabase db push`
**验收标准**: 生产 `GET /api/students` 返回 `200 []`（区别于连不上的 500）；冷启动时页面呈现自家错误卡片与可用的重试，而非平台 504；`frontend/e2e/production-acceptance.spec.ts` 在生产环境全绿 —— 新增（含微信号）→ 改字段 → 打标签 → 归档 → 恢复，**每步刷新页面**确认真正落库，重复邮箱在两种情形下分别给出正确提示且不产生重复记录；生产改名往返（改名 → 刷新确认落库 → 改回原名 → 刷新确认，按邮箱定位而非按当前选中项——改名会让列表重排）与昵称片段检索命中，均已在生产实测

> 访问控制见下方 `access-control`（2026-07-29 落地，整站已需密码）。

---

### `course-catalog` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我想把课建到系统里并给它排多场——报满后加的第二场、为亚洲时区加的晚场，每场讲师可能都不是同一个人；我按美西时间排课，但要直接看到各时区对应时间，**而且不想在夏令时切换后发现所有时间都错了一小时**；平台里这门课的各种写法也要登记下来，下次导入报课数据不用手工对
**覆盖需求**:
- docs/superpowers/specs/2026-07-29-course-catalog-requirements.md（课程、别名、场次）
- docs/superpowers/specs/2026-07-30-course-scheduling-fields-requirements.md（时长改分钟、按所选时区录入）
- docs/superpowers/specs/2026-07-30-course-list-order-requirements.md（列表按最近开课排序、左右两栏）
- docs/superpowers/specs/2026-07-30-course-page-boundaries-requirements.md（课程页的加载态与错误态）
**设计基准**: docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html（`sc-if isCourses` 与 `showCourse` 两个分支）

**后台**: 三张表 —— `courses`（独立 uuid 主键，课程名与简称都可改）、`course_aliases`（**主键就是归一化后的别名**，全库唯一由结构保证 + CHECK 约束兜底绕过 API 的直写）、`course_sessions`（`local_date` + `local_time` + **该场自己的** IANA `tz`，**无 UTC 偏移列**）；FastAPI `GET /api/courses`（课程+别名+场次一次取全，内存归拢避免 N+1）、`GET /api/courses/teachers`（场次讲师去重）；课程带 `duration_minutes`（分钟，15–600，**不是整小时** —— 真实课程 150 分钟）与 `default_tz`（新增场次的预选时区，不回溯已有场次）；课程与场次的 POST/PATCH/DELETE、别名增删、`POST .../sessions/{id}/follow-date`（清除状态覆盖是动作而非 PATCH null）
**前台**: `frontend/app/(app)/courses/`（独立路由；侧栏从 `setView` 改为 `next/link`，占位页各自成路由）；`CoursesClient` 只渲染 props、不留数据副本；`CourseModal` 新建/编辑 + 别名增删；`SessionRows` 行内编辑、新增一场、讲师 chip 可当场新增、**时区 chip（取自 `ZONE_ROWS`，与换算行同一份来源）**且时间标签跟随所选时区；`lib/tz.ts` **只做格式化**
**关键性质**: 课程列表**按该课最早一场的日期倒序**（未排课的排最前），排序由**服务端**决定并体现在响应顺序里、前端不重排——顺序是数据的属性，不是某个客户端的看法；倒序用**反转日期键**而非 `sorted(reverse=True)`（后者会把名称兜底也反过来），未排课优先用**分组位**而非哨兵日期；场次时间存墙上时间、绝对时刻读取时用 `zoneinfo` 派生（时区规则会变，墙上时间才是讲师的意图）；状态 = 派生 + 可覆盖三态（`state_override` 为 null 即"跟随日期"），"今天"取 `America/Los_Angeles` 而非服务器时区；课程无删除，只有上架/已下线
**验收标准**: 两场同为「美西 19:30」、分别在 10 月与 12 月时，**上海行为 10:30 次日 / 11:30 次日**；以**美东** 20:30 录入的 2026-07-31 一场，美西行 17:30 同日、上海行 08:30 次日（换算基准是该场自己的时区）（美东两场都是 22:30——美国两地同日切换，拿它比验不出任何东西）；生产四门课顺序为 S4(7/26) → S3(7/19) → S2(6/14) → S1(6/07)（取**最早**一场，所以补录了早期场次的 S1 落到末位）；课程页为左右两栏、左栏定宽 264px 独立滚动，课程增多时左栏内部滚动而非把详情往下推；场次写入失败就近显示、失败保留用户输入；生产已建真实课程与两场并通过上述断言

> **本能力不提供**：作业评分维度（课程上只有"作业题目"一条元数据）、讲师实体（讲师是场次上的字符串）、批量排课、课程删除。
>
> 报课已由 `enrollment` 提供（2026-07-30）：场次卡片显示「已报 N 人」、课程显示「另有 N 人未定场次」，
> 两者**为 0 时都不显示**；删除有报课的场次被拒绝。
>
> ⚠️ **报课能力落地时必须补一条**：**删除已有报课的场次要被拒绝**。现在场次是硬删除，没有报课表所以无害；有了之后，删掉一场会让报课记录指向不存在的场次。

### `access-control` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我想让这个存着真实学员联系方式的系统不再对全世界敞开，只有知道密码的人能进
**覆盖需求**: docs/superpowers/specs/2026-07-29-access-control-requirements.md

**后台**: `X-Backend-Secret` 校验放在 FastAPI middleware（默认覆盖所有路由，新增路由自动受保护），`secrets.compare_digest` 常数时间比较；`/docs`、`/openapi.json`、`/redoc` 默认关闭，仅 `ENABLE_API_DOCS` 显式设置时开启
**前台**: 根目录 `frontend/proxy.ts`（本版 Next.js 已把 `middleware` 约定改名为 `proxy`）整站 Basic Auth，matcher 负向排除静态资源；`lib/api.ts` 在 server-side fetch 注入 secret
**关键性质**: 两个变量缺失时**拒绝而非放行**（fail-closed），且认证逻辑**无环境判断分支**——本地与生产同一条路径
**验收标准**: 未带凭据时页面与后端一律 401 且响应体不含学员数据；带正确凭据行为如常；生产 API 文档不可达

> ✅ **护栏已于 2026-07-29 解除**（该 change 归档时作为一次单独、明确的决定）。
> 生产库现存放真实学员数据。**排查生产问题时不要整行 dump 学员记录** ——
> `console.log` 出去的姓名邮箱会留在终端输出、CI 日志与对话记录里（见 CLAUDE.md「隐私」）。
>
> **本能力不提供**：每人一身份（无法单独吊销某人、互动记录无法区分录入者）、限流（安全性依赖密码长度）、登出。

### `app-shell` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我在左侧切换「学员 / 课程」时，希望**点了就知道点上了** —— 现在点完屏幕纹丝不动几百毫秒（后端冷启动时是几十秒），侧边栏还整块消失又出现，看着像整页刷新，我会以为没点上而再点一次
**覆盖需求**: docs/superpowers/specs/2026-07-30-course-page-boundaries-requirements.md
**设计基准**: docs/superpowers/specs/mocks/2026-07-30-course-page-boundaries-mocks.html（讲的是**范围与时序**，不是长相 —— 卡片本身沿用已上线的那两份）

**后台**: 不涉及，本能力纯前端
**前台**: 路由组 `frontend/app/(app)/`（**不产生 URL 段，路径全不变**）承载 `layout.tsx`，六个页面（学员、课程、四个占位页）迁入；`Sidebar` 改客户端组件，高亮由 `usePathname()` 派生、不再由各页传 `active`；徽标计数以 `SidebarWithCount` + `<Suspense>` 隔离，layout **不 await**；`(app)/error.tsx`（侧边栏保留）与根 `app/error.tsx`（兜底）两层；`(app)/courses/loading.tsx` 新增、学员那份迁入，容器由整屏改为 `flex-1` 内容区；学员写操作 `revalidatePath("/students", "layout")`
**关键性质**: 加载/错误态只替换内容区（它们替换的是**下方**的东西，所以侧边栏必须在 layout 里）；**外壳自身的取数不得阻塞导航也不得拖垮外壳** —— layout 里未隔离的取数会阻塞每一次导航（本版 Next `loading.js` 不覆盖 layout），而 `(app)/error.tsx` 接不住同段 layout 自己抛的错，故计数的 rejection 就地吞掉、未知计数渲染 `—`（与"这页不数学员"同一个占位：没数过就不能声称是 0）
**验收标准**: 生产上两个方向切 tab，点后 **180ms** 侧边栏都在、高亮已跳；**后端休眠状态下**打开 `/courses` 在 2190ms 内出加载卡片（非空白、非平台 504），同一时刻占位页 `/enroll` 仍能打开（这条同时证明 Suspense 没漏包）；新增学员后徽标 10 → 11 无需刷新

> **本能力不提供**：骨架屏（冷启动下"约 1 分钟"的文案价值高于形状仿真）、顶部进度条、预取与 `staleTimes` 调优（那是"等待时长"，本能力治的是"等待反馈"）、`global-error.tsx`（只在根 layout 自身抛错时用得上，而根 layout 只加载字体与全局样式）。
>
> ⚠️ **实测记录**：一次硬加载 `/students` 打后端 `GET /api/students` **3 次**（page 2 次 + layout 1 次）—— request memoization **没有**合并 layout 与 page 的同名 GET，因为二者各带不同的 `AbortSignal.timeout()`。按计划接受（内部工具、个位数用户），不为此加计数专用端点。

### `enrollment` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我想知道**这门课这一场有谁** —— 现在系统里查不到，只能翻平台后台；有人平台漏记或线下转账我要能直接补录；有人这次没上想补后面那一场，改一下就行，别让我删了重建把报名时间丢掉；还有人想再听一遍加深印象，系统要记下她占了两场的位子，但**别催她交两次作业**
**覆盖需求**:
- docs/superpowers/specs/2026-07-30-enrollment-core-requirements.md（数据主干）
- docs/superpowers/specs/2026-07-30-enrollment-backfill-requirements.md（来源三值、报课总表、逐条编辑、从作业倒推）
- docs/superpowers/specs/2026-08-01-homework-auto-create-student-requirements.md（`derived` 报课的常态触发：此前只有一次性回填用过这个来源值，现在每次作业导入遇到未知邮箱都会走这条路）
**设计基准**: docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html（学员详情的报课区块、`showManual` 补录弹窗、场次卡片的已报人数）

**后台**: `enrollments` 表 —— `students.email` × `courses.id` × **可空**的 `course_sessions.id`，带 `enrolled_at` / `status` / `source`（**三值**：`manual` 人特意录的 / `platform` 平台同步 / `derived` 从别处倒推的占位，取值在 API 边界受限）/ `note`；**两条 partial unique index**（`session_id is not null` 一条、`is null` 一条）；`session_id` 外键**故意不写** `on delete cascade / set null`；`GET/POST/PATCH/DELETE /api/enrollments`；`GET /api/courses` 同一次请求内聚合三个计数（每场人数、未定场次人数、去重人数）；场次删除守卫返回 409 并带条数
**前台**: 学员详情的「报课记录」区块（`EnrollmentRows`，每条可**改场次/清空/删除**，错误按报课 id 就近显示）+ 补录弹窗（`EnrollmentModal`，四个字段全部送出）；`/enroll` **只读**报课总表（六列 + 课程筛选，无任何编辑入口——写入只在学员详情一处）；课程页场次行的「已报 N 人」与课程层的「另有 N 人未定场次」，**两者为 0 时都不显示**；删除被拒的信息渲染在**那一行**（弹窗关着时也可见）
**关键性质**: **来源三值的区别对将来的平台导入有约束力** —— 平台导入不得覆盖 `manual`、可以覆盖 `derived`；二者塞进同一个值就分不出哪些能覆盖，而那时错的方向不可逆。状态**只存 `enrolled` / `withdrawn`**，「已完成」不入库、读取时由所属场次派生（场次取消 → 仍是报名，课没上成）；**不设状态覆盖** —— 补课与重听靠**改场次/清空场次**表达，否则"这个人属于哪一场"会有两个矛盾答案；重听同一门课 = 两条记录，但**作业按人计一份**；**归档学员不影响计数**（排除会让历史数字随今天的操作被改写）；退课与删除是两件事——退课=发生过（仍挡住场次删除），删除=这条记录本身录错了
**验收标准**: 生产上 22 条由作业成绩倒推而来（S1 14 / S2 8，全部未定场次、来源 `derived`，报名日期取各自课程最早一场），**重跑新建 0 条、已存在 22 条**；指派一条到某场后「未定场次」14 → 13、该场已报 0 → 1，改回完全复原；另：生产上给真实学员补录一条并**填上可选字段**，`session_id` 与 `note` 确实落库、派生状态为 `completed`（该场已过而库里仍是 `enrolled`）；删除该场次返回 409 且提示「有 1 条报课记录」；删掉该报课后人数回到 0

> **本能力不提供**（归 `enrollment-import`，阻塞于 EliteCoach101 导出方式未知）：CSV / 手工粘贴 / API 三通道导入、待处理队列、`raw_payload` 原始行留档、**批量**指派场次（逐条指派已有）。
>
> 也不提供：出勤记录（来没来）、退款与收费、名额上限。

### `homework` ✅ 已实现 · 🌐 已上线
**用户故事**: 作为讲师，我批完的成绩只存在另一个仓库的 `grades.csv` 里和我自己脑子里 —— 我想在系统里看到某门课谁交了谁没交、某人的分项得分与我当时写的改进建议；更要紧的是「有报课记录但没提交」这个判断在此之前**根本算不出来**，而它是催作业的第一前提；导入不该依赖我记不记得本地命令行怎么写；新学员交作业也不该逼我先手动建档再重传一遍；我在系统之外回复了学员，也该有地方记下来，不用等下次导入 `grades.csv` 那一列才跟上；分项原始分是个孤立的数字，配上满分才看得出"这个 11 分是接近满分还是刚及格"
**覆盖需求**:
- docs/superpowers/specs/2026-07-31-homework-requirements.md（数据主干、只读名单）
- docs/superpowers/specs/2026-07-31-homework-upload-requirements.md（浏览器导入、预览屏、排除名单）
- docs/superpowers/specs/2026-08-01-homework-auto-create-student-requirements.md（未知邮箱自动建档+建报课）
- docs/superpowers/specs/2026-08-02-homework-reply-status-requirements.md（讲师手动标记已回复，独立于源文件、不受重新导入影响）
- docs/superpowers/specs/2026-08-02-homework-rubric-requirements.md（各分项满分、条形图、总分进度条）
- docs/superpowers/specs/2026-08-02-homework-grading-report-requirements.md（单条提交上传批改报告 `.md`，解析逐分项评语，预览+勾选+确认，`highlight`/`improve` 覆盖后锁定不受 `grades.csv` 重新导入影响）
**设计基准**: docs/superpowers/specs/mocks/2026-07-31-course-enrollment-design.dc.html（`sc-if isHomework` 分支）+ docs/superpowers/specs/mocks/2026-07-31-homework-mocks.html + docs/superpowers/specs/mocks/2026-07-31-homework-upload-mocks.html（预览屏与硬规则表）+ docs/superpowers/specs/mocks/2026-08-01-homework-auto-create-student-mocks.html（自动建档面板）+ docs/superpowers/specs/mocks/2026-08-02-homework-reply-status-mocks.html（回复标记切换）+ docs/superpowers/specs/mocks/2026-08-02-homework-rubric-mocks.html（满分/条形图/名单迷你竖条，布局沿用 2026-07-31 那份早期导入的 Claude design comp，阈值改成这次定的 90/70）+ docs/superpowers/specs/mocks/2026-08-02-homework-grading-report-mocks.html（上传按钮、预览屏勾选+警告、导入后来源徽章）

**后台**: `homework_submissions` 表 —— 唯一键 `(student_email, course_id)`，**不含 `session_id`**；`scores` 是 `jsonb` **数组** `[{item, score}]`；`total` / `highlight` / `improve` / `reply_status` / `source_ref`（`session1/grades.csv:7`）/ `replied`（bool，默认 false）/ `replied_at`（服务端盖时间）。`homework_rubric_items` 表（`course_id, item` 主键，`max_score` 带 `CHECK (max_score > 0)`）——满分独立于 `scores` 存储，是课程级配置，改满分不需要重写历史提交；「未配置」用**这一行不存在**表达，不用可空列+哨兵值。`homework_excluded_emails`（「不算作业的邮箱」，键是邮箱、**全课程通用**、不挂在 `students` 上）与 `homework_imports`（每次**实际写入**的元信息，dry-run 不留记录，不存原文）。`homework_submissions` 另有 `dimension_comments`（`jsonb` 数组，`[{item, comment}]`，跟 `scores` 同形状，只存被勾选写入的分项）与 `highlight_locked`（bool）——批改报告导入一旦覆盖过 `highlight`/`improve` 就把这个标记设真，`_classify` 重新导入 `grades.csv` 时据此跳过这两个字段（其余字段照常整行覆盖）。`POST /api/homework/submissions/{id}/report?dry_run=`（纯函数解析层 `backend/app/homework_report_parsing.py`，表格行按 `^([A-Za-z]\d+)` 取编号前缀、忽略中文标题，`### 亮点`/`### 改进建议` 到下一个 `###` 之间的内容分别提取，一行都解析不出时 422）复用同一个 `dry_run` 约定——预览不写入，确认时前端把上传内容原样重新提交 + 勾选结果，服务端不留临时状态。**唯一进库的路**是 `POST /api/homework/import?dry_run=`（收 base64 原始字节 + `course_id`/`course_alias`，服务端解码→解析→分类，幂等 upsert）；邮箱不在 `students` 表的行**自动建最小档案**（`region="美东"`/`level="有基础"`/`source="讲武堂"` 占位值，姓名空则「待定」）与一条 `source="derived"` 报课（`session_id=None`，`enrolled_at` 取该课程最早场次日期、无场次回退导入当天），成绩正常写入，不再跳过；`GET /api/homework?course=<id>`（一次 JOIN 取全，含 `submission_id`/`replied`/`replied_at`，`scores` 每项附带 `max`、`total_max` 在该提交全部分项都配了满分时才非空）；`GET /api/homework/last-import`；`POST /api/homework/excluded`；`POST /api/homework/submissions/{id}/reply` 与 `.../unreply`（动作式端点、无请求体、时间戳 `datetime.now(UTC)` 服务端盖，与 `Student.archive`/`restore` 同一先例）；`GET /api/homework/rubric?course=`（该课程去重分项名 + 已配满分，未配为 `null`）与 `PUT /api/homework/rubric`（整表覆盖式写入，`max_score` 为 `null` 删除对应行）。`_classify` 的整行覆盖字典天然不含 `replied`/`replied_at`（解析层不知道这两个字段的存在），重新导入不清空标记。`backend/app/homework_parsing.py` 是纯函数解析层（UTF-8-sig → GB18030 顺序解码，`BadHeader` / `CannotDecode` / `MalformedCell` 三种可区分异常）。旧的 `PUT /api/homework` 与 `tools/homework-sync/` 已删除
**前台**: `/homework` 页只有**一个写入口**——「导入 grades.csv」+ `ImportDialog` 预览屏（编码始终显示、行数对账「共 N 行 → 可用 M 行」、将新建/将更新两个数、「自动建档」与「无报课记录」两份清单**语气不同**、表头警告、逐行「以后不算作业」）；名单表格「回复」列**以讲师标记为准**（已标记显示「已回复」，未标记才回退显示源文件 `reply_status` 原文——上线当天生产反馈过一次：显示源文件原文会让人以为"标记没生效"，因为那一列可能是过期快照）；「待回复」筛选判据同样看 `replied` 不看 `reply_status`；详情面板在回复状态原文之后加独立的「讲师标记」控件（徽章 + 时间戳 + 可来回切换的按钮）；分项有满分时显示「X / 满分」+ 按比例条形图，条形图与分数文字按三档阈值染色（≥90% 绿、70%–90% 黄、<70% 红），没配满分只显示原始分；总分只在该提交全部分项都配了满分时显示进度条+三档颜色，否则只显示数字；名单表格每行一串迷你竖条（配了满分的分项才有柱子），不点详情就能看出弱项；课程页新增 `RubricEditor` 满分维护表单（分项名自动列出、逐项填一个整数满分，留空=不配置）；课程 chip、四态名单、四个筛选、逐条编辑控件的缺席均沿用不变；详情面板「批改报告」区一个按钮弹系统文件选择框选 `.md`，选中后 `ReportUploadDialog` 展示解析出的逐分项评语（勾选框默认全勾选）+ 亮点/改进建议预览，得分与现有 `scores`/`total` 不一致的分项标黄警告但不阻止确认；确认后逐分项评语挂在「分项」块里对应分项行下面（按编号前缀匹配，不单独成块），亮点/改进建议与「分项」块标题旁标「来自批改报告」徽章；**独立的「回复状态」字段已去掉**——「讲师标记」区的信号更可信，两处重复只留一处
**关键性质**: **分项列整列原样存下且保序** —— 列的先后是评分表分组（A 工作流 / B 提示词 / C 输出 / D 心得）的唯一载体，而 `jsonb` 不保对象键序（实测 10 个真实列名过一遍对象被打散成 A2 A3 B2 B3 D1 D2 A1 C1 C2 B1），所以只能是数组；新增课程只是多一套 item 名，**不动表结构**。**总分取自源文件不重算** —— `session2/grades.csv` 里真有一行总分与分项之和不符，镜像的职责是忠实不是纠正。**覆盖式不是同步式删除** —— 源文件少一行，库里那条仍在。名单**按人去重**（重听同一门课只欠一份作业），**已归档与已退课不进计数**。写入前必须先给出**只读预览**，标记排除后**重新请求一次预览**而非前端自行加减；写入期间所有出口（含取消）禁用，只在成功回调里关闭；上传按内容判定不按扩展名，体积上限在 base64 解码**之前**先粗筛（decode 会为误传大文件实打实分配一次内存）。**自动建档不检查归档冲突**；**没有删除入口** —— 导入错课程后，报课记录能通过 `enrollments` 的增删接口挪到正确课程，但已写入的 `homework_submissions` 无法通过 API 移动或删除（唯一写入口是导入，覆盖式语义故意不含删除），只能直接改数据库（生产实测踩过一次：三人误导入到 S3，报课已挪至 S4，S3 下的三条成绩记录靠直接删库处理）。**讲师标记与源文件是两个独立信号，不共用存储** —— `reply_status` 每次导入整列覆盖，标记若与它同一份存储会被下一次导入悄悄冲掉；「待回复」判据与名单表格显示都**只看标记不看源文件**，因为标记比源文件那份可能过期的快照更可信。**满分聚合走标量子查询，不新增数据库往返** —— `GET /api/homework` 的「一次 JOIN 取全」约束不能破，`func.jsonb_object_agg` 把满分表嵌进主 `select()` 里，不是应用层第二次 `session.exec`；**"总分要不要显示进度条"按这条提交自己的分项集合判定**，不做跨提交/跨课程的完整性校验（同一门课分项名随时间变化是已知不处理的边界）。**批改报告解析出的分项编号与 `scores` 的 item 键格式不同**（报告是「A1 工作流结构」带空格，`scores` 是「A1工作流结构」不带）——对齐只取开头编号前缀正则匹配，不要求标题文字一致；「讲师回复草稿」「作业原文」两段刻意不解析、不存储。**批改报告是可选的额外信息，不是必需路径**——没上传过报告的提交，行为与本能力早期版本完全一致
**验收标准**: 生产真实浏览器验收全绿（`frontend/e2e/homework-import-acceptance.spec.ts` 只读四项 + `homework-import-write.spec.ts` 写入一项）——S1 预览「将更新 16 · 将新建 0」、讲师邮箱在已排除清单（migration 回填，本地空库跑在 0 行上、只能在生产验）、GBK 文件注明「按 GBK 读取」中文不乱码、传错文件被拒且说得出「不像作业成绩文件」、S2 文件传到 S1 触发表头警告但不阻止确认、真写入后计数保持 16（幂等）并出现「上次导入」；本地 `frontend/e2e/homework-import.spec.ts` 九项覆盖 17 行长清单不被裁切、可滚到最后一行；自动建档一段：backend 34 项 + frontend 29 项全绿，两组评审分 99/80、100/70；回复标记一段：backend 26 项 + frontend 80 项全绿，两组评审分 99.6/80、100/70，上线当天收到一次生产反馈（名单列显示源文件原文误导人）并当场修复补测；满分一段：三组评审全 PASS（100/99/99），covering 满分录入/校验/自动列出分项名、分项条与总分进度条三档染色、名单迷你竖条、单次往返未被打破；批改报告导入一段：backend 254 项 + frontend 294 项全绿，两组评审分 96.6/80、98/70，覆盖解析/预览不写入/勾选过滤写入/得分不一致警告不阻止/锁定字段不被重新导入覆盖/上传按钮+预览对话框+导入后展示；上线当天收到一次生产反馈（详情面板「回复状态」字段与「讲师标记」区重复），当场去掉并把逐分项评语合并进「分项」块

> **本能力不提供**（`nudge` 能力已实现算名单/起草文案/标记已催/回写互动事件这几项，见下）：真实发信、已催次数的展示入口——这些在催作业那一片。
>
> 也不提供（归 `enrollment-import` 阻塞的同一原因）：报课数据的浏览器导入——本片只解决了作业这一侧。
>
> 也不提供：回复状态的**批量**标记、名单行内的快捷标记（只在详情面板一处）；`reply_status` 本身仍然只读镜像，不能改、不解读其含义——能改的是独立的讲师标记。

### `nudge` ✅ 已实现
**用户故事**: 作为讲师，我知道"未交"这个判断系统已经算得出来，但催不催、催了没有全靠我自己记；我想要一个页面告诉我"这门课谁还没交、逾期几天、催过没有"，系统帮我按已催次数推荐合适语气的催促文案，我看一眼改改就能发，发完点一下标记，下次不会漏催也不会重复催；跳过的人我还想留着看，跳错了能反悔，不想导出名单里混进已经跳过的人；文案我不想只是复制粘贴到别处发，希望系统能直接把邮件发出去
**覆盖需求**:
- docs/superpowers/specs/2026-08-03-nudge-requirements.md（MVP：算名单、起草文案、标记已催/跳过、最小互动事件记录；明确不接真实发信、不做多模板、不做导出、不做批量操作）
- docs/superpowers/specs/2026-08-04-nudge-advanced-requirements.md（进阶版：三档文案模板按已催次数自动推荐、导出未交名单 CSV、名单头部未交/已跳过人数摘要；上线后按用户实测反馈修订两处——已跳过的人改为原地可见可撤销而非从名单消失，静态进度指示因不随操作变化产生"卡住了"的误导直接移除）
- docs/superpowers/specs/2026-08-05-nudge-email-send-requirements.md（真实发信：详情面板"发送邮件"按钮，确认后真的把草稿发出去，成功自动记一条 `channel=email` 的已催事件；上线后实测 Render 免费档封锁出站 SMTP 端口，把发信方式从 SMTP 换成 Resend HTTP API）
**设计基准**: docs/superpowers/specs/mocks/2026-08-03-nudge-mocks.html（MVP）、docs/superpowers/specs/mocks/2026-08-04-nudge-advanced-mocks.html（进阶版三档 tab/导出按钮/头部摘要；页面头部进度指示的对应 mock 区段已废弃，见下）；发送邮件按钮/确认框无独立 mock（`HAS_UI_SURFACE: no`），沿用应用已有的手写 modal 模式

**后台**: `nudge_events` 表（`student_email`/`course_id`/`event_type` [`nudged`|`skipped`|`unskipped`，不建 CHECK、给未来三来源互动记录留口子]/`channel`/`note`/`created_at`），不外键到 `enrollments`——报课记录的生命周期与催促历史无关，与 `homework_submissions` 不外键到 `enrollments` 同一个理由。`GET /api/nudge?course=`：从 `app.routers.homework` 导入 `merge_states`/`state_of` 复用"未交"判定（不重新发明），按（学员, 课程）去重取最早场次日期算逾期天数，`history` 用 Postgres `json_agg` 子查询嵌进主查询一次带出、按时间倒序，返回体形状为 `{items, skipped_count}`；跳过的（学员, 课程）**仍出现在 `items` 里**（`skipped: bool` 逐行标出，取 `history` 中最新一条 `skipped`/`unskipped` 事件决定），`skipped_count` 由 `items` 直接数出，不查库。`GET /api/nudge/count`：全课程合计（侧边栏徽标用），仍然排除跳过的人，但判断用"最新一条 skipped/unskipped 事件"而不是"曾经出现过 skipped"——否则取消跳过之后这个人会被永久漏计（`nudge_events_course_type_idx (course_id, event_type)` 索引配合，独立评审中发现原索引领头列不匹配这条查询）。`POST /api/nudge/events`：渠道服务端按学员微信是否对齐自动判定（已对齐→微信，否则→邮件），`skipped`/`unskipped` 均无渠道。`POST /api/nudge/send-email`：独立端点（不复用 `/events`），`body` 是详情面板当前草稿原文（服务端不重新生成文案），主题固定 `《{课程名}》作业提醒`；`backend/app/email_client.py::send_email()` 走 Resend HTTPS API（`httpx.post`，发件地址固定 `noreply@austinxyz.ai`），失败统一抛 `EmailSendError`；发送成功后端点直接写 `NudgeEvent(channel="email")`，**不经过** `_channel_for`——不管该学员微信是否对齐，走这个按钮的记录都是"邮件"；发送失败 SHALL NOT 落库，顺序是先发送、成功才写 DB
**前台**: `/nudge` 页——课程 tab 切课，头部摘要"N 人未交 · 已跳过 M 人"（未交人数只算未跳过的行）+"导出名单"按钮（CSV 生成走前端纯函数，用页面已加载数据拼字符串下载，过滤掉已跳过的行，不发起额外请求）；表格列姓名（跳过的人整行灰显 + `Badge`「已跳过」）/微信/逾期天数/已催次数/上次催促；选中一人在右侧 360px 详情面板：三档固定文案模板 tab（第一次提醒/第二次提醒/最后一次），按该学员已催次数自动选中默认档，手动切换只在草稿未编辑过时替换文本；"发送邮件"按钮（与"复制文案"/"标记已催"并列，第三个动作）点击后弹确认框显示目标邮箱，确认后调用发送接口，成功不需要再点"标记已催"、失败就地报错；已跳过的人显示"取消跳过"按钮取代"跳过"；催促历史区块按时间倒序展示，`unskipped` 事件显示为"取消跳过"
**关键性质**: **名单判据不重新实现**——直接复用 `homework.py` 的 `merge_states`/`state_of`。**跳过不再是"从查询结果排除"，是"标记后仍可见、可撤销"**——MVP 与进阶版首个上线版本都把跳过的人整个从 `items` 里过滤掉，上线后用户直接反馈"看不到跳过的是谁、想反悔也没入口"；改为查询里不过滤，`skipped` 字段逐行标出，配一个仅追加的 `unskipped` 事件类型撤销，`nudge_events` 仍是纯追加日志，不删除历史行。**"当前是否跳过"必须按最新事件判断，不是"是否出现过"**——独立代码评审在这条修订刚合入时就抓到：`count_nudge`（侧边栏徽标）沿用了旧的"存在一条 skipped 事件"判断，取消跳过后这个人永久从徽标漏计；同一评审还抓到 CSV 导出用了未过滤的 `people`，导出内容会混进已跳过的人，与"导出内容与当前名单一致"这条 spec 矛盾——两处都是同一类疏漏：新增"可见但不算作未交"这个中间态后，所有读这份人数据的地方都要重新过一遍，不能假设旧代码的排除/包含逻辑还成立。**详情面板的草稿状态不下放到父组件**——状态活在 `DetailPanel` 自己身上，靠 `key={studentEmail}` 触发的重新挂载天然复位，模板切换时的"是否已编辑"用字符串相等比较（当前草稿 === 当前档位默认文案）判断，已编辑过的草稿不会被切 tab 覆盖。**真实发信不能走 SMTP**——Gmail 应用专用密码方案上线后生产实测 `[Errno 101] Network is unreachable`：Render 免费档对出站 SMTP 端口（587/465/25）平台级封锁，换账号、换密码都无解；`email_client.py` 的对外函数签名（`send_email(to, subject, body) -> None`，失败抛 `EmailSendError`）设计成可以整体换实现——真正切换到 Resend 时只改了这一个模块，调用方 `nudge.py` 完全不用动，这条边界划对了才让这次生产事故的修复成本降到最低
**验收标准**: MVP backend 12 项 + frontend 38 项全绿，四组评审 96/80、100/80、98.4/70、96/80。进阶版 backend 20+ 项 + frontend 24+ 项全绿，四组评审 96/80、99/70、99/70、99/80；上线后修订与独立 code review 各自额外发现 1 处真实缺陷（进度指示体验/跳过不可见、count_nudge 漏计+CSV 导出泄漏），均已 RED 测试复现后修复。真实发信 backend 20+ 项（含 SMTP→Resend 切换后的重写用例）+ frontend 28 项全绿，三组评审 99/80、98/80、99/80；生产环境用临时测试学员端到端验证过 Resend 真实送达（201 + 收到邮件），验证完即归档该测试学员

> **本能力不提供**（MVP 明确排除，见 proposal Out of Scope）：真实发信通道（Gmail OAuth / 微信自动发送）、多套文案模板/语气切换、导出名单 CSV、批量勾选发送、完整互动记录能力（人工录入 1:1 沟通、参与度信号导入）。
