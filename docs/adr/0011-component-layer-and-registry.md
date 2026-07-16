# ADR-0011: 组件层——自研 CSS 组件 + 机器可读注册表,经 MCP 供 AI 组页

- 状态:已采纳(2026-07-16)
- 关联:ADR-0008/0010(MCP 消费端)、ADR-0009(新鲜度分野)

## 背景

管线此前只交付 token(原子);设计师在 web 端要"搭页面",AI 需要分子——
组件的标记结构、变体与样式。同时 claude.ai 的 artifact 有严格 CSP:不能加载
外部资源,组件样式必须能以文本形式内联。

## 备选方案

1. 接管现成库(如 Spectrum CSS)+ CSS 变量桥接层——最贴近"入职接管"的生产
   现实,但引入 117 变量/组件量级的桥接与覆盖率治理,MVP 期收益比不高
2. React/Web Components 组件库——行业主流的框架绑定层,但依赖运行时/构建链,
   与 artifact 内联约束冲突;定位上属于"组件作者"而非"基建"的活
3. **自研 CSS 组件 + 注册表**:解剖结构参考 Spectrum(BEM、变体、状态),
   值全部来自契约 token;registry.json 作为机器可读的组件契约

## 决策

方案 3,范围刻意最小:**表单页 + 列表页所需的五件**(Button/Badge/Card/
TextField/Table),不做多余组件。

- **token 纪律**:usage 层优先;usage 缺状态时降级 semantic 层并以 `gap:`
  注释标记——这些标记就是 USAGE 映射表的下一批扩张清单(与 Phase 6 发现
  static-white 缺口是同一机制的常态化)
- **registry.json = 组件契约**:规范标记模板、变体语义("accent 每页一个")、
  尺寸、用法指引——写给 AI 消费端的 API 文档
- **build.mjs 三重守卫**:注册表↔CSS 类名一致性;无裸色值;所有 token 引用
  存在于构建产物。dist(foundation.css + components.css)**提交入库**并由
  CI 防漂移——与 token 契约同一治理模型
- **MCP 新工具**:`list_components` / `get_component`(含可内联 CSS);
  stdio 版在仓库外优雅降级为纯 token 工具;远程版从 GitHub raw 拉取,
  与契约同一 TTL/断源兜底缓存

## 后果与已知取舍

- Storybook 暂缓:5 组件规模下 preview.html 足够;将来的正确姿势是**从
  registry.json 生成 stories**(基建的活是生成,不是手写)
- 组件库未发布 npm(private);npm 版 mcp-server 无组件工具,设计师路径
  (远程)与仓库内路径功能完整
- 教训入账:npm workspaces 跑脚本**不做拓扑排序**,CI 干净环境暴露了
  components 先于 tokens 构建的顺序缺陷;根脚本显式排序解决,更大规模
  应引入 turbo/nx 类编排
- 方案 1(接管桥接)未被否定,记为未来演进:届时本组件库即"被接管的
  存量库",覆盖率报表等治理件在该场景复用
