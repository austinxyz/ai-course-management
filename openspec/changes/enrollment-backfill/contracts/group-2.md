### Contract
- **Spec**:
  - 由既有记录（如作业成绩）倒推建立的报课 SHALL 标为 `derived`。
  - （脚本本身的行为不入 spec —— 与 `tools/notion-import`、`tools/course-import` 同例，
    一次性程序归 `tools/`。这里的 Spec 只约束它写出来的数据形状。）
- **Runtime**: `cd tools/enrollment-backfill && python -m pytest -q`（或项目既有的 tools 测试方式）
  → expected: 纯函数部分（读 CSV、按 (邮箱, 课程) 去重、别名归一化、日期取最早场次）的单元测试通过
- **Code**:
  - **权威源是 `grades.csv`，不是 Notion** —— Notion 那 19 条作业记录本身是从这些 CSV 生成的衍生数据
  - **课程靠别名查**（`normalize_alias`，与 `tools/course-import` 同一路径），查不到就中止并报告，不猜
  - **`session4` 跳过并说明原因** —— 0 行且表头与 session3 高度重合，`session4 → S4` 无证据
  - `enrolled_at` 取该课程**最早一场**的日期；课程没有任何场次时中止（编一个日期会让记录看起来像今天报的）
  - 未匹配的学员**跳过并只列邮箱**（不列姓名），不自动建档
  - 重跑幂等**靠数据库**：直接写、把 409 归类为"已存在"，不先查再写（TOCTOU 且多一轮往返）
  - dry-run 默认，`--apply` 才写；**不提供 `--undo`**（只在出错时才跑的删除路径本身就是没被测过的危险代码）
- **Threshold**: 80
