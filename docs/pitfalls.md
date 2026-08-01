# Pitfalls

这个项目踩过的坑。索引在 [CLAUDE.md](../CLAUDE.md#pitfalls)，动到哪个领域就读哪一节。

## 怎么维护

- **只记真实发生过的事**：evaluator 发现、实测踩坑、部署事故。不编造，也不从
  "理论上可能出问题"推演。
- **新增前先找同根因。** 有就往那条下面加一行症状，不新开一条 —— 一条带三个症状的
  条目比三条各说一个症状更好记，也更短。只进不出会让这份文件在两个月内失去可读性。
- **每条都要能回答"症状长什么样"。** 这些坑的共同点是**不报错**；能识别症状才用得上。
- `openspec archive` 的 cleanup 阶段是默认的追加时机，但不限于那时。

---

## 数据库与后端

**读接口必须有能打破并列的 `ORDER BY`，写脚本一律按主键定位。**
没有排序时 Postgres 按堆顺序返回，而 `UPDATE` 是写一条新元组到堆尾 —— "位置"记录的是
最后一次写入时间，不是数据的任何属性。三种症状都撞过：

- *记录跑到名单最后*（roster-editing）：改了个字段，这人就从名单中间消失了。
- *脚本改错人*（roster-editing，毁了两条 seed 记录）：列表按 `name, email` 排，改名后该行移位，
  reload 之后详情面板选中的是排序首条。"改名 → reload → 改回原名"的第三步把**另一个人**的
  姓名覆盖了，两步都返回 200。系统不留痕，改错没有第二处可查 —— 原值必须先读出来存好。
- *「第一条」不可依赖*（enrollment-backfill 生产验收，改错了用户的数据）：`GET /api/enrollments`
  压根没排序，`rows[0]` 每次可能是不同的行。验收脚本操作"S1 的第一条报课"，取到的是用户
  手工补录的那条，把它从 6/28 挪到了 6/07。两条记录长得几乎一样。

规则：排序键要能打破并列（本项目 `name, email`），否则同名两人的相对顺序仍会随任何写入抖动；
**验收脚本只操作自己刚建的记录**（按 id，或按只有自己会写的标记如 `source == "derived"` 筛），
且全程按 id，不在中途重新"找"一遍。

**结构约束是最后一道，不是唯一一道。**

- *`NULL` 互不相等，唯一索引会"建了但没挡住"*（enrollment-core group 1）：
  `unique (student_email, course_id, session_id)` 挡不住两条都是"未定场次"的记录 ——
  两行都被收下且互不冲突，而它们表示的是同一件事，批量导入每跑一遍就多一条。
  要拆成两条 partial index（`where session_id is not null` 与 `is null`）。
  **验证只能靠真实插入两次**；migration 跑通、索引存在都不构成证据。
- *唯一约束只挡得住它定义的那种重复*（enrollment-backfill，真实数据里撞到）：
  上面两条索引都在，却挡不住"一条有场次 + 一条未定场次"——**两条都合法**，而业务上是同一件事。
  写入前要问的是"这件事是不是已经被某条记录表达了"，而不是"数据库会不会拒绝我"。

**外键管不到"属于哪门课"这类跨表关系约束**（enrollment-core group 2，evaluator BLOCK）。
`enrollments.session_id` 只能指向 `course_sessions.id`，DB 层无法表达"这一场必须属于这条报课的课程"。
不在边界上挡的话，A 课的场次能挂到 B 课的报课上，而**状态是从所属场次派生的** —— 这条报课会按
一个毫不相干的日期显示已完成。凡是"两个外键之间还有关系"的地方，那道校验只能写在应用层。

**显式 `null` 的拒绝要按列的可空性分别决定，不能一刀切 `"*"`**（student-write group 1 与
enrollment-core group 2，两次 evaluator BLOCK）。
`XxxUpdate` 里字段是 `str | None = None`，`None` 表示"这次请求没提到它"（配合 `exclude_unset`）。
客户端显式传 `{"wechat": null}` 时 Pydantic 照收，`None` 被写进 NOT NULL 列 → 未捕获的 500。
但**不能挂在 `field_validator("*")` 上**：`session_id` 本来就可空，显式 null 是合法的"清空场次"，
也是补课流程唯一的表达方式 —— 一刀切会把正常功能一起挡死。

**只读响应字段不要用 Pydantic `Literal` 校验没有 DB CHECK 约束的枚举列**（student-management
group 2，evaluator BLOCK）。`region`/`level`/`source` 在 DB 层是纯 `TEXT`（为将来加枚举值留口子），
`response_model` 用 `Literal[...]` 的话，任意一行落在集合外，FastAPI 会在**整个响应**上抛
`ResponseValidationError`，`GET` 列表接口全灭（500），不是那一行出错。
只读端点用 `str`，`Literal` 留给写接口做请求体校验。

**SQLModel 会把显式 `None` 发成 SQL NULL，盖掉列的 DB 默认值**（course-catalog group 2）。
`created_at: datetime | None = Field(default=None)` 配 `not null default now()` → 插入时报
`NotNullViolation`，而报错位置离"我明明给了默认值"很远。
应用不读不写的列**干脆不要映射到模型**；主键 uuid 用 `default_factory=uuid.uuid4` 自己生成。

**`jsonb` 不保证对象键顺序，所以"顺序有含义"的数据只能存数组**（homework 决策 1）。
存储时按键长度、再按字节序重排。实测 10 个真实评分项名过一遍 jsonb 对象，
`A1 A2 A3 B1 B2 B3 C1 C2 D1 D2` 被打散成 `A2 A3 B2 B3 D1 D2 A1 C1 C2 B1` —— 分组彻底毁掉，
而**页面照常渲染、没有任何报错**。存 `[{item, score}]`。
配套断言必须比较**有序序列**：断言集合相等或转成 dict 比较，对这个缺陷全盲。

**FastAPI 静默忽略不认识的查询参数，于是"新加的开关"在旧构建上等于没加**（homework 生产同步，
我把一次 dry-run 跑成了真写入）。客户端加了 `?dry_run=true` 就以为安全，而线上还是旧构建，
参数被无视，16 条成绩真写进了生产库。→ 验证方法见「脚本与运维」的第一条。

**dry-run 不能实现成"照常写、最后 rollback"**（homework）。
那样正确性取决于**调用方**的事务边界：测试里 session 绑在外层事务上，`rollback()` 把 pytest
fixture 自己的清表操作一并撤销，17 行本该不可见的数据浮回来，症状是"dry-run 居然写进去了"。
**不写就是不写** —— 分类照算，只是不往 session 里 add 对象。

**「每次请求发几条 SQL」要写成断言，否则它只会悄悄变差**（性能优化，`test_query_roundtrips.py`）。
实测每次数据库往返 ≈ 61ms（Render → Supabase），固定开销 ≈ 103ms —— 接口耗时都落在
`103 + 61 × 查询数` 这条线上，**往返次数就是用户感知的延迟**。
退化时没有任何征兆：有人顺手加一行 `session.exec(...)`，功能测试全绿，只是每次切页面慢 61ms。
用 SQLAlchemy 的 `before_cursor_execute` 数一数，钉成断言。

**一段错误处理在"只有 CLI 操作者能看到"时是够用的，换了信任边界就不够了**
（homework-upload group 2，evaluator BLOCK）。`grades.csv` 解析层原本只被本地命令行调用，
格式错的单元格（总分填了 `abc`）抛裸 `ValueError` 完全没问题 —— 操作者看得见 traceback，
知道是自己那份文件的问题。挂到浏览器上传与 MCP 后面之后，同一个异常一路冒到端点外变成
**500 加 traceback**，用户看到的是"服务器错了"，而实际是他那份 csv 的某一行有问题。
**改变调用方（从"我自己"变成"任何用户"）本身就是一类需要重新审查错误处理的事件**，
即使代码逻辑一行没动。

**migration 的回填在本地永远跑在 0 行上**（course-scheduling-fields）。
`supabase db reset` 是空库重放，seed 里没有对应数据，所以 `update ... set x = y * 60` 这类回填
**不被任何本地测试覆盖** —— 绿灯不代表回填写对了。真实证据只能来自生产那几行既有数据，
所以这类 migration 的生产验收必须专门列一条"确认既有行的值被正确转换"。

---

## Next.js 与前端

**`error.tsx` 接不住同段 `layout.tsx` 自己抛的错，于是外壳的取数会带走整个外壳**
（course-page-boundaries，VISUAL DIFF 才发现，全部单测都是绿的）。
文档原文：error.js「does not wrap the layout.js ... above it in the same segment」。
侧边栏提进 `(app)/layout.tsx` 并取学员数之后，后端一停 —— 计数 promise 一 reject，
**整个外壳死掉、掉到根错误页、侧边栏消失**，恰好发生在冷启动，也就是这套边界存在的理由本身。
外壳自己取的数据**必须不能抛**：就地 `.catch(() => undefined)`，未知值走既有占位。
推论：**凡是 layout 渲染的东西，它的失败都不归本段 error.tsx 管。**

**layout 里未隔离的取数会阻塞每一次导航，而且不报错、不告警**（course-page-boundaries）。
本版 Next 文档：layout 访问未缓存数据时 `loading.js` **不为它显示 fallback**，且
「Without Cache Components: Navigation blocks until the layout finishes rendering」。
症状只是"哪儿都慢"，**本地后端毫秒级完全看不出来**。解法是取数留在 page，或在 layout 内用
独立 `<Suspense>` 包住（promise 传给客户端组件用 `use()` 展开）。
测试要用**挂住不 resolve 的 promise**；已 resolve 的无论包没包都通过。
更强的断言：**layout 函数本身不是 async** —— 同步函数不可能 await 过任何东西。

**`error.tsx` 要用 `unstable_retry()` 而不是 `reset()`**（deployment group 2）。
本项目 Next.js 16.2：`reset()` 只重渲染子树、**不重新拉取数据**。用它做重试按钮，点了会原地
不动停在错误页 —— 恰好在"后端刚醒过来"这个最需要它工作的场景失效。

**Server Component 的 fetch 必须设显式超时，且要短于平台函数执行上限**（deployment 决策 #2）。
否则后端冷启动时 fetch 一直挂着直到平台把整个函数杀掉，`error.tsx` **根本没机会渲染**，
用户看到的是平台的 504。宁可主动放弃（15s）并给重试按钮。

**`middleware.ts` 在本版已弃用、改名为 `proxy.ts`**（access-control 决策 #1）。
文件放根目录、与 `app/` 同级，导出名为 `proxy` 的函数或默认导出。用旧名字的话文件**根本不会
被执行**，而症状是"页面照常打开"——与认证正常工作**外观完全一致**。
认证类改动**不能以"能打开页面"作为成功判据**，必须实测未授权请求确实被拒。
另：`WWW-Authenticate` 的 realm 必须是 ASCII，中文 realm 会在构造响应时抛 `TypeError`，
把 401 变成 500。

**Server Action 抛出的错误，生产构建里信息会被抹掉**（student-write，生产验收才发现）。
把"邮箱已存在 / 属于已归档学员"做成抛异常再在客户端正则匹配 `error.message` —— 本地 dev 正常，
生产上 Next 只传一个 digest，正则永远匹配不上，引导**静默消失**。
预期内的结果用**返回值**表达，不要抛。判断标准是"用户正常操作能不能撞到"：能就是返回值，
不能（如未授权）才抛。推论：**任何依赖跨 Server Action 边界传递错误内容的逻辑，本地测试都验不了。**

**`revalidatePath` 的路径不写路由组前缀，但写错只表现为"数字不动"**（course-page-boundaries）。
文档示例是 `revalidatePath('/(main)/post/[slug]', 'layout')`，容易以为搬进 `(app)` 要跟着写。
实测 `revalidatePath("/students", "layout")` 就对。**粒度**倒是必须改 —— 默认的 page 粒度不刷新
layout，于是表格更新了、外壳里的徽标不动。两种错法症状完全一样且都不报错，
只能靠**真实写一条数据看数字变没变**定论。

**204 没有 body，而写请求的公共壳里一句 `res.json()` 就能把成功变成失败**（enrollment-backfill，
上线后用户报「删除不成功」）。`DELETE` 返回 204 时解析空 body 抛异常 → Server Action 捕获 →
返回"没删掉"、`revalidatePath` **不执行**、那一行留在屏幕上，**而记录其实已经删掉了**。
症状与"真的删不掉"一模一样，只有刷新才分得出。
更一般地：**把"解析响应体"写死在所有写请求的共同路径上，就等于假设每个写请求都有响应体。**

**写入失败的信息必须渲染在触发它的那块界面上，而承载它的界面不能先消失**（course-catalog
group 6，evaluator RETRY 后又 BLOCK 一次才补齐）。同一个缺陷从四个出口漏出来：
行内编辑的失败塞进了弹窗 state（弹窗是关的，于是**什么都不显示**）；新建"提交即关窗"；
保存中点「取消」也能关窗；按钮没被 `busy` 挡住、连点发两遍。
共同形状是**失败信息与承载它的组件生命周期脱钩**。规则：关闭/收起只在成功回调里做，
写入期间禁用**所有**出口（含取消），错误状态按对象分开存。
测试用**挂住不 resolve 的 promise** 断言 `disabled`，只断言最终态的测试对这类回归全盲。
第五个出口后来在 `homework-upload` group 4 又冒出来一次：标记排除后触发的**重算**请求，
`busy` 在重算发出的瞬间就被放回 `false`（`refresh()` 里 `setPhase("previewing")` 覆盖了
写入态），于是重算飞着的时候所有按钮都是放开的，能再点一次、两个请求乱序回来。
**异步操作的"进行中"状态不止覆盖它自己触发的那次请求，还要覆盖它引发的后续请求**，
断言同样得用挂住的 promise 才测得出来。

**`overflow-hidden`（为圆角）+ 可压缩的 flex 子项 = 内容被静默裁掉，且哪儿都没有滚动条**
（enrollment-backfill，上线后用户报「看不到全部记录」）。
表格外框被 flex 父容器压到 555px 后**裁掉**了 1226px 的表格；外层的 `overflow-y-auto` 因此
**看不到任何溢出**，于是不出滚动条 —— 记录不是"看不见"，是**够不着**。
外框要 `flex-none`（按内容撑开），让溢出冒到滚动容器上。
**jsdom 没有布局，这类缺陷单测量不出来**（只能钉类名），必须在真实浏览器里用**足够多的数据**
验一次：本次的数据量差别就是 4 条（看着好好的）与 22 条（一半够不着）。

**Server Action 的请求体上限（默认 1MB）比后端自己的上限小，且在 action 代码跑起来之前就拒**
（homework-upload group 3，evaluator BLOCK）。后端设了 2MB 的上传上限，但 Next.js 框架层
默认把 Server Action 请求体卡在 1MB，**在 action 拿到控制权之前**就 413——落在 1–2MB 这段
区间的文件，用户拿到的是框架的 413，而不是应用写的"文件超过上限…"那句话。**任何一处
"预期内的失败用返回值表达"的设计，都要连带检查框架自己有没有在那之前先拦一道**。
配置 `experimental.serverActions.bodySizeLimit` 时留出比后端上限更大的余量（本项目定 3mb 对
2mb）：这个上限管的是**原始请求体**，客户端送的是 multipart 而非纯字节，边界与字段头还要占
十几 KB，卡到刚好会让恰好达到后端上限的文件被误伤。

**「落地页默认选哪一项」要按有没有数据选，不能按列表顺序**（homework 生产验收）。
课程列表按最近开课倒序，而那个顺序与"这门课有没有人报"完全不相干 —— 排最前的 S4 一条报课都没有，
于是新页面第一眼是空状态。**空页面不报错、不告警，看起来就像功能没做好。**
既有接口往往已经带了可用的判据（这里是 `enrolled_people`），不需要多发请求。

---

## 测试与验证

**本地数据会把测试搞红，而报错落在不相干的地方。** 三种成因：

- *全库唯一的键*（course-catalog，为截图建了一条数据就红了 20 个）：`course_aliases` 主键是
  归一化后的别名，全库唯一。本地建了一门带别名 `S1` 的课，之后所有用 `S1` 的测试都 409 ——
  而测试本身在会回滚的事务里，看不出是外部数据造成的。
  修法是测试开始时于同一事务内清空相关表，**不要改用随机别名**："别名撞了"本身就是被测行为。
- *清表 fixture 没跟着外键长*（enrollment-core group 6）：`empty_course_tables` 原本只清课程三表；
  有了 `enrollments` 之后，本地库里留着一条报课就会撞外键 —— **129 个测试全部 error，且报错落在
  某个与报课毫不相干的课程测试的 setup 阶段**。新增引用表时要回头改那张清空顺序表：
  先引用方，后被引用方。
- *演示数据与夹具在 `@example.com` 上撞*（homework）：清表 fixture 有意不清 `students`，理由是
  "测试用 @example.com，撞不上"——但为截图/验收造的本地数据按隐私规则**也只能用** @example.com，
  所以撞是结构性的。症状是**四个不相干的测试红在 setup 阶段**（`duplicate key ... students_pkey`）。
  夹具邮箱按测试文件加前缀（`hw-…@example.com`），或造完演示数据后 `supabase db reset`。

**`vi.clearAllMocks()` 清调用记录但不清 mock 实现**（course-page-boundaries）。
前面用例设的 `mockRejectedValue(...)` 会残留到后面的用例，于是同一个断言**全量跑与单独跑
结果不同**（本例 revalidate 调用数 3 vs 4）。要清实现得用 `resetAllMocks`；
更稳的做法是**用例内显式设定自己依赖的返回值**，不吃环境状态。

**pytest fixture 每次新建 engine 却不 dispose，第 ~100 个测试开始连接被拒**
（course-scheduling-fields）。连接池随测试数累积，Postgres 报
`remaining connection slots are reserved for roles with the SUPERUSER attribute`。
**症状与原因毫无关系**：报错落在某个不相干的测试的 setup 阶段。
engine 提到模块级共用一个即可（顺带快一倍）。测试数量跨过某个阈值才出现的失败，先怀疑资源泄漏。

**做变异测试时别用 `git checkout <file>` 还原 —— 未提交的工作会一起没**（homework group 3）。
基线已提交、当前改动还没提交时，`git checkout` 把文件还原到 HEAD，正在写的实现就没了，
而且**不报错**（"Updated 1 path from the index"）。变异前把文件复制到 scratchpad，从副本还原。

**验收脚本必须在"新建"那一步就填可选字段**（student-write，用户手工试用时发现）。
新建学员只送了必填的 5 个字段，弹窗收的另外 5 个（含微信号）被静默丢弃 —— 后端有默认值所以不报错。
而验收流程是"建记录（只填姓名邮箱）→ 编辑微信号 → …"，于是**新建路径的字段处理从头到尾没被走到**。
同理，前端字段名与后端不一致时（`wxName` vs `wx_name`）漏了映射，后端会静默忽略。

**e2e 里"等写入完成"的信号不能盯按钮文案**（student-write，生产才暴露）。
`归档学员` 在点开二次确认后被 `确认归档` 替换、`恢复为在读` 在进行中变成 `正在恢复…`——
按原文案找的定位器**立刻返回 0**，等待条件瞬间满足，随后导航把还在飞的请求掐断。
要盯只在成功后才发生的状态变化（如详情面板卸载）。另：写入后的断言要给足超时，
Playwright 默认 5s 而 Render 冷启动要几十秒 —— **超时不足的失败长得跟功能缺失一模一样**。

**`waitUntil: "networkidle"` 在会冷启动的后端上可能永远不达成**（course-catalog 生产验收）。
Render 唤醒期间请求持续在飞，`networkidle` 等到超时，而报错指向后面那个 `waitFor`，
看着像"页面没渲染出来"。用 `domcontentloaded` + 等一段**只有数据到位才会出现的文案**。

**`setInputFiles` 只要元素存在就成功，不等 React 装上 `onChange`**（homework-upload，
Playwright e2e 首次跑通前反复卡死）。水合完成前选中的文件被设进 input 却没有人在听，
症状是**没有弹窗，也没有任何报错**，页面看起来就是"导入按钮坏了"。更麻烦的是重试救不回来：
**再选同一个文件，文件列表没变，浏览器根本不会再发 `change` 事件**——于是一个"选完文件就重试"
的循环会死循环、永远等不到弹窗。判据是 input 的 `value` 停留在 `C:\fakepath\...` 没被组件的
`onChange` 清空。修法：每次重试前先 `setInputFiles([])` 清空，让下一次成为一次真正的变化，
再包一层 `toPass` 直到目标弹窗出现。

**认证类的"缺变量时被拒"要写成独立断言，且补写的测试必须先故意改错实现验一遍**
（access-control 决策 #3）。这类测试若是在实现之后补的，不验证它真的会失败，它可能只是"碰巧通过"。

**验夏令时不能拿美西比美东**（course-catalog，起草验收标准时自己写错过一次）。
美国两地同日切换，美西→美东恒为 3 小时 —— 那条断言无论换算实现对错都会通过，是个假测试。
中国不用夏令时，所以美西→上海的时差在 **15 与 16 小时之间跳**：两场同为美西 19:30、
一场 10 月一场 12 月，上海分别是次日 10:30 与 11:30。断言写死这两个值，别写"两者不同"。
同理，凡是跨时区功能，**存墙上时间 + IANA 时区名**，绝对时刻读取时派生；
存固定偏移会在换季后集体错一小时。

---

## 脚本与运维

**验证任何改动前，先确认打的是新进程/新构建 —— 而判据必须是只有新版才有的可观察差异。**
三次栽在这上面，一次比一次隐蔽：

- *端口被占时 uvicorn 静默退出*（access-control）：新进程绑定失败后退出，curl 打的是**上一轮的
  旧代码**，日志里 `[Errno 10048] only one usage of each socket address` 才是真相。
  表现为"改了代码但行为没变"。同理 Next.js dev server：新增根目录文件（如 `proxy.ts`）
  或改 `.env` 后要重启，热重载不覆盖这些。
- *生产站点密码与本地 `.env.local` 那份不同*（roster-editing）：拿本地值打生产会一路 401，
  而 401 长得跟"还没部署完"、"realm 不对"、"用户名错了"完全一样。
- *判据选了两个构建共有的东西*（homework，因此把 dry-run 跑成了真写入）：我用「空 body 返回
  404 还是 422」判断新端点在不在，可端点上一次 push 就有了，**两个构建都返回 422**。
  凡是加了新参数/新字段的部署，验证要打那个**新东西本身**。

**部署配置类的环境变量，缺失时要启动即失败，不要留 localhost 兜底**（deployment，实际部署中暴露）。
`DATABASE_URL` 原本缺失时回落到 `127.0.0.1:54322` 图本地方便。这在云上是灾难性的沉默失败：
**进程正常启动、平台健康检查通过**，然后每个请求 500，日志写着"连接 127.0.0.1 被拒绝"——
在云环境里看到这句话根本不会联想到"变量没配"。本地便利性交给 `.env` + `load_dotenv()`。

**认证/密钥类的环境变量，缺失时必须 fail-closed，且判断要拆成两步**（access-control 决策 #3）。
易错写法 `if (expected && provided !== expected) deny()` 在变量未设时**放行所有人**。
这跟 `DATABASE_URL` 那条同源但更隐蔽：数据库连不上会 500 当场暴露，
认证静默失效**什么征兆都没有**，页面照常打开，可能数月无人察觉。

**`supabase db reset` 会让正在跑的后端连接池全废，但进程仍在监听**（student-write 多次踩到）。
表现为端口有人听、每个请求 500、日志里是 `connection ... closed`。极易误判成代码问题。
`db reset` 之后**必须重启后端进程**（按 PID 杀，`pkill -f uvicorn` 在 Windows 上不可靠）。

**`uv` 托管的 Python 被清理后，`.venv` 变成空壳且报错指向不存在的路径**（roster-editing）。
`uv run` 报 `No Python at '...cpython-3.12.13-windows-x86_64-none\python.exe'`——venv 还在、
指向的解释器没了。`uv python install 3.12 && uv sync` 即可重建。
这类失败与"依赖没装"外观相似但成因不同，别急着 `pip install`；同理 `python -m uvicorn` 报
`No module named uvicorn` 时，先确认用的是不是项目那个 venv 的解释器。

**清理脚本会"成功地什么都没做"**（course-list-order，清场时把本地数据毁了）。
清理临时数据时用 `DELETE /api/courses/{id}` —— **课程根本没有删除端点**（有意设计，下线走
`offline`），于是每个请求 404，脚本照样打印 "deleted 14"。改用 SQL 直删时又按课程名匹配保留名单，
破折号写成 `——` 而真实数据是 `—`，误删了两门真课。
两条规则：**写清理脚本前先确认该端点存在**（httpx 不因 404 抛异常，要显式 `raise_for_status`）；
**保留/删除的判据只能是主键**，不能是会被排版字符、空格、改名影响的显示名。

**输出非 ASCII 的命令行脚本会因控制台编码而崩，而崩的样子像"数据有问题"**
（enrollment-backfill 生产 dry-run）。Windows 控制台默认 cp1252，`print` 在第一行就抛
`UnicodeEncodeError`，把一次**只读**的操作变成崩溃。本地测试全绿（pytest 捕获的是内存流），
只有真在终端跑才暴露。写成 `sys.stdout.buffer.write(line.encode("utf-8"))`，并留一个
"模拟 cp1252 流"的测试。`sys.stdout.reconfigure(encoding="utf-8")` 对已被重定向的流不生效。

**子目录的 `.gitignore` 会吃掉根目录的否定规则**（deployment group 3，evaluator HIGH finding）。
根 `.gitignore` 写了 `!.env.example`，但 `create-next-app` 在 `frontend/.gitignore` 里生成了 `.env*`——
**根目录的否定例外管不到子目录自己的规则**，于是 `frontend/.env.example` 静默地进不了仓库，
文件在磁盘上、`git add` 也不报错，只是永远没被跟踪。
每加一个带自带 `.gitignore` 的子包都要检查：`git check-ignore -v <路径>` 会告诉你是哪一行拦的。

**"他碰巧不在名单里"不是排除，是巧合**（enrollment-backfill，homework 又撞一次）。
讲师自己的测试提交没被导入，原因只是他不在学员库里 —— 哪天他被加进名单，那些记录就会**静默**
变成真实数据。要排除就写成**显式**的排除名单，并与"待补建的人"分开列：
前者是"本来就不该算"，后者是"补建后要补上"，处置相反。

---

## 性能测量

**计时区间里不能有固定 `sleep`，也不该有定位器解析**（性能排查，同一次里犯了两遍）。
"点一名学员 657ms"——其中 600ms 是我自己写的 `waitForTimeout(600)`；真实值 31–50ms。
"切 tab 850ms"里也混着 Playwright 解析 `getByRole` 遍历可访问性树的开销。
**在页面内部计时**：`performance.now()` + `MutationObserver` 等目标节点出现，用原生
`element.click()` 触发。这样量到的才是应用的时间，不是测量工具的时间。

**别把预取请求当成导航请求**（性能排查，据此得出过完全相反的结论）。
Next 会预取视口内的链接，抓 `_rsc=` 时很容易抓到那一条。我据此说"网络只占 108ms、
400–600ms 在客户端"，完全错了 —— 真实的导航 RSC 请求是 519–652ms。
**决定性证据来自 CPU 剖析**：`Profiler` 显示 573ms 是 `(idle)`、真正执行的 JS 只有 5ms。
凡是"慢在哪"的判断，先抓一份 profile 再说；`(idle)` 占满就是在等 I/O，
与"客户端渲染慢"是相反的结论和相反的修法。

**噪声与效应同量级时，三次采样会骗人；留一个没改过的接口当对照**（同上）。
优化上线后第一轮 3 次采样显示 `/api/students`（**我根本没碰**）慢了 54ms —— 噪声就有 ±50ms，
而要测的效应也是这个量级。改成 7 次采样、并看**最小值**（排队与抖动只会让某次变慢，
不会让它变快），信号才干净。没有对照组的话，我会把另一个接口的 −69ms 当成真实收益写进报告。

---

## openspec 流程与设计稿

**openspec 的 MODIFIED 按标题匹配，改标题会让 archive 中止**（course-scheduling-fields）。
delta 里改了需求标题，`openspec archive` 报 `MODIFIED failed for header ... - not found` 并
**回滚整次归档**（不留半成品，这点是好的）。需求标题本身就是一句断言，行为变了就该改标题 ——
正确表达是 **REMOVED（旧标题 + Reason/Migration）+ ADDED（新标题）**，不是把标题改回去迁就工具。
另：archive 会把 ADDED 的条目追加到文件末尾并留下 `---` 分隔线，需要手工归位。
**propose 阶段就核一遍标题**比归档时才发现便宜得多。

**`openspec archive` 按 UTC 命名目录，本机在 PT —— 傍晚归档会命名成明天**（roster-editing，
PT 21:00 归档时发现）。这台机器与项目全部时间基准都是 PT：`date`、git commit 时间戳、
`docs/log/` 文件名都是 PT 日期，只有归档目录名走 UTC，于是 **PT 17:00 之后归档，目录名比
其余一切早一天**。归档后核一眼目录名；不对就 `git mv` 并同步改 `.openspec.yaml` 的 `created`。

**设计稿是布局与语气，不是取值域、不是数据、也不是待办清单。** 三种错法都犯过：

- *示例值被当成约束*（course-scheduling-fields，导入真实课程时才发现）：稿上画了 1/2/3/4 小时
  四个 chip，列就成了 `hours int` 限 1–4；稿上写「时间（美西）」，美西就成了 schema 默认值。
  而真实课程是 **150 分钟、8:30 PM 美东** —— 两个都存不下，且不是边缘情况，是全部四门课。
  **实现枚举/范围类字段前，先拿一条真实数据比对**；拿不到就把范围放宽到"显然够用"。
- *示例数字被抄进生产代码*（enrollment-core group 4，一处没抄干净还留了两处）：归档确认写死
  「他的 2 条报课、4 份作业」，占位块写死「作业提交 4 / 6」。对每个学员都显示同一个数字 ——
  **永远相同的数字比没有数字更糟，它看起来像信息**。
  能力不存在时**不写数字**（写"还没做"），能力存在后数字必须来自数据。
- *把有意的偏离当成待修的 bug*（2026-07-31 用户确认）：`.dc.html` 来自 claude.ai/design，
  是**单向**的 —— 改动不会 sync 回稿子。所以不一致时有两种方向相反的可能：实现漂移了，
  或那是有意的决定。**分辨的唯一依据是最新那份 `.dc.html` 头注释里的「已知偏离」清单**，
  它逐条记了偏离内容、理由与拍板日期。重新导入设计稿后第一件事是读它。
