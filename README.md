# LLP Design Infrastructure

把设计系统当作**基础设施**来建设的实践项目:一条从设计决策到多平台交付的自动化管道,以及让人和 AI agent 都能消费设计系统的接口层。

## 为什么

设计系统的规模化瓶颈通常不在组件和规范本身,而在它们的**生产、分发、消费、度量**方式:色值靠人肉搬运、设计与代码各自漂移、下游无从知道"该用哪个 token"。本仓库把这些环节工程化——每个关键决策记录在 [docs/adr/](docs/adr/) 中。

## 架构

```
值的来源(可替换)              管道契约                    平台交付物
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│ @adobe/spectrum- │      │  tokens/ (DTCG)  │      │ dist/css  CSS 变量   │
│ tokens (占位)    ├──①──▶│  primitives/     ├──②──▶│ dist/ts   TS 常量    │
│ …future:         │      │  semantic/       │      │ dist/json 机读 JSON  │
│ Airtable/公式/    │      │  usage/          │      │ …future: Figma sync │
│ Figma            │      │  (light + dark)  │      │ MCP server          │
└─────────────────┘      └──────────────────┘      └─────────────────────┘
   ① 摄入适配器 scripts/import-spectrum.mjs   ② Style Dictionary build.js
```

三层 token 结构(ADR-0003):**primitives**(原始色板,按主题分值)→ **semantic**(主题无关别名,如 `accent.800 → blue.800`)→ **usage**(消费方使用的角色,如 `color.bg.base`)。

## 快速开始

```bash
npm install
npm run build          # 构建全部平台产物到 packages/tokens/dist/
```

重新从来源生成 token 契约文件(仅在更换/升级来源时需要):

```bash
npm run import:spectrum --workspace @llp/tokens
```

CI 会校验提交的 `tokens/` 与适配器输出无漂移,并验证构建通过。

## 架构决策记录

| ADR | 决策 |
|---|---|
| [0001](docs/adr/0001-dtcg-json-as-pipeline-contract.md) | 以 W3C DTCG JSON 作为管道契约 |
| [0002](docs/adr/0002-ingestion-adapter-pattern.md) | 值的来源通过摄入适配器隔离 |
| [0003](docs/adr/0003-theming-at-primitive-layer.md) | 主题化发生在 primitive 层 |
| [0004](docs/adr/0004-computation-at-build-time.md) | 派生计算发生在构建时 |

## 路线图

- [x] **Phase 1 — Token 管道**:DTCG 源 → Style Dictionary → CSS/TS/JSON,双主题,CI 门禁
- [ ] **Phase 1.5 — 公式化来源**:以"基准值+公式"配置替换占位值(OKLCH 色彩推导)
- [ ] **Phase 2 — Figma 同步**:token ↔ Figma Variables / Text Styles
- [ ] **Phase 3 — MCP server**:让 AI coding agent 查询 token、组件 API 与用法规范
- [ ] **Phase 4 — 门禁与度量**:design lint、adoption 统计
