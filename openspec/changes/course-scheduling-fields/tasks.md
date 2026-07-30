## 1. 后端：时长改分钟 + 课程默认时区

### Contract
- **Spec**:
  - **每场时长 SHALL 以分钟存储**，取值范围 15–600。SHALL NOT 限制为整小时——真实课程的时长是 150 分钟，整小时表达不了。
  - 课程 SHALL 有一个默认时区（IANA 时区名）。该默认值 SHALL 仅用于新增场次时的预选，SHALL NOT 回溯改变任何已有场次的时区。
- **Runtime**: `cd backend && uv run pytest -q` → expected: 分钟边界（150 可存、0/负数/601 被拒）、migration 回填正确（`hours=2` → `120`）、默认时区可设且非法 IANA 名被拒，全部通过；既有 84 项无回归
- **Code**:
  - `hours` → `duration_minutes` 是**替换不并存**：migration 内 `add column` → `update ... hours * 60` → `drop column`。两个来源必然有一天不一致
  - 回填用 `hours * 60` 而非直接给默认值 —— migration 要能在任何一份数据上正确重放，不只是当前生产那一条
  - `default_tz` 复用既有 `TimezoneName` 校验器（zoneinfo 认得的键才收）；DB 默认留 `America/Los_Angeles`，不写入某个用户的排课习惯
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/course-scheduling-fields/contracts/group-1.md with the ### Contract block above
- [ ] 1.1 RED — `backend/tests/test_courses_write.py`：课程时长设为 150 落库并回显；0 / -1 / 601 被拒 422 且库中值不变（当前列是 `hours` 且限 1–4，因此先红）
- [ ] 1.2 GREEN — migration：`courses` 加 `duration_minutes int not null default 120`、回填 `hours * 60`、删 `hours`；`supabase db reset` 后**重启后端进程**（连接池会全废、进程仍在监听）
- [ ] 1.3 GREEN — `models.py` / `schemas.py` 字段改名与校验（15–600），`CourseRead` 同步
- [ ] 1.4 RED — `backend/tests/test_courses_model.py`：migration 回填正确性 —— 直接插入一条并断言默认值为 120；另断言表上**不再有** `hours` 列
- [ ] 1.5 GREEN — 使 1.4 通过（若 1.2 已满足则确认无需改动并在提交信息里说明）
- [ ] 1.6 RED — 课程可设 `default_tz`；设为 `America/New_York` 后回显；设为 `Mars/Olympus` 或空串被拒（创建与更新两条路径各一条断言）
- [ ] 1.7 GREEN — `courses.default_tz` 列 + schema 字段（复用 `TimezoneName`）
- [ ] 1.8 RED — 改课程 `default_tz` **不改变**已有场次的 `tz` 与 `starts_at`
- [ ] 1.9 GREEN — 确认实现满足 1.8（`default_tz` 只被新增表单读取，后端不做任何回溯写入）
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 后端：按任意时区录入的场次换算正确

### Contract
- **Spec**:
  - 场次时间 SHALL 以「本地日期 + 本地时间 + IANA 时区名」存储，SHALL NOT 存固定的 UTC 偏移小时数。该时区 SHALL 由录入时指定，缺省取课程默认时区。
  - 换算基准 SHALL 是该场次自己的时区，SHALL NOT 是某个写死的时区。
- **Runtime**: `cd backend && uv run pytest tests/test_courses_sessions.py -q` → expected: 以美东 20:30、2026-07-31 建的场次，其 `starts_at` 对应美西 17:30 同日、上海 08:30 次日；既有的美西 10 月/12 月断言不回退
- **Code**:
  - `starts_at` 已由 `zoneinfo` 在读取时算，本组只需确认它对**非美西**的 `tz` 同样成立 —— 换言之这组主要是补断言，实现可能已经满足
  - 断言**必须写死日期**：同样是美东 20:30，12 月那场的上海行是 09:30 次日。不锁日期的断言会在换季后自己变红
  - 时区名校验在创建与更新两条路径都要生效（group 4 已加，本组确认不回退）
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/course-scheduling-fields/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — `test_courses_sessions.py`：以 `tz=America/New_York`、`2026-07-31 20:30` 建一场，断言其 `starts_at` 换算到美西是同日 17:30、到上海是次日 08:30
- [ ] 2.2 GREEN — 使 2.1 通过（若既有实现已满足，明确记录"无需改动"并说明为什么这条断言仍有价值：它钉住的是"基准是场次自己的 tz"）
- [ ] 2.3 RED — 新增场次时不传 `tz`，落库取的是**课程的 `default_tz`** 而非 schema 写死的美西
- [ ] 2.4 GREEN — 新增场次的 `tz` 缺省从所属课程取
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端：时长输入、默认时区、场次时区选择

