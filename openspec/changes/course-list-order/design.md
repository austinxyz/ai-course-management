## Context

`course-catalog` 上线并导入四门真实课程后，讲师试用发现两处。

现状：`list_courses` 用 `order_by(Course.name, Course.id)`；课程页把课程渲染成一排
`flex-wrap` 的 chip，详情卡片在其下方。生产上四门课，chip 尚未换行 ——
但这是数量掩盖的问题，不是没有问题。

设计基准（`docs/superpowers/specs/mocks/2026-07-29-course-enrollment-design.dc.html`
第 443–458 行）写得很明确：

```
外层  flex:1;min-height:0;display:flex;overflow:hidden
左栏  width:264px;flex:none;border-right:1px solid #e4e0d8;background:#fbfaf8;
      overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px
右侧  flex:1;min-width:0;overflow-y:auto;display:flex;flex-direction:column
```

## Goals / Non-Goals

**Goals:**

- 课程按最早场次日期倒序；未排课优先；顺序稳定
- 课程页恢复左右两栏，左栏独立滚动

**Non-Goals:**

- 学员名单排序（另一条能力）、手动排序、搜索筛选分页
- 改场次内部排序
- 把布局写进 spec

## Decisions

### 1. 排序在应用层，不在 SQL 里

排序键是子集合的聚合值（`min(local_date)`）。用 SQL 表达需要 outer join + `func.min` +
`nulls first` 的组合，可读性明显更差；而端点本来就把所有场次取回来在内存里按 `course_id` 归拢了
（那是为了避免 N+1），排序键因此已经在手边。课程数量是个位数。

**若将来课程上百**，把它推到 SQL 里；那时 N+1 与内存排序的代价会一起变得显著，
应当一并处理，而不是只搬排序。

### 2. 倒序用"反转键"而不是 `reverse=True`

三段排序键：`(未排课=0/已排课=1, 日期, 名称, id)`。日期要倒序，其余要正序。
`sorted(reverse=True)` 会把三段一起反过来 —— 名称兜底也跟着反了，同日两门课的顺序
就与"名称升序"这条说法相反。

因此日期段用一个**字符反转**函数变成"越新越小"的字符串，整体保持升序：

```python
def _reverse_date(iso: str) -> str:
    return "".join(chr(ord("9") - int(ch)) if ch.isdigit() else ch for ch in iso)
```

**为什么不用 `datetime.date.max - d` 之类的算术**：ISO 字符串直接可比，且这个函数
对 `2026-07-26` 这种带分隔符的串是安全的（非数字原样保留）。
代价是可读性，所以它有名字和注释，而不是内联在 lambda 里。

**替代方案**（未采用）：给排序键的日期段取负的 ordinal（`-d.toordinal()`）。
这个更直观，但会让键的类型在"未排课"分支上不一致（`0` vs `-739000`），
而 Python 的元组比较要求同位置类型可比。用字符串统一了两个分支的类型。

### 3. 未排课优先靠分组位而非哨兵日期

用 `(0, "")` 与 `(1, 反转日期)` 两段表达，而不是给未排课的课程编一个"很大的日期"。
哨兵值会在将来某天与真实数据撞上（真有人排到 9999 年吗——不会，但哨兵一旦泄漏到别处就难查）。
分组位把"有没有排课"这件事显式写在键里。

### 4. 左右布局：把现有内容搬进两栏容器，不重画

课程列表与详情两块 JSX 本身不改，改的是它们外面的容器：

- 外层从 `flex-col` 改为 `flex`，`overflow-hidden`
- 课程列表从 `flex-wrap` 的横排改为左栏内的纵向列表（`w-[264px] flex-none border-r overflow-y-auto`）
- 详情包进 `flex-1 min-w-0 overflow-y-auto`

**`min-w-0` 不能省**：flex 子项默认 `min-width:auto`，长课程名会把右栏撑开、
把左栏挤扁。这类问题在四门课时看不出来，在名字长的课上立刻出现。

### 5. 前端不再持有任何排序逻辑

现在前端也没有排序（列表直接 map），本 change 之后仍然没有。这一点写进 spec 是有意的：
只要前端可以重排，"最近开课在前"就只是某个客户端的看法，而不是数据的属性。

## Risks / Trade-offs

- **[排序键的稳定性没被测到就等于没有]** → 「顺序不因写入而抖动」这条要用**真实写入**来测：
  两门排序键相同的课，编辑其中一门后再查。只断言"两次 GET 相同"是不够的 ——
  学员名单那次的 bug 恰恰是 `UPDATE` 之后才显形（行被写到堆尾）。
- **[左栏改动波及既有测试]** → 现有课程页测试按文本查找课程按钮，不依赖布局，
  预计不受影响；若有断言绑定了 chip 的容器结构，一并改。
- **[生产数据只有四门课，看不出布局问题]** → VISUAL DIFF 时临时用窄窗口或多造几门课
  验证左栏滚动，不能只看"四门课的样子挺好"。

## Migration Plan

**无 schema 变更，无数据迁移。** 纯代码改动，前后端各自部署即可，顺序不敏感 ——
后端先上则前端显示顺序变化，前端先上则布局变化，两者都不会出错。

回滚 = revert 提交。

## Open Questions

（无阻塞项。以下为已定边界：）

- 未排课排最前（人工确认）
- 排序在应用层做，课程上百时再推到 SQL
- 布局不入 spec，靠 mocks 导览 + VISUAL DIFF 验收
