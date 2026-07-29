### Contract
- **Spec**: 后端 SHALL 接受 Supabase 控制台格式的数据库连接串（`postgresql://` 前缀）并以 psycopg v3 驱动建立连接，不得因驱动解析而在启动时崩溃。
- **Runtime**: `cd backend && uv run pytest tests/test_db_url.py -v` → expected: 全部用例通过，覆盖 `postgresql://`、`postgres://`、已带 `+psycopg` 三种输入
- **Code**: design.md 决策 #1 —— 归一化写在 `db.py` 内部而非依赖人工填对格式；已带 `+psycopg` 的串必须原样透传，不得重复改写；归一化只影响驱动选择，不得改动主机/库/凭证任何一项
- **Threshold**: 80
