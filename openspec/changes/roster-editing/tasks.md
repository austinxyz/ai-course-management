## 1. 后端：姓名可写 + 非空校验

### Contract
- **Spec**:
  - 系统 SHALL 支持更新已有学员的可编辑字段（**姓名**、微信号、微信名、微信昵称、区域、基础、来源、行业、性别、年龄、备注、标签），更新 SHALL 落库并在页面刷新后依然存在。邮箱 SHALL NOT 可被修改。
  - 姓名 SHALL 在写入前去除首尾空白；去除后为空的姓名 SHALL 被拒绝。该约束 SHALL 同时作用于更新与新增两条路径。
  - 其余可编辑字段 SHALL 允许被清空——清空是合法编辑，不得与姓名一并收紧。
- **Runtime**: `cd backend && pytest` → expected: 既有 34 项全绿，新增姓名相关用例全部通过；无 import 错误
- **Code**:
  - 姓名规则只有一处定义：`StudentName = Annotated[str, AfterValidator(...)]`，`StudentCreate.name` 与 `StudentUpdate.name` 共用。两个 `@field_validator("name")` 各写一遍就是把本 change 要修的那个洞（只拦更新、放过新增）在实现里重造
  - 不得破坏 `StudentUpdate` 的哨兵语义：`None` = "本次请求未提到该字段"（配合 `exclude_unset`），显式 JSON `null` 仍由既有 `@field_validator("*") _reject_explicit_null` 拦下；`AfterValidator` 只在值为 `str` 时运行
  - 校验放 Pydantic 层，**不加 DB CHECK 约束**（约束放在能演进的那一层；本系统只有 FastAPI 访问数据库）
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/roster-editing/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 环境 — 修好后端 venv（`cd backend && uv python install 3.12 && uv sync`；`.venv` 现指向已被删除的 cpython-3.12.13，`uv run` 直接报 `No Python at ...`），确认 `pytest` 可跑、34 项全绿。基础设施任务，无 RED/GREEN
- [x] 1.2 RED — `backend/tests/test_students_write.py`：PATCH 姓名落库（虚构姓名，`@example.com`）
- [x] 1.3 GREEN — `StudentUpdate` 增 `name` 字段，最小实现通过 1.2
- [x] 1.4 RED — 三种输入的区别各一条断言：不带 `name` 键 → 姓名不变；`{"name": null}` → 拒绝；`{"name": "   "}` → 拒绝（422）且库中姓名不变
- [x] 1.5 GREEN — 提取 `StudentName = Annotated[str, AfterValidator(...)]`（trim + 非空），挂到 `StudentUpdate.name`
- [x] 1.6 RED — `backend/tests/test_students_api.py`：POST 新建学员时姓名为空白 → 拒绝且不创建记录
- [x] 1.7 GREEN — `StudentCreate.name` 改用同一个 `StudentName` 别名（不新写 validator）
- [x] 1.8 RED — 姓名首尾空白被 trim 后落库（`"  张三  "` → `"张三"`）；更新姓名不影响备注/标签/微信号；微信号仍可清空为 `""`（证明非空约束没有波及其它字段）
- [x] 1.9 GREEN — 使 1.8 通过（若 1.5 已满足则确认无需改动，并在提交信息里说明）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：姓名编辑入口

### Contract
- **Spec**:
  - 系统 SHALL 支持更新已有学员的可编辑字段（**姓名**、…），更新 SHALL 落库并在页面刷新后依然存在。
  - 姓名 SHALL 在写入前去除首尾空白；去除后为空的姓名 SHALL 被拒绝。
- **Runtime**: `cd frontend && npm run test` → expected: 既有前端用例无回归，新增「姓名字段行可编辑」「保存失败保留输入」「改名后选中态仍是同一邮箱」三类断言通过
- **Code**:
  - 姓名走字段表既有渲染分支（就地编辑 / 保存中 / 失败保留输入），**不为姓名单开一套 UI**；详情面板顶部的姓名是展示位，编辑入口统一在字段表
  - `EditableFieldKey` 增 `"name"`；前后端字段名同为 `name`，无需 camel→snake 映射（对比 `wxName` → `wx_name`）
  - 列表按 `ORDER BY name, email`，改名会让该行移位；选中态以邮箱为键，必须有测试钉住"改名后选中的仍是同一封邮箱"，防止将来被改成按索引选中
- **Threshold**: 70

- [ ] 2.0 CONTRACT — write openspec/changes/roster-editing/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — vitest：详情面板存在「姓名」字段行且可进入编辑态；提交后调用写入通道并携带 `name`
- [ ] 2.2 GREEN — `FIELDS` 首位加 `{ key: "name", label: "姓名", type: "text" }`；`EditableFieldKey` 增 `"name"`
- [ ] 2.3 RED — vitest：姓名保存失败时字段留在编辑态、用户输入不被旧值覆盖（复用既有 `FieldStatus.failed` 机制）
- [ ] 2.4 GREEN — 最小实现通过 2.3
- [ ] 2.5 RED — vitest：改名后选中态仍指向同一封邮箱（不因列表重排而跳到别人身上）
- [ ] 2.6 GREEN — 使 2.5 通过（若既有实现已以邮箱为键则确认无需改动并说明）
- [ ] 2.7 VISUAL DIFF — 起 dev stack（`npm run dev --prefix frontend`），打开学员详情面板，肉眼确认姓名行与其余字段行同构（间距/字号/编辑图标一致），改一条记录的姓名确认落库与重排。**无 mock 可比**——本 change 的 mocks 是 stub（`HAS_UI_SURFACE: no`），比对基准是相邻字段行本身
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：检索范围扩至 5 字段

