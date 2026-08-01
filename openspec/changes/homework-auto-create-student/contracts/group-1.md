### Contract
- **Spec**: 系统 SHALL 自动创建该学员的最小档案与一条报课记录，并 SHALL 正常写入该行的成绩——不再跳过、不再要求人工先建档。自动创建的 `Student` SHALL 使用源文件中的邮箱与姓名；姓名为空时 SHALL 写入占位值「待定」。`region`、`level`、`source` 三个必填字段 SHALL 使用固定占位默认值（`region="美东"`、`level="有基础"`、`source="讲武堂"`）。自动创建的 `Enrollment` SHALL 关联到本次导入的目标课程，`session_id` SHALL 为空，`source` SHALL 为 `"derived"`。同一邮箱在同一课程被多次导入时，SHALL NOT 重复创建 `Student` 或 `Enrollment`。（`specs/homework/spec.md`）该报课记录的 `enrolled_at` SHALL 取该课程所有场次中最早的 `local_date`；该课程尚未创建任何场次时，SHALL 回退为本次导入发生的日期。（`specs/enrollment/spec.md`）
- **Runtime**: `cd backend && pytest tests/test_homework_import.py` → expected: 全部通过，新增用例覆盖自动建档/建报课/enrolled_at 回退/幂等/dry_run，无既有用例回归
- **Code**: 未知邮箱集合就是 `emails 中不在 known 的部分`，复用 `_classify` 已有的批量查询，不逐行查库；`enrolled_at` 的 `min(local_date)` 查询只在存在未知邮箱时才执行一次；dry_run 与非 dry_run 共用同一份"未知邮箱集合"计算，只是后者才真正 `session.add`；占位默认值写成模块级常量 `_AUTO_CREATE_DEFAULTS` / `_UNKNOWN_NAME_PLACEHOLDER`
- **Threshold**: 80
