## 1. 导航改成路由（只动既有代码，不加功能）

### Contract
- **Spec**:
  - 侧栏 SHALL 提供 `课程` 入口并指向课程页；该入口 SHALL NOT 再是占位页。`报课` SHALL 仍为占位页（不属于本能力）。
- **Runtime**: `cd frontend && npm run test` → expected: 既有 58 项无回归；`StudentsClient` 不再持有 `view` state 后相关测试改到新形状仍全绿；另需 `npm run build --prefix frontend` 通过
- **Code**:
  - 现状侧栏是 `onNavigate → setView`，整站只有 `/students` 一个数据页。课程页做成 `StudentsClient` 的分支会让该组件同时持有两套数据，且打开学员名单要顺带查课程表
  - `Sidebar` props 从 `(view, onNavigate)` 变为 `(active)`；`<button onClick>` 改 `next/link`；占位页从 `StudentsClient` 分支变成各自路由（`/enroll`、`/homework`、`/nudge`、`/interactions`）
  - 本组**只改导航、不加功能**，单独提交，让回归面看得清
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/course-catalog/contracts/group-1.md with the ### Contract block above
- [x] 1.1 RED — vitest：`Sidebar` 渲染的是链接（`role="link"` 且 href 指向对应路由），当前实现是 button，因此先红
- [x] 1.2 GREEN — `Sidebar` 改 `next/link`，props 收为 `(active: NavKey, studentCount)`
- [x] 1.3 RED — vitest：`/enroll` 等占位路由各自渲染 `PlaceholderPage`（新增路由文件前先红）
- [x] 1.4 GREEN — 新增 `app/(placeholder)/enroll|homework|nudge|interactions/page.tsx`，复用 `PlaceholderPage`；`StudentsClient` 删掉 `view` state 与占位分支
- [x] 1.5 修既有测试 — `StudentsClient.test.tsx` / `.write.test.tsx` / `.search.test.tsx` 里凡断言过 `view` 切换或侧栏 button 的，改到新形状；跑全套确认无回归
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. schema 与只读接口

### Contract
- **Spec**:
  - 系统 SHALL 支持新建与编辑课程。课程名 SHALL 为必填；简称、一句话定位、课程介绍、每场时长、作业题目 SHALL 可为空并可事后补填。课程 SHALL 以与课程名、简称都无关的独立标识为主键，使课程名与简称都可以被修改而不影响任何引用。
  - 别名 SHALL 在**全库**唯一——同一别名 SHALL NOT 同时指向两门课。唯一性与匹配 SHALL 按「去首尾空白后转小写」判定。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_model.py -q` → expected: 建表、外键、别名唯一约束、级联删除各自的断言全绿；`supabase db reset` 后 migration 可重放
- **Code**:
  - `course_aliases` 的主键就是归一化后的别名 → 全局唯一由结构保证，不靠应用层先查再写（与 `students` 的 `lower(email)` 唯一索引同源）
  - `raw` 单独存，界面显示用户原样写法，匹配只看 `alias`
  - 场次存 `local_date` / `local_time` / `tz`，**不存固定 UTC 偏移**；派生的绝对时刻不入库
  - 纯新增三张表，不改 `students`；回滚是人工 `drop table course_sessions, course_aliases, courses;`
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/course-catalog/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `backend/tests/test_courses_model.py`：三张表可插入、`course_aliases` 同一归一化别名二次插入被拒、删除课程级联删除其别名与场次（表不存在，先红）
- [x] 2.2 GREEN — 写 `supabase/migrations/<ts>_create_courses.sql` 三张表 + 外键 + 主键；`supabase db reset` 重放后**重启后端进程**（连接池会全废、进程仍在监听）
- [x] 2.3 GREEN — `backend/app/models.py` 增 `Course` / `CourseAlias` / `CourseSession`
- [x] 2.4 RED — `backend/tests/test_courses_api.py`：`GET /api/courses` 返回课程数组，每条带别名与场次；空库返回 `[]` 而非 404/500
- [x] 2.5 GREEN — `backend/app/routers/courses.py` 只读端点 + 挂载到 `main.py`；响应枚举字段用 `str` 不用 `Literal`（响应上用 `Literal` 会让一行脏数据 500 掉整个列表）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 后端：课程写入与别名唯一

### Contract
- **Spec**:
  - 课程名 SHALL 为必填。系统 SHALL NOT 提供课程删除；停止招生通过「已下线」表达，历史数据 SHALL 保留。
  - 课程 SHALL 可挂任意多个平台别名。别名 SHALL 在全库唯一。唯一性与匹配 SHALL 按「去首尾空白后转小写」判定，使 `S1`、`s1`、` S1 ` 视为同一别名。
  - 课程名的修改 SHALL NOT 自动修改别名。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_write.py -q` → expected: 创建/编辑/空名拒绝/别名占用拒绝/大小写去重/删除别名，全部通过；无删除课程的端点
