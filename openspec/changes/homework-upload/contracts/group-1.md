# Group 1 — 解析层迁入后端 + 解码

### Contract
- **Spec**:
  - 系统 SHALL 先按 UTF-8 严格解码上传内容；失败时 SHALL 尝试 GB18030；两者皆失败 SHALL 拒绝该文件并 SHALL NOT 写入任何数据。
  - 预览 SHALL **始终**显示实际采用的编码，包括判定为 UTF-8 时。
  - 系统 SHALL 按**内容**判断上传是否可用（能否解码、能否解析出必需的列），SHALL NOT 以文件扩展名作为接受或拒绝的依据。
  - 必需列缺失时的错误说明 SHALL 让用户能判断"可能传错文件了"。
- **Runtime**: `cd backend && pytest tests/test_homework_parsing.py` → expected: 全部通过（含从 tools/ 搬来的既有用例），无 import 错误
- **Code**:
  - 解码在**后端**、拿到的必须是**原始字节** —— 在 Next 侧 `file.text()` 读成字符串的话，浏览器已按 UTF-8 解过一遍，GBK 文件到这里已经是替换字符，后端再想试 GB18030 已无字节可试（design 决策 1、2）
  - `utf-8-sig` 而非 `utf-8`：Excel 存的 UTF-8 带 BOM，不剥掉第一个列名会变成 `﻿姓名`，而错误信息会说"表头缺少必需的列"，指向完全不相干的方向
  - 顺序不能反：GB18030 几乎能解开任何字节序列，先试它会把 UTF-8 中文静默解成乱码而不报错
  - `tools/homework-sync/README.md` 里的教训随目录删除前要移进模块 docstring（design 决策 6）
- **Threshold**: 80
