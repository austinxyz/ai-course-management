# Group 3 — Server Action 与 API 封装

### Contract
- **Spec**:
  - 网页的 Server Action SHALL 只做「读取文件内容、鉴权、转发」，SHALL NOT 包含任何解码、解析、校验、排除与分类逻辑。
  - 系统 SHALL 允许用户在作业页选择一个 `grades.csv` 文件并导入到**当前选中的课程**，全程 SHALL NOT 依赖任何本地文件路径或命令行工具。
- **Runtime**: `cd frontend && npm run test` → expected: 全部通过
- **Code**:
  - Server Action 必须自己调 `requireSitePassword()`：它编译成页面路由上的一个 POST 端点，`proxy.ts` 覆盖页面加载**不构成**对它的保护
  - 文件以**字节**（base64）送到后端，**不得**在 Next 侧 `file.text()` —— 那会让 GBK 检测彻底失效（design 决策 1）
  - 预期内的结果（编码不对、表头不符、课程不存在、超限）用**返回值**表达，不抛异常：Server Action 抛出的错误在生产构建里只剩 digest，客户端拿不到内容
- **Threshold**: 80
