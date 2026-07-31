## 1. 数据层与幂等写接口

### Contract
- **Spec**:
  - 系统 SHALL 为每名学员每门课程最多保存一条作业提交记录。同一份 `grades.csv` 重复同步 SHALL NOT 新增记录，只更新既有记录。
  - 系统 SHALL 把源文件中固定列（姓名、邮件、提交时间、总分、亮点、改进建议、回复状态）之外的所有列，作为该次提交的分项评分整体存下，**保留列名与列的先后顺序**。
  - 新增一门课程（即一套全新的分项列名）SHALL NOT 要求修改数据库结构。
  - 系统 SHALL 原样保存源文件中「总分」列的值，SHALL NOT 由各分项之和推导。
  - 同步接口与同步工具 SHALL 要求调用方显式指定目标课程，并 SHALL 通过既有的课程别名解析。系统 SHALL NOT 从文件路径或目录名推断课程。
  - 同步 SHALL 逐行处理，遇到无法关联的行时跳过该行并继续，最终 SHALL 报出**两份彼此分开**的清单。
  - 第二类（无报课记录）的**成绩仍 SHALL 写入**。
- **Runtime**: `cd backend && pytest tests/test_homework_write.py tests/test_homework_model.py` → expected: 全部通过，无 import 错误；`supabase db reset` 后 migration 干净重放
- **Code**:
  - `scores` 必须是 `jsonb` **数组** `[{"item": …, "score": …}]` —— Postgres 的 `jsonb` 不保证对象键顺序，对象结构会静默丢失分组信息（design 决策 1）
  - 唯一键 `(student_email, course_id)`，**不含** `session_id` —— `enrollment` 已定「作业按人计」（design 决策 2、4）
  - 写接口是幂等 `PUT`，返回体须区分 `created` / `updated` / 两类 `skipped`；分类只有数据库知道，不能推给 CLI（design 决策 3）
  - SQLModel 显式 `None` 会发成 SQL NULL 盖掉列默认值 —— 应用不读不写的列不要映射到模型（CLAUDE.md）
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/homework/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `tests/test_homework_model.py`：断言 `scores` 存入 `[{"item":"A1工作流结构","score":11},{"item":"A2数据传递","score":9},…]` 再读出时**顺序与写入一致**。断言必须比较有序序列，不得比较集合或 dict —— 集合相等的断言对"用了 jsonb 对象"这个缺陷全盲
- [x] 1.2 GREEN — 写 `supabase/migrations/<ts>_create_homework_submissions.sql`（建表 + `unique (student_email, course_id)` + `index (course_id)`）与 `backend/app/models.py` 的 `HomeworkSubmission`；`supabase db reset` 后**重启后端进程**（连接池会全废，按 PID 杀，`pkill -f uvicorn` 在 Windows 上不可靠）
- [x] 1.3 RED — 变异验证：把 `scores` 列改成 `jsonb` 对象形态写入（键为 item 名），确认 1.1 的顺序断言**真的变红**；确认后恢复
- [x] 1.4 RED — `tests/test_homework_write.py`：`PUT /api/homework` 送同一批行两次，第二次响应 `created == 0`、`updated == N`，库中总行数不变
- [x] 1.5 GREEN — `backend/app/routers/homework.py` 的 `PUT`：按 `(student_email, course_id)` upsert；`backend/app/schemas.py` 增 `ScoreItem` / `HomeworkUpsert` / `HomeworkUpsertResult`；`main.py` 注册路由
- [x] 1.6 RED — 总分不重算：送一行「总分 73、分项之和 71」，读回来是 **73**
- [x] 1.7 GREEN — 让 1.6 通过（`total` 直接取请求体，不做任何求和）
- [x] 1.8 RED — 邮箱不在 `students` 表的行：不写入，出现在 `skipped_no_student`，**其余行照常写入**（同一次请求里混着一条好行与一条坏行，断言好行进去了）
- [x] 1.9 RED — 学员存在但该课无报课记录的行：**成绩写入**，且出现在 `skipped_no_enrollment`。两个清单是两个字段，不得合并
- [x] 1.10 GREEN — 实现两类分类与部分写入
- [x] 1.11 RED — 课程别名解析：`course_alias` 查不到时整份请求被拒（4xx）、报出该别名、**一条都不写入**（断言库中行数为 0）
- [x] 1.12 GREEN — 复用既有别名解析路径实现 1.11
- [x] 1.13 RED — 显式 `null` 的拒绝：请求体把 NOT NULL 列显式送 `null` 时被边界挡下（4xx），不是 500。注意 `scores` 送 `[]` 是合法的（一门课可以只有固定列）
- [x] 1.14 GREEN — 在 schema 层加拒绝；按列的可空性分别决定，不要一刀切 `field_validator("*")`（CLAUDE.md：`enrollment-core` 曾因此挡死正常功能）
- [x] 1.15 GREEN — 更新 `backend/tests/conftest.py` 的清表 fixture：`HomeworkSubmission` 排在 `Student` / `Course` **之前**删。漏了的症状是一批与作业毫不相干的测试红在 setup 阶段
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 同步 CLI

