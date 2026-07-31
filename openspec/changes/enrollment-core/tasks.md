## 1. 表与约束

### Contract
- **Spec**:
  - 系统 SHALL 以「学员 × 课程」记录一条报课，并 SHALL 允许指明该学员上哪一场；
    场次 SHALL 可以为空。报课 SHALL 记录报名日期与来源。
  - 系统 SHALL 拒绝为同一 (学员, 课程) 建立**第二条**未指明场次的报课记录。
    (学员, 课程, 场次) 三者相同的记录 SHALL 同样被拒绝。
    这道约束必须由数据库结构保证，不能只在应用层判断。
- **Runtime**: `cd backend && uv run pytest tests/test_enrollments_api.py -q` → expected:
  唯一性四条断言通过（同场次重复被拒、未定场次重复被拒、不同场次并存、不同学员并存）
- **Code**:
  - 存**外键**（`students.email` / `courses.id` / 可空 `course_sessions.id`），不存课程名 ——
    课程名可改，存名字会把历史报课改坏
  - **两条唯一索引，各带 `where`**：`session_id is not null` 一条、`session_id is null` 一条。
    单一索引在 `NULL != NULL` 下会"收下但不冲突"——索引建了却没挡住
  - `session_id` **故意不写 `on delete cascade / set null`**：级联静默带走报课，
    置空静默把人推进待跟进。DB 默认 `no action` 恰好就是拒绝，与应用层守卫一致
  - `source` 列现在就建（只写 `manual`），切片 2 不该改表结构
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/enrollment-core/contracts/group-1.md with the ### Contract block above
- [x] 1.1 RED — `test_enrollments_api.py`：为同一 (学员, 课程, 场次) 建第二条被拒（表不存在，先红）
- [x] 1.2 GREEN — migration 建 `enrollments` 表 + 两条 partial unique index；`models.py` 映射
      （`created_at` 之类应用不读写的列**不要映射** —— SQLModel 会把显式 `None` 发成 SQL NULL 盖掉 DB 默认值）
- [x] 1.3 RED — 同一 (学员, 课程) 的**第二条未定场次**记录被拒。
      **这条必须真实插入两次**，不能只断言索引存在 —— `NULL != NULL` 正是"索引建了但没挡住"的静默失败
- [x] 1.4 GREEN — 若 1.3 已通过，说明 partial index 生效；若没通过，修索引条件
- [x] 1.5 RED — 不同场次的两条报课并存（重听同一门课的场景）
- [x] 1.6 GREEN — 确认无需改动或修正索引条件
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 报课接口与状态派生

### Contract
- **Spec**:
  - 系统 SHALL 只存储两种报课状态：报名与退课。「已完成」SHALL NOT 入库，
    SHALL 在读取时由所属场次派生：无场次或场次未到 → 报名；场次已上 → 已完成；
    场次已取消 → 报名。退课 SHALL 显示为退课，不参与派生，且 SHALL 可以改回报名。
  - 用户 SHALL 通过改这条报课的场次（或清空场次）表达补课，系统 SHALL NOT 提供独立的状态覆盖。
  - 系统 SHALL 同时提供「标记退课」与「删除这条报课」两种动作，二者语义不同。
  - 已下线课程 SHALL NOT 出现在补录选项里；已存在的相关报课 SHALL 照常显示。
- **Runtime**: `cd backend && uv run pytest tests/test_enrollments_api.py -q` → expected:
  派生五态（无场次/未到/已上/已取消/退课）与写入路径（补录、改场次、退课、恢复、删除）全部通过
- **Code**:
  - 派生**复用场次自己的 state**（它已经是派生的：`state_override` 为空即跟随日期，
    "今天"取 `America/Los_Angeles`），不要另算一遍日期 —— 两处各算必然在某个边界分叉
  - 只读响应字段用 `str` 而非 `Literal` —— DB 层没有 CHECK 约束时，
    枚举外的值会让整个列表接口 500 而不是那一行出错
  - `StudentUpdate` 那类哨兵语义：客户端显式传 `null` 要在边界上挡住
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/enrollment-core/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — 派生：场次已上时 `state == "completed"`，而库里存的仍是 `enrolled`
- [x] 2.2 GREEN — `GET /api/enrollments`（可按学员筛选），派生 `state` 复用场次 state
- [x] 2.3 RED — 派生的另外四态：无场次、场次未到、场次**已取消**、退课压倒派生
- [x] 2.4 GREEN — 补齐派生分支
- [x] 2.5 RED — 写入路径：补录一条（含可选字段）、改场次到未来那场后 `state` 变回 `enrolled`、
      清空场次同理、标退课、退课改回报名、删除记录
