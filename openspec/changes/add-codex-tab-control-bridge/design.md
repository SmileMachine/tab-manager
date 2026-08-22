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

## 4. 操作记录、快照与回退

### 4.1 记录范围

所有由扩展执行的浏览器写操作都必须经过统一的 command executor，并在执行前后写入操作记录。这包括管理页面、Codex bridge、导入流程、批量整理以及回退操作。仅在管理页面中记录 Codex 请求，会留下无法解释的状态变化，因此现有 manager 页面直接调用 `BrowserTabsApi` 的路径需要迁移到共享的记录层，或通过 service worker 的统一命令入口执行。

每条记录至少包含：

- `operationId`、`source`、`operationType`、`requestedAt`、`completedAt`。
- 请求参数的安全摘要，不保存不必要的敏感内容。
- `beforeSnapshotId`、`afterSnapshotId`。
- `expectedRevision`、实际执行时的 revision。
- `status: succeeded | partially-failed | failed | rolled-back`。
- 每个子操作的结果、警告和错误。
- `revertsOperationId`，用于标记一条回退操作对应的原始操作。

批量操作作为一条可审查的父记录保存，子操作结果按稳定序号记录。批量执行中途失败时，仍然保存失败前后的快照，不能只保留成功结果。

### 4.2 快照存储

快照使用可恢复的 portable workspace 结构，不把当前浏览器 ID当作恢复依据。快照至少保存窗口、标签页 URL、原生顺序、固定状态、活动状态、标签组元数据以及导入标识。浏览器 ID仅作为当次快照中的诊断信息。

快照存储使用扩展自己的 IndexedDB，而不是把大量历史内容塞入 `chrome.storage`。存储可以采用按内容哈希寻址：相同状态只保存一份实体，操作记录保存 `beforeSnapshotId` 和 `afterSnapshotId` 引用。这样每个操作都拥有明确的前后快照，同时避免连续读取没有变化时反复复制相同数据。

需要提供可配置的保留策略：

- 默认保留最近若干条操作记录和最近若干个命名 checkpoint。
- 达到数量或存储容量上限时，先清理没有被任何操作引用的重复快照。
- 被操作记录引用的快照不能被单独清除。
- 清理历史记录属于显式管理操作，不由普通批量整理静默触发。

### 4.3 回退工具

增加以下工具：

| 工具 | 用途 |
| --- | --- |
| `tab_group.list_operation_history` | 按时间、来源、状态和操作类型查询历史记录，只返回摘要。 |
| `tab_group.get_operation` | 读取一条操作记录及其前后快照摘要。 |
| `tab_group.create_checkpoint` | 显式保存一个命名快照，供后续恢复。 |
| `tab_group.list_checkpoints` | 列出命名 checkpoint。 |
| `tab_group.preview_rollback` | 比较当前状态与目标快照，展示将创建、移动、更新和无法恢复的对象。 |
| `tab_group.rollback_operation` | 将浏览器状态恢复到某条操作的 `beforeSnapshot`，或恢复到指定 checkpoint。 |

回退本身也必须生成新的操作记录。`rollback_operation` 不能直接删除历史记录，也不能把原记录改写成“已撤销”；它需要以一条新的记录描述回退过程。

### 4.4 回退能力边界

标签页排列、窗口归属、固定状态、标签组成员关系、标签组标题和颜色通常可以通过重新创建或重新移动恢复。关闭过的标签页只能根据保存的 URL 创建新的标签页，无法保证恢复原来的进程状态、表单输入、滚动位置或页面内存状态。对于无法准确恢复的字段，回退预览必须明确列出警告。

如果原窗口已不存在，可以根据快照创建新窗口；隐身窗口、浏览器内部页面、受浏览器策略限制的页面以及无法恢复的 session 字段必须返回明确的跳过原因。回退不能假装已经恢复了浏览器无法提供的状态。

## 5. 直接读取标签页内容

### 5.1 工具分层

直接读取页面内容的目的，是在 URL 和标签页元数据不足以判断分组归属时提供少量证据。它不应默认返回完整 HTML 或全文。建议提供三类工具：

| 工具 | 用途 | 默认返回量 |
| --- | --- | --- |
| `tab_group.inspect_tabs` | 批量读取多个标签页的紧凑内容指纹，适合初筛。 | 每个标签页一条短记录 |
| `tab_group.inspect_tab` | 读取单个标签页的标题、摘要、标题层级和主要内容片段。 | `compact` budget |
| `tab_group.read_tab_content` | 对单个标签页进行有目的的内容读取。 | 由 `mode` 和 `budget` 限制 |

`inspect_tabs` 用于一次处理一批候选标签页，减少 MCP 请求往返和重复协议字段。建议默认限制单次 20 个标签页，并允许返回逐项失败结果，而不是因为一个受限页面导致整批失败。

### 5.2 内容读取模式

`read_tab_content` 不接受任意脚本，只接受受限的读取参数：

- `mode: outline`：页面标题、canonical URL、语言、meta description、主要标题、内容区域和页面类型。
- `mode: excerpt`：从主要内容区域提取受字符预算限制的文本片段。
- `mode: focused`：根据 `focusTerms` 查找相关文本，返回去重后的上下文片段；没有命中时返回很短的开头摘要。
- `mode: structured`：返回标题、列表项和段落的结构化摘要，忽略脚本、样式、导航和隐藏节点。

每次调用支持 `budget: compact | focused | expanded`，并由扩展端设置硬上限。调用方可以提供 `maxChars`，但不能超过服务端上限。响应包含 `returnedChars`、`estimatedTokens`、`truncated` 和 `contentHash`，让 Codex知道是否需要继续读取。