### Contract
- **Spec**:
  - 源文件同一门课出现同一学员多行时，系统 SHALL 取**提交时间较晚**的那一行；提交时间相同时 SHALL 取文件中靠后的那一行。
  - 同步接口与同步工具 SHALL 要求调用方显式指定目标课程……SHALL NOT 从文件路径或目录名推断课程。
  - 两份清单 SHALL NOT 合并呈现。
  - 同步工具 SHALL 在任何终端编码下都能完整输出其中文报告，SHALL NOT 因编码错误中止。
- **Runtime**: `cd tools/homework-sync && python -m pytest` → expected: 全部通过；解析层测试不发出任何网络请求
- **Code**:
  - `parsing.py` 是纯函数（csv 文本 → 规范化行 + 消歧 + 分类），零 I/O 零网络；`sync.py` 负责文件、HTTP、渲染（design 决策 7）
  - 消歧规则写在解析层，落库时已是每人一行 —— 交给 upsert 去决定"哪一行赢"会让顺序变成隐式依赖（design 决策 2）
  - `--dry-run` 走完整解析与分类路径，只是不发 `PUT`；报不出两份清单的 dry-run 等于没有 dry-run
  - 输出一律 `sys.stdout.buffer.write(line.encode("utf-8"))`；`sys.stdout.reconfigure` 对已被重定向的流不生效
  - 清理/验收脚本只操作自己刚建的记录，全程按主键定位（CLAUDE.md：`enrollment-backfill` 曾因"第一条"改错用户数据）
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/homework/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `parsing.py` 的表头切分：给一份 S1 形状的表头，返回的固定列与分项列切分正确，且分项列**顺序与表头一致**；再给一份 S2 形状（列数与列名都不同）的，同样正确 —— 断言里不得出现任何硬编码的分项名清单
- [x] 2.2 GREEN — 实现表头切分（固定列白名单：姓名/邮件/提交时间/总分/亮点/改进建议/回复状态；其余按出现顺序即分项）
- [x] 2.3 RED — 消歧：同一邮箱两行、提交时间 06-11 与 06-18 → 只留 06-18 那行
- [x] 2.4 RED — 消歧的并列情形：同一邮箱两行、提交时间**相同** → 留文件中靠后的那一行（用两行不同的总分来分辨取到了哪一条）
- [x] 2.5 GREEN — 实现消歧
- [x] 2.6 RED — `sync.py --dry-run`：不发出任何 HTTP 请求（mock 掉 client 并断言零调用），但报告里**两份清单都在**且各自带计数
- [x] 2.7 GREEN — 实现 `sync.py`：读文件、`--course` 必填、`--dry-run`、渲染报告
- [x] 2.8 RED — 编码：把输出流换成只支持单字节编码的假流，跑一次报告渲染，断言**不抛异常**且内容完整。（这条若在实现之后才补，必须故意把实现改回 `print` 确认它真的变红）
- [x] 2.9 GREEN — 全部输出改走 `sys.stdout.buffer.write(...encode("utf-8"))`
- [x] 2.10 RED — 后端不可达 / 超时：`PUT` 超时时报出可读错误并以非零退出码结束，不静默当成成功（配置 rule：涉及外部 API 的任务必须有超时与异常路径的 RED 测试）
- [x] 2.11 GREEN — 给 HTTP 调用设显式超时并处理异常路径；`raise_for_status`，因为 httpx 不会因 4xx/404 抛异常（CLAUDE.md：`course-list-order` 的清理脚本曾"成功地什么都没做"）
- [x] 2.12 GREEN — 写 `tools/homework-sync/README.md`：怎么跑、`--course` 从哪查、两份清单各自怎么处置
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 读接口：名单、四态、去重与过滤

### Contract
- **Spec**:
  - 作业页某门课的名单 SHALL 由该课程的报课记录派生，并 SHALL 按学员邮箱去重 —— 一名学员在同一门课有多条报课记录时，名单中 SHALL 只出现一次。
  - 已归档学员与已退课的报课记录 SHALL NOT 进入名单，因而不计入任何计数。
  - 名单中每人 SHALL 有且仅有一个状态：已交 / 未交 / 未开放 / 未定场次。
  - 「场次是否已结束」SHALL 与课程页显示的场次状态一致（含人工覆盖的场次状态），SHALL NOT 另行按日期判断。
  - 排名 SHALL 按总分在该课程所有提交中计算，并 SHALL 使用能打破并列的确定性排序。
  - `GET /api/homework` SHALL 在**一次**数据库往返内取全所需数据。
