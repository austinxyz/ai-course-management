## Context

作业成绩由 `ai-course` 仓库的 `grade-homework.skill` 批出来，汇总在
`tools/homework-grader/session*/grades.csv`。共 28 行 / 27 人，分布在 S1（18 行 / 17 人）、
S2（9 行）、S3（1 行）。S4 一份都没有。

这些数据从未进过本系统的库。`enrollment-backfill` 只用掉了「有没有成绩」这一个比特。

三条既有约束把设计空间压得很窄：

1. **跨仓库数据先导入、不做运行时依赖**（CLAUDE.md）。部署环境的后端看不到那些 csv 文件
2. **新增课程不得要求改表结构**（CLAUDE.md）。各课分项列零交集
3. **作业按人计，不按报课记录计**（`enrollment` spec 已写）

## Goals / Non-Goals

**Goals:**

- `grades.csv` 的全部内容进库，且新增课程不动表结构
- 「有报课记录但无提交记录」第一次可计算 —— 为催作业打底
- 同步可重复：同一份文件跑两遍结果一致

**Non-Goals:**

- 催作业全链路、互动记录、网页上触发同步
- 各分项满分、条形图、历史版本、截止后交
- 任何写入界面

## Decisions

### 决策 1：分项评分存 `jsonb` **数组**，不存对象

```sql
scores jsonb not null default '[]'::jsonb
-- [{"item": "A1工作流结构", "score": 11}, {"item": "A2数据传递", "score": 9}, …]
```

**备选：`jsonb` 对象 `{"A1工作流结构": 11, …}`。** 被否决 —— Postgres 的 `jsonb`
**不保证对象键顺序**（存储时按键长度、再按字节序重排，且去重）。而列的先后顺序是评分表
分组结构的唯一载体（A 工作流 / B 提示词 / C 输出 / D 心得）。取出来乱序就再也复原不了。

**备选：`json`（非 b）类型。** 保留原文因而保序，但失去索引与运算符，且把"要不要保序"
这个决定藏在一个字母里。数组是显式的。

**备选：分项单独一张表 `homework_scores(submission_id, ordinal, item, score)`。**
规范但过度 —— 我们从不按分项查询、从不聚合，只整块读出来渲染。多一张表就多一次 JOIN，
而往返次数是这个系统的主要延迟来源（决策 5）。

### 决策 2：唯一键是 `(student_email, course_id)`，不含 `session_id`

`enrollment` spec 已定「作业按人计」。一个人重复听同一门课有多条报课，但只欠一份作业。
把 `session_id` 放进唯一键会让同一份作业按场次复制。

源文件里同一人同一课出现两行时，取提交时间较晚者；同时间取文件靠后者。
这个消歧规则**写在解析层**，落库时已经是每人一行 —— 让 upsert 去处理"哪一行赢"
会让顺序变成隐式依赖。

> `enrollments` 那边需要两条 partial unique index 是因为 `session_id` 可空、
> 而 `NULL != NULL`。这里没有可空列参与唯一键，一条普通 unique 约束就够。

### 决策 3：同步走 HTTP，写接口是幂等 `PUT`，不是 `POST`

CLI 通过 `PUT /api/homework` 提交，body 带 `course_id` + 一批行。语义是
「这批行的最新状态是这样」，服务端做 upsert。

**备选：CLI 直连数据库。** 违反架构纪律（只有 FastAPI 能访问数据库），且会长出第二套
校验逻辑。

**备选：`POST` + 409。** 那会把幂等性推给调用方去处理冲突 —— 而"重复跑不出错"正是
本次的核心成功标准之一。

**返回体**须区分 `created` / `updated` / 两类 `skipped`，因为 CLI 的报告直接由它渲染。
让服务端来分类，是因为"这门课有没有报课记录"只有数据库知道。

### 决策 4：`session_id` **不**进作业表

作业属于「这个人 + 这门课」，与他上哪一场无关（决策 2）。场次只在**呈现**时用到 ——
判断一个没交的人是「未交」还是「未开放」。那是从报课记录读的，不是作业的属性。

把 `session_id` 存进作业表会立刻产生一个无法回答的问题：一个人两条报课、一份作业，
这份作业算哪一场的？

### 决策 5：读接口一次往返取全

```python
select(Enrollment, Student, Course, CourseSession, HomeworkSubmission)
  .join(Student, ...)                      # 归档状态 + 姓名 + 微信号
  .join(Course, ...)
  .outerjoin(CourseSession, ...)           # 可空
  .outerjoin(HomeworkSubmission,           # 没交的人也要在名单里
      (HomeworkSubmission.student_email == Enrollment.student_email) &
      (HomeworkSubmission.course_id == Enrollment.course_id))
```

实测每次往返 ≈ 61ms，固定开销 ≈ 103ms。往返次数**就是**用户感知的延迟。
以 `Enrollment` 为驱动表（名单来自报课），`HomeworkSubmission` 走 outer join ——
反过来以作业为驱动表会漏掉所有没交的人，而那正是这一页要回答的问题。

按人去重（`enrollment` 的「作业按人计」）在 Python 侧做：
同一邮箱的多条报课合并成一行，状态取**最"宽容"**的那条 —— 已交 > 未开放 > 未定场次 > 未交。
理由：一个人报了两场，其中一场还没上，就不该被催。

> ⚠️ 这条合并规则是设计时定的，spec 里只规定了「按人去重」没规定"合并时听谁的"。
> 实现时它必须是一个具名函数并单独测到，否则会被写成"取第一条"而看不出错。

