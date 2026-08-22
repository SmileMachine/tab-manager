# 实施任务

## 1. 协议与领域模型

- [x] 1.1 定义版本化 JSON-RPC 请求、响应、错误码和工具描述类型。
- [x] 1.2 扩展 `BrowserWindowRecord`、`BrowserTabRecord` 和 `BrowserTabGroupRecord`，保留可选浏览器字段与派生分组字段。
- [x] 1.3 定义 `BrowserSnapshotEnvelope`、稳定 `revision` 和 `fieldSet`。
- [x] 1.4 定义 workspace 导入导出文档和旧 ID 到新 ID 的映射结构。
- [x] 1.5 定义操作记录、快照引用、checkpoint 和回退结果类型。
- [x] 1.6 定义页面内容读取的 budget、mode、截断标识和不可读错误类型。

## 2. 只读工具

- [x] 2.1 实现完整快照读取和字段集裁剪。
- [x] 2.2 实现窗口、标签页、标签组的列表与详情查询。
- [x] 2.3 实现 URL 派生字段、相邻关系和标签组统计摘要。
- [x] 2.4 实现 `get_capabilities` 与基础诊断信息。
- [x] 2.5 实现 `export_workspace`。
- [x] 2.6 实现 `inspect_tabs`、`inspect_tab` 和 `read_tab_content` 的紧凑响应。
- [x] 2.7 增加 URL、页面标题、标题层级、主要内容片段和 focus snippets 提取器。
- [x] 2.8 处理 host permission、浏览器内部页面、PDF、discarded 标签页和注入失败。

## 3. service worker 路由

- [x] 3.1 在 service worker 内增加请求解析、方法分派和响应序列化。
- [ ] 3.2 将所有浏览器 API 调用限制在 `BrowserTabsApi` 适配层。
- [x] 3.3 增加状态事件游标或“需要刷新完整快照”的事件摘要。
- [ ] 3.4 增加连接、请求和错误的最小审计日志。

## 4. 写工具与一致性

- [x] 4.1 扩展 `BrowserTabsApi`，支持创建、更新、移动、激活、关闭、丢弃和标签组操作。
- [x] 4.2 实现单项写工具及其参数校验。
- [x] 4.3 实现 `preview_operations` 和 `apply_operations`。
- [x] 4.4 增加 `expectedRevision`、`dryRun`、`confirm` 和 `failurePolicy`。
- [x] 4.5 为批量操作返回逐项结果、警告和执行后的真实快照。
- [ ] 4.6 让管理页面、Codex bridge、导入和回退共用 command executor，避免写操作绕过记录层。
- [x] 4.7 在每次写操作前后保存快照，并记录部分失败状态。

## 5. 操作历史与回退

- [x] 5.1 使用 IndexedDB 保存去重后的 portable snapshots 和 operation records。
- [x] 5.2 实现 `list_operation_history`、`get_operation`、`create_checkpoint` 和 `list_checkpoints`。
- [x] 5.3 实现 `preview_rollback` 和 `rollback_operation`。
- [x] 5.4 对关闭标签页、不可读页面、隐身窗口和浏览器内部页面报告无法完全恢复的字段。
- [x] 5.5 实现历史保留数量、存储容量和引用快照清理策略。

## 6. 导入

- [x] 6.1 实现 workspace 文档校验和导入预览。
- [x] 6.2 实现 append 导入：窗口、标签页、标签组、顺序和固定状态。
- [x] 6.3 返回新旧导入标识映射、跳过项和警告。
- [x] 6.4 将 replace 导入和关闭现有标签页限制为明确确认的高影响操作。

## 7. 本地 Codex 适配边界

- [x] 7.1 定义 Native Messaging host 与扩展之间的消息格式和连接生命周期。
- [x] 7.2 提供可测试的本地 transport adapter，不在扩展内假设 Codex 的具体实现。
- [x] 7.3 为 MCP/CLI 映射写出工具命名、参数和错误码说明。
- [x] 7.4 补充 native host 安装、扩展 ID 限制和本地安全说明。
- [x] 7.5 增加 MCP 实例 hello 信息，记录 PID、版本、启动时间和 socket。
- [x] 7.6 增加单次工具请求 15 秒上限，隔离超时后的迟到响应。

## 8. 验证与文档

- [x] 8.1 为协议、快照、命令规划、导入导出、操作历史、回退、内容提取和 fake browser adapter 增加测试。
- [x] 8.2 运行 `npm test`、`npm run build` 和对应 OpenSpec 严格校验。
- [ ] 8.3 在 Edge 中验证读取、内容提取、预览、分组、跨窗口移动、回退和导入。
- [ ] 8.4 在 Chrome 中验证同一协议和核心写操作。
- [ ] 8.5 使用数百个标签页验证快照体积、历史保留、内容读取预算和批量操作反馈。
- [x] 8.6 增加 bridge 超时回归测试和本地诊断命令。

## 9. 批量读取与协议效率优化

- [x] 9.1 新增 `tab_group.get_tabs`，保证单次快照一致性、重复 ID 去重和 `missingTabIds` 返回。
- [x] 9.2 新增 `tab_group.get_groups`，支持 `tabDetail: none | summary | full`、重复 ID 去重和 `missingGroupIds` 返回。
- [x] 9.3 扩展 `tab_group.list_tabs` 的数组筛选条件、相邻标签页和连续片段返回，避免同一规划阶段重复查询。
- [x] 9.4 增加轻量 workspace overview 与可选的快照增量读取，明确全局读取和局部查询的使用场景。
- [x] 9.5 为 `apply_operations` 增加 `returnState: none | affected | grouping | full`，避免每次写操作默认返回完整快照。
- [x] 9.6 为预览计划增加短期 `previewId`、过期时间和 operation hash，并在应用时重新校验 revision。
- [x] 9.7 为批量写操作增加 `idempotencyKey`，避免超时重试造成重复浏览器变更。
- [x] 9.8 让 checkpoint 支持相同名称与 revision 的幂等返回，并允许服务端生成默认名称。
- [x] 9.9 为 MCP 工具提供严格的输入 schema，缓存会话内 capabilities，并避免在 `content` 与 `structuredContent` 中重复携带完整 JSON。
- [x] 9.10 不在本次变更中建立通用 `pageKind` 或 URL 分类表；仅保留浏览器原始 URL 字段和现有受限内容读取能力。
