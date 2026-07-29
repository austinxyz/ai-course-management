### Contract
- **Spec**: N/A —— 基础设施组。本组产出的是部署配置与 CI workflow，不构成对外行为契约，`student-roster` 的 SHALL 由第 1、2 组覆盖。
- **Runtime**: `cd backend && uv run python -c "import yaml; yaml.safe_load(open('../render.yaml', encoding='utf-8')); yaml.safe_load(open('../.github/workflows/db-migrate.yml', encoding='utf-8')); print('yaml ok')"` → expected: 两个 YAML 均能解析，输出 `yaml ok`
  （`encoding='utf-8'` 于 apply 阶段补上：Windows 下 Python `open()` 默认 cp1252，读不了带中文注释的 UTF-8 文件，会误报成 YAML 无效）
- **Code**: design.md 决策 #3（`render.yaml` 走 Blueprint，start 命令必须用 `$PORT` 与 `--host 0.0.0.0`，否则平台健康检查连不上）、决策 #4（Actions 每次 push main 都跑，**不加 `paths` 过滤**——过滤写错的失败模式正是本 change 要消灭的"migration 静默不部署"）、决策 #8（`.env.example` 前后端各一份）
- **Threshold**: 80
