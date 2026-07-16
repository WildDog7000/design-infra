# ADR-0009: MCP 服务器经 npm 分发——契约随版本钉死

- 状态:已采纳(2026-07-16)
- 关联:ADR-0006(插件的 raw 拉取模式)、ADR-0008(只读 MCP 消费端)

## 背景

Phase 7 的 MCP 服务器以 stdio + 仓库相对路径工作,只服务于"打开本仓库的人"。
真实诉求是让**其他项目的成员**使用——他们没有、也不该需要这个仓库的 checkout。

## 备选方案

1. **npm 分发**:发布 `@llp-design/mcp-server`,消费端配置 `npx` 一行——要求
   对方有 Node 环境,适合工程师;设计师仍有门槛
2. 远程 MCP(Streamable HTTP + 托管):对设计师零门槛(贴 URL 即用)——需要
   托管、鉴权与缓存决策,量级更大
3. GitHub raw 运行时拉取(复用插件模式):契约永远最新——但 loadTheme 变异步、
   引入网络依赖,且"npm 包版本"与"契约内容"失去对应关系

## 决策

先做 **npm 分发**(方案 1),远程 MCP 作为下一步(不是替代——两种形态共用
`lib.mjs` 查询引擎,是同一决策的两次落地)。

关键取舍:**契约新鲜度模型按消费端分化,是刻意设计**——

- Figma 插件拉 main(设计师要看的是"现在的真相")
- npm 包把契约钉在依赖版本上(`@llp-design/tokens@^0.1.x`):工程/AI 消费端
  要的是**可复现**——同一版本的包对同一问题永远给同一答案,升级契约 =
  升级依赖,走 semver 治理(docs/versioning.md)而不是悄悄漂移

实现要点:

- `@llp-design/tokens` 随包发布 DTCG 源文件(`files += tokens/`),它本来就是
  契约的正主;mcp-server 通过 `require.resolve('@llp-design/tokens/package.json')`
  定位契约——workspace 开发与 npm 安装共用同一条解析路径
- scope 改名 `@llp` → `@llp-design`:npm 上 `llp` 已被占用;CSS 前缀 `--llp-`
  与 npm scope 是两个命名空间,不受影响
- 验证方式:`npm pack` 双包 → 隔离目录安装 tarball → MCP 客户端拉起
  `node_modules/.bin/llp-mcp-server`,全程不接触仓库文件

## 后果

- 首次发布依赖 npm 账号 + `llp-design` org + `NPM_TOKEN`(人工步骤,一次性)
- mcp-server 的发版暂为手动 `npm publish`(release.mjs 治理只覆盖 tokens 包);
  若发版频率上来,再并入自动化
- 契约更新不会自动到达 npm 消费者——这是特性不是缺陷,但需要在 tokens 发版
  后记得 bump mcp-server 的依赖并跟着发一版(两包联动,已知人工环节)
