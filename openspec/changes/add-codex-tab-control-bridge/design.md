# Design: 面向本地 Codex 的标签页控制桥接

## 1. 目标与边界

当前扩展已经具备读取窗口、标签页和原生标签组的能力，也具备管理页面所需的部分写操作。缺少的部分是一个供本地 Codex 调用的稳定接口。这个接口需要让 Codex 先获得完整、结构化、可比较的浏览器状态，再通过带有前置条件和安全检查的命令执行整理工作。

浏览器扩展本身不能直接注册一个本地 MCP 工具，也不适合在 service worker 内启动 HTTP 监听端口。因此设计分为三层：

1. **Extension service worker**：唯一直接访问 `chrome.tabs`、`chrome.windows`、`chrome.tabGroups` 的层，负责状态读取、请求校验和命令执行。
2. **Local bridge transport**：优先采用 Native Messaging。扩展通过一个受信任的 native host 建立本地连接；协议本身保持独立于传输，以便后续接入其他本地通道。
3. **Codex adapter**：本地进程把协议方法映射为 Codex 可调用的工具。该适配器可以是 MCP server，也可以是一个提供 JSON-RPC 的 CLI，但不能绕过扩展直接修改浏览器状态。

这项变更第一阶段应先完成协议、service worker 路由和可测试的本地适配边界。Native Messaging host 的安装注册需要根据目标机器和发行方式单独处理，不能把“源码已构建”当作“Codex 已经可以调用”。

## 2. 读取模型

### 2.1 `BrowserSnapshot`

每次读取返回一个带版本和修订信息的快照：

- `schemaVersion`：协议模型版本。
- `capturedAt`：浏览器状态采集时间。
- `revision`：由规范化快照计算出的稳定哈希或等价修订值。
- `windows`：窗口记录。
- `groups`：原生标签组记录。
- `tabs`：标签页记录，按窗口和原生 `index` 排序。
- `diagnostics`：读取期间被跳过、字段缺失或权限受限的项目。

快照中的数字 ID只用于当前浏览器会话。写请求必须允许调用方提供 `expectedRevision`，避免 Codex 根据旧状态继续操作。

### 2.2 窗口字段

窗口尽量保留 `chrome.windows.Window` 中有助于分组和恢复的信息：

- `id`、`type`、`state`、`focused`、`incognito`、`alwaysOnTop`。
- `top`、`left`、`width`、`height`，字段存在时才返回。
- `tabCount`、`groupCount` 等由快照计算的摘要字段。
- 可选的浏览器会话字段，例如 `sessionId`，仅在浏览器提供时返回。

### 2.3 标签页字段

标签页记录分为原始浏览器字段和便于 Codex 分组的派生字段。原始字段包括：

- `id`、`windowId`、`index`、`groupId`。
- `title`、`url`、`pendingUrl`、`favIconUrl`。
- `active`、`highlighted`、`pinned`、`audible`、`discarded`、`autoDiscardable`。
- `status`、`incognito`、`openerTabId`、`sessionId`、`lastAccessed`，字段存在时才返回。
- `muted` 及 `mutedReason`，若浏览器提供 `mutedInfo`。

派生字段包括：

- `hostname`、`origin`、`protocol`、`pathname`，无法解析时返回 `null`。
- `isNewTab`、`isInternalPage`、`isPdf` 等低成本分类标记。
- `group` 摘要、窗口摘要和标签页在窗口中的相邻关系。

返回内容必须明确区分“浏览器没有提供”和“字段值为空字符串”，避免 Codex 把缺失数据当成普通页面属性。

### 2.4 标签组字段

标签组记录包括：

- `id`、`windowId`、`title`、`color`、`collapsed`。
- `tabIds`、`tabCount`、`startIndex`、`endIndex`。
- `hostnameCounts`、`representativeTitles` 等从当前快照计算的只读摘要。

这些摘要只服务于读取和分组判断，不形成独立的持久化分组关系。

