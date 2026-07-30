## 1. 后端：课程按最近开课排序

### Contract
- **Spec**:
  - `GET /api/courses` SHALL 按「该课程最早一场的上课日期」**倒序**返回课程——最近开课的在前。一门课有多场时，排序键 SHALL 取**最早**那一场。
  - **还没有任何场次的课程 SHALL 排在最前。**
  - 顺序 SHALL 稳定：排序键相同时以课程名、再以课程标识兜底，使反复请求与任何一次写入之后的相对顺序都不变。
  - 排序 SHALL 由服务端决定并体现在响应顺序里；客户端 SHALL NOT 自行重排。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_api.py -q` → expected: 倒序、多场取最早、未排课优先、写入后顺序不抖，四条断言通过；既有 97 项无回归
- **Code**:
  - 排序在应用层做（键是子集合的聚合值 `min(local_date)`，端点已把场次取回内存归拢；课程个位数）。课程上百时再推到 SQL，届时与 N+1 一起处理
  - 倒序用**反转键**而非 `sorted(reverse=True)` —— 后者会把名称兜底也反过来，同日两门课的顺序就与"名称升序"相反
  - 未排课优先用**分组位**（`0` / `1`）而非哨兵日期；哨兵值总有一天会与真实数据撞上，且泄漏到别处极难查
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/course-list-order/contracts/group-1.md with the ### Contract block above
- [x] 1.1 RED — `test_courses_api.py`：三门课第一场分别在 5/6/7 月 → 顺序为 7、6、5 月（当前按名字排，先红）
- [x] 1.2 RED — 一门课有 5 月与 12 月两场时按 **5 月**参与排序（用最早那场，不是最后一场）
- [x] 1.3 RED — 没有任何场次的课程排在最前
- [x] 1.4 RED — **顺序不因写入而抖动**：两门排序键相同的课，编辑其中一门后再查，相对顺序不变。用真实 `PATCH` 触发，不是连查两次 —— 学员名单那个 bug 恰恰是 `UPDATE` 之后才显形
- [x] 1.5 GREEN — `list_courses` 换成三段排序键（分组位 + 反转日期 + 名称 + id）
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 前端：课程页改回左右两栏

### Contract
- **Spec**:
  - 排序 SHALL 由服务端决定并体现在响应顺序里；客户端 SHALL NOT 自行重排——每个客户端各自决定的顺序不成其为顺序。
  - （布局本身不入 spec：视觉基准是设计稿，验收靠 mocks 导览 + VISUAL DIFF）
- **Runtime**: `cd frontend && npm run test` → expected: 课程列表按 props 顺序渲染且前端无排序调用、左栏可定位，既有 105 项无回归；`npm run build` 通过
- **Code**:
  - 只改容器，不重画内容：外层 `flex` + `overflow-hidden`，左栏 `w-[264px] flex-none border-r overflow-y-auto`，右侧 `flex-1 min-w-0 overflow-y-auto`
  - **`min-w-0` 不能省** —— flex 子项默认 `min-width:auto`，长课程名会撑开右栏、挤扁左栏。四门短名字的课看不出来
  - 颜色用 token（`border-border` / `bg-surface-muted` / `bg-surface`），不写设计稿里的十六进制值
  - 前端仍然不排序：只要它可以重排，"最近开课在前"就只是某个客户端的看法
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/course-list-order/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — 读 `docs/superpowers/specs/mocks/2026-07-30-course-list-order-mocks.html`：记下左栏宽度/边框/滚动行为，以及「上次漂移成了什么样」那一节
- [x] 2.2 RED — vitest：课程列表按 props 给的顺序渲染（传入乱序数组，断言 DOM 顺序与之一致）—— 钉住"前端不重排"
- [x] 2.3 GREEN — 若已满足则确认无需改动并说明；本条的价值是防止将来有人在前端加 `sort`
- [x] 2.4 RED — vitest：课程列表位于一个可独立滚动的左栏容器内（可用 `aria-label="课程列表"` 定位），且详情不在该容器内
- [x] 2.5 GREEN — 改成左右两栏容器，课程列表移入左栏
- [x] 2.6 VISUAL DIFF — 起 dev stack 进 `/courses`，对着 `.dc.html` 的 `isCourses` 分支比：左栏宽度、分隔线、两侧各自滚动。**不要只看四门课** —— 把窗口压窄或临时多造几门，确认左栏内部滚动而不是把详情往下推（上次就是"四门课看着挺好"让漂移过了关）
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 验证与上线

- [ ] 3.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 3.2 Run frontend test suite — `cd frontend && npm run test`；另跑 `npm run build`
- [ ] 3.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e
- [ ] 3.4 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑 `project.custom_verification_checks`
- [ ] 3.5 上线 —— 无 schema 变更，前后端各自部署，顺序不敏感
- [ ] 3.6 生产验收 —— 四门课顺序为 S4（7/26）→ S3（7/19）→ S2（7/12）→ S1（6/28）
- [ ] 3.7 生产验收 —— 页面为左右两栏，与设计稿一致
