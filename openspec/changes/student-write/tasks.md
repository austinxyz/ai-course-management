## 1. Schema + 后端写端点

### Contract
- **Spec**: 系统 SHALL 支持更新已有学员的可编辑字段，更新 SHALL 落库；邮箱 SHALL NOT 可被修改。后端 SHALL 校验写请求中区域、基础、来源三个字段的取值落在既定枚举内，非法值 SHALL 被拒绝；该校验 SHALL 只作用于请求体，不得施加于读取响应。系统 SHALL 支持新增学员。系统 SHALL 支持将学员归档与恢复；归档是软删除，记录及其关联数据 SHALL 保留；归档时间 SHALL 由服务端记录，SHALL NOT 由客户端提供。
- **Runtime**: `cd backend && uv run pytest tests/test_students_write.py -v` → expected: 全部通过，覆盖 部分字段更新、拒绝改邮箱、非法枚举被拒、清空备注与不改备注可区分、新增、邮箱冲突（在读/已归档各一）、归档、恢复、归档时间由服务端盖
- **Code**: design.md 决策 #3（归档走独立端点，字段更新端点不接受归档字段）、#4（`archived_at` 可空，既有行为 null，否则无法迁移）、#5（`Literal` 只用于请求体，读响应仍用 `str`——读响应用 `Literal` 会因一行脏数据整个接口 500）、#6（部分更新必须区分"未提供"与"显式设为空"，否则清空备注会失效）
- **Threshold**: 80

- [ ] 1.0 CONTRACT — write openspec/changes/student-write/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [ ] 1.1 RED — pytest：新建 `tests/test_students_write.py`，断言 `PATCH /api/students/{email}` 只提交 `{"wechat": "..."}` 时该字段更新、其余字段不变（端点尚不存在，应 404/405）
- [ ] 1.2 GREEN — 新增 migration `alter table students add column archived_at timestamptz`（可空）；`models.py` 加字段；实现字段更新端点，接受部分字段
- [ ] 1.3 RED — pytest：补三条——请求体含 `email` 时不得改写主键；`region` 传非法值（如 `"火星"`）被 4xx 拒绝且库中值不变；**备注显式设为空字符串会清空，而请求体不含备注时保持原值**（区分"未提供"与"设为空"）
- [ ] 1.4 GREEN — 补齐实现使 1.3 转绿；枚举用 `schemas.py` 里既有但此前未启用的 `Region`/`Level`/`Source` 别名
- [ ] 1.5 RED — pytest：`POST /api/students` 新增成功；邮箱与**在读**学员重复 → 冲突；邮箱与**已归档**学员重复 → 冲突且**已有记录字段未被覆盖、也未被自动恢复**
- [ ] 1.6 GREEN — 实现新增端点与两种冲突的区分
- [ ] 1.7 RED — pytest：归档端点使该学员 `archived_at` 非空；恢复端点使其回到 null 且**全部字段与归档前逐项相同**；请求体携带归档时间时该值被忽略、实际记录服务端时间
- [ ] 1.8 GREEN — 实现归档/恢复独立端点；时间由服务端生成
- [ ] 1.9 RED — pytest：读端点 `GET /api/students` 默认只返回未归档学员，且需能取到已归档列表（前端的"在读/已归档"切换依赖此）
- [ ] 1.10 GREEN — 调整读端点以支持按归档状态筛选，保持既有响应字段契约不变
- [ ] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. Server Actions + 写入面鉴权

### Contract
- **Spec**: 每个写入入口 SHALL 独立校验凭据，SHALL NOT 仅依赖页面层的访问控制。未携带有效凭据的写请求 SHALL 被拒绝且 SHALL NOT 改变任何数据。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 通过，含 无凭据调用 Action 被拒、有凭据放行、Action 调后端时带上 `X-Backend-Secret` 三组断言
- **Code**: design.md 决策 #2 —— 凭据比对逻辑与 `proxy.ts` **共用同一个函数**，避免两处实现漂移；Server Action 内通过 `headers()` 读 `Authorization`。**双向风险**：matcher 没覆盖 Action 的 POST 且 Action 内不校验 → 写入面裸奔；浏览器不在 Action 请求上带凭据 → 所有写操作全挂。两个方向都必须实测排除
- **Threshold**: 80

- [ ] 2.0 CONTRACT — write openspec/changes/student-write/contracts/group-2.md with the ### Contract block above
- [ ] 2.1 RED — vitest：把 `proxy.ts` 里的凭据比对抽成共用函数并直接测它（正确/错误/变量缺失三种），确认抽取后 `proxy.test.ts` 既有断言仍全绿
- [ ] 2.2 GREEN — 抽出共用比对函数，`proxy.ts` 改为调用它
- [ ] 2.3 RED — vitest：新建 `frontend/app/students/actions.test.ts`，mock `headers()` 返回不含 `Authorization` 的请求头，断言 Server Action 抛错/拒绝且**未调用后端**（Action 尚不存在，应失败）
- [ ] 2.4 GREEN — 新建 `frontend/app/students/actions.ts`（`"use server"`），实现字段更新/新增/归档/恢复四个 Action，每个开头调用共用鉴权，通过后经 `lib/api.ts` 调后端，末尾 `revalidatePath`
- [ ] 2.5 RED — vitest：断言带**正确**凭据时 Action 放行并确实调用了后端（防止鉴权写成"永远拒绝"——那是 fail-closed 但功能全挂）
- [ ] 2.6 GREEN — 补齐实现使 2.5 转绿
- [ ] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 前端接线：删本地状态 + 保存中/失败态