## 3. 工具目录

工具名称采用稳定的 `tab_group.*` 前缀。每个写工具都返回 `operationId`、执行结果、警告以及执行后的新快照或新 `revision`。

### 3.1 读取工具

| 工具 | 用途 |
| --- | --- |
| `tab_group.get_capabilities` | 返回协议版本、浏览器类型、可用字段、可用写操作、权限和限制。 |
| `tab_group.get_snapshot` | 返回完整窗口、标签页、标签组快照，可按字段集和窗口范围裁剪。 |
| `tab_group.list_windows` | 返回窗口列表和窗口级摘要。 |
| `tab_group.list_tabs` | 支持按窗口、标签组、域名、标题/URL、固定、活动、丢弃状态和文本查询筛选，并保留原生顺序。 |
| `tab_group.list_groups` | 返回原生标签组及其成员、顺序和统计摘要。 |
| `tab_group.get_tab` | 根据当前 `tabId` 获取单个标签页的完整记录。 |
| `tab_group.get_group` | 获取单个原生标签组及成员。 |
| `tab_group.get_window` | 获取窗口详情和其中的标签页、标签组。 |
| `tab_group.export_workspace` | 生成可移植的 workspace 文档，包含恢复所需的 URL、顺序、窗口、固定状态和标签组元数据。 |
| `tab_group.get_events` | 返回自某个事件游标以来的状态变更摘要；第一阶段可以先返回“需要重新读取快照”的信号。 |

`get_snapshot` 是 Codex 进行分组推理的主要入口。`list_*` 工具用于减少大规模标签页场景下的返回体积。工具参数需要支持 `fieldSet`，至少提供 `minimal`、`grouping`、`full` 三档。

### 3.2 标签页写工具

| 工具 | 用途 |
| --- | --- |
| `tab_group.activate_tab` | 激活标签页并聚焦所属窗口。 |
| `tab_group.create_tabs` | 根据 URL 创建一个或多个标签页，可指定窗口、位置、固定和激活策略。 |
| `tab_group.update_tab` | 修改 URL、固定、静音、自动丢弃、激活等浏览器允许的属性。 |
| `tab_group.move_tabs` | 在同一窗口或跨窗口移动一组标签页，并指定目标位置。 |
| `tab_group.reorder_tabs` | 用目标标签页顺序重排同一窗口中的标签页。 |
| `tab_group.close_tabs` | 关闭指定标签页；必须显式 `confirm: true`，支持先 `dryRun`。 |
| `tab_group.discard_tabs` | 释放未活动标签页占用的内存。 |
| `tab_group.ungroup_tabs` | 将指定标签页移出原生标签组。 |

### 3.3 标签组写工具

| 工具 | 用途 |
| --- | --- |
| `tab_group.create_group` | 从同一窗口中的标签页创建原生标签组，并设置标题和颜色。 |
| `tab_group.update_group` | 修改标题、颜色和浏览器原生 `collapsed` 状态。管理页面自身的展开状态仍然独立保存。 |
| `tab_group.move_tabs_to_group` | 将标签页移动到已有标签组，允许跨窗口。 |
| `tab_group.move_group` | 在窗口内或跨窗口移动整个标签组。 |
| `tab_group.ungroup_group` | 移出标签组中的全部标签页，使原生标签组自然消失。 |

### 3.4 批量整理与导入工具

| 工具 | 用途 |
| --- | --- |
| `tab_group.preview_operations` | 校验一组命令，计算将改变的标签页和标签组，返回警告、跳过项和预期结果，不修改浏览器。 |
| `tab_group.apply_operations` | 按顺序执行一组经校验的命令，支持 `expectedRevision`、`dryRun`、`confirm` 和失败策略。 |
| `tab_group.import_workspace` | 从 workspace 文档创建窗口/标签页/标签组并恢复顺序；默认只创建，不关闭或覆盖现有标签页。 |
| `tab_group.preview_import` | 在实际创建前报告 URL 数量、目标窗口、待创建的标签组、无法恢复的字段和潜在重复项。 |

