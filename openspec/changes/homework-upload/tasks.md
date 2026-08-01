## 1. 解析层迁入后端 + 解码

### Contract
- **Spec**:
  - 系统 SHALL 先按 UTF-8 严格解码上传内容；失败时 SHALL 尝试 GB18030；两者皆失败 SHALL 拒绝该文件并 SHALL NOT 写入任何数据。
  - 预览 SHALL **始终**显示实际采用的编码，包括判定为 UTF-8 时。
  - 系统 SHALL 按**内容**判断上传是否可用（能否解码、能否解析出必需的列），SHALL NOT 以文件扩展名作为接受或拒绝的依据。
  - 必需列缺失时的错误说明 SHALL 让用户能判断"可能传错文件了"。
- **Runtime**: `cd backend && pytest tests/test_homework_parsing.py` → expected: 全部通过（含从 tools/ 搬来的既有用例），无 import 错误
- **Code**:
  - 解码在**后端**、拿到的必须是**原始字节** —— 在 Next 侧 `file.text()` 读成字符串的话，浏览器已按 UTF-8 解过一遍，GBK 文件到这里已经是替换字符，后端再想试 GB18030 已无字节可试（design 决策 1、2）
  - `utf-8-sig` 而非 `utf-8`：Excel 存的 UTF-8 带 BOM，不剥掉第一个列名会变成 `﻿姓名`，而错误信息会说"表头缺少必需的列"，指向完全不相干的方向
  - 顺序不能反：GB18030 几乎能解开任何字节序列，先试它会把 UTF-8 中文静默解成乱码而不报错
  - `tools/homework-sync/README.md` 里的教训随目录删除前要移进模块 docstring（design 决策 6）
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/homework-upload/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 GREEN — 把 `tools/homework-sync/parsing.py` 搬到 `backend/app/homework_parsing.py`，`test_parsing.py` 搬到 `backend/tests/test_homework_parsing.py`；只改 import 路径，逻辑一行不动；跑一遍确认既有 18 个用例仍绿（搬迁不是新行为，所以没有 RED 前置）
- [x] 1.2 RED — 解码：构造一份**真正的 GB18030 字节序列**（`"…".encode("gb18030")`，不是构造 str 再 encode 回来做往返），断言 `decode_csv(raw)` 返回正确中文且报出 `encoding == "gb18030"`
- [x] 1.3 RED — UTF-8 的字节断言 `encoding == "utf-8"`。只断言"内容对"不够：GB18030 会把 UTF-8 中文解成**另一批中文字**，人眼才分得出，而测试分不出
- [x] 1.4 RED — 带 BOM 的 UTF-8：第一个列名是 `姓名` 而不是 `﻿姓名`（用 `utf-8-sig` 的理由）
- [x] 1.5 RED — 两种编码都解不开的字节序列被拒绝，抛出可区分的异常（不是 `BadHeader`）
- [x] 1.6 GREEN — 实现 `decode_csv(raw: bytes) -> tuple[str, str]`
- [x] 1.7 RED — 变异验证：把顺序改成先试 GB18030，确认 1.3 **真的变红**；恢复
- [x] 1.8 RED — 表头缺列的错误要能让人判断"传错文件了"：给一份学员名单形状的 csv，断言错误信息里同时出现「缺了什么」与「这看起来不是作业成绩文件」这类判断依据，而不只是内部列名
- [x] 1.9 GREEN — 改 `BadHeader` 的信息，并让它携带缺失列名供上层渲染
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 2. 导入接口 + 排除名单 + 导入记录

