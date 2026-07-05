# ADR-0001: 以 W3C DTCG 格式的 JSON 文件作为管道契约

- 状态:已采纳(2026-07-05)
- 关联:ADR-0002(值从哪里来)、ADR-0004(计算发生在哪里)

## 背景

Token 管道需要一个所有环节共同遵守的中间格式:上游(值的来源,可能是 Spectrum、Airtable、公式生成器、Figma)各说各话,下游(CSS/TS 构建、Figma 同步、MCP server、度量工具)也各有各的需求。没有统一契约,就会出现 N 个来源 × M 个消费方的两两适配,复杂度爆炸。

## 备选方案

1. **W3C DTCG 标准格式**(`$value` / `$type` / `$description`,`{path}` 引用语法)
2. Style Dictionary 私有格式(`value` 无前缀写法)
3. 自定义格式(如以前基于 Sass 变量或表格的写法)

## 决策

采用 **DTCG 格式**,文件放在 `packages/tokens/tokens/`,按层分目录(primitives / semantic / usage)。

理由:DTCG 是 W3C Design Tokens Community Group 的行业标准草案,Style Dictionary v4+ 原生支持,Figma、Tokens Studio 等工具生态都在向它靠拢。选标准格式意味着不被任何单一工具锁死——今天用 Style Dictionary,明天换 Terrazzo,契约文件一行不用改。

## 后果

- 上下游只需要各自适配 DTCG,新增来源或消费方的成本是 O(1) 而不是 O(N)
- DTCG 尚是草案,个别语义(如复合类型的细节)未来可能微调,需跟进
- 契约文件提交进 git,改动走 PR review,governance 复用工程基建
