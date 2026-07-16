# ADR-0010: 远程 MCP 落在 Cloudflare Workers——贴 URL 即用的设计师通道

- 状态:已采纳(2026-07-16)
- 关联:ADR-0008(只读 MCP)、ADR-0009(npm 分发与新鲜度分野)

## 背景

npm 分发版(ADR-0009)解决了"其他项目的工程师"的接入,但对设计师仍有两道
门槛:装 Node、改 JSON 配置。以设计师身份做的接入模拟证实了这一点;且
claude.ai 网页端在浏览器沙箱里,**原理上不可能**拉起本地 stdio 进程,只接受
远程 URL(custom connector)。设计师通道必须是远程形态。

## 决策

`packages/mcp-remote/`:Cloudflare Worker,Streamable HTTP,无鉴权只读。

- **托管**:Cloudflare Workers——免费档无冷启动,远程 MCP 的主流托管;
  备选 Render(免费档休眠 30-60s,设计师首问即超时,否决)
- **复用**:Phase 9 先把查询引擎拆成纯函数 `engine.mjs`(端口与适配器,
  同 ADR-0002 的摄取适配器模式),stdio 与 Worker 是同一引擎的两个壳;
  工具定义共享 `tools.mjs`,两形态的工具面**定义上**一致而非约定上一致
- **新鲜度**:从 GitHub raw 拉 main + 5 分钟内存缓存,拉取失败时降级用旧
  缓存——设计师通道要"现在的真相",与 Figma 插件同模型(ADR-0009 分野的
  另一半);与 npm 版"钉在版本上"形成刻意互补
- **无鉴权**:公开只读的设计 token 无泄露面;写路径依旧只有提案 PR 通道。
  若未来接入私有 token,再补 OAuth,不预建
- **纯 JSON 响应,GET 返回 405**:本服务器无服务器主动通知,不提供 SSE
  长连接(详见下)

## 实现中撞到的三个真问题(按时间序)

1. **可选依赖打包失败**:`agents` 内部有条件的 `import("ai")`,esbuild 解析
   不到 → wrangler `alias` 指向空壳模块
2. **单例服务器在 HTTP 形态下崩溃**:stdio 是"一进程一连接",`McpServer`
   全局一个即可;HTTP 每个请求绑定新传输,同一实例第二次 connect 即抛错
   → 每请求新建服务器(工具注册开销可忽略;契约缓存在模块级,不随请求重建)
3. **SSE 长连接堵死后续请求**:客户端按规范开启的 server-push GET 流永不
   结束,经 CF 边缘 + Node undici 连接池组合出 head-of-line 阻塞,tools/list
   永久挂起(本地 miniflare 不复现,纯生产行为)。本服务器根本无通知可推,
   于是禁用整条 SSE 通路:`enableJsonResponse: true` + GET 405(规范允许,
   客户端自动降级纯请求/响应)。**教训:协议的可选能力,不用就显式关闭,
   留着只会成为故障面。**

## 后果

- 部署是手动 `wrangler deploy`(个人 OAuth);若要 CI 自动部署需配
  CLOUDFLARE_API_TOKEN,暂缓
- CI 仅做 `wrangler deploy --dry-run` 构建校验;生产回归靠 `e2e.mjs <url>`
  手动跑,已知取舍
- 三种接入形态并存:仓库内 stdio(.mcp.json)、npm 包(工程师)、
  远程 URL(设计师/网页端)——同一引擎,三个壳
