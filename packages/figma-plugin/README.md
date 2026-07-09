# LLP Token Sync (Figma plugin)

git ↔ Figma 双向桥。git 是唯一事实源(SSoT);Figma 是镜像 + 提案通道。

## 发布方向(Sync: git → Figma)

从 GitHub 拉取 DTCG 契约文件,在当前 Figma 文件中创建/更新
一个名为 **LLP Tokens** 的 Variable Collection(Light / Dark 双 mode)。

- primitives → 带实值的变量(色板按 mode 分值)
- semantic / usage → 变量**别名**,引用链在 Figma 中原样可见
- 幂等:重复运行按名字匹配已有变量并更新,不产生重复

为什么走插件而不是 REST API:Figma 的 Variables REST API 仅对 Enterprise 计划开放,
插件 API 无此限制。

## 提案方向(Propose: Figma → git PR)

设计师在 Figma 里改动变量后,插件不会直接写回 git,而是生成 **Pull Request**,
走与代码改动相同的治理路径(review → CI drift check → merge → 再 Sync 回 Figma)。

1. **Check drift**:重新拉取契约,读回当前全部变量值(别名还原为 `{ref}` 语法,
   颜色还原为 hex,尺寸还原单位后缀),逐 token 比对,列出差异
   - 差异为零时它就是 **Verify** 按钮:确认 Figma 与契约一致
   - 契约中没有的 Figma 变量只报告不提案(新 token 的命名/归属决策属于 git)
2. 勾选要提交的改动,填入 GitHub **fine-grained PAT**
   (只授予本仓库 Contents: read/write + Pull requests: read/write),
   PAT 保存在 Figma clientStorage,不进入契约或代码
3. **Propose PR**:建分支 → 提交两类文件 → 开 PR(正文附改动对照表)
   - **`overrides.json`(意图)**:契约由 adapter 从 Spectrum 生成,CI 会重新生成并
     比对,直接手改契约必被打回。提案因此写入 overrides 层(adapter 的输入,
     记录「有意偏离上游」),adapter 生成后应用它
   - **契约文件(效果)**:同时提交改动后的契约,CI 重跑 adapter 时
     Spectrum + overrides = 提交的契约,drift check 通过

### 已知限制

- 免费版降级(双 collection)时,`LLP Tokens · Dark` 中主题无关 token
  (dimension / typography / semantic)的改动不参与 diff——这些 token 以
  light collection 的副本为准
- 契约文件由 `JSON.stringify(tree, null, 2)` 生成,插件写回使用同一序列化,
  PR diff 只含真实值变更

## 本地运行(开发模式)

1. 打开 Figma **桌面版**,进入任意设计文件
2. 菜单 → Plugins → Development → **Import plugin from manifest…**
3. 选择本目录的 `manifest.json`
4. 运行插件,点击 **Sync from GitHub**

无构建步骤,纯 JS,无依赖。
