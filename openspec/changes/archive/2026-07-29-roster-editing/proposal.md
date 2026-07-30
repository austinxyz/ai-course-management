---
Date: 2026-07-29
Change: roster-editing
HAS_UI_SURFACE: no
Requirements: docs/superpowers/specs/2026-07-29-roster-editing-requirements.md
---

## Why

对照 `docs/requirements.md` §4.1 逐项体检学员档案能力，发现两处缺口卡住的是既有工作流，
不是未来功能：**姓名是 8 个信息项里唯一不能改的**，而导入进来的名字带群昵称残留
（`Xin`、`Jessie` 这类），改不了就只能归档重建、连带丢掉备注 —— 备注是全系统最不可再生的数据；
**搜索只匹配姓名和邮箱**，而 §5 指定的核心工作流「人工肉眼对齐微信」手上唯一有的信息恰恰是昵称，
于是那个工作流在界面上没有检索入口。

顺带清掉一处会误导人的现状：`frontend/app/students/mock-data.ts` 里**没有任何 mock 数据**，
全是线上词表与线上文案，名字本身就是陷阱。

## What Changes

- **姓名可编辑** —— 详情面板新增姓名字段行，走既有的逐字段编辑通道
  （`PATCH /api/students/{email}` + `updateStudentField`），不新增端点
- **姓名非空校验** —— 先 trim，trim 后为空即拒绝（422）。校验同时作用于
  `StudentUpdate` 与 `StudentCreate`：后者目前是裸 `str`，空姓名建得出来，
  只拦更新会留下同样的坏状态从新建路径产生
- **搜索范围扩至 5 个字段** —— 姓名、邮箱、微信昵称、微信名、微信号，任一命中即命中，
  大小写不敏感。**不含**标签与备注
- **词表搬出 `mock-data.ts`** → `frontend/app/students/vocab.ts`。纯移动，不改内容
- **删除 `FIELDS` 里的 `sid` 行** —— 详情面板显示的「学员 ID」是
  `"stu_" + 邮箱前缀` 当场合成的，数据库里没有这个标识。邮箱才是学员主键，
  界面上摆一个看着像主键的合成值会诱导人拿它当键用。连带清掉
  `keyof Student | "sid"` 类型后门与只为它存在的 `type: "ro"` 分支
- 无 schema 变更，`supabase/migrations/` 不增文件

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `student-roster` —— 「学员字段可持久更新」当前列举的可编辑字段不含姓名，需补入并规定
  trim 后非空（覆盖新增路径）；另补一条列表检索范围的要求，含「检索辅助而非身份匹配」的约束。
  读契约、归档/恢复契约、邮箱不可变均不动

## Impact

- `backend/app/schemas.py` —— `StudentUpdate` 增 `name` 字段；姓名 validator 由
  `StudentCreate` 与 `StudentUpdate` 共用
- `backend/tests/test_students_write.py` —— 姓名更新、空白拒绝、trim、字段隔离
- `backend/tests/test_students_api.py` —— 新增路径的空白姓名拒绝
- `frontend/app/students/types.ts` —— `EditableFieldKey` 增 `name`；去掉 `sid` 类型后门
- `frontend/app/students/mock-data.ts` → `vocab.ts` —— 文件重命名与内容搬迁，
  更新全部 import（`StudentsClient` / `FilterBar` / `DetailPanel` / `NewStudentModal` /
  `StudentsTable` / `Sidebar` / `PlaceholderPage` 及其测试）
- `frontend/app/students/DetailPanel.tsx` —— 姓名字段行；不再渲染「学员 ID」行
- `frontend/app/students/StudentsClient.tsx` —— 搜索匹配范围；placeholder 文案
  由 `FilterBar.tsx` 承载
- `frontend/app/students/*.test.tsx` —— 搜索命中/不命中断言、姓名编辑断言

## Out of Scope

- **标签自由输入 / 白名单可扩** —— 产品选择，进 backlog。已知后果：`Phase1导入`
  这类标签筛不出来，而它存在的唯一理由就是让 18 条导入记录可整批复核。知情接受
- **gender / age / industry 批量导入** —— 目前手工维护，等确定导入方式后另开 change
- **改名留痕 / 审计** —— 表里无时间戳，改完看不出原值。属于 §4.5 互动记录那条线
- **后端搜索与分页** —— 列表全量返回、客户端筛选，19 条记录不构成压力
- **重名合并 / 去重** —— 涉及关联数据归属，独立问题
- **区域时区聚合**（算「哪个时段覆盖最多人」）—— 独立能力
- **`TZ_BY_REGION` 前后端统一** —— 跨语言共享枚举需要生成机制，独立决定。
  本 change 只在搬迁时留注释指明这处重复
