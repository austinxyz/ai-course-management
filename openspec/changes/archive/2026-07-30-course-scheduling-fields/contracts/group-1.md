### Contract
- **Spec**:
  - **每场时长 SHALL 以分钟存储**，取值范围 15–600。SHALL NOT 限制为整小时——真实课程的时长是 150 分钟，整小时表达不了。
  - 课程 SHALL 有一个默认时区（IANA 时区名）。该默认值 SHALL 仅用于新增场次时的预选，SHALL NOT 回溯改变任何已有场次的时区。
- **Runtime**: `cd backend && uv run pytest -q` → expected: 分钟边界（150 可存、0/负数/601 被拒）、migration 回填正确（`hours=2` → `120`）、默认时区可设且非法 IANA 名被拒，全部通过；既有 84 项无回归
- **Code**:
  - `hours` → `duration_minutes` 是**替换不并存**：migration 内 `add column` → `update ... hours * 60` → `drop column`。两个来源必然有一天不一致
  - 回填用 `hours * 60` 而非直接给默认值 —— migration 要能在任何一份数据上正确重放，不只是当前生产那一条
  - `default_tz` 复用既有 `TimezoneName` 校验器（zoneinfo 认得的键才收）；DB 默认留 `America/Los_Angeles`，不写入某个用户的排课习惯
- **Threshold**: 80