### Contract
- **Spec**:
  - 导入接口 SHALL 要求调用方显式指定目标课程，接受 `course_id` **或** `course_alias`，两者都给时 SHALL 以 `course_id` 为准，两者都不给 SHALL 拒绝整份导入。
  - 系统 SHALL NOT 从文件名、文件路径或文件内容推断课程。
  - 导入 SHALL 由一个后端 HTTP 接口完成，该接口 SHALL 承载全部解码、解析、校验、排除与分类逻辑。
  - 接口的返回体 SHALL 自描述：实际采用的编码、解析行数、因重复被丢弃的行、将新建/将更新条数、两份跳过清单、被排除的邮箱、表头是否与既有不符。
  - 系统 SHALL 维护一份「不算作业的邮箱」名单，**全课程通用**。名单中的邮箱在任何一次导入中 SHALL NOT 被写入，并 SHALL 在预览中显示为已排除。
  - 上传文件的分项列与该课程已有成绩的分项列不同时，系统 SHALL 在预览中给出醒目警告……SHALL 允许用户在看到警告后仍然确认导入。
  - 系统 SHALL 为每次**实际写入**的导入记录时间、文件名、解析行数与结果……SHALL NOT 保存上传文件的原始内容。
  - 系统 SHALL 对上传体积设上限并在超出时明确拒绝。
- **Runtime**: `cd backend && pytest tests/test_homework_import.py tests/test_homework_read.py tests/test_query_roundtrips.py` → expected: 全部通过；既有读接口与往返断言不受影响
- **Code**:
  - `dry_run` **不往 session 里放对象**，不是"照常 add 最后 rollback" —— 后者让正确性取决于调用方的事务边界，`homework` 那次回滚掉了 pytest fixture 自己的清表操作（design 决策 3）
  - 排除名单是独立表、键是邮箱，**不挂在 `students` 上** —— 被排除的人恰恰可能不在学员表里（讲师本人就是）（design 决策 5）
  - 导入记录只在**实际写入**时产生；dry-run 不写，否则"上次导入"会指向一次没发生的导入（design 决策 8）
  - 结构化的 `PUT /api/homework` 移除，只留一条进库的路
  - migration 含一条回填（讲师邮箱进排除名单）——**本地空库重放跑在 0 行上，不被任何本地测试覆盖**，证据只能来自生产验收
- **Threshold**: 80

- [x] 2.0 CONTRACT — write openspec/changes/homework-upload/contracts/group-2.md with the ### Contract block above
- [x] 2.1 RED — `POST /api/homework/import` 带 base64 的 CSV 字节与 `course_id`，`dry_run=true` 时返回 `created`/`updated`/两份清单/`encoding`/`row_count`，且**库中无任何变化**
- [x] 2.2 GREEN — 写 migration（两张表 + 索引 + 讲师邮箱回填）与模型；实现 import 端点的 dry-run 路径；`supabase db reset` 后**重启后端进程**（连接池会全废，按 PID 杀）
- [x] 2.3 RED — `dry_run=false` 真写入，且返回体与 dry-run 的判断一致
- [x] 2.4 GREEN — 实现写入路径
- [x] 2.5 RED — 课程入参三种情形：只给 `course_alias` 能解析；两者都给以 `course_id` 为准（构造 alias 指向另一门课，断言写进了 id 那门）；都不给则 4xx 且**一条都不写**
- [x] 2.6 GREEN — 实现课程解析
- [x] 2.7 RED — 排除名单：名单中的邮箱不写入、出现在返回体的 `excluded` 里；`POST /api/homework/excluded` 加入一个邮箱后重新 dry-run，`created` 减一
- [x] 2.8 GREEN — 实现排除名单表与端点
- [x] 2.9 RED — 排除名单**全课程通用**：某邮箱排除后，导入另一门课的文件同样不写入
- [x] 2.10 RED — 表头警告：该课程已有 `A1…D2` 的成绩，上传 `E1…G2` 的文件 → 返回体带警告并列出两边列名，但**不拒绝**；该课程一条成绩都没有时**不产生**警告
- [x] 2.11 GREEN — 实现表头比对
- [x] 2.12 RED — 导入记录：真写入后产生一条（文件名/编码/行数/新建/更新），dry-run **不产生**；`GET` 该课程最近一次导入信息
- [x] 2.13 GREEN — 实现导入记录
- [x] 2.14 RED — 体积上限：超限的请求被拒绝并说明上限，不解析、不写入
- [x] 2.15 GREEN — 实现上限
- [x] 2.16 GREEN — 移除 `PUT /api/homework` 及其测试；删除 `tools/homework-sync/` 整个目录，**先把 README 里的教训移进 `homework_parsing.py` 的模块 docstring**
- [x] 2.17 GREEN — 更新 `backend/tests/conftest.py` 的清表 fixture：两张新表排在 `courses` **之前**删
- [x] 2.F1 FIX — 格式错的单元格（总分 `abc`、提交时间 `N/A`）抛的是裸 `ValueError`，`import_homework` 没接，于是浏览器上传一份半填的 csv 拿到的是 500 加 traceback。解析层加 `MalformedCell`（带行号、列名、原值），端点映射成 422。evaluator BLOCK 于此（HIGH）
- [x] 2.F2 FIX — 体积上限原本在 `b64decode` **之后**才量，等于先为一份误传的大文件实打实分配一遍内存，而上限存在的理由正是别让那件事发生。加一道 decode 前的粗筛（base64 长度 × 3/4 为原文下界，不能直接拿 base64 长度比，否则 1.6MB 的合法文件会被误伤），精筛保留在 decode 之后
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. Server Action 与 API 封装

