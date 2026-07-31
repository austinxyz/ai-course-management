## Context

`homework` 上线后，导入只能这么走：有 `ai-course` 仓库的 checkout → 在那台机器上 →
记得命令行怎么写。生产上已有 26 条成绩，全部是这么进去的。

三个约束把设计空间压得很窄：

1. **浏览器不直连 FastAPI**（架构纪律）。上传必须经 Next.js 转一手
2. **已知的下一个调用方是 MCP**，它不经过 Next.js
3. **Server Action 编译成页面路由上的一个 POST 端点**，`proxy.ts` 覆盖页面加载
   不构成对它的保护（既有代码里已有这条注释）

## Goals / Non-Goals

**Goals:**

- 选一个文件就能更新成绩，不依赖本地有任何东西
- 写入前一屏预览，且预览的数字与真跑一致
- 解析与校验**只有一处实现**，在后端

**Non-Goals:**

- MCP 服务器本身、学员/报课导入、保存原文、满分与图、改变认证模型

## Decisions

### 决策 1：文件内容以**文本**送到后端，不用 multipart

Server Action 拿到 `File` 之后读成 `ArrayBuffer`，以 base64 放进 JSON 请求体，
后端解 base64 拿到原始字节再自己解码。

**备选：multipart/form-data 直传后端。** 被否决 —— 后端要多一个 multipart 解析器
（`python-multipart`），而真正的问题是**编码判定必须拿到原始字节**：
一旦在 Next 侧用 `file.text()` 读成字符串，浏览器已经按 UTF-8 解过一遍，
GBK 文件在这一步就变成替换字符了，后端再想试 GB18030 已经没有原始字节可试。

**备选：Next 侧读文本再送。** 同上，这正是那个陷阱。**必须传字节。**

### 决策 2：解码在后端，顺序固定 UTF-8 → GB18030 → 拒绝

```python
for encoding in ("utf-8-sig", "gb18030"):
    try:
        return text.decode(encoding), encoding
    except UnicodeDecodeError:
        continue
raise CannotDecode
```

`utf-8-sig` 而不是 `utf-8`：Excel 存的 UTF-8 带 BOM，不剥掉的话第一个列名会变成
`﻿姓名`，于是「姓名」这一列认不出来 —— 而错误信息会说"表头缺少必需的列"，
指向一个完全不相干的方向。

GB18030 而不是 GBK：前者是后者的超集，能解的更多，且对纯 GBK 内容结果相同。

**顺序不能反**：GB18030 几乎能解开任何字节序列（单字节部分兼容 ASCII），
先试它的话 UTF-8 中文会被静默解成乱码而不报错。

### 决策 3：一个端点，`dry_run` 是查询参数

`POST /api/homework/import?dry_run=true|false`。同一条代码路径，dry-run 只是最后不落库。

**dry-run 不往 session 里放对象**，不是"照常 add 最后 rollback"。后者让 dry-run 的
正确性取决于调用方的事务边界 —— `homework` 那次就踩了：回滚把 pytest fixture 自己的
清表操作一并撤销，本该不可见的数据浮回来。**不写就是不写。**

**结构化的 `PUT /api/homework` 移除。** 只留一条进库的路，就不会有两套校验。

### 决策 4：预览与确认送**两次**文件，不在服务端存临时上传

浏览器留着 `File` 对象，确认时再读一次、再送一次。

**备选：服务端存临时上传，确认时引用 id。** 被否决 —— 要多一张表、要过期清理、
要处理"确认时那份临时数据已被清掉"。而文件是几 KB。

代价：预览与确认之间数据库可能变化（比如有人加了学员），于是真跑结果与预览不同。
这在任何方案里都存在（临时存储也不冻结数据库）。**确认后的响应报的是实际结果**，
不是预览时的数字 —— 界面显示实际结果，不复述预览。

### 决策 5：排除名单是独立表，键是邮箱

```sql
create table homework_excluded_emails (
  email text primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);
```

**不挂在 `students` 上**：被排除的人**恰恰可能不在学员表里**（讲师本人就是），
挂上去等于要求先给他建档，而建档正是我们不想做的事（建了档他的测试提交就会进名单）。

**不按课程分**：讲师的测试提交在哪门课都不该算。按课程分会让"我上次是不是标过"
变成一个要逐课回忆的问题。

### 决策 6：解析层迁入 `backend/app/homework_parsing.py`，工具删除

