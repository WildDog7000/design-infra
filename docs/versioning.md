# Token 版本政策(@llp-design/tokens)

消费者升级依赖时只关心一个问题:「这次升级会不会弄坏我?」semver 是回答它的
协议,但 token 包的「坏」需要自己的定义——本文就是那份定义。

## 判级规则

对比两个版本的 DTCG 契约(`packages/tokens/tokens/`),逐 token 判定:

| 变更 | 判级 | 理由 |
| --- | --- | --- |
| 删除或改名 token | **major** | 消费端对该 token 的引用(CSS 变量名、TS 导出、`{ref}`)直接失效 |
| 改变 token 的 `$type` | **major** | 值的形态变了,消费端的用法大概率失效 |
| 新增 token | **minor** | 纯增量,现有引用不受影响 |
| 改变 token 的 `$value`(含别名重定向) | **patch** | 所有引用照常解析,API 面未变 |

整包判级取所有变更中的最高级。判级由 `release-diff.mjs` 自动执行,
发布脚本据此计算新版本号。

## 「改值算不算 breaking?」

这是 token 版本化的核心争议,值得成文:

改值在**结构上**是 patch——没有引用会断。但在**视觉上**可能是灾难:
`color/accent/bg/default` 从蓝改成黄,结构一字未动,产品换了张脸。

我们的立场:**自动判级只保证结构契约,视觉契约靠治理流程保证。**

- 值的变更进入仓库的唯一通道是 PR(含 Figma 提案,见 ADR-0007),视觉影响
  在 review 时由人评估——这正是「Figma 只是提案通道」的意义
- 自动判级是**下限不是上限**:重大视觉改版(如全色板置换)应当由发布者
  手动升为 major,即使分级器说 patch
- 换句话说:机器守结构,人守语义

## 发布流程

```
npm run release --workspace @llp-design/tokens
```

脚本依次:校验工作区干净 → 重跑适配器验证无漂移 → 构建 → 对比上一个
tag 判级 → 计算新版本 → 更新 CHANGELOG.md 与 package.json → commit + tag。
随后 `git push origin main --follow-tags` 触发 `release.yml`:

- 构建并发布到 npm(未配置 `NPM_TOKEN` secret 时降级为 `--dry-run`)
- 创建 GitHub Release,附当次 CHANGELOG 内容

## 0.x 阶段的约定

1.0.0 之前 semver 允许 0.x.y 的 minor 承担 breaking 语义,但我们提前按
正式规则记账:判级纪律从第一天就是肌肉记忆,1.0.0 只是心理关口。