### Contract
- **Spec**:
  - 网页的 Server Action SHALL 只做「读取文件内容、鉴权、转发」，SHALL NOT 包含任何解码、解析、校验、排除与分类逻辑。
  - 系统 SHALL 允许用户在作业页选择一个 `grades.csv` 文件并导入到**当前选中的课程**，全程 SHALL NOT 依赖任何本地文件路径或命令行工具。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过
- **Code**:
  - Server Action 必须自己调 `requireSitePassword()`：它编译成页面路由上的一个 POST 端点，`proxy.ts` 覆盖页面加载**不构成**对它的保护
  - 文件以**字节**（base64）送到后端，**不得**在 Next 侧 `file.text()` —— 那会让 GBK 检测彻底失效（design 决策 1）
  - 预期内的结果（编码不对、表头不符、课程不存在、超限）用**返回值**表达，不抛异常：Server Action 抛出的错误在生产构建里只剩 digest，客户端拿不到内容
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/homework-upload/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — 未带站点密码调用该 Server Action 时被拒绝，且**不发出**任何后端请求
- [x] 3.2 GREEN — 实现 `previewImport` / `applyImport` 两个 action，开头调 `requireSitePassword()`
- [x] 3.3 RED — 传给后端的 body 里是 **base64 的原始字节**，不是解码后的字符串。用一份 GB18030 字节夹具断言送出去的内容 base64 解回来与原字节**逐字节相同**
- [x] 3.4 GREEN — 用 `arrayBuffer()` 而非 `text()`
- [x] 3.5 RED — 后端返回 4xx 时 action 返回 `{ ok: false, message }` 而**不抛异常**（生产构建里抛出的错误只剩 digest）
- [x] 3.6 GREEN — 实现错误的返回值表达
- [x] 3.7 GREEN — `lib/api.ts` 增 `importHomework` / `addExcludedEmail`；确认没有引入任何解析逻辑
- [x] 3.8 RED — 写入成功后 `revalidatePath("/homework", "layout")` 被调用（页面计数与侧边栏都要跟着变）
- [x] 3.9 GREEN — 加 revalidate
- [x] 3.F1 FIX — Next.js 默认把 Server Action 请求体卡在 1MB，**在 action 跑起来之前**就拒，而后端上限是 2MB —— 1–2MB 的文件拿到框架的 413 而不是我们那句说明，「预期内的失败用返回值表达」在这段区间里失效。
  `next.config.ts` 设 `bodySizeLimit: '3mb'`（留 multipart 开销），`next.config.test.ts` 把它与后端 `MAX_UPLOAD_BYTES` 的关系钉成断言。另补 `excludeEmailAction` 与 courseId 缺失两条用例。evaluator BLOCK 于此（HIGH）
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 预览屏与导入入口

