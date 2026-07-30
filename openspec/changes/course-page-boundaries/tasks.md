## 1. 路由组与共享外壳：侧边栏活过导航

### Contract
- **Spec**:
  - 在同一应用外壳下的页面之间切换时，侧边导航 SHALL 始终保持可见，包括目标页面正在取数、
    以及目标页面取数失败的整个期间。加载态与错误态 SHALL 只替换内容区，不得替换整屏。
  - 侧边导航中"当前所在区段"的高亮 SHALL 由当前路由派生，不得由各页面各自传入，
    也不得作为客户端状态持有。用户点击导航项后，高亮 SHALL 在导航提交时移动到目标项，
    不等待目标页面的数据返回。
  - 应用外壳自身获取的数据（如导航徽标的计数）SHALL 以独立的加载边界隔离，
    使外壳能在该数据返回之前先行渲染。外壳的取数失败或缓慢 SHALL NOT 阻止任何页面打开。
- **Runtime**: `cd frontend && npm run test` → expected: 新增的外壳测试（高亮由路由派生、
  徽标缺数时渲染 `—`）通过；既有 107 项**全部跟随迁移后仍通过**，无因路径变动而失败的用例
- **Code**:
  - 路由组 `(app)/` 不产生 URL 段 —— 路径全部不变，这是选它而非真实目录段的原因
  - **layout 的取数必须包 `<Suspense>`**：本版 Next 文档明写未隔离的 layout 取数会
    阻塞每一次导航，且 `loading.js` 对它不生效。漏包**不报错**，只是哪儿都变慢
  - Sidebar 因 `usePathname` 成为客户端组件；计数由 layout 以 prop 传入，Sidebar 内不取数
  - 迁移用 `git mv`（保 blame），测试文件与被测文件一起移动
- **Threshold**: 80

- [x] 1.0 CONTRACT — write openspec/changes/course-page-boundaries/contracts/group-1.md with the ### Contract block above; confirm all three fields (Spec, Runtime, Code) are non-empty before proceeding
- [x] 1.1 RED — `Sidebar.test.tsx`：高亮由当前路由派生 —— mock `usePathname` 返回 `/courses`，
      断言「课程」项处于高亮态，且**不再接受 `active` prop**（当前实现靠 prop，先红）
- [x] 1.2 GREEN — `Sidebar` 改为 `"use client"`，`active` 由 `usePathname()` 派生；
      `NAV` 词表与 `NavKey` 不变
- [x] 1.3 RED — `Sidebar.test.tsx`：`studentCount` 未提供时徽标渲染 `—` 而非 `0`
      （既有行为，钉住它 —— 它同时是 Suspense fallback 的样子）
- [x] 1.4 GREEN — 若已满足则确认无需改动并说明；本条防止将来有人把占位改成 `0`
- [x] 1.5 GREEN — `git mv` 六个页面进 `app/(app)/`（students、courses、四个占位页），
      连同它们的测试文件；新建 `(app)/layout.tsx` 渲染 `<Sidebar>`；六个 page 各自删掉
      自己那行 `<Sidebar>` 与外层 `h-screen` 容器
- [x] 1.6 RED — 断言 layout 的取数被 `<Suspense>` 隔离：徽标计数的 promise **挂住不 resolve**
      时，页面内容与侧边栏已经渲染、徽标显示 `—`。**用挂住的 promise，不要用已 resolve 的** ——
      只断言最终态的测试对"漏包 Suspense"完全盲，而漏包正是本 change 最隐蔽的失败模式
- [x] 1.7 GREEN — layout 里计数改为独立 async 子组件，包进 `<Suspense fallback={无计数的 Sidebar}>`
- [x] 1.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-1.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)
- [x] 1.F1 FIX — 更新 `app/(app)/students/loading.tsx` 与 `error.tsx` 容器：将 `min-h-screen` 改为 `flex-1`，外层补 `w-full` 或用 `<main className="flex-1">` 包裹，使加载/错误卡片填满内容区而非整屏

## 2. 加载态与错误态：课程页补齐，范围改为内容区

### Contract
- **Spec**:
  - 课程页 SHALL 在数据获取期间呈现加载态，且该加载态 SHALL 明示可能出现的长时间等待。
  - 课程页 SHALL 在后端不可达时呈现可读的错误说明与重试入口，而非白屏或未捕获的异常。
    错误说明 SHALL 同时覆盖"服务正在唤醒"与"服务异常"两种可能。重试 SHALL 重新发起数据获取，
    而不仅是重新渲染既有内容。
  - 应用外壳之外发生的渲染错误，以及外壳自身抛出的错误，SHALL 由一层兜底错误界面接住，
    呈现中文说明与重试入口，而非框架默认的错误页。
- **Runtime**: `cd frontend && npm run test` → expected: 课程页 loading/error 的新测试通过
  （文案含等待说明、重试调用 `unstable_retry` 而非 `reset`），既有测试无回归；`npm run build` 通过
- **Code**:
  - 重试必须用 `unstable_retry()`，**不是 `reset()`** —— 后者只重渲染子树、不重新取数，
    点了会原地不动停在错误页，恰在"后端刚醒"这个最需要它的场景失效
  - `error.tsx` 组内共用一份（现有文案对任何数据页都成立）；`loading.tsx` 按路由各一份（文案分页面）
  - 卡片 DOM 不动，只改最外层容器：整屏居中 → 内容区内居中
  - 两层 error 分工：`(app)/error.tsx` 接组内页面错误（侧边栏在）；`app/error.tsx` 接
    `(app)/layout.tsx` 自身的错与组外页面（侧边栏不在）
- **Threshold**: 70