- **Runtime**: `cd backend && pytest tests/test_homework_read.py tests/test_query_roundtrips.py` → expected: 全部通过，且往返断言为 1
- **Code**:
  - 以 `Enrollment` 为驱动表 outer join 作业 —— 反过来会漏掉所有没交的人，而那正是这一页要回答的问题（design 决策 5）
  - 按人合并时状态取最宽容者：已交 > 未开放 > 未定场次 > 未交。必须是**具名函数并单独测到**，否则会被写成"取第一条"而看不出错（design 决策 5 + Risks）
  - 「场次已结束」复用 `routers/courses.py` 的 `derive_session_state`，不得另写日期比较（design 决策 6）
  - 归档与退课在**读接口**过滤，不在同步时过滤 —— 归档可撤销，恢复后成绩不该要求重跑同步才回来（design 决策 8）
  - 只读响应字段用 `str` 不用 `Literal` —— DB 层没有 CHECK 约束时 `Literal` 会让整个列表接口 500（CLAUDE.md）
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/homework/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — 四态：构造四名学员（有提交 / 报了已结束场次无提交 / 报了未来场次无提交 / 无场次无提交），断言各自的状态
- [x] 3.2 GREEN — 实现 `GET /api/homework` 与状态派生；「场次已结束」调 `derive_session_state`
- [x] 3.3 RED — 场次被人工覆盖为已取消时，该学员的状态**不是**按日期算出的「未交」（构造：日期已过 + `state_override` 为已取消）
- [x] 3.4 GREEN — 让 3.3 通过（走 `derive_session_state` 而非裸日期比较即可）
- [x] 3.5 RED — 按人去重：同一学员两条报课（两个场次），名单中只出现 1 次
- [x] 3.6 RED — 合并规则：同一学员两条报课，一条指向已结束场次、一条指向未来场次，且**没有提交** → 状态为「未开放」而非「未交」。这条针对"取第一条"的写法
- [x] 3.7 GREEN — 实现具名的合并函数（不要内联进查询循环）
- [x] 3.8 RED — 已归档学员不进名单也不进任何计数；已退课的报课同理。两者各一个用例
- [x] 3.9 GREEN — 在读接口加过滤
- [x] 3.10 RED — 排名：三名学员总分 90 / 90 / 80，断言两次请求得到的名次与相对顺序**完全相同**（排序键须能打破并列）
- [x] 3.11 GREEN — 实现排名，排序键加入邮箱等可打破并列的字段
- [x] 3.12 RED — 往返次数：在 `tests/test_query_roundtrips.py` 加一条，断言 `GET /api/homework` 的查询数 == 1。先写断言、确认它对朴素实现是红的
- [x] 3.13 GREEN — 合并成单条 JOIN 查询
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 作业页

### Contract
- **Spec**:
  - 作业页 SHALL 按课程组织，逐门课列出名单，并 SHALL 提供「全部 / 已交 / 未交 / 待回复」四个筛选项，各自带计数。
  - 「待回复」SHALL 定义为：已交，且回复状态不等于「已回复」。
  - 回复状态 SHALL 原样取自源文件，系统 SHALL NOT 归一化其取值。
  - 选中名单中的一名学员时，系统 SHALL 显示：总分、该课程内的排名、各分项的**原始分**、亮点、改进建议、回复状态，以及这条记录的来源（源文件名与行号）。
  - 系统 SHALL NOT 显示各分项的满分，SHALL NOT 以满分为基准绘制比例图形。
  - 作业页 SHALL NOT 提供修改、删除、新增或触发同步的入口。
  - 某门课程尚无任何提交记录时，作业页 SHALL 显示说明文字……SHALL NOT 只呈现一个空表格。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，无新增 console 噪声
