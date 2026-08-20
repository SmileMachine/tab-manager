# 实施任务

## 1. 协议与领域模型

- [ ] 1.1 定义版本化 JSON-RPC 请求、响应、错误码和工具描述类型。
- [ ] 1.2 扩展 `BrowserWindowRecord`、`BrowserTabRecord` 和 `BrowserTabGroupRecord`，保留可选浏览器字段与派生分组字段。
- [ ] 1.3 定义 `BrowserSnapshotEnvelope`、稳定 `revision` 和 `fieldSet`。
- [ ] 1.4 定义 workspace 导入导出文档和旧 ID 到新 ID 的映射结构。

## 2. 只读工具

- [ ] 2.1 实现完整快照读取和字段集裁剪。
- [ ] 2.2 实现窗口、标签页、标签组的列表与详情查询。
- [ ] 2.3 实现 URL 派生字段、相邻关系和标签组统计摘要。
- [ ] 2.4 实现 `get_capabilities` 与基础诊断信息。
- [ ] 2.5 实现 `export_workspace`。

## 3. service worker 路由

- [ ] 3.1 在 service worker 内增加请求解析、方法分派和响应序列化。
- [ ] 3.2 将所有浏览器 API 调用限制在 `BrowserTabsApi` 适配层。
- [ ] 3.3 增加状态事件游标或“需要刷新完整快照”的事件摘要。
- [ ] 3.4 增加连接、请求和错误的最小审计日志。

## 4. 写工具与一致性

- [ ] 4.1 扩展 `BrowserTabsApi`，支持创建、更新、移动、激活、关闭、丢弃和标签组操作。
- [ ] 4.2 实现单项写工具及其参数校验。
- [ ] 4.3 实现 `preview_operations` 和 `apply_operations`。
- [ ] 4.4 增加 `expectedRevision`、`dryRun`、`confirm` 和 `failurePolicy`。
- [ ] 4.5 为批量操作返回逐项结果、警告和执行后的真实快照。

## 5. 导入

- [ ] 5.1 实现 workspace 文档校验和导入预览。
- [ ] 5.2 实现 append 导入：窗口、标签页、标签组、顺序和固定状态。
- [ ] 5.3 返回新旧导入标识映射、跳过项和警告。
- [ ] 5.4 将 replace 导入和关闭现有标签页限制为明确确认的高影响操作。

## 6. 本地 Codex 适配边界

- [ ] 6.1 定义 Native Messaging host 与扩展之间的消息格式和连接生命周期。
- [ ] 6.2 提供可测试的本地 transport adapter，不在扩展内假设 Codex 的具体实现。
- [ ] 6.3 为 MCP/CLI 映射写出工具命名、参数和错误码说明。
- [ ] 6.4 补充 native host 安装、扩展 ID 限制和本地安全说明。

## 7. 验证与文档

- [ ] 7.1 为协议、快照、命令规划、导入导出和 fake browser adapter 增加测试。
- [ ] 7.2 运行 `npm test`、`npm run build` 和对应 OpenSpec 严格校验。
- [ ] 7.3 在 Edge 中验证读取、预览、分组、跨窗口移动和导入。
- [ ] 7.4 在 Chrome 中验证同一协议和核心写操作。
- [ ] 7.5 使用数百个标签页验证快照体积、分页/裁剪和批量操作反馈。
