## Context

学员档案能力（`student-roster`）目前的写入面由 `student-write` 建立：详情面板逐字段编辑 →
Server Action → `PATCH /api/students/{email}` → SQLModel。可编辑字段共 11 个，
姓名不在其中。名单页的检索在客户端做，匹配姓名与邮箱两个字段。

三处待改的现状：

```
frontend/app/students/
├── mock-data.ts       ← 名字是陷阱：里面 0 条 mock 数据，
│                        全是 TAGS/TAG_COLORS/SOURCES/LEVELS/TZ_BY_REGION/
│                        FIELDS/BLANK_FORM/NAV/PAGES —— 线上词表与线上文案
├── types.ts           ← EditableFieldKey 无 name；
│                        末行 `type EditableFieldKeyLike = keyof Student | "sid"`
├── DetailPanel.tsx    ← :82 合成 sid = "stu_" + 邮箱前缀
│                        :159 `fd.key === "sid" ? sid : (student as unknown as
│                              Record<string,string>)[fd.key]`
│                        :228/:241 为 sid 存在的 type === "ro" 分支
└── StudentsClient.tsx ← :80 检索只看 name / email
```

后端 `StudentUpdate` 的 `name` 字段不存在，`StudentCreate.name` 是裸 `str`（空姓名建得出来）。

## Goals / Non-Goals

**Goals:**

- 姓名进入既有的逐字段写入通道，不新增端点、不加列
- 姓名非空（trim 后）在**一处**定义，新增与更新两条路径共用
- 检索覆盖 5 字段，且实现形态不构成「按昵称自动关联」
- 词表脱离 `mock-data` 这个名字，搬迁与行为改动可分别回滚

**Non-Goals:**

- 不做后端检索/分页（客户端筛选不变）
- 不统一前后端各自的 `TZ_BY_REGION`
- 不给改名留痕

## Decisions

### 1. 姓名校验用 `Annotated` 类型别名，而非在两个类里各写一遍 validator

```python
def _strip_and_require(value: str) -> str: ...
StudentName = Annotated[str, AfterValidator(_strip_and_require)]

class StudentCreate(BaseModel):
    name: StudentName
class StudentUpdate(BaseModel):
    name: StudentName | None = None
```

两个 schema 引用同一个别名，规则只有一处。若改成两个 `@field_validator("name")`，
将来收紧一处漏掉另一处 —— 而「只拦更新、放过新增」正是本 change 要修的那个洞的形状，
不该在实现里把它重造一遍。

**与 `StudentUpdate` 哨兵语义的相互作用**（这是本 change 最容易出错的地方）：
`StudentName | None = None` 里，`None` 仍表示"这次请求没提到姓名"，配合 `exclude_unset`。
显式 JSON `null` 会走到 None 分支，仍由既有的 `@field_validator("*") _reject_explicit_null`
拦下。`AfterValidator` 只在值确实是 `str` 时运行。两套机制不冲突，但**必须有测试钉住
三种输入的区别**：不带 `name` 键（不改）、`name: null`（拒）、`name: "  "`（拒）。

### 2. 拒绝走 Pydantic，不加 DB CHECK 约束

与 pitfalls 里「只读响应字段不要用 Literal」同源的取舍反面：约束放在能演进的那一层。
本系统没有绕过 API 直写的路径（只有 FastAPI 访问数据库），因此 API 层足够。
DB 层加 CHECK 会让将来的姓名格式演进需要一次 migration。

代价：**已存在的空姓名数据不会被这条约束发现**。生产 19 条已确认姓名非空，
但如果将来出现（例如直连数据库补数据），系统不会报警。接受。

另一个后果，值得记住：validator 只在请求带 `name` 时运行，所以一条假设存在的空姓名记录
**仍可正常编辑其它字段**——不会因为姓名脏而整条锁死。这是期望行为。

### 3. 检索：单次遍历 5 个字段，`includes` 语义

```ts
const hay = [s.name, s.email, s.nick, s.wxName, s.wechat];
if (q && !hay.some((v) => v.toLowerCase().includes(q))) return false;
```

`q` 已 `trim().toLowerCase()`。**不做**模糊匹配、不做拼音、不做相似度排序 ——
那些会把「辨认辅助」变成「自动猜人是谁」，而昵称不能作为标识（`docs/requirements.md` §5，
CLAUDE.md 同款禁令）。人看到候选、人做判断，系统只负责缩小范围。