### Contract
- **Spec**: 更新 SHALL 落库并在页面刷新后依然存在（字段、标签、备注）。新增记录 SHALL 落库并出现在名单中；邮箱属于已归档学员时 SHALL NOT 自动恢复或覆盖。归档后 SHALL 从在读名单消失、恢复后字段与归档前一致。界面 SHALL 在写入进行中给出可见的进行中状态，并在失败时给出失败提示；失败时 SHALL 保留用户已输入的内容，SHALL NOT 回退为旧值。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 通过，含 保存中状态渲染、失败时输入被保留、失败提示就近显示 三组断言
- **Code**: design.md 决策 #1（删除 `over`/`added`/`archived` 三块本地状态与 `applyOverride`，服务端成为唯一真相源；保留的本地状态仅为纯 UI 态）、#7（保存中/失败是 per-field 而非全局）。**回归风险**：筛选、选中、在读/已归档切换、新增弹窗都读这些被删的状态，改动面远大于"加几个写接口"
- **Threshold**: 70

- [ ] 3.0 CONTRACT — write openspec/changes/student-write/contracts/group-3.md with the ### Contract block above
- [ ] 3.1 MOCK — open docs/superpowers/specs/mocks/2026-07-29-student-write-mocks.html；记录四种状态的结构与 token：保存中（值变淡 + 行尾转子，**只锁那一行**）、保存失败（输入框留编辑态、`border-danger`、下方 `text-danger` 提示 + "重试"）、邮箱已归档（`bg-danger-surface` + `border-danger-border` 横幅 + "前往「已归档」"按钮）、归档进行中（按钮禁用并改字）
- [ ] 3.2 RED — vitest：`StudentsClient` 传入一个正在保存的字段状态，断言该字段呈现进行中态、**其余字段不被禁用**（防止实现成整块面板遮罩）
- [ ] 3.3 GREEN — 删除 `over`/`added`/`archived` 与 `applyOverride`，改为直接使用 props；新增 per-field 的保存中/失败状态；接上 Server Actions
- [ ] 3.4 RED — vitest：模拟某字段保存失败，断言失败提示出现在该字段附近，且**输入框里仍是用户刚输入的值**（不得回退为旧值——这是 mock 里标为最关键的一条）
- [ ] 3.5 GREEN — 补齐失败处理使 3.4 转绿
- [ ] 3.6 RED — vitest：新增学员时后端返回"邮箱属于已归档学员"，断言界面显示对应横幅且**不自动恢复**
- [ ] 3.7 GREEN — 补齐新增冲突处理
- [ ] 3.8 回归验证 —— 起本地栈，逐项确认删除本地状态后既有交互未坏：搜索、标签筛选、来源筛选、微信对齐三态、在读/已归档切换、点行联动详情面板、新增弹窗开关
- [ ] 3.9 VISUAL DIFF — 起本地栈，逐一触发四种状态（可临时让后端返回错误以触发失败态），与 mock 比对配色、文案、布局；修正偏差
- [ ] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 部署与验收

<!-- No Contract/EVAL block for this group — verification-and-ship group runs cross-cutting checks, not per-feature harness evaluation -->

**含 manual-ops：** 4.6 的清理需直连数据库（硬删除不是本系统功能）。
**生产库刻意为空**，因此写功能的生产验收需专门建一条虚构记录，验完清除。

- [ ] 4.1 本地 `supabase db reset` 验证 migration + seed 组合可用，`archived_at` 列存在且既有行为 null
- [ ] 4.2 部署后验收 —— **未携带凭据直接 POST 到 Server Action 入口 → 被拒绝，且数据库数据未变**（design 决策 #2 的核心风险之一：写入面裸奔）
- [ ] 4.3 部署后验收 —— **带正常凭据从界面写入能成功**（同一决策的反方向风险：鉴权过严导致所有写操作全挂）
- [ ] 4.4 生产验收 —— 新建虚构测试记录 `deploy-test@example.com`，依次执行 编辑一个字段 → 打标签 → 归档 → 恢复，**每步刷新页面确认真正落库**
- [ ] 4.5 生产验收 —— 用同一邮箱再次新增，确认得到"该邮箱已存在"提示且未产生重复记录
- [ ] 4.6 **[人工]** 直连生产数据库删除该测试记录（`DELETE FROM students WHERE email = 'deploy-test@example.com'`），确认生产库回到空表
- [ ] 4.7 Run backend test suite — `cd backend && uv run pytest`，确认无回归
- [ ] 4.8 Run frontend test suite — `cd frontend && npm run test`，确认无回归
- [ ] 4.9 Run superpowers:verification-before-completion — 跑 `project.test_commands`；`grep -rn 'console.log' frontend/app frontend/lib`；跑 `project.custom_verification_checks`；确认仓库内无真实凭证
