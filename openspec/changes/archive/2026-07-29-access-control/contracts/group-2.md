### Contract
- **Spec**: 系统 SHALL 对未携带有效凭据的请求拒绝访问全部页面路由，并且响应体 SHALL NOT 含有任何学员数据；拒绝必须发生在渲染之前。当认证所需的环境变量缺失时，系统 SHALL 拒绝全部请求。认证逻辑 SHALL NOT 包含任何环境判断分支——本地与生产运行同一条代码路径。该 secret SHALL 仅存在于服务端，不得以任何形式出现在浏览器可见的内容中。
- **Runtime**: `cd frontend && npm run test` → expected: 全部 vitest 通过，含 无凭据→401、错凭据→401、对凭据→放行、密码变量缺失→拒绝、401 响应带 `WWW-Authenticate` 头 五组断言
- **Code**: design.md 决策 #1（文件必须是根目录 `proxy.ts` 而非 `middleware.ts`——本版已弃用改名；写错的失败形状是"文件根本不执行、页面照常打开"，与认证生效外观相同）、决策 #2（matcher 用负向匹配排除 `_next/static` 等，否则会拦掉 CSS/JS）、决策 #3（fail-closed：先判缺失再比对）、决策 #7（401 必须带 `WWW-Authenticate: Basic realm="..."`，否则浏览器不弹凭据框）
- **Threshold**: 80