### Contract
- **Spec**:
  - 新增或编辑场次时，用户 SHALL 能指定该场次按哪个时区录入；界面上的时间标签 SHALL 跟随所选时区，使录入者不必自行把时间换算到某个固定时区。未指定时 SHALL 取课程的默认时区。
  - 每场时长 SHALL 以分钟存储，取值范围 15–600。
  - 课程默认时区 SHALL 仅用于新增场次时的预选，SHALL NOT 回溯改变任何已有场次。
- **Runtime**: `cd frontend && npm run test` → expected: 时长输入落到 `duration_minutes`、超范围被拦、课程默认时区 chip、新增场次预选课程默认时区、编辑场次预选**该场自己的**时区、标签跟随所选值，全部通过；既有 92 项无回归；`npm run build` 通过
- **Code**:
  - 时区 chip 直接用 `lib/tz.ts` 的 `ZONE_ROWS`，**不新建第二份清单** —— 两份会漂移成"能选但换算行里没有"
  - 编辑既有场次时 chip 初始值必须是**该场次自己的 `tz`**，不是课程默认。取错会让打开一个旧场次再保存就静默改掉它的时区（时间看着没变，实际差三小时）
  - 时长用数字输入不用 chip：chip 一旦不够用就退化成"选个最接近的"，那正是这次要修的毛病
  - 文案改动见 mocks 导览：`时间（美西）` → 跟随所选、`时间按美西填` → `按所选时区填`、`上课时间统一按美西记` → `默认时区可在下方设定`
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/course-scheduling-fields/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — 读 `docs/superpowers/specs/mocks/2026-07-30-course-scheduling-fields-mocks.html`：记下两处偏离设计稿的地方与新文案；视觉基准仍是 `.dc.html` 的 `isCourses` / `showCourse` 分支
- [ ] 3.2 RED — vitest：课程弹窗的时长是输入框，填 150 提交后 `updateCourseAction` 收到 `duration_minutes: 150`；填 0 被拦并给出提示
- [ ] 3.3 GREEN — `CourseModal` 时长输入 + 前端范围检查；`types.ts` 字段改名
- [ ] 3.4 RED — vitest：课程弹窗有默认时区 chip，选美东后提交带 `default_tz: "America/New_York"`
- [ ] 3.5 GREEN — 默认时区 chip（取自 `ZONE_ROWS`）
- [ ] 3.6 RED — vitest：课程默认时区为美东时，打开「+ 添加上课时间」预选美东且标签为 `时间（美东）`；把 chip 切到美西后标签变 `时间（美西）`，提交带 `tz: "America/Los_Angeles"`
- [ ] 3.7 GREEN — 新增场次表单的时区 chip 与跟随标签
- [ ] 3.8 RED — vitest：编辑一场 `tz=America/Los_Angeles` 的既有场次（课程默认是美东），chip 初始选中**美西**；不改时区直接保存，提交的 `tz` 仍是美西
- [ ] 3.9 GREEN — 编辑态时区 chip 初始值取场次自己的 `tz`
- [ ] 3.10 RED — vitest：课程详情的「这门课」事实行显示 `150 分钟`
- [ ] 3.11 GREEN — 事实行改为分钟
- [ ] 3.12 VISUAL DIFF — 起 dev stack，进 `/courses`：确认时长输入、默认时区 chip、新增场次的时区 chip 与标签跟随；建一场美东 20:30 的场次，肉眼确认美西行 17:30 同日、上海行 08:30 次日
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证与上线

- [ ] 4.1 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 4.2 Run frontend test suite — `cd frontend && npm run test`；另跑 `npm run build`
- [ ] 4.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e
- [ ] 4.4 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑 `project.custom_verification_checks`
- [ ] 4.5 上线顺序 —— **DB → 后端 → 前端**。push 后先确认 `.github/workflows/db-migrate.yml` 绿再验收页面（`duration_minutes` 不存在时后端 500、前端整页错误态）
- [ ] 4.6 生产验收 —— 生产那门课的时长显示为分钟且与 migration 前等价（`2 小时` → `120 分钟`）
- [ ] 4.7 生产验收 —— 在生产按**美东** 20:30 建一场（日期 2026-07-31），刷新确认美西行 17:30 同日、上海行 08:30 次日。这一场随后会被导入脚本的真实场次取代，或由人删除