### 决策 6：「场次已结束」复用 `derive_session_state`

`backend/app/routers/courses.py` 已有 `derive_session_state`（`course-scheduling-fields`
引入，`enrollment-core` 已在用）。它处理了人工覆盖的场次状态（如已取消）。

不得另写日期比较。同一概念两处实现会在 `state_override` 这类边界上分叉，
而这种分叉的症状（某人被误催）只有收件人看得到。

### 决策 7：解析与推送分离，CLI 独立成 `tools/homework-sync/`

```
parsing.py   纯函数：csv 文本 → 规范化的行 + 消歧 + 分类。零 I/O，零网络
sync.py      读文件、调 API、渲染报告、--dry-run
```

`--dry-run` 走完整条解析与分类路径，只是不发 `PUT`。它必须能报出两份跳过清单 ——
否则 dry-run 看不出真实执行会跳过谁，等于没有 dry-run。

**不并进 `tools/enrollment-backfill/`**：那个是一次性的历史倒推（已归档），
homework-sync 要长期反复跑。代价是 csv 解析有两份 —— 接受，两者读的列不同
（前者只要邮箱，后者要整行）。

输出全部经 `sys.stdout.buffer.write(line.encode("utf-8"))`。
`sys.stdout.reconfigure` 对已被重定向的流不生效，不用。

### 决策 8：归档与退课在**读接口**过滤，不在同步时过滤

同步照常写入已归档学员的成绩（成绩是历史事实），过滤只发生在作业页的名单与计数上。

**备选：同步时就跳过。** 被否决 —— 归档是可撤销的（`student-roster` 有恢复功能），
恢复之后成绩不该凭空消失，也不该要求重跑一次同步才回来。

## Risks / Trade-offs

**[JSONB 数组被实现成对象]** → spec 里已把"保序"写成硬要求并注明 `jsonb` 不保键序；
测试须断言取出的 item **顺序**与源表头一致，而不只是断言集合相等。
集合相等的断言对这个缺陷全盲。

**[按人去重的合并规则被写成"取第一条"]** → 读接口没有 `ORDER BY` 时"第一条"根本不可依赖
（`enrollment-backfill` 生产验收时因此改错过用户的数据）。合并须是具名函数 + 独立测试，
且构造"两条报课、状态不同"的夹具。

**[清表 fixture 漏了新表]** → `homework_submissions` 引用 `students` 与 `courses`。
`empty_course_tables` 之类的 fixture 必须把它排在被引用方**之前**删。
漏了的症状是一批**与作业毫不相干**的测试红在 setup 阶段（`enrollment-core` 时 129 个测试
全 error 就是这么来的）。

**[表格被 `overflow-hidden` 裁掉]** → S1 有 17 行，够撞上（报课页是 22 条时暴露的，
4 条时看着好好的）。外框须 `flex-none`。**jsdom 没有布局，单测量不出来** ——
必须在真实浏览器里用 S1 全量数据验一次。

**[往返次数悄悄退化]** → 在 `test_query_roundtrips.py` 里加一条断言，与既有两条同处。

**[dry-run 在真实终端崩掉]** → 留一个"模拟单字节编码流"的测试。
`enrollment-backfill` 时本地测试全绿、真在终端跑才炸，因为 pytest 捕获的是内存流。

**[生产上页面只显示 14 / 8 而不是 17 / 9]** → 这是**正确行为**（名单来自报课记录，
而报课比成绩少）。写进验收步骤：先按同步输出的第二份清单补齐报课，再核计数。
不写清楚的话，验收时会被当成缺陷去"修"。

## Migration Plan

单支 migration，纯新增，不触碰任何既有表：

```sql
create table homework_submissions (
  id uuid primary key default gen_random_uuid(),
  student_email text not null references students (email) on delete cascade,
  course_id uuid not null references courses (id) on delete cascade,
  submitted_at date not null,
  total int not null,                              -- 取自源文件，不重算
  scores jsonb not null default '[]'::jsonb,       -- 有序数组
  highlight text not null default '',
  improve text not null default '',
  reply_status text not null default '',           -- 原样存，不归一化
  source_ref text not null default '',             -- "session1/grades.csv:7"
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index homework_submissions_unique_person_course
  on homework_submissions (student_email, course_id);

create index homework_submissions_course on homework_submissions (course_id);
```

**回滚**：`drop table homework_submissions;`。没有其它表引用它，没有既有数据被改动，
因此回滚是完全的 —— 唯一损失是同步进来的成绩，而权威副本仍在 `ai-course` 仓库的 csv 里，
重跑一次同步即可恢复。这也是纯镜像的一个附带好处。

**回填**：无。表是空的建起来，数据由 CLI 推入。
（对照 `course-scheduling-fields` 的教训：带回填的 migration 在本地永远跑在 0 行上，
本地绿灯不构成证据。这里没有回填，不受此影响。）

**部署顺序**：migration → 后端 → 前端 → 本地跑同步。
前端先上会看到空名单，不会报错；后端先上而 migration 没跑会 500。

## Open Questions

无阻塞项。

一条留给人工确认的边界（已写进 spec 的 ⚠️ 注记）：**场次被人工标记为已取消**时，
报了那一场且没交的人应落到「未开放」还是「未定场次」？spec 目前只约束
"必须与课程页的场次状态一致、不得自行按日期算"，没有指定落到哪一态。
两种都不会造成误催，所以不阻塞实现；实现时取「未定场次」（取消后这些人本来就要改派），
若人工 review 认为该是「未开放」，改动只在一个派生函数里。
