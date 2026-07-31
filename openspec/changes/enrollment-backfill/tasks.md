## 1. 来源加第三个值

### Contract
- **Spec**:
  - 报课 SHALL 记录报名日期与来源。来源 SHALL 有三种（`manual` / `platform` / `derived`），
    且它们的区别对将来的平台导入具有约束力：平台导入 SHALL NOT 覆盖 `manual`，
    SHALL 可以覆盖 `derived`。
  - 界面补录的记录 SHALL 标为 `manual`；由既有记录倒推建立的 SHALL 标为 `derived`。
  - 写入请求给出三种之外的来源值时 SHALL 被拒绝。
- **Runtime**: `cd backend && uv run pytest tests/test_enrollments_api.py -q` → expected:
  默认 `manual`、可指定 `derived`、第四种值被拒三条断言通过；既有报课测试无回归
- **Code**:
  - **无 schema 变更** —— `source` 已是 `text` 且没有 CHECK 约束（与 `region`/`level` 同一判断）
  - 取值只在 API 边界挡；**只读响应仍用 `str` 而非 `Literal`** ——
    枚举外的值会让整个列表接口 500 而不是那一行出错
  - 覆盖规则本身不实现（平台导入不存在），只把值与语义定下来
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/enrollment-backfill/contracts/group-1.md with the ### Contract block above
- [ ] 1.1 RED — `POST /api/enrollments` 不给 `source` 时落 `manual`（既有行为，先钉住）
- [ ] 1.2 GREEN — 若已满足则确认并说明；本条防止将来有人改默认值
- [ ] 1.3 RED — 给 `source: "derived"` 时如实落库并在读取时返回
- [ ] 1.4 GREEN — `EnrollmentCreate` 接受 `source`
- [ ] 1.5 RED — 给第四种值（如 `"imported"`）被拒（422）
- [ ] 1.6 GREEN — 边界校验
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 倒推脚本

### Contract
- **Spec**:
  - 由既有记录（如作业成绩）倒推建立的报课 SHALL 标为 `derived`。
  - （脚本本身的行为不入 spec —— 与 `tools/notion-import`、`tools/course-import` 同例，
    一次性程序归 `tools/`。这里的 Spec 只约束它写出来的数据形状。）
- **Runtime**: `cd tools/enrollment-backfill && python -m pytest -q`（或项目既有的 tools 测试方式）
  → expected: 纯函数部分（读 CSV、按 (邮箱, 课程) 去重、别名归一化、日期取最早场次）的单元测试通过
- **Code**:
  - **权威源是 `grades.csv`，不是 Notion** —— Notion 那 19 条作业记录本身是从这些 CSV 生成的衍生数据
  - **课程靠别名查**（`normalize_alias`，与 `tools/course-import` 同一路径），查不到就中止并报告，不猜
  - **`session4` 跳过并说明原因** —— 0 行且表头与 session3 高度重合，`session4 → S4` 无证据
  - `enrolled_at` 取该课程**最早一场**的日期；课程没有任何场次时中止（编一个日期会让记录看起来像今天报的）
  - 未匹配的学员**跳过并只列邮箱**（不列姓名），不自动建档
  - 重跑幂等**靠数据库**：直接写、把 409 归类为"已存在"，不先查再写（TOCTOU 且多一轮往返）
  - dry-run 默认，`--apply` 才写；**不提供 `--undo`**（只在出错时才跑的删除路径本身就是没被测过的危险代码）
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/enrollment-backfill/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — 读一份**虚构的** CSV（虚构姓名 + `@example.com`）：解析出 (邮箱, 课程目录) 列表，
      同一门课的重复提交按邮箱去重
- [ ] 2.2 GREEN — CSV 解析 + 去重（纯函数，不碰网络）
- [ ] 2.3 RED — 别名归一化：`session1` → `s1`；给一份不含该别名的课程表时**中止并报告**，不猜
- [ ] 2.4 GREEN — 别名匹配（复用 `normalize_alias` 的规则）
- [ ] 2.5 RED — `enrolled_at` 取最早一场；课程无场次时中止
- [ ] 2.6 GREEN — 日期推导
- [ ] 2.7 RED — 计划输出：将建 N 条、跳过哪些邮箱、`session4` 不导且带原因
- [ ] 2.8 GREEN — `plan()` 纯函数 + dry-run 打印
- [ ] 2.9 GREEN — `--apply` 写入路径：409 归类为"已存在，跳过"，不失败退出
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 学员详情：逐条改场次与删除

### Contract
- **Spec**:
  - 用户 SHALL 能修改一条已有报课的场次，包括清空它（改回未定场次）；SHALL 能删除一条报课。
    二者 SHALL 都在学员详情里进行。
  - 学员详情的报课区块 SHALL 为每条记录提供修改场次（含清空）与删除的入口。
- **Runtime**: `cd frontend && npm run test` → expected: 改场次/清空/删除三条新测试通过，
  既有 144 项无回归；`npm run build` 与 `npx tsc --noEmit` 通过