### 5.3 最少上下文的提取算法

默认提取顺序如下：

1. 使用页面标题、canonical URL、`og:title`、meta description 和文档语言建立页面身份。
2. 提取最多若干个 `h1` 至 `h3` 标题，保留标题层级。
3. 优先选择 `main`、`article`、`[role="main"]` 等主要内容区域。
4. 从主要内容中移除 `script`、`style`、`noscript`、导航、页脚、隐藏节点、表单输入值和重复空白。
5. 使用段落、列表项和标题作为候选片段；`focused` 模式只保留包含关键词或其邻近窗口的片段。
6. 对重复片段去重，并按信息密度和与 `focusTerms` 的距离排序。
7. 只返回受预算限制的文本，不返回原始 HTML、完整链接列表或页面脚本。

默认 `compact` 响应应优先包含标题、meta 描述、标题层级、页面类型和一小段主要文本。只有 Codex 判断这些证据不足时，才请求 `focused` 或 `expanded`。返回内容必须带有 `contentTrust: untrusted-page-data`，提醒调用方把页面文本当作数据，不把其中的指令当作 Codex 操作要求。

### 5.4 页面权限和不可读状态

直接读取使用 `chrome.scripting.executeScript`，需要 `scripting` 权限以及对应站点的 host permission。为避免一开始就请求全部站点权限，设计上采用 optional host permission：首次读取某个 origin 时返回 `host-permission-required`，由用户在扩展管理页面明确授权；用户也可以在设置中启用本地自动整理所需的站点范围。

以下页面需要返回结构化的不支持原因，并且不能尝试绕过浏览器限制：

- `chrome://`、`edge://` 等浏览器内部页面。
- 扩展商店页面。
- 浏览器 PDF viewer 或其他禁止脚本注入的页面。
- 处于 discarded、尚未加载或浏览器策略禁止访问的标签页。

读取接口默认不激活标签页、不重新加载页面、不改变窗口焦点。除非另有明确工具和确认，它只能读取当前页面状态。

## 6. 安全模型与一致性

### 6.1 本地边界

只允许本机 native host 与扩展连接。协议消息必须是 JSON-RPC 风格的请求和响应，具备 `requestId`、`method`、`params`、`result`、`error` 和 `protocolVersion`。不接受任意网页通过 `postMessage` 直接调用写接口，也不把浏览器权限交给 Codex 进程。

Native host 的安装清单、可执行文件路径和浏览器注册步骤必须单独记录。生产实现应限制 host 可访问的扩展 ID，并记录连接建立和写操作审计信息，但不记录完整 URL 查询参数或页面内容之外的敏感信息。

### 6.2 写操作前置条件

除 `get_*` 和 `preview_*` 外，写操作默认要求：

- `expectedRevision` 与当前快照一致，或调用方明确使用 `allowStale: true`。
- 关闭标签页、创建窗口等高影响操作带有 `confirm: true`。
- `dryRun: true` 时只执行校验和计划计算。
- 参数中的标签页和标签组 ID必须属于当前快照；失效 ID返回可分类错误。
- 跨窗口创建标签组时返回不支持原因，因为原生标签组只能属于一个窗口。

浏览器扩展 API 不提供真正的事务。批量执行需要返回每个子操作的状态，并在任何阶段失败后立即读取真实快照。协议应提供 `failurePolicy: stop | continue`，但不能声称已完成回滚。

### 6.3 导入语义

workspace 文档使用稳定的导入标识，不保存旧浏览器 ID作为恢复依据。导入流程按以下顺序执行：

1. 校验文档版本、URL 和窗口/标签组结构。
2. 生成预览，报告重复 URL、无效 URL、不可恢复字段和可能创建的对象数量。
3. 创建或选择目标窗口。
4. 按文档顺序创建标签页。
5. 根据导入标识映射新标签页 ID，再创建或更新原生标签组。
6. 恢复固定状态、标签组元数据、顺序和可选的激活标签页。
7. 返回 ID 映射、跳过项、警告以及最终快照。

默认导入策略为 `append`。`replace` 或关闭现有标签页必须单独请求并带有明确确认。

## 7. 测试策略

- 协议测试：请求解码、参数校验、版本协商、错误码和响应结构。
- 快照测试：字段集裁剪、稳定排序、URL 派生字段、修订值和缺失字段。
- 命令规划测试：创建组、跨窗口移动、重排、关闭确认、过期 revision 和失败策略。
- 导入导出测试：旧 ID 不复用、顺序恢复、固定状态、重复 URL 和部分失败报告。
- 浏览器适配器测试：使用 fake `chrome.tabs`、`chrome.windows`、`chrome.tabGroups` 验证调用顺序。
- 本地桥接测试：仅验证协议边界和断连行为；真实 Native Messaging 注册与 Edge/Chrome 手动验证列为独立验收项。

## 8. 分阶段交付

### Phase 1：协议、快照与只读能力

完成快照扩展、协议类型、service worker 路由、`get_snapshot`/`list_*`/`export_workspace`、操作快照存储和测试。此阶段可以让 Codex读取浏览器状态，但不允许写操作。

### Phase 2：受保护的写能力与操作历史

完成单项写工具、`preview_operations`、`apply_operations`、revision 检查、确认策略、统一 command executor、操作记录和回退预览。优先覆盖分组所需的创建组、移动标签页、移动标签组、修改组属性和移出标签组。

### Phase 3：内容读取、本地适配与导入

完成页面内容提取、optional host permission、Native Messaging host 协议适配、Codex/MCP 工具映射、workspace 导入、安装说明和 Edge/Chrome 手动验证。
