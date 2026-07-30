## Context

`course-catalog` 于 2026-07-30 归档上线。同日准备导入真实课程时发现两个字段存不下真实数据，
根因相同：**我把设计稿里的示例值当成了真实约束**——
1/2/3/4 小时的 chip 变成了 `hours int` + `ge=1 le=4`，
「时间（美西）」这句文案变成了写死的换算基准与 schema 默认值。

生产现状：一门课（`hours = 2`）、两场（均 `America/Los_Angeles`），
都是我在生产验收时建的占位内容，紧接着会被导入脚本覆盖。所以本 change 的数据迁移风险极低。

## Goals / Non-Goals

**Goals:**

- 时长以分钟存储且能表达 150
- 课程有默认时区；场次录入时可选时区，标签跟随
- 换算基准从"写死美西"变成"该场次自己的时区"

**Non-Goals:**

- 导入课程数据（一次性脚本，本 change 是其前置）
- 期次字段、价格、任意时区选择器
- 改默认时区时回溯已有场次

## Decisions

### 1. `hours` 换成 `duration_minutes`，一次 migration 内完成

```sql
alter table courses add column duration_minutes int not null default 120;
update courses set duration_minutes = hours * 60;
alter table courses drop column hours;
```

**替换而非并存**：两个来源必然有一天不一致，而"这门课多长"只该有一个答案。
回填用 `hours * 60` 而非直接给默认值，是为了不丢已有数据——即便这次生产上只有一条、
且随后会被导入覆盖，migration 也要能在任何一份数据上正确重放。

新列默认值 120 分钟（=原默认 2 小时），保持"新建课程不填时长"的行为不变。

**回滚**（人工，本项目无 down migration）：
`alter table courses add column hours int not null default 2; update courses set hours = greatest(1, round(duration_minutes / 60.0)); alter table courses drop column duration_minutes;`
——注意这一步**有损**：150 会变成 2 或 3。回滚前要确认没有非整小时的数据。

### 2. `default_tz` 是"新增场次时的预选值"，不是"场次时区的真相"

```sql
alter table courses add column default_tz text not null default 'America/Los_Angeles';
```

场次的 `tz` 仍然是每场自己存的。`default_tz` 只在**新增场次的表单**里被读一次，
作为 chip 的初始选中值。

**为什么不回溯**：改一个叫"默认"的字段，如果会改掉已排好的历史场次的时区，
那就等于用一次配置修改静默改写了历史记录的含义——"6 月那场到底几点上的"会变。
默认值影响未来，不影响过去。

**DB 默认值留美西**，不跟着这位讲师的美东习惯走：schema 的默认值是所有用户的起点，
而这里的"所有用户"目前虽然只有两人，写进去的东西却会活很久。
四门真实课程的美东由导入脚本显式设置。

### 3. 时区 chip 与换算行共用 `ZONE_ROWS`

`lib/tz.ts` 已有 `ZONE_ROWS`（美西/美东/加拿大/上海），供场次卡片的换算行使用。
时区 chip 直接用同一个数组。

**理由**：两份清单会漂移，且漂移的方式很难看——用户能选一个时区，
但那个时区不出现在换算行里，于是"我按这个时区录的，为什么下面不显示它"。
共用一份的代价是 chip 与换算行必须同增同减，这正是我们想要的耦合。

API 层不受此限制：`TimezoneName` 校验器接受任意 IANA 名，导入脚本要用（比如将来出现
`Asia/Taipei` 的专场）。**界面不给的东西，API 不禁止**——界面是便利，API 是契约。

### 4. 时长用数字输入，不用 chip

真实值是 150，而 90/120/150/180 这类 chip 一旦不够用就会退化成"选个最接近的"——
那正是这次要修的毛病，用 chip 只是把上限从 4 挪到别处。

输入框收分钟数，校验 15–600。前端在提交前做同样的范围检查，
但**后端才是判据**（前端校验是为了少一次往返，不是安全边界）。

### 5. 场次编辑态也能改时区

新增能选、编辑不能改的话，录错时区就只能删了重建——而删除是不可逆的，
重建又丢掉备注与状态覆盖。`SessionUpdate` 本来就有 `tz` 字段（group 4 就加了），
界面补上即可。

## Risks / Trade-offs

- **[migration 在有真实数据的库上回填出错]** → 生产此刻只有一条课程且值为 2（→120），
  回填公式简单；但 migration 会在本地 `db reset` 时与所有 seed 数据一起重放，
  测试里要有"回填后值正确"的断言，而不是只看列存在。
- **[前端字段改名遗漏]** → `hours` → `duration_minutes` 会触及类型、fixture 与三个组件。
  `tsc --noEmit` 会当场报错，这是最好的一类失败。
- **[时区 chip 默认值取错]** → 新增场次时若没读到课程的 `default_tz`，会静默按美西建场，
  而"静默按错误时区落库"事后极难发现（时间看起来是对的，只是差三小时）。
  这条要有测试：课程默认美东 → 打开新增表单 → 断言选中的是美东。
- **[编辑既有场次时把时区改错]** → 与上一条同源。编辑态的 chip 初始值必须是**该场次自己的 tz**，
  不是课程默认——否则打开一个美西的旧场次会看到"美东"被选中，一保存就改了它。

## Migration Plan

一个 migration 文件，两件事（换列 + 加列）。**纯 DDL + 一次 UPDATE，无数据风险**。

- **顺序**：DB → 后端 → 前端。`duration_minutes` 不存在时后端会 500；
  前端先上会整页错误态。同一次 push 时先确认 migration workflow 绿再验收页面。
- **本地**：`supabase db reset` 重放全部 migration；重放后**必须重启后端进程**
  （连接池会全废、进程仍在监听）。
- **回滚**：见决策 1，有损，回滚前确认无非整小时数据。

## Open Questions

（无阻塞项。以下为已定但值得复述的边界：）

- 时长默认值 120 分钟；范围 15–600
- `default_tz` 的 DB 默认值 `America/Los_Angeles`
- 界面时区只给 `ZONE_ROWS` 四个，API 收任意 IANA 名