- [x] 2.6 GREEN — `POST/PATCH/DELETE /api/enrollments`
- [x] 2.7 RED — 补录到已下线课程被拒绝；但既有的、指向已下线课程的报课照常返回
- [x] 2.8 GREEN — 补录时校验课程未下线
- [x] 2.F1 FIX — 校验 `session_id` 属于该报课的课程（POST 与 PATCH 两处）；
      DB 层表达不了（外键管不到 course_id），只能在边界上挡
- [x] 2.F2 FIX — `EnrollmentUpdate` 对 `status`/`enrolled_at`/`note` 拒绝显式 null
      （沿用 `SessionUpdate` 的 `_reject_explicit_null`）；`session_id` **不在**其列，
      它可空且显式 null 是合法的"清空场次"
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 计数与场次删除守卫

### Contract
- **Spec**:
  - 某场次的已报人数 SHALL 为指向该 (课程, 场次) 且状态不是退课的报课条数。
    学员是否已归档 SHALL NOT 影响该计数。
  - 有人报名的场次 SHALL 显示其已报人数；**无人报名时 SHALL 不显示该数字**。
    课程 SHALL 另外呈现"未定场次"的人数，为零时 SHALL 不显示。
  - **删除场次 SHALL 在有报课记录指向该场次时被拒绝**，并告知有多少条挡着。
    退课的报课记录 SHALL 同样阻止删除。
  - 一门课的报课**人数** SHALL 按学员去重。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_api.py tests/test_enrollments_api.py -q`
  → expected: 计数（退课减一、归档不减、去重人数）与删除守卫（409 + 条数、退课记录同样挡住）通过；
  既有课程测试无回归
- **Code**:
  - 计数在 `GET /api/courses` 同一次请求里聚合（场次已经取回内存归拢过，避免 N+1），
    不新开端点；"未定场次人数"按 `course_id` 聚合 `session_id is null`
  - 409 的 `detail` 要带**条数**，前端 `describeDetail()` 已能渲染
  - 归档学员**不排除**在计数外 —— 排除会让历史数字随今天的操作被改写
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/enrollment-core/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — `test_courses_api.py`：场次带 `enrolled_count`，退课的不计入
- [x] 3.2 GREEN — `GET /api/courses` 聚合每场人数
- [x] 3.3 RED — **归档学员后该场人数不变**（这条钉住"归档≠退课"）
- [x] 3.4 GREEN — 确认聚合不过滤归档学员
- [x] 3.5 RED — 课程带 `undecided_count`（未定场次且未退课的条数）；以及报课**人数**按学员去重
- [x] 3.6 GREEN — 补两个聚合
- [x] 3.7 RED — 删除有报课的场次返回 409 且 detail 含条数；**只有退课记录时同样 409**
- [x] 3.8 GREEN — 场次删除守卫
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 前端：学员详情的报课区块与补录

### Contract
- **Spec**:
  - 学员详情 SHALL 列出该学员的全部报课记录，每条 SHALL 显示课程、场次（未定时明确标出）、
    报名日期与当前状态。SHALL 提供「补录报课」入口。没有任何报课时 SHALL 明确说明，而不是留空。
  - 归档确认 SHALL 告知该学员当前有多少条报课记录。
- **Runtime**: `cd frontend && npm run test` → expected: 报课区块与补录弹窗的新测试通过，
  既有 122 项无回归；`npm run build` 与 `npx tsc --noEmit` 通过
- **Code**:
  - **新建路径要把所有字段都送出去**（`student-write` 的 pitfall：只送必填字段，
    其余被静默丢弃且后端有默认值所以不报错）；前后端字段名映射要核对
  - 前端**不参与状态派生**，只渲染后端给的 `state`
  - 写入失败按对象分开存错误、关闭只在成功回调里做、写入期间禁用所有出口（含取消）
  - Server Action 的预期内失败用**返回值**表达，不要抛 —— 生产构建会把抛出的信息抹成 digest
- **Threshold**: 70

- [x] 4.0 CONTRACT — write openspec/changes/enrollment-core/contracts/group-4.md with the ### Contract block above
- [x] 4.1 MOCK — 读 `docs/superpowers/specs/mocks/2026-07-30-enrollment-core-mocks.html`
      的「学员详情里的报课区块」与末尾「验收时最容易漏的两条」
- [x] 4.2 RED — 报课区块逐条显示课程/场次/日期/状态；**未定场次显示为"未定场次"而非留白**
- [x] 4.3 GREEN — `DetailPanel` 新增报课区块
- [x] 4.4 RED — 没有报课时显示说明文案而非空白
- [x] 4.5 GREEN — 空态
- [x] 4.6 RED — 补录弹窗：**填了可选字段（场次、备注）时它们确实出现在提交载荷里**
      （不是只断言"提交成功"—— 那分辨不出字段被丢掉）
- [x] 4.7 GREEN — 补录弹窗 + Server Action
- [x] 4.8 RED — 写入进行中所有出口被禁用（用**挂住不 resolve 的 promise** 断言 `disabled`）
- [x] 4.9 GREEN — busy 态
- [x] 4.10 RED — 归档确认里出现报课条数
- [x] 4.11 GREEN — 归档确认补上条数
- [x] 4.12 VISUAL DIFF — 起 dev stack 进 `/students`，对着 mocks 比：区块位置、未定场次的呈现、
      补录弹窗字段。**造一条未定场次的记录**再看 —— 只有指明场次的记录看不出这条
- [x] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 前端：课程页的人数与删除守卫提示

### Contract
- **Spec**:
  - 有人报名的场次 SHALL 显示其已报人数；无人报名时 SHALL 不显示该数字。
    课程 SHALL 另外呈现"未定场次"的人数，为零时 SHALL 不显示。
  - 删除有报课的场次 SHALL 被拒绝，界面 SHALL 说明有多少条报课挡着。
- **Runtime**: `cd frontend && npm run test` → expected: 人数显示三态（有人/无人/未定场次）
  与删除被拒的错误呈现通过，既有测试无回归；`npm run build` 通过
- **Code**:
  - **错误必须渲染在触发它的那一行**（场次行内），不能塞进课程弹窗的 state ——
    行内删除时弹窗是关着的，塞进去等于什么都不显示（`course-catalog` group 6 被 BLOCK 两次的形状）
  - 错误状态按**场次 id** 分开存
  - 零值不显示：无人报名的场次不出现数字，未定场次为零不出现提示
- **Threshold**: 70

- [x] 5.0 CONTRACT — write openspec/changes/enrollment-core/contracts/group-5.md with the ### Contract block above
- [x] 5.1 MOCK — 读 mocks 的「课程页：两个数字，都在零时消失」与「删除场次被拒绝时，错误显示在哪」
- [x] 5.2 RED — 有人报名的场次显示人数；**无人报名的场次不出现该数字**
- [x] 5.3 GREEN — `SessionRows` 显示人数
- [x] 5.4 RED — 课程层显示"另有 N 人未定场次"；为零时不显示
- [x] 5.5 GREEN — 课程层提示
- [x] 5.6 RED — 删除被拒时错误**渲染在该场次行内**，且课程弹窗关闭时仍可见
- [x] 5.7 GREEN — 行内错误呈现，按场次 id 分开存
- [x] 5.8 VISUAL DIFF — 对着 mocks 比：两个数字的零值行为、错误信息的位置。
      **必须在课程弹窗关闭的状态下触发一次删除失败** —— 弹窗开着时看不出这个缺陷
- [ ] 5.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-5.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 6. 验证与上线

- [ ] 6.1 Run backend test suite — `cd backend && uv run pytest`
- [ ] 6.2 Run frontend test suite — `cd frontend && npm run test`；另跑 `npm run build` 与 `npx tsc --noEmit`
- [ ] 6.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e
- [ ] 6.4 Run superpowers:verification-before-completion — 跑 `project.test_commands` 与
      `project.custom_verification_checks`（`console.log` 与密钥泄漏两条）
- [ ] 6.5 上线 —— **后端先**（新端点 + 删除守卫），前端后。中间态"后端能拒绝删除、前端还没有报课区块"无害。
      migration 是新建表，无回填
- [ ] 6.6 生产验收 —— 给一名真实学员补录一条报课（虚构测试数据除外，这里用真实学员），
      学员详情与课程页两处数字一致；**补录时填上可选字段**并确认它们落库
- [ ] 6.7 生产验收 —— 删除一个有报课的场次被拒绝且提示条数正确；随后把该报课删掉，场次可正常删除
- [ ] 6.8 生产验收 —— 清理：把验收过程中建的报课记录删掉（报课有删除入口，用它）