- **Code**:
  - 表格外框须 `flex-none`：`overflow-hidden`（为圆角）配可压缩 flex 子项会**静默裁掉**内容且哪儿都没有滚动条。S1 有 17 行，够撞上（CLAUDE.md + design Risks）
  - jsdom 没有布局，裁切缺陷单测量不出来 —— 只能钉类名，必须在 VISUAL DIFF 里用足量数据在真实浏览器验一次
  - 页面全只读，`lib/api.ts` 只加 `getHomework`，不加任何写方法（design 非目标）
  - Server Component 的 fetch 必须设显式超时，且短于平台函数执行上限（CLAUDE.md）
  - `vi.clearAllMocks()` 清调用记录但不清实现 —— 用例内显式设定自己依赖的返回值（CLAUDE.md）
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/homework/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 MOCK — 打开 docs/superpowers/specs/mocks/2026-07-31-homework-mocks.html；对照「照做 / 有意不做」两节与「四种状态的呈现」「详情面板」，记下 token（`--color-primary: #9c3417`、`#4c8a63`、`#b3261e`、`#c9c3b6`）与逐字文案（「未交 · 有报课无提交」「未定场次」）。视觉基准是 2026-07-31-course-enrollment-design.dc.html 的 `sc-if isHomework` 分支
- [ ] 4.2 RED — 名单渲染：四种状态各一行，断言状态文案与 `wrapper.classes()` 里的 token 类（未定场次用主色、未交用 danger）
- [ ] 4.3 GREEN — `frontend/app/(app)/homework/` 的名单组件；`lib/api.ts` 增 `getHomework`
- [ ] 4.4 VISUAL DIFF — 起 dev stack（`npm run dev --prefix frontend`），打开 /homework，对照 mock 校 token、颜色与文案；**用 S1 的全量数据（17 行）** 确认最后一行够得着、滚动条在该在的地方
- [ ] 4.5 RED — 筛选：「未交」筛选后只剩未交的人；「待回复」= 已交且回复状态 ≠「已回复」（构造一条「草稿已创建」断言它**在**待回复里，一条「已回复」断言它**不在**）
- [ ] 4.6 GREEN — 实现四个筛选项与计数
- [ ] 4.7 RED — 回复状态原样显示：源值「草稿已创建」在页面上逐字出现，不被改写
- [ ] 4.8 GREEN — 让 4.7 通过（不建立任何取值映射表）
- [ ] 4.9 MOCK — 打开 mock 的「详情面板」一节；记下分项行的 zebra 斑马纹与「本课第 3 / 17」的排版
- [ ] 4.10 RED — 详情面板：显示总分、排名、各分项原始分、亮点、改进、回复状态、来源行号；断言**不含** `/` 满分写法、不含任何按比例的宽度样式；断言分项中的 `0` 分**照常出现**
- [ ] 4.11 GREEN — 实现详情面板
- [ ] 4.12 VISUAL DIFF — 对照 mock 校详情面板；确认没有条形图、没有 `11 / 15`
- [ ] 4.13 RED — 只读：页面上查不到任何名称匹配 /修改|删除|新增|同步|补录/ 的按钮
- [ ] 4.14 RED — 空态：一门课没有任何提交记录时出现说明文字而非空表格
- [ ] 4.15 GREEN — 实现只读约束与空态
- [ ] 4.16 GREEN — 侧边导航「作业」指向 `/homework` 真实路由；确认外壳的取数仍不阻塞导航（layout 不得变成 async）
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 验证与上线

- [ ] 5.1 Run backend test suite — `cd backend && pytest`，确认无回归（注意：跨过某个测试数阈值才出现的失败先怀疑资源泄漏，engine 应模块级共用）
- [ ] 5.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归；单独跑与全量跑结果需一致（`vi.clearAllMocks` 不清实现）
- [ ] 5.3 Run superpowers:verification-before-completion — 跑 `project.test_commands` 与 `project.custom_verification_checks`（`console.log` 审计 + 前端不得出现后端密钥名）
- [ ] 5.4 上线：先跑 migration，再部署后端，最后部署前端。顺序不能反 —— migration 没跑而后端先上会每个请求 500
- [ ] 5.5 生产同步 dry-run — 对 S1/S2/S3 三份 csv 各跑一次 `--dry-run`，**在真实终端里跑**（本地测试捕获的是内存流，编码问题只在真终端暴露）。核对两份清单的人数
- [ ] 5.6 按第二份清单（无报课记录）补齐报课记录 —— 生产上报课是 S1 = 14 / S2 = 8，而成绩是 17 人 / 9 人。**这一步之前页面只显示 14 / 8 是正确行为，不是缺陷**
- [ ] 5.7 生产正式同步 — 去掉 `--dry-run` 执行三份；核对 `/homework` 的已交计数为 S1 = 17、S2 = 9、S3 = 1（不是 18 —— 18 是行数，其中一人交了两次）
- [ ] 5.8 生产幂等验收 — 三份 csv **再跑一遍**，确认 `created == 0`、页面计数不变
- [ ] 5.9 生产可视验收 — 在真实浏览器打开 /homework，切到 S1（17 行），确认最后一行够得着、切 tab 后外壳不闪。判据要选**只有新构建才有的可观察差异**，不是"页面能打开"；且生产站点密码与本地 `.env.local` 那份不同
