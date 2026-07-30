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
- docs/superpowers/specs/2026-07-30-course-page-boundaries-requirements.md（课程页的加载态与错误态）
**设计基准**: docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html（`sc-if isCourses` 与 `showCourse` 两个分支）

**后台**: 三张表 —— `courses`（独立 uuid 主键，课程名与简称都可改）、`course_aliases`（**主键就是归一化后的别名**，全库唯一由结构保证 + CHECK 约束兜底绕过 API 的直写）、`course_sessions`（`local_date` + `local_time` + **该场自己的** IANA `tz`，**无 UTC 偏移列**）；FastAPI `GET /api/courses`（课程+别名+场次一次取全，内存归拢避免 N+1）、`GET /api/courses/teachers`（场次讲师去重）；课程带 `duration_minutes`（分钟，15–600，**不是整小时** —— 真实课程 150 分钟）与 `default_tz`（新增场次的预选时区，不回溯已有场次）；课程与场次的 POST/PATCH/DELETE、别名增删、`POST .../sessions/{id}/follow-date`（清除状态覆盖是动作而非 PATCH null）
**前台**: `frontend/app/(app)/courses/`（独立路由；侧栏从 `setView` 改为 `next/link`，占位页各自成路由）；`CoursesClient` 只渲染 props、不留数据副本；`CourseModal` 新建/编辑 + 别名增删；`SessionRows` 行内编辑、新增一场、讲师 chip 可当场新增、**时区 chip（取自 `ZONE_ROWS`，与换算行同一份来源）**且时间标签跟随所选时区；`lib/tz.ts` **只做格式化**
**关键性质**: 场次时间存墙上时间、绝对时刻读取时用 `zoneinfo` 派生（时区规则会变，墙上时间才是讲师的意图）；状态 = 派生 + 可覆盖三态（`state_override` 为 null 即"跟随日期"），"今天"取 `America/Los_Angeles` 而非服务器时区；课程无删除，只有上架/已下线
**验收标准**: 两场同为「美西 19:30」、分别在 10 月与 12 月时，**上海行为 10:30 次日 / 11:30 次日**；以**美东** 20:30 录入的 2026-07-31 一场，美西行 17:30 同日、上海行 08:30 次日（换算基准是该场自己的时区）（美东两场都是 22:30——美国两地同日切换，拿它比验不出任何东西）；场次写入失败就近显示、失败保留用户输入；生产已建真实课程与两场并通过上述断言

> **本能力不提供**：报课（场次卡片上的「已报 N 人」因此**不显示**，而不是显示 0）、作业评分维度（课程上只有"作业题目"一条元数据）、讲师实体（讲师是场次上的字符串）、批量排课、课程删除。
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