- [x] 2.0 CONTRACT — write openspec/changes/course-page-boundaries/contracts/group-2.md with the ### Contract block above
- [x] 2.1 MOCK — 读 `docs/superpowers/specs/mocks/2026-07-30-course-page-boundaries-mocks.html`：
      记下「加载/错误态占多大面积」「三态时序」两节，以及末尾「验收时最容易漏的一条」
- [x] 2.2 RED — `courses/loading.test.tsx`：课程页加载态渲染，文案含等待时长说明
      （约 1 分钟量级），而非仅"加载中"（文件不存在，先红）
- [x] 2.3 GREEN — 新建 `(app)/courses/loading.tsx`，与学员页那份同构、文案换成课程
- [x] 2.4 RED — `(app)/error.test.tsx`：点击「重试」调用 `unstable_retry`，
      **且不调用 `reset`**。两个断言都要有 —— 只断言"点了有反应"分不出用的是哪个
- [x] 2.5 GREEN — `git mv` 学员页的 `loading.tsx` / `error.tsx` 进路由组，
      `error.tsx` 提到 `(app)/` 层并去掉文案里的"学员"字样；容器由 `min-h-screen` 改为内容区内居中
- [x] 2.6 RED — 根 `app/error.test.tsx`：组外错误渲染中文说明与重试入口（文件不存在，先红）
- [x] 2.7 GREEN — 新建 `app/error.tsx`
- [x] 2.8 VISUAL DIFF — `npm run dev --prefix frontend`，对着 mocks 的「三态时序」验：
      切 tab 时**侧边栏不消失**、高亮**点了就亮**、加载卡片在内容区内。
      **本地后端是毫秒级，什么都看不出来** —— 必须人为制造慢：停掉后端看错误态，
      或在 `lib/api.ts` 临时加 sleep 看加载态（验完删掉）
- [x] 2.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-2.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 70 → PASS; < 70 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 3. 徽标刷新：revalidate 粒度与路径写法

### Contract
- **Spec**:
  - 导航徽标展示的计数 SHALL 在相关数据被写入后随即更新，无需用户手动刷新页面。
- **Runtime**: `cd frontend && npm run test` → expected: 学员写操作的 revalidate 调用被断言为
  layout 粒度且路径写法正确，既有 actions 测试无回归。**单测不足以定论**，须配合 3.3 的真实写入
- **Code**:
  - 徽标进 layout 后 page 粒度的 `revalidatePath` **不会**刷新它
  - **路由组会改变路径写法**：文档示例是 `revalidatePath('/(main)/post/[slug]', 'layout')`，
    所以可能要写 `/(app)/students`。**实测确认，不靠读代码**
  - 写错的症状是"加完学员徽标不动"，与"根本没改粒度"**外观完全一致**
- **Threshold**: 80

- [x] 3.0 CONTRACT — write openspec/changes/course-page-boundaries/contracts/group-3.md with the ### Contract block above
- [x] 3.1 RED — `actions.test.ts`：新增/更新/归档/恢复四处均以 layout 粒度调用 `revalidatePath`
      （当前是默认 page 粒度，先红）
- [x] 3.2 GREEN — 四处 `revalidatePath` 加 `"layout"` 粒度
- [x] 3.3 VISUAL DIFF — **真实新增一名学员**（虚构姓名 + `@example.com`），确认徽标数字随即变化。
      路径写法若不对（`/students` vs `/(app)/students`）就在这一步暴露 —— 单测断言的是
      "调用参数长什么样"，断不出 Next 认不认这个路径。改完记得把测试记录删掉
- [x] 3.E EVAL — spawn evaluator subagent (haiku); reads contracts/group-3.md + spec + design + group diff; invokes superpowers:requesting-code-review (CRITICAL/HIGH = BLOCK); scores Spec/Runtime/Code; total ≥ 80 → PASS; < 80 → append FIX tasks + retry (max 3 attempts, plateau < 5pt = escalate)

## 4. 验证与上线

- [x] 4.1 Run backend test suite — `cd backend && uv run pytest`（本 change 不碰后端，确认无意外）
- [x] 4.2 Run frontend test suite — `cd frontend && npm run test`；另跑 `npm run build` 与 `npx tsc --noEmit`
- [x] 4.3 e2e — `project.e2e_command` 为空，本 change 不新增 e2e
- [x] 4.4 Run superpowers:verification-before-completion — 跑 `project.test_commands`；
      跑 `project.custom_verification_checks`（`console.log` 与密钥泄漏两条）
- [x] 4.5 **实测记录：没有合并。** 一次硬加载 `/students` 打到后端 `GET /api/students` **3 次**：
      page 自己 2 次（在读 + 已归档，本来就有），layout 的计数 1 次。即 request memoization
      **没有**把 layout 与 page 的同名 GET 合并 —— 二者用的是各自的 `AbortSignal.timeout()`，
      RequestInit 不同一。按计划接受（内部工具、个位数用户），不为此加计数专用端点。
      注：只在硬加载与 layout 粒度 revalidate 时多这一次；软导航不重渲染 layout，不受影响。
      测量在 dev 模式下进行，生产构建可能不同，但方向不会反过来
- [x] 4.6 上线 —— 无 schema 变更、不碰后端，前端单独部署；路由组不改 URL，回滚无坏链接
- [x] 4.7 生产验收 —— 两个方向切 tab，侧边栏都不消失，高亮点了就亮
- [x] 4.8 生产验收 —— 静置 17 分钟让 Render 免费档进入休眠后实测：`/courses` 在 2190ms 内
      渲染出加载卡片（非空白、非平台 504），侧边栏立即可见且学员徽标为 `—`（计数还在飞，
      但没挡住外壳）；同一时刻点「报课」占位页正常打开 —— Suspense 未漏包；后端唤醒后
      课程页正常渲染