`tools/homework-sync/parsing.py` 是纯函数，直接搬。`sync.py` 与其测试删除，
`test_parsing.py` 搬进 `backend/tests/`。

`tools/homework-sync/README.md` 里那些教训（目录名不可信、两份清单处置相反、
覆盖式不是同步式删除）不能随目录一起删 —— 它们移进 `backend/app/homework_parsing.py`
的模块 docstring 与 `openspec/specs/homework/spec.md`。

### 决策 7：Server Action 只做三件事

```
读 File → ArrayBuffer → base64
requireSitePassword()
fetch 后端，原样返回结果
```

**一行业务逻辑都不放。** MCP 那条路绕过它，任何落在这里的规则都会两条路径不一致。

**预期内的结果用返回值表达，不抛异常** —— 编码不对、表头不符、课程不存在、
体积超限，全是用户正常操作能撞到的。Server Action 抛出的错误在生产构建里
只剩一个 digest，客户端拿不到内容（`student-write` 那次的教训）。

### 决策 8：导入记录只在**实际写入**时产生

`homework_imports` 表记 `course_id` / `filename` / `row_count` / `created` / `updated` /
`encoding` / `imported_at`。dry-run 不写记录 —— 否则"上次导入"会指向一次没发生的导入。

## Risks / Trade-offs

**[Next 侧把文件读成文本，GBK 检测失效]** → 决策 1 的核心。测试必须构造一份
**真正的 GB18030 字节序列**并断言解码正确，而不是构造一个 Python str 再 encode 回去 ——
后者在任何实现下都能通过。

**[BOM 没剥掉导致"表头缺少必需的列"]** → 用 `utf-8-sig`。测试要带 BOM 的夹具。

**[解码顺序反了]** → 测试一份 UTF-8 中文文件，断言 `encoding == "utf-8"` 而不只是
"内容对"。GB18030 会把 UTF-8 中文解成别的中文字，内容"对不对"人眼才看得出。

**[dry-run 写成 rollback]** → `homework` 已经踩过一次，见决策 3。

**[标记排除后前端自己减数字]** → 数字会与后端不一致，且只在写入后暴露。
重算必须是重新请求一次预览。测试要断言标记后**发生了第二次预览请求**。

**[预览屏在写入期间被关掉]** → 失败信息随组件一起消失（`course-catalog` 那次
evaluator BLOCK 两轮）。写入期间禁用**所有**出口含取消；只在成功回调里关闭。
测试用**挂住不 resolve 的 promise** 断言 disabled。

**[清表 fixture 漏了新表]** → 两张新表引用 `courses`。`empty_course_tables` 要把它们
排在被引用方**之前**删，否则一批不相干的测试红在 setup 阶段。

**[删掉 `tools/homework-sync` 时把教训一起删了]** → 决策 6。

## Migration Plan

一支 migration，纯新增：

```sql
create table homework_excluded_emails (
  email text primary key,
  note text not null default '',
  created_at timestamptz not null default now()
);

create table homework_imports (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses (id) on delete cascade,
  filename text not null,
  encoding text not null,
  row_count int not null,
  created_count int not null,
  updated_count int not null,
  imported_at timestamptz not null default now()
);

create index homework_imports_course on homework_imports (course_id, imported_at desc);
```

**回填**：一条 —— 把讲师本人的邮箱写进 `homework_excluded_emails`，
因为 CLI 的 `--exclude` 随工具一起消失，不回填的话那条约束就断了。
（注意：本地 `supabase db reset` 是空库重放，这条回填**不被任何本地测试覆盖**，
证据只能来自生产验收。）

**回滚**：`drop table homework_imports, homework_excluded_emails;`。
既有的 `homework_submissions` 不受影响。回滚后排除名单丢失 —— 影响是下次导入会
把讲师的测试提交写进去，需要人工再删。

**部署顺序**：migration → 后端 → 前端。反了的话前端的导入按钮会打到一个不存在的端点。

## Open Questions

无阻塞项。

一条留给实现时决定的：**排除名单的删除入口**。本片只做"加入"（在预览里标记），
没有"移出"。理由是加错的概率低且后果轻（少导一个人的成绩，重新标记不了就得改库）。
如果实现时发现加错很容易发生，就在预览里给已排除的行一个"恢复"。
不预先做，是因为那会多一个几乎不会被点的控件。
