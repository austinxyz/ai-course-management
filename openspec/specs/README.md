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
**覆盖需求**: docs/superpowers/specs/2026-07-29-course-catalog-requirements.md
**设计基准**: docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html（`sc-if isCourses` 与 `showCourse` 两个分支）

**后台**: 三张表 —— `courses`（独立 uuid 主键，课程名与简称都可改）、`course_aliases`（**主键就是归一化后的别名**，全库唯一由结构保证 + CHECK 约束兜底绕过 API 的直写）、`course_sessions`（`local_date` + `local_time` + IANA `tz`，**无 UTC 偏移列**）；FastAPI `GET /api/courses`（课程+别名+场次一次取全，内存归拢避免 N+1）、`GET /api/courses/teachers`（场次讲师去重）、课程与场次的 POST/PATCH/DELETE、别名增删、`POST .../sessions/{id}/follow-date`（清除状态覆盖是动作而非 PATCH null）
**前台**: `frontend/app/courses/`（独立路由；侧栏从 `setView` 改为 `next/link`，占位页各自成路由）；`CoursesClient` 只渲染 props、不留数据副本；`CourseModal` 新建/编辑 + 别名增删；`SessionRows` 行内编辑、新增一场、讲师 chip 可当场新增；`lib/tz.ts` **只做格式化**
**关键性质**: 场次时间存墙上时间、绝对时刻读取时用 `zoneinfo` 派生（时区规则会变，墙上时间才是讲师的意图）；状态 = 派生 + 可覆盖三态（`state_override` 为 null 即"跟随日期"），"今天"取 `America/Los_Angeles` 而非服务器时区；课程无删除，只有上架/已下线
**验收标准**: 两场同为「美西 19:30」、分别在 10 月与 12 月时，**上海行为 10:30 次日 / 11:30 次日**（美东两场都是 22:30——美国两地同日切换，拿它比验不出任何东西）；场次写入失败就近显示、失败保留用户输入；生产已建真实课程与两场并通过上述断言

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

> ⚠️ **仍未解除的护栏**：CLAUDE.md 与 README 中"不得导入真实学员数据"的警告**依然有效**。
> 认证虽已工作，但解除护栏是一次单独、明确的决定（见该 change 的 requirements Open Questions），
> 不随本能力自动失效。生产库目前仍为空表。
>
> **本能力不提供**：每人一身份（无法单独吊销某人、互动记录无法区分录入者）、限流（安全性依赖密码长度）、登出。
