# Lima Design System

一个实践项目:把 enterprise 设计系统做成 **agent 可消费、可度量** 的形态——
机读契约、MCP server,以及衡量"哪些信息在控制生成漂移"的评测。

> 这是重建中的 `lima` 分支。旧实现(LLP)归档在分支 `archive/llp-spectrum-v0`。

## 现在有什么

```
packages/contract/
  tokens/               693 个 token,light / dark 两个模式,一行一个
  components/           10 个组件的 API 签名
  intent-levels.json    每个字段属于哪个意图级别
  lib/contract.mjs      loadContract({ level }):按级别读取契约
  scripts/validate.mjs  校验:形状、命名、引用、取值一致性、字段分级
```

契约文件是编写源,不是生成物;没有构建步骤。

## 契约长什么样

```jsonc
// tokens/theme.json 里的一行
{ "name": "control-fgColor-placeholder", "cssVar": "--lima-control-fgColor-placeholder",
  "path": ["control", "fgColor", "placeholder"], "type": "color", "tier": "functional",
  "group": "color/control",
  "modes": { "light": { "value": "#59636e", "alias": "fgColor-muted" },
             "dark":  { "value": "#9198a1", "alias": "fgColor-muted" } } }
```

```jsonc
// components/button.json 的一部分
{ "id": "button", "name": "Button", "importPath": "@lima-design/react", "status": "alpha",
  "props": [ { "name": "variant", "required": false, "defaultValue": "'default'",
               "type": "'default' | 'primary' | 'danger' | 'invisible' | 'link'" } ] }
```

## 意图分级

契约里的每个字段只属于一个级别;消费方按级别读取,只拿到该级别及以下的字段(ADR-0013):

| 级别 | 内容 | 数据现状 |
|---|---|---|
| `structure` | 名字、类型、值、引用关系、props 签名、生命周期状态 | ✅ 已有 |
| `description` | 一句话说明 | 待编写 |
| `rules` | 用途、规则、配对、无障碍要求 | 待编写 |
| `examples` | 正例、组合配方、反例 | 待编写 |

`structure` 级是门禁(lint、类型检查)的数据来源,也是所有评测对照组的底座。

## 使用

```bash
npm ci
npm run validate
npm test
```

```js
import { loadContract } from '@lima-design/contract';
const { tokens, components } = loadContract({ level: 'structure' });
```

## 架构决策

| ADR | 决策 |
|---|---|
| [0012](docs/adr/0012-lima-rebuild-as-independent-system.md) | 重建为 Lima:独立项目,契约数据为自有源 |
| [0013](docs/adr/0013-intent-levels-and-gate-eval-split.md) | 契约按意图分级;确定性可判的归门禁,不进评测 |
| 0001–0011 | 旧实现(LLP)的决策记录,保留为历史 |

## 路线图

- [x] **契约,structure 级** token 与组件签名、分级机制、校验
- [ ] **消费端样例** React 应用与 `@lima-design/react` 的可运行实现
- [ ] **MCP server** 先接 structure 级
- [ ] **更高意图级别** description / rules / examples 的数据
- [ ] **门禁** lint 与校验工具
- [ ] **评测** 任务 × 级别 × 多次运行
- [ ] **远程分发与版本治理**,切换 `main`

第三方许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
