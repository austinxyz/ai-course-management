## Context

`backend/app/routers/students.py:46` 已经是：

```python
students = session.exec(
    select(Student).where(clause).order_by(Student.name, Student.email)
).all()
```

两个测试也在：`test_list_order_is_stable_across_an_edit`（跨编辑稳定）、
`test_list_order_breaks_name_ties_deterministically`（同名以邮箱兜底）。

缺的只是 spec 里的依据。本 change 因此**不含任何代码改动** ——
它的产出全部落在 `openspec/specs/student-roster/spec.md`。

## Goals / Non-Goals

**Goals:**

- 把已在运行的排序规则连同**理由**写进 spec
- 明确"顺序是数据的属性，不随写入抖动"这条不变量

**Non-Goals:**

- 改排序规则、改代码、改测试
- 前端排序 / 手动排序 / 可配置排序
- 给归档名单另立一条排序需求

## Decisions

### 1. ADDED 而非 MODIFIED 既有的「学员列表查询」

那条讲的是"返回哪些字段"，顺序是另一件事。合并会让两个互不相干的断言绑在同一个标题下，
将来任一变化都要动同一个 header —— 而 `openspec archive` 按标题匹配 MODIFIED，
改标题会中止并回滚整次归档（course-scheduling-fields 撞过）。

分开还有一个好处：这条需求可以带自己的理由段，而不必挤进一条讲字段的需求里。

### 2. 需求文本必须包含兜底键

只写"按姓名排序"是不完整的：同名两人的相对顺序仍会随任何写入抖动 ——
那正是原缺陷的形状，只是范围从整份名单缩到了同名那几行。
写清"邮箱是兜底键、且它是主键所以一定能决出顺序"，下一个人才知道这不是可有可无的装饰。

### 3. Scenario 对应既有测试，不新造断言

两条 Scenario 分别是两个既有测试的自然语言版本。**不为了 spec 好看而写出没有测试的断言** ——
那会让 spec 看起来覆盖得比实际更多。

### 4. 与课程列表相反的取值要写明是有意的

课程按最早场次日期**倒序**，学员按姓名**升序**。两条规则并列摆着而没有解释的话，
"统一一下"看起来会像是改进。理由段因此点明：课程列表回答"最近在上什么"，
学员名单回答"这个人在哪"。

## Risks / Trade-offs

- **[承诺了在读与已归档同规则]** → 实现上本就是同一条 `select`（`clause` 只切换归档过滤），
  事实成立；但写进需求即是承诺，而**当时没有任何测试覆盖它**。apply 阶段据此补了
  `test_archived_list_uses_the_same_order`（本 change 唯一的代码改动，且只在测试里）——
  spec 不得声称未被测试的行为，否则它看起来覆盖得比实际多。
  若将来想让已归档按归档时间倒序，这句话要按 REMOVED + ADDED 改，不能原地改标题
- **[spec-only change 的 apply 阶段没有 RED/GREEN]** → 没有代码可写就不造代码。
  验证方式改为：跑测试确认原样通过，并断言生产代码零改动（新增测试除外）

## Migration Plan

无。不部署、不迁移、无回滚需求（回滚 = revert 文档提交）。

## Open Questions

（无。）