### Contract
- **Spec**:
  - 系统 SHALL 在写入之前显示一屏预览，至少包含：按哪种编码读取、解析出多少行、因重复提交被丢弃的行、将新建多少条、将更新多少条，以及两份**彼此分开**的跳过清单。
  - 预览期间系统 SHALL NOT 写入任何数据。用户 SHALL 需要一次显式确认才发生写入。确认控件上 SHALL 显示将要写入的**具体条数**。
  - 预览 SHALL **始终**显示实际采用的编码。
  - 用户 SHALL 能在预览的每一行上把该邮箱**永久**加入排除名单；加入之后系统 SHALL 重新计算整屏预览，且重新计算 SHALL 通过重新请求一次预览得到，SHALL NOT 由前端自行加减。
  - 上传文件的分项列与该课程已有成绩的分项列不同时，系统 SHALL 在预览中给出醒目警告并列出两边。
  - 目标课程 SHALL 恒为当前选中的那一门，界面上 SHALL NOT 另设课程选择控件。
  - 作业页 SHALL NOT 提供逐条修改、删除或新增作业成绩的入口。
  - 系统 SHALL 在作业页显示最近一次导入的时间、文件名与行数。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过，无新增 console 噪声
- **Code**:
  - 写入期间禁用**所有**出口含取消；只在成功回调里关闭。失败信息就地渲染，承载它的组件不能先消失（`course-catalog` 那次 evaluator BLOCK 两轮就是这个形状）
  - 断言 disabled 要用**挂住不 resolve 的 promise**；只断言最终态的测试对这类回归全盲
  - 标记排除后必须**重新请求预览**，不在前端加减 —— 测试要断言发生了第二次预览请求
  - 「不在学员表」用 danger 语气、「无报课记录」用普通语气：处置相反，同一种视觉语气会让人以为是同一件事
  - `vi.clearAllMocks()` 清调用记录但不清实现 —— 用例内显式设定自己依赖的返回值
- **Threshold**: 70

