# 实现任务

- [x] 1.1 盘点现有 `OperationJournal`、Codex import/rollback 服务和 manager API，确定可复用的调用边界。
- [x] 1.2 增加 manager 快照应用服务，支持命名快照、操作历史 before/after、当前工作区导出和 checkpoint 创建。
- [x] 1.3 实现默认本地时间戳命名，精确到秒，并处理同秒重复名称。
- [x] 1.4 增加 portable workspace 比较领域模块和差异模型，覆盖 URL、title、窗口、group、顺序、duplicate 匹配和可选变化字段。
- [x] 1.5 为快照详情增加单选/多选 tab 模型，支持在当前聚焦窗口创建新的快照 tab。
- [x] 1.6 接入现有导入预览和确认流程，支持 JSON 文件选择、append/replace 模式和结果反馈。
- [x] 1.7 接入整体快照恢复预览和确认，明确显示可能创建、移动、分组和关闭的项目。
- [x] 1.8 在 manager 增加快照工作区入口，并实现命名快照与操作历史两层列表。
- [x] 1.9 实现快照详情、tab 选择、导入、导出、打开选中 tab 和整体恢复交互。
- [x] 1.10 实现当前状态与选定快照的比较视图、变化字段复选框、差异摘要和可展开详情。
- [x] 1.11 增加 application、domain、browser adapter 和 React 组件测试。
- [x] 1.12 运行 `npm test`、TypeScript/WXT build、`openspec validate add-manager-snapshot-workspace --strict` 和 `git diff --check`。
- [ ] 1.13 在 Edge 中手动验证保存、导入、导出、打开 tab、整体恢复和比较模式。
- [x] 1.14 定义 Current、named snapshot、operation history snapshot 和 compare 的统一来源模型。
- [x] 1.15 抽取可复用的 `WorkspaceView`，让 Current 与 Snapshot 使用同一套窗口、分组和 tab 渲染组件。
- [x] 1.16 将比较结果投影为左右两栏 diff，默认隐藏 unchanged，支持空位、字段标记和 `Show unchanged`。
- [x] 1.17 增加来源切换、只读快照视图和左右比较视图的组件测试。
- [x] 1.18 重新运行测试、TypeScript/WXT build、OpenSpec 严格校验，并完成 `git diff --check`。
