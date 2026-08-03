### Contract
- **Spec**: 系统 SHALL 在课程页提供一处入口，讲师可以给某门课的各个分项录入满分（正整数）。分项名字 SHALL 由系统自动列出——取该课程 `homework_submissions.scores` 中出现过的全部去重分项名，SHALL NOT 要求讲师手工输入分项名。满分 SHALL 允许为空（未配置），已配置的满分 SHALL 拒绝非正整数（0 或负数）。该分项在这门课配了满分时，系统 SHALL 在原始分旁显示满分（「X / 满分」），并 SHALL 绘制一条按比例填充的条形图，条形图与分数文字 SHALL 按同一套三档阈值染色（≥90% 绿、70%–90% 黄、<70% 红）；没有配满分时只显示原始分。总分 SHALL 在这门课当前用到的全部分项都配了满分时显示按比例进度条与同一套三档颜色，否则只显示数字。名单表格每一行 SHALL 显示一串迷你竖条，配了满分的分项才有对应竖条，颜色同三档阈值。（`specs/homework/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_homework_rubric.py tests/test_homework_read.py` → expected: 全部通过，新增用例覆盖满分录入/校验/自动列出分项名、`GET /api/homework` 附带满分与颜色档位、单次往返未被打破
- **Code**: 新表 `homework_rubric_items`（`course_id, item` 主键，`max_score` 带 `CHECK (max_score > 0)`）；`GET /api/homework` 用**标量子查询**（`func.jsonb_object_agg`）把满分表聚合进主查询，不新增 `session.exec` 调用；"总分要不要显示进度条"按**这条提交自己的分项集合**判定（不做跨课程完整性校验）；`PUT /api/homework/rubric` 整表覆盖式写入，`max_score` 为 `null` 的项删除对应行
- **Threshold**: 80