**已知边缘**：`nick` / `wxName` 未采集时的默认值是 `—`，因此查询串 `—` 会命中所有未采集的学员。
不特殊处理 —— 没人会拿破折号当查询词，为它加分支反而增加解释成本。

**不纳入** `region`/`level`/`source`：它们已有独立筛选器，纳入后「为什么这条出现在结果里」
变得难以解释。也不纳入备注 —— 备注里存着大段 Demo Day 文案，会让噪音压过信号。

### 4. 姓名字段行放在字段表首位，与其它行同构

`FIELDS` 数组新增 `{ key: "name", label: "姓名", type: "text" }` 置于首位，
复用既有的「就地编辑 + 保存中 + 失败保留输入」渲染分支。**不为姓名单开一套 UI** ——
详情面板顶部已显示姓名，但那是展示位；编辑入口统一在字段表里，规则一致比位置好看更重要。

`EditableFieldKey` 增 `"name"`，`StudentOverride` 与前端字段名映射（`wxName` → `wx_name`）
不受影响，因为 `name` 两边同名。

### 5. 删 `sid`：三处一起删，`ro` 分支随之消失

`FIELDS` 里那行、`DetailPanel.tsx:82` 的合成、`:159` 的三元分支一起去掉。
`sid` 是唯一 `type: "ro"` 的字段，删掉后 `:228`/`:241` 的 `fd.type === "ro"` 分支成为死代码 ——
一并删除，否则留一个永不进入的分支给后人猜。`EditableFieldKeyLike` 收缩为 `keyof Student`，
`(student as unknown as Record<string, string>)` 这个逃逸转型也可以顺势收紧。

**这一步单独一个 task**，不与词表搬迁混在一个提交里：搬迁是"内容不变、位置变"，
删除是"内容变"。混在一起一旦 UI 出问题，分不清是搬错了还是删多了。

### 6. `mock-data.ts` → `vocab.ts`：用 `git mv`，只改 import 路径

用 `git mv` 而非新建+删除，让 diff 是 rename 而不是"一个 145 行新文件 + 一个 145 行删除"——
review 时能一眼看出内容未变。同一提交里只改 import 语句。

搬迁时在 `TZ_BY_REGION` 上方加一行注释，指明 `backend/app/schemas.py` 有一份同源副本、
两边要同步改 —— 这是本 change 不解决但必须留下线索的重复。

## Risks / Trade-offs

- **[改名让该行在列表里跳位]** → 列表按 `ORDER BY name, email`，改名后重排是排序生效的正常表现。
  选中态以邮箱为键（`selected` 存的是 email），因此详情面板不会跟着跳到别人身上。
  风险在于将来有人把选中态改成按索引 —— 加一条前端测试钉住"改名后选中的仍是同一封邮箱"。
- **[`Annotated` + `| None` 的组合行为被误解]** → 三种输入（缺键 / null / 空白串）各写一条测试。
  这套哨兵语义已经在 `student-write` 上踩过一次坑（显式 `null` 写进 NOT NULL 列 → 500），
  不靠"我记得 Pydantic 是这样"。
- **[搬迁漏改某个 import 导致构建失败]** → 这是最好的一类风险：`tsc` / `next build` 当场报错，
  不会留到运行时。搬迁后跑一次前端测试与构建即可。
- **[删 `ro` 分支时误删仍被使用的样式类]** → `ro` 只影响 `cursor-default` 与"点击不进入编辑"，
  删除后所有字段都可编辑 —— 这正是期望（剩下的字段本来都可编辑）。
- **[前端搜索匹配 `wechat` 让"未对齐"筛选器语义重叠]** → 不重叠：筛选器判断的是有无，
  检索判断的是内容包含。两者可叠加使用。

## Migration Plan

**无 schema 变更**，`supabase/migrations/` 不增文件，因此没有数据库回滚需求。

部署照常：前端 Vercel、后端 Render 自动重新部署。回滚 = revert 提交并等重新部署。

一处顺序性：后端 `StudentUpdate.name` 必须先于前端的姓名编辑入口上线，否则前端提交
`{"name": ...}` 会被后端当作未知字段。两侧在同一个 change 内、同一次部署窗口，
但若分两次部署，**先后端**。

## Open Questions

（无阻塞项。以下为已定但值得复述的边界：）

- 空白姓名返回码：实现层用 Pydantic 默认的 422；spec 只锁"4xx 拒绝"
- `sid` 删除后不提供替代的"学员 ID"展示 —— 邮箱就是标识，详情面板顶部已有