- [x] 4.0 CONTRACT — write openspec/changes/homework-upload/contracts/group-4.md with the ### Contract block above
- [x] 4.1 MOCK — 打开 docs/superpowers/specs/mocks/2026-07-31-homework-upload-mocks.html；记下预览屏的结构、编码提示的措辞、表头警告的措辞、以及「这一屏的几条硬规则」那张表
- [x] 4.2 RED — 预览屏渲染：编码行、行数、去重丢弃、将新建/将更新、两份**分开**的清单（断言两个邮箱之间隔着第二份清单的标题）
- [x] 4.3 GREEN — 实现 `ImportDialog` 的预览态
- [ ] 4.4 VISUAL DIFF — 起 dev stack，走一遍上传，对照 mock 校 token 与文案；**用 S1 的全量数据**（17 行）确认清单长时不被裁掉
- [x] 4.5 RED — 确认按钮上写**具体条数**（「确认导入 16 条」），不是「确认」
- [x] 4.6 GREEN — 实现确认按钮
- [x] 4.7 RED — 写入期间**所有**出口 disabled（含取消与关闭），用挂住不 resolve 的 promise 断言
- [x] 4.8 RED — 写入失败时错误就地渲染在预览屏上，且预览屏**仍然打开**
- [x] 4.9 GREEN — 实现 busy 与错误态
- [x] 4.10 RED — 标记「以后不算作业」后**发生第二次预览请求**，且界面上的数字来自第二次的返回值（构造两次不同的返回值，断言显示的是第二次那个）
- [x] 4.11 GREEN — 实现标记与重算
- [x] 4.12 RED — 编码提示：UTF-8 时也显示；GBK 时显示提醒核对中文
- [x] 4.13 RED — 表头警告：列出两边列名，确认按钮**仍可用**
- [x] 4.14 GREEN — 实现编码提示与表头警告
- [x] 4.15 RED — 作业页：有「导入 grades.csv」按钮、有「上次导入 …」一行、且**没有**逐条编辑/删除/新增成绩的控件
- [x] 4.16 GREEN — 实现入口与「上次导入」
- [ ] 4.17 VISUAL DIFF — 对照 mock 校编码提示与表头警告两块；确认预览屏在写入中的 disabled 态看得出来
- [x] 4.18 GREEN — 侧边栏那一项改为「作业 CSV 导入」并真的跳到 `/homework`；删除学员页的「导入 CSV」按钮与新建弹窗里的「批量导入请用 CSV 导入」链接
- [x] 4.F1 FIX — 标记排除后的重算把 `phase` 落回 `previewing`，于是重算期间出口全部放开：能再标一个人，两个 dry-run 同时在飞，先发的后回时屏幕上留下的是**旧的**数字——而确认按钮上那个数正是用户要核对的东西。`load(whileLoading)` 显式接收取数期间的态，exclude 那条路传 `writing`。evaluator 报 HIGH
- [x] 4.F2 FIX — `exclude()` 不清上一条错误，两条错误会叠在一起读不出哪条是刚发生的；并把 `encodingLabel` 对认不出的编码改成原样显示，不再假装是 UTF-8
- [x] 4.F3 FIX — action 在鉴权失败时是**抛**的，而弹窗只处理了返回值形式的失败：站点密码过期或网络断掉时，`useEffect` 里是一个未处理的 rejection，弹窗停在"正在读取…"永不动、也没有一句解释（vitest 的 unhandled error 警告实证）。加 `settle()` 把两种失败收成一种，三条路径各配一条 RED
- [x] 4.F4 FIX — 作业页取不到「上次导入」时会连整份名单一起换成错误卡片，而名单其实取到了。`getLastImport` 那条 `.catch(() => null)` 退化成不显示那一行；名单本身取不到仍照常抛给 `error.tsx`（渲染空页面等于谎称"这门课没有人"）。另补 `loading.tsx`：后端是 Render 免费档会休眠，冷启动那一分钟里空白页与"坏了"看不出区别
- [x] 4.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-4.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 5. 验证与上线

- [x] 5.1 Run backend test suite — `cd backend && pytest`，确认无回归
- [x] 5.2 Run frontend test suite — `cd frontend && npm run test`，确认无回归；单独跑与全量跑结果需一致
- [x] 5.3 `cd frontend && npx tsc --noEmit` 与 `npx next build`，确认生产构建通过
- [x] 5.4 Run superpowers:verification-before-completion — 跑 `project.test_commands` 与 `project.custom_verification_checks`；另确认 `tools/homework-sync/` 已不存在且没有任何地方还引用它
- [ ] 5.5 上线：先跑 migration，再部署后端，最后部署前端。**等 migration workflow 真的成功再验后端** —— 判据必须是只有新构建才有的可观察差异（新端点存在），不是某个更早就有的东西还在（`homework` 那次栽在这里，把 dry-run 跑成了真写入）
- [ ] 5.6 生产验收 · 回填 — 确认讲师邮箱确实在 `homework_excluded_emails` 里。**本地空库重放跑在 0 行上，这条回填不被任何本地测试覆盖**，只能在生产上看
- [ ] 5.7 生产验收 · 预览 — 从浏览器上传 `session1/grades.csv`，预览显示「将更新 16 条」（不是新建，已经导过一次）、编码 UTF-8、讲师那一行显示为已排除；**此时不确认**，回到作业页确认计数没变
- [ ] 5.8 生产验收 · 写入 — 再走一遍并确认，计数仍为 S1 已交 16，说明幂等；作业页出现「上次导入 …」
- [ ] 5.9 生产验收 · GBK — 把 `session2/grades.csv` 另存为 GBK 上传，预览注明「按 GBK 读取」且中文正常，确认后 S2 已交仍为 9
- [ ] 5.10 生产验收 · 传错文件 — 上传一份非作业 csv，被拒绝且说明看起来不是作业成绩文件；上传 S2 的文件到 S1 课程，出现表头警告并列出两边列名（**不确认**）