- **Code**:
  - 课程名校验复用 `roster-editing` 立下的形状：`Annotated[str, AfterValidator(trim+非空)]` 类型别名，创建与更新共用（只拦一边等于留洞）
  - 写请求体的枚举用 Pydantic `Literal`，只读响应用 `str`
  - 别名冲突返回 409 并带上占用它的课程标识，让界面能引导过去；**不覆盖**已有别名的 `raw`（先到先得）
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/course-catalog/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — `POST /api/courses` 只填课程名可建；空白课程名（`"   "`）被拒 422 且不创建
- [ ] 3.2 GREEN — `CourseCreate` / `CourseUpdate` + 端点，课程名走共享 validator
- [ ] 3.3 RED — `PATCH /api/courses/{id}` 部分更新；未提及的字段不变；显式 `null` 被拒
- [ ] 3.4 GREEN — 最小实现通过 3.3（沿用 `exclude_unset` 哨兵语义）
- [ ] 3.5 RED — 别名：添加 `S1` 成功；再添加 ` s1 ` 视为重复不新增第二条；把已属于另一门课的别名加过来返回 409 且原课程别名集合不变；删除别名只影响该条
- [ ] 3.6 GREEN — 别名端点 + 归一化函数（trim + lower），冲突走 409
- [ ] 3.7 RED — 不存在删除课程的端点（`DELETE /api/courses/{id}` 返回 405/404），且已下线课程仍出现在列表里
- [ ] 3.8 GREEN — 上下架用 `PATCH` 的 `offline` 字段；确认没有实现删除
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 后端：场次、状态派生与时区换算

