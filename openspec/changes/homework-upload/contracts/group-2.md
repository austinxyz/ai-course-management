# Group 2 — 导入接口 + 排除名单 + 导入记录

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