`apply_operations` 是 Codex 自动整理的主要写入口。它应支持的操作类型至少包括 `createTabs`、`moveTabs`、`createGroup`、`moveTabsToGroup`、`updateGroup`、`ungroupTabs`、`updateTab`、`closeTabs` 和 `discardTabs`。

## 4. 安全模型与一致性

### 4.1 本地边界

只允许本机 native host 与扩展连接。协议消息必须是 JSON-RPC 风格的请求和响应，具备 `requestId`、`method`、`params`、`result`、`error` 和 `protocolVersion`。不接受任意网页通过 `postMessage` 直接调用写接口，也不把浏览器权限交给 Codex 进程。

Native host 的安装清单、可执行文件路径和浏览器注册步骤必须单独记录。生产实现应限制 host 可访问的扩展 ID，并记录连接建立和写操作审计信息，但不记录完整 URL 查询参数或页面内容之外的敏感信息。

### 4.2 写操作前置条件

除 `get_*` 和 `preview_*` 外，写操作默认要求：

- `expectedRevision` 与当前快照一致，或调用方明确使用 `allowStale: true`。
- 关闭标签页、创建窗口等高影响操作带有 `confirm: true`。
- `dryRun: true` 时只执行校验和计划计算。
- 参数中的标签页和标签组 ID必须属于当前快照；失效 ID返回可分类错误。
- 跨窗口创建标签组时返回不支持原因，因为原生标签组只能属于一个窗口。

浏览器扩展 API 不提供真正的事务。批量执行需要返回每个子操作的状态，并在任何阶段失败后立即读取真实快照。协议应提供 `failurePolicy: stop | continue`，但不能声称已完成回滚。

### 4.3 导入语义

workspace 文档使用稳定的导入标识，不保存旧浏览器 ID作为恢复依据。导入流程按以下顺序执行：

1. 校验文档版本、URL 和窗口/标签组结构。
2. 生成预览，报告重复 URL、无效 URL、不可恢复字段和可能创建的对象数量。
3. 创建或选择目标窗口。
4. 按文档顺序创建标签页。
5. 根据导入标识映射新标签页 ID，再创建或更新原生标签组。
6. 恢复固定状态、标签组元数据、顺序和可选的激活标签页。
7. 返回 ID 映射、跳过项、警告以及最终快照。

默认导入策略为 `append`。`replace` 或关闭现有标签页必须单独请求并带有明确确认。

## 5. 测试策略

- 协议测试：请求解码、参数校验、版本协商、错误码和响应结构。
- 快照测试：字段集裁剪、稳定排序、URL 派生字段、修订值和缺失字段。
- 命令规划测试：创建组、跨窗口移动、重排、关闭确认、过期 revision 和失败策略。
- 导入导出测试：旧 ID 不复用、顺序恢复、固定状态、重复 URL 和部分失败报告。
- 浏览器适配器测试：使用 fake `chrome.tabs`、`chrome.windows`、`chrome.tabGroups` 验证调用顺序。
- 本地桥接测试：仅验证协议边界和断连行为；真实 Native Messaging 注册与 Edge/Chrome 手动验证列为独立验收项。

## 6. 分阶段交付

### Phase 1：协议与只读能力

完成快照扩展、协议类型、service worker 路由、`get_snapshot`/`list_*`/`export_workspace` 和测试。此阶段可以让 Codex读取浏览器状态，但不允许写操作。

### Phase 2：受保护的写能力

完成单项写工具、`preview_operations`、`apply_operations`、revision 检查、确认策略和浏览器适配器扩展。优先覆盖分组所需的创建组、移动标签页、移动标签组、修改组属性和移出标签组。

### Phase 3：本地适配与导入

完成 Native Messaging host 协议适配、Codex/MCP 工具映射、workspace 导入、安装说明和 Edge/Chrome 手动验证。
