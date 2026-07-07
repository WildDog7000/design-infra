# LLP Token Sync (Figma plugin)

git → Figma 的「发布」方向:从 GitHub 拉取 DTCG 契约文件,在当前 Figma 文件中创建/更新
一个名为 **LLP Tokens** 的 Variable Collection(Light / Dark 双 mode)。

- primitives → 带实值的变量(色板按 mode 分值)
- semantic / usage → 变量**别名**,引用链在 Figma 中原样可见
- 幂等:重复运行按名字匹配已有变量并更新,不产生重复

为什么走插件而不是 REST API:Figma 的 Variables REST API 仅对 Enterprise 计划开放,
插件 API 无此限制。

## 本地运行(开发模式)

1. 打开 Figma **桌面版**,进入任意设计文件
2. 菜单 → Plugins → Development → **Import plugin from manifest…**
3. 选择本目录的 `manifest.json`
4. 运行插件,点击 **Sync from GitHub**

无构建步骤,纯 JS,无依赖。
