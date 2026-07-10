# ADR-0006: 变量写入走 Figma 插件而非 REST API,计划限制以运行时优雅降级吸收

- 状态:已采纳(2026-07-07)
- 关联:ADR-0005(git 为事实源、Figma 为镜像)、ADR-0007(提案通道)

## 背景

发布方向(git → Figma)需要程序化创建/更新 Figma Variables。技术选型受 Figma
商业策略(plan-gating)的强约束,且约束是在开发过程中逐个撞出来的:

- Variables **REST API** 仅对 Enterprise 计划开放
- 一个 Variable Collection 的**多 mode** 是付费功能,免费计划限 1 mode
- 本项目运行在免费计划上,且目标用户(小团队)大概率也是

## 备选方案

1. REST API:接口形态最理想(可 headless、可进 CI),但 Enterprise-only,不可得
2. **插件 API**:所有计划可用、能力完整;代价是只能在打开的文件内由人触发运行
3. 手工维护变量:放弃自动化,同步质量靠纪律——正是本项目要消灭的模式

## 决策

采用**插件路线**(`packages/figma-plugin/`)。主题结构优先走理想形态:单 collection
"LLP Tokens" + Light/Dark 双 mode;当 `addMode` 被计划限制拒绝时,**运行时降级**为
双 collection("LLP Tokens" + "LLP Tokens · Dark")。

降级采用 try/catch 的**能力探测**,而非配置开关:同一份插件代码在任何计划上
自动跑出该环境下的最优形态,用户无需知道 plan-gate 的存在。

设计原则:**把商业限制当作运行时环境差异处理;能力探测优于能力假设。**

## 后果

- 同步需要有人在 Figma 里点一下,无法全自动进 CI;接受——发布到设计工具本就
  应当是有人在场的动作
- 降级形态下主题无关 token(dimension/typography/semantic)在两个 collection 中
  各有一份副本,dark 副本成为读回/diff 的盲区(以 light collection 为准,见 ADR-0007
  时期的已知限制记录)
- 教训:降级让多 mode 路径在真实环境中长期不被执行,直到 Phase 3 用 Node 测试台
  (stub `figma` 全局)模拟付费路径,才暴露出该路径重复创建全部变量的潜伏 bug。
  **未走的降级分支必须有测试兜底,否则它只是没被证伪。**
- plan-gate 的完整记录(REST API → 插件;多 mode → 双 collection;MCP 验证限流 →
  手动核对)沉淀为项目叙事素材
