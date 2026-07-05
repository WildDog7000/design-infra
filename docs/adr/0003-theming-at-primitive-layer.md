# ADR-0003: 主题化发生在 primitive 层(跟随 Spectrum 模型)

- 状态:已采纳(2026-07-05)
- 关联:ADR-0001、ADR-0002

## 背景

支持浅色/深色主题时,"明暗差异"可以建模在不同层:

1. **语义层切换**:primitive 色板全主题唯一,深色主题由语义层引用不同的色阶(如 light 的 `bg` 引 `gray.50`,dark 引 `gray.900`)。Tailwind 系应用的常见做法。
2. **primitive 层切换**:色板本身分主题,`gray.100` 在深色模式下就是另一个颜色;语义/用途层的引用关系全主题不变。Adobe Spectrum 的做法。

## 决策

采用**方案 2(primitive 层主题化)**,与占位来源 Spectrum 的原生模型一致:

- `primitives/color.light.json` / `color.dark.json` — 同路径、不同值
- `semantic/color.json` — 主题无关的别名(`accent.800 → blue.800`)
- `usage/color.{light,dark}.json` — 少数角色 token 需要按主题指向不同目标时使用

构建时每主题独立跑一次 Style Dictionary:light 输出全量 CSS 到 `:root`,dark 只输出颜色到 `[data-theme="dark"]`。CSS 保留引用链(`outputReferences`),深色模式下 `--llp-color-bg-base: var(--llp-color-gray-25)` 自动指向深色版 `gray-25`,级联天然生效。

理由:方案 2 下"哪个灰阶配哪个角色"的设计决策只表达一次,不必每主题重复;新增主题(高对比、品牌皮肤)只需新增一套 primitive 值。代价是色板值总量翻倍,由适配器自动生成,可接受。

## 后果

- 新主题的成本集中在 primitive 值的生产(未来可用公式生成,见 ADR-0004)
- 语义/用途层的审查负担不随主题数增长
- 与 Figma Variables 的 mode 机制(同变量、多模式值)天然对齐,利于 Phase 2 同步