- **Code**:
  - 错误状态按**报课 id** 分开存，失败信息渲染在**那一条**上（几条可以各自处于不同状态）
  - 写入期间禁用该条的**所有**出口（含取消）；关闭编辑态只在成功回调里做
  - 测试用**挂住不 resolve 的 promise** 断言 `disabled` —— 只断言最终态对这类回归全盲
  - Server Action 的预期内失败用**返回值**表达，不要抛（生产构建会把抛出的信息抹成 digest）
  - 前端**不参与状态派生**，改完场次后的状态以后端返回为准
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/enrollment-backfill/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — 读 `docs/superpowers/specs/mocks/2026-07-30-enrollment-backfill-mocks.html`
      的「学员详情：每条报课多了两个动作」
- [ ] 3.2 RED — 每条报课有「改场次」与「删除」入口
- [ ] 3.3 GREEN — `EnrollmentRows` 增加两个入口
- [ ] 3.4 RED — 改场次：选一场保存后，该条显示为那一场；**清空**后回到「未定场次」
- [ ] 3.5 GREEN — 行内改场次 + Server Action
- [ ] 3.6 RED — 删除：确认后该条从列表消失
- [ ] 3.7 GREEN — 删除入口（二次确认）
- [ ] 3.8 RED — 写入进行中该条的所有出口被禁用（**挂住不 resolve 的 promise**）；
      失败时说明挂在**那一条**上、其余条不受影响
- [ ] 3.9 GREEN — busy 与按 id 分开的错误状态
- [ ] 3.10 VISUAL DIFF — 起 dev stack，**造一条未定场次的记录**，把它改到某一场再清空回来；
      确认失败信息就近显示（可临时让 action 返回失败）
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 报课总表

### Contract
- **Spec**:
  - 系统 SHALL 提供一处能看到全部报课记录的页面，逐条显示学员、课程、场次（未定时明确标出）、
    报课日期、状态与来源，并 SHALL 支持按课程筛选。该页面 SHALL NOT 提供任何编辑入口。
  - 未指明场次的记录 SHALL 明确显示为"未定场次"，而不是留白。
  - 一条报课都没有时 SHALL 显示说明文案，而不是空白表格。
- **Runtime**: `cd frontend && npm run test` → expected: 总表的列、筛选、未定场次呈现、空态、
  以及「没有编辑入口」五条断言通过；既有测试无回归；`npm run build` 通过
- **Code**:
  - `/enroll` 从占位页改为真实页面 —— `app/(app)/placeholder-routes.test.tsx` 里
    「报课渲染其占位页」那条要跟着改。**红的时候要认出这是计划内的**，不是缺陷
  - **不做**设计稿里的「导入平台数据」按钮与两个徽标（`与平台不一致` / `本地已改`）——
    要有平台数据才有意义，现在挂上去恒为假
  - 只读：不提供任何修改入口。写入仍只在学员详情一处
  - 页面取数与既有页一致（Server Component + `lib/api.ts`），不直连后端
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/enrollment-backfill/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 MOCK — 读 mocks 的「照做 / 不做」与「总表：倒推数据进来之后的样子」
- [ ] 4.2 RED — 总表逐条显示六列；**未定场次显示为"未定场次"而非留白**
- [ ] 4.3 GREEN — `/enroll` 页面 + 表格
- [ ] 4.4 RED — 按课程筛选后只剩该课程的记录，并显示筛选后的条数
- [ ] 4.5 GREEN — 课程筛选
- [ ] 4.6 RED — 一条都没有时显示说明文案
- [ ] 4.7 GREEN — 空态
- [ ] 4.8 RED — 页面**不提供**修改或删除入口（钉住"只读"这条）
- [ ] 4.9 GREEN — 确认无需改动并说明；本条防止将来有人顺手加编辑
- [ ] 4.10 GREEN — 改 `placeholder-routes.test.tsx`：报课不再是占位页
- [ ] 4.11 VISUAL DIFF — 起 dev stack 进 `/enroll`，对着 mocks 比：六列、筛选 chip、
      未定场次的呈现、空态。**造几条未定场次的记录再看** —— 全是有场次的记录看不出这一页的重点
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 验证与上线

- [ ] 5.1 Run backend test suite — `cd backend && uv run pytest`
- [ ] 5.2 Run frontend test suite — `cd frontend && npm run test`；另跑 `npm run build` 与 `npx tsc --noEmit`
- [ ] 5.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e
- [ ] 5.4 Run superpowers:verification-before-completion — 跑 `project.test_commands` 与
      `project.custom_verification_checks`（`console.log` 与密钥泄漏两条）
- [ ] 5.5 上线 —— 无 schema 变更，前后端各自部署，顺序不敏感
- [ ] 5.6 **脚本 dry-run 打生产**：确认将建 22 条、跳过 5 个邮箱、`session4` 不导且带原因。
      **人工确认后**再 `--apply`
- [ ] 5.7 **重跑一次**：新建 0 条、冲突 22 条，不报错退出。这条是幂等的唯一证据
- [ ] 5.8 生产验收 —— `/enroll` 显示 22 条；按课程筛选 S1 = 14、S2 = 8
- [ ] 5.9 生产验收 —— 课程页 S1「另有 14 人未定场次」、S2「另有 8 人未定场次」，
      且两门课的场次卡片上**都不显示**已报人数（全为 0）。
      **这一条最容易被误读成"导入没成功"**，要专门确认
- [ ] 5.10 生产验收 —— 把其中一条改到某一场，确认该场次卡片出现「已报 1 人」、
      课程层的未定场次数减一；改回未定场次复原
