# ADR-0002: 值的来源通过"摄入适配器"隔离,当前占位来源为 Adobe Spectrum

- 状态:已采纳(2026-07-05)
- 关联:ADR-0001(契约格式)、ADR-0004(公式即另一种来源)

## 背景

管道需要真实的 token 值才能开发和演示,但值的最终来源尚未定稿(候选:自有色板、Airtable、公式生成器、Figma Variables)。需要一种架构,让"换来源"不影响管道下游。

## 备选方案

1. 手抄一批占位值直接写进 DTCG 文件
2. **适配器模式**:每种来源写一个转换脚本,输出 DTCG 文件;来源包声明为依赖,转换可随时复现
3. 等最终来源定稿再开工

## 决策

采用**适配器模式**。首个适配器 `scripts/import-spectrum.mjs` 以 `@adobe/spectrum-tokens` npm 包为来源,抽取精选子集(gray/blue/red/green/orange 色板、间距、圆角、字体、语义与用途别名)转换为我们的 DTCG 结构。生成的 `tokens/` 文件提交进仓库作为契约,CI 校验其与适配器输出无漂移。

设计原则:**把易变的东西隔离在边界上**。来源是最易变的环节,适配器就是它的边界。

## 后果

- 换来源 = 换适配器,下游(构建、未来的同步/MCP)零改动
- 转换中发现的不可直译语义必须在适配器里显式处理并记录(实例:Spectrum 的 `corner-radius-full` 是 0.5 倍元素高度的乘数,CSS 变量无法表达,落为 `9999px` 惯例值;`positive/notice/informative` 色系无 content token,以 `visual-color` 替代)
- Spectrum 值仅为占位,替换计划见 ADR-0004 展望