### Contract
- **Spec**:
  - 名单页的检索 SHALL 匹配姓名、邮箱、微信昵称、微信名、微信号五个字段，任一字段包含查询串即视为命中，匹配 SHALL 大小写不敏感。检索 SHALL NOT 匹配标签与备注。
  - 检索是**人工对齐时的辨认辅助**，SHALL NOT 被实现为按微信昵称自动关联、自动去重或自动建档的逻辑。
- **Runtime**: `cd frontend && npm run test` → expected: 五字段命中、大小写不敏感、备注/标签不命中，全部通过；既有「按姓名/邮箱搜索」用例无回归
- **Code**:
  - 实现形态限定为 `hay.some(v => v.toLowerCase().includes(q))`，`q` 已 trim + 小写。**不做**模糊匹配、拼音、相似度排序——那会把「辨认辅助」变成「自动猜人是谁」，而微信昵称不能作为标识（`docs/requirements.md` §5，CLAUDE.md 同款禁令，design 规则里是 BLOCK 级）
  - 不纳入 `region`/`level`/`source`（已有独立筛选器，纳入后结果难以解释）；不纳入备注（大段 Demo Day 文案会让噪音压过信号）
  - 已知边缘：`nick`/`wxName` 未采集时默认值是 `—`，查询串 `—` 会命中所有未采集者，**有意不特殊处理**
- **Threshold**: 80

- [ ] 3.0 CONTRACT — write openspec/changes/roster-editing/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 RED — vitest：按 `nick` 片段、`wxName` 片段、`wechat` 片段各命中一条；大小写不一致仍命中
- [ ] 3.2 RED — vitest：查询串只出现在备注或标签中时**不**命中；按姓名/邮箱搜索仍命中（回归保护）
- [ ] 3.3 GREEN — 改 `StudentsClient.tsx` 的筛选 `useMemo`，五字段 `some(...includes)`
- [ ] 3.4 RED — vitest：检索框 placeholder 为 `搜索姓名 / 邮箱 / 微信`（verbatim 字符串，用户知道"能搜昵称"的唯一途径）
- [ ] 3.5 GREEN — 改 `FilterBar.tsx` 的 placeholder
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 前端：词表搬迁与删除合成 ID

### Contract
- **Spec**: N/A — 重构组，无对应 SHALL。约束来自 requirements Goals 第 3、4 条（词表脱离 `mock-data` 这个名字；删掉合成的「学员 ID」行）与 Success Criteria 12、13
- **Runtime**: `cd frontend && npm run test` → expected: 前端全套用例无回归；另需 `npm run build --prefix frontend` 通过（漏改 import 会在编译期暴露，这是本组最主要的失败模式）
- **Code**:
  - 用 `git mv mock-data.ts vocab.ts`，让 diff 呈现为 rename 而非"新增 145 行 + 删除 145 行"，review 时能一眼确认内容未变；同一提交里只改 import 语句
  - **搬迁与删除分两个提交**：搬迁是"内容不变、位置变"，删除是"内容变"。混在一起一旦 UI 出问题，分不清是搬错了还是删多了
  - `sid` 三处一起删（`FIELDS` 那行、`DetailPanel.tsx:82` 的合成、`:159` 的三元分支）；它是唯一 `type: "ro"` 字段，删后 `:228`/`:241` 的 `ro` 分支成为死代码，一并删除。`EditableFieldKeyLike` 收缩为 `keyof Student`，顺势收紧 `as unknown as Record<string, string>` 逃逸转型
  - 在 `TZ_BY_REGION` 上方加注释指明 `backend/app/schemas.py` 有同源副本、两边需同步——本 change 不统一，但必须留线索
- **Threshold**: 70

- [ ] 4.0 CONTRACT — write openspec/changes/roster-editing/contracts/group-4.md with the ### Contract block above
- [ ] 4.1 搬迁 — `git mv frontend/app/students/mock-data.ts frontend/app/students/vocab.ts`，更新全部 import（`StudentsClient` / `FilterBar` / `DetailPanel` / `NewStudentModal` / `StudentsTable` / `Sidebar` / `PlaceholderPage` 及各测试文件），加 `TZ_BY_REGION` 重复说明注释。**只移动不改内容**，`npm run build` + 前端测试全绿即为通过；单独提交
- [ ] 4.2 RED — vitest：详情面板**不**渲染标签为「学员 ID」的字段行（当前会渲染，因此此测试先失败）
- [ ] 4.3 GREEN — 删 `FIELDS` 里的 `sid` 行、`DetailPanel` 里合成 `sid` 的代码与三元分支、死掉的 `ro` 分支；`EditableFieldKeyLike` 收缩为 `keyof Student`；单独提交
- [ ] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 验证与上线

- [ ] 5.1 Run backend test suite — `cd backend && pytest`，确认无回归
- [ ] 5.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 5.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e。已有 `frontend/e2e/production-acceptance.spec.ts` 可选跑；跑的话注意按钮文案定位器与冷启动超时那两个坑
- [ ] 5.4 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑 `project.custom_verification_checks`（含前端不得出现 `NEXT_PUBLIC_(BACKEND|SITE_PASSWORD|…)` 那条）
- [ ] 5.5 生产验收（无 schema 变更，无需 migration）——部署顺序若分两次则**先后端**，否则前端提交 `{"name": ...}` 会被后端当未知字段。挑一条带 `Phase1导入` 标签的记录：**先记下原名**（系统不留痕，改错无第二处可查）→ 改名 → 刷新确认落库 → 改回原名 → 刷新确认
- [ ] 5.6 生产验收 — 用某位学员的微信昵称片段在检索框搜索，确认命中