### Contract
- **Spec**:
  - 每场 SHALL 记录上课日期、上课时间、讲师、状态与备注。日期、时间、讲师 SHALL 为必填，备注 SHALL 可空。讲师 SHALL 按场次各自记录。
  - 场次时间 SHALL 以「美西本地日期 + 美西本地时间 + IANA 时区名」存储，SHALL NOT 存固定的 UTC 偏移小时数。
  - 场次状态 SHALL 默认由上课日期与**美西当天**比较得出：未到为 `pending`，已过为 `done`。系统 SHALL 允许人工覆盖状态（含 `cancelled`），并 SHALL 允许清除覆盖以恢复跟随日期。判定「今天」SHALL 依据 `America/Los_Angeles` 的当前日期。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_sessions.py -q` → expected: 必填校验、按日期排序、状态三态与恢复跟随、`starts_at` 的夏令时断言（10 月与 12 月两场同为美西 19:30，上海分别为次日 10:30 / 11:30）全绿
- **Code**:
  - 「墙上时间 + 时区名 → 绝对时刻」用 Python `zoneinfo` 在**读取时**算，返回 `starts_at`；不入库，因为时区规则会变、墙上时间才是意图
  - 状态派生：`state_override` 非空则用它，否则比 `local_date` 与 `datetime.now(ZoneInfo("America/Los_Angeles")).date()`；响应同时给 `state` 与 `state_is_override`
  - **取"今天"的函数要单独可替换**（如 `_today_pt()`），测试注入固定日期；直接用真实当天写死断言的测试会在某天突然变红
  - 验夏令时只能拿亚洲时区比 —— 美西与美东同日切换，PT↔ET 恒为 3 小时，那条断言必然通过、证明不了任何事
- **Threshold**: 80

- [ ] 4.0 CONTRACT — write openspec/changes/course-catalog/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 RED — 新增场次：日期/时间/讲师齐全可建；缺任一被拒；备注可空；同课程多场可各自不同讲师
- [ ] 4.2 GREEN — `SessionCreate` + 端点
- [ ] 4.3 RED — 列表按 `local_date` 升序（乱序创建后断言顺序）
- [ ] 4.4 GREEN — 查询加 `order_by`（无 `ORDER BY` 时 `UPDATE` 会把改过的行写到堆尾，这个坑在 roster-editing 踩过）
- [ ] 4.5 RED — `starts_at` 的夏令时断言：两场同填 `19:30`，一场 2026-10-15、一场 2026-12-15；断言其 UTC 时刻分别对应上海次日 10:30 与 11:30，且两场的美西墙上时间都仍是 `19:30`
- [ ] 4.6 GREEN — 用 `zoneinfo` 在响应里算 `starts_at`
- [ ] 4.7 RED — 状态派生：未到为 `pending`、已过为 `done`、覆盖为 `cancelled` 且 `state_is_override` 为真、清除覆盖后回到跟随；另一条：注入"美西还没跨日但服务器已跨日"的今天，断言仍为 `pending`
- [ ] 4.8 GREEN — 派生逻辑 + `_today_pt()` 可替换
- [ ] 4.9 RED — 修改与删除场次；删除后同课程其余场次不受影响
- [ ] 4.10 GREEN — `PATCH` / `DELETE` 端点
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 前端：课程页（列表、详情、场次与时区行）

### Contract
- **Spec**:
  - 侧栏 SHALL 提供 `课程` 入口并指向课程页。
  - 场次列表按上课日期升序呈现；界面 SHALL 为每场给出其它时区的对应时间，换算 SHALL 使用 IANA 时区名。
  - 某门课还没有任何场次时，界面 SHALL 说明「还没有排课」，并说明排课后该课才会出现在报课的场次选项里。
  - 已下线课程 SHALL 仍出现在课程页并带有可见标记。
- **Runtime**: `cd frontend && npm run test` → expected: 课程列表/详情渲染、时区行格式化（10 月与 12 月两场的上海行不同）、空场次说明、已下线标记，全部通过；既有测试无回归
- **Code**:
  - 前端只把后端给的 `starts_at` 用 `Intl.DateTimeFormat({ timeZone })` 格式化 —— 不在 JS 里做"墙上时间→时刻"的反向换算（那需要试探偏移再迭代，是本 change 最容易写错的一段）
  - 客户端组件只渲染 props，不持有数据副本（`student-write` 立下的规矩：本地副本会让页面显示从未写入的东西）
  - 状态 Badge 映射 `pending → success` / `done → muted` / `cancelled → danger`（取自设计脚本，不要把「待上」改成灰色）
- **Threshold**: 70

- [ ] 5.0 CONTRACT — write openspec/changes/course-catalog/contracts/group-5.md with the ### Contract block above
- [ ] 5.1 MOCK — 读 `docs/superpowers/specs/mocks/2026-07-29-course-catalog-mocks.html`：记下课程页的 verbatim 文案与 token 映射；视觉基准是 `.dc.html` 的 `sc-if isCourses` 分支
- [ ] 5.2 RED — vitest：课程页渲染课程列表与选中课程的详情（名称、一句话定位、介绍、别名、「这门课」事实行、作业题目）
- [ ] 5.3 GREEN — `app/courses/page.tsx`（Server Component 取数）+ `CoursesClient.tsx`
- [ ] 5.4 RED — vitest：场次行显示各时区对应时间，且 2026-10-15 与 2026-12-15 两场（同为美西 19:30）的上海行分别是次日 10:30 与 11:30
- [ ] 5.5 GREEN — `frontend/lib/tz.ts` 格式化 + 场次行渲染
- [ ] 5.6 RED — vitest：无场次时显示「还没有排课。加一个上课时间后，这门课才会出现在报课的场次选项里。」；已下线课程带 `已下线` Badge
- [ ] 5.7 GREEN — 空态与下线标记
- [ ] 5.8 VISUAL DIFF — 起 dev stack（`npm run dev --prefix frontend`），进 `/courses`，对着 `.dc.html` 在线版的课程页比：卡片间距、别名 chip、事实行、场次行两行结构、状态 Badge 颜色。修文案与 token 漂移
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 前端：课程弹窗与场次编辑

### Contract
- **Spec**:
  - 系统 SHALL 支持新建与编辑课程。课程名 SHALL 为必填；其余字段可事后补填。简称为空时 SHALL 显示 `—`。
  - 界面 SHALL 提示「课程名改了要同步平台别名」，但 SHALL NOT 代替用户改动别名。
  - 用户编辑一场状态为「已上」的场次时，界面 SHALL 先呈现警示文案。
  - 讲师的可选项 SHALL 由已有场次的讲师去重得出，并 SHALL 允许当场录入新的讲师名。
- **Runtime**: `cd frontend && npm run test` → expected: 弹窗必填校验、别名添加/占用提示、改名提示、场次行内编辑（含已上场次的警示）、讲师选项去重与新增，全部通过
- **Code**:
  - 写操作走 Server Actions，每个 action 内部独立校验站点密码（不押注 `proxy.ts` 单点）
  - 预期内的失败（别名被占用、课程名为空）用**返回值**表达，不要抛异常 —— 生产构建会把 Server Action 抛出的错误信息抹成 digest，客户端拿不到内容
  - 场次行内编辑沿用学员详情面板那套：保存中降透明度、失败就近提示并保留用户输入
- **Threshold**: 70

- [ ] 6.0 CONTRACT — write openspec/changes/course-catalog/contracts/group-6.md with the ### Contract block above
- [ ] 6.1 MOCK — 读 mocks 导览的「课程弹窗」与「场次编辑态」两节，记下 verbatim 文案（含两段说明文案与 placeholder）
- [ ] 6.2 RED — vitest：新建课程只填课程名可提交；空白课程名提交被拦且给出提示
- [ ] 6.3 GREEN — `CourseModal.tsx` + `actions.ts` 的创建/更新
- [ ] 6.4 RED — vitest：编辑态修改课程名时出现「课程名改了要同步平台别名」提示；别名列表未被自动修改
- [ ] 6.5 GREEN — 提示与别名区块
- [ ] 6.6 RED — vitest：添加已被占用的别名时显示占用提示（**断言走返回值路径**，不是抛异常）
- [ ] 6.7 GREEN — 别名添加/删除 + 409 的返回值处理
- [ ] 6.8 RED — vitest：场次行内编辑；编辑一场 `done` 的场次时先出现「这一场已经上过…」警示；讲师选项来自已有场次去重且可新增
- [ ] 6.9 GREEN — `SessionRows.tsx` 行内编辑与新增一场表单
- [ ] 6.10 VISUAL DIFF — 起 dev stack，对着 `.dc.html` 比课程弹窗与场次编辑态：字段分组、副文案位置、chip 选中态、警示条样式
- [ ] 6.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-6.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 7. 验证与上线

- [ ] 7.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 7.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归；另跑 `npm run build`
- [ ] 7.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e
- [ ] 7.4 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑 `project.custom_verification_checks`
- [ ] 7.5 上线顺序 —— **DB → 后端 → 前端**。push 后先确认 `.github/workflows/db-migrate.yml` 的 migration 跑绿，再验收页面；表不存在时后端能正常启动但接口 500，前端会整页错误态
- [ ] 7.6 生产验收 —— 建一门真实课程 + 至少两场，其中一场排在 11 月之后；刷新确认落库；确认该场的亚洲时区行与 11 月前那场相差 1 小时
- [ ] 7.7 生产验收 —— 给该课程加别名 `S1`（`grades.csv` 现用写法），为下一个 change 的导入匹配做准备
