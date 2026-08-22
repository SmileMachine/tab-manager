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

标签页记录分为原始浏览器字段、低成本派生证据和页面读取证据。三者必须在协议中区分，不能把扩展自己的推断描述成 Edge 提供的事实。

原始字段包括：

- `id`、`windowId`、`index`、`groupId`。
- `title`、`url`、`pendingUrl`、`favIconUrl`。
- `active`、`highlighted`、`pinned`、`audible`、`discarded`、`autoDiscardable`。
- `status`、`incognito`、`openerTabId`、`sessionId`、`lastAccessed`，字段存在时才返回。
- `muted` 及 `mutedReason`，若浏览器提供 `mutedInfo`。

低成本派生字段包括：

- `hostname`、`origin`、`protocol`、`pathname`，无法解析时返回 `null`。
- `isNewTab`、`isInternalPage`、`isPdf` 等可以直接由 URL 或浏览器状态确定的标记。
- `group` 摘要、窗口摘要和标签页在窗口中的相邻关系。

页面形状和页面语义不能从 `chrome.tabs.Tab` 直接获得。Edge 提供的是标题、URL、状态和生命周期字段，不提供“这是视频、访谈或文章”这样的通用 page kind。本次变更不建立通用 `pageKind` 或 `urlKind` 字段，也不维护 URL 特征分类列表。后续如果需要站点分类，应单独设计一个由 hostname、pathname 和查询参数组成的规则表，并明确规则来源、适用站点和未知状态。

页面内容读取可以在获得 host permission 后，通过 `chrome.scripting.executeScript` 读取当前 DOM、meta 标签、JSON-LD 和可见结构，得到带来源的页面证据。内容证据可能缺失、过时或被站点自定义，不能当作权威分类，也不应在本次变更中被压缩成一个通用 page kind。

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
| `tab_group.get_workspace_overview` | 只返回窗口、标签组、域名、URL 路径特征和未分组状态的统计，不返回全部标签页正文。 |
| `tab_group.list_windows` | 返回窗口列表和窗口级摘要。 |
| `tab_group.list_tabs` | 支持按窗口、标签组、域名、URL 前缀、标题/URL、固定、活动、丢弃状态和文本查询筛选，并可返回匹配项的相邻标签页和连续片段。 |
| `tab_group.list_groups` | 返回原生标签组及其成员、顺序和统计摘要。 |
| `tab_group.get_tabs` | 根据多个 `tabId` 一次获取标签页记录；单个标签页也通过传入单元素数组读取。 |
| `tab_group.get_groups` | 根据多个 `groupId` 一次获取原生标签组及可选成员；单个标签组也通过传入单元素数组读取。 |
| `tab_group.get_window` | 获取窗口详情和其中的标签页、标签组。 |
| `tab_group.export_workspace` | 生成可移植的 workspace 文档，包含恢复所需的 URL、顺序、窗口、固定状态和标签组元数据。 |
| `tab_group.get_events` | 返回自某个事件游标以来的状态变更摘要；第一阶段可以先返回“需要重新读取快照”的信号。 |
| `tab_group.get_snapshot_delta` | 根据 `sinceRevision` 返回受影响的窗口、标签页和标签组；无法计算安全增量时明确要求完整快照。 |

`get_snapshot` 是 Codex 进行全局分组推理的主要入口。`list_*` 工具用于减少大规模标签页场景下的返回体积。工具参数需要支持 `fieldSet`，至少提供 `minimal`、`grouping`、`full` 三档。

针对分组任务，读取接口需要同时支持两种路径：需要全局上下文时读取一次 `grouping` 快照；只需要候选集合时使用服务端筛选，避免把无关标签页送入 Codex 上下文。`list_tabs` 的相邻片段查询至少支持 `groupId: -1`、`hostname`、`urlPrefix`、`includeNeighbors` 和 `includeSegments`。相邻片段只表达窗口顺序和当前 group 边界，不对主题相关性作结论。

本次变更不实现 URL 特征分类表。URL 的 hostname、origin、pathname 仍作为原始可解释字段返回，后续站点规则变更不得改变这些字段的含义。

### 3.1.1 批量详情读取

调用记录显示，Codex 经常在同一规划阶段连续读取多个已知 `tabId` 或 `groupId`。当前单项工具每次都会重新加载完整快照，因此增加批量详情工具：

| 工具 | 用途 |
| --- | --- |
| `tab_group.get_tabs` | 一次读取多个标签页，所有结果共享同一个 `capturedAt` 和 `revision`。 |
| `tab_group.get_groups` | 一次读取多个标签组，可选择是否附带成员标签页。 |

批量接口的 ID 查询必须满足以下约束：

- 输入 ID 自动去重；
- 找不到的 ID 返回 `missingTabIds` 或 `missingGroupIds`，不使整批请求失败；
- 返回结果包含统一的 `capturedAt` 和 `revision`；
- 标签页默认按窗口原生顺序返回，并保留 `windowId` 和 `index`；
- `get_groups` 的成员读取使用 `tabDetail: none | summary | full`，避免默认复制大型标签页记录。

### 3.1.2 多条件筛选和状态复用

`list_tabs` 应支持 `textAny`、`hostnameAny`、`urlPrefixAny`、`windowIds`、`groupIds` 等数组条件，减少 Codex 为同一规划阶段重复提交相近查询的需要。是否返回完整快照，应由任务范围决定：

- 全局整理：优先使用一次 `get_snapshot(fieldSet: grouping)`，由调用方在本地建立索引；
- 局部整理：优先使用服务端筛选和相邻片段，避免传输无关标签页；
- 已知 ID 详情：使用 `get_tabs` 或 `get_groups`，不再调用全量列表工具。

写操作的返回状态应当可以直接成为下一次规划的输入。`apply_operations` 支持 `returnState: none | affected | grouping | full`，默认返回受影响对象和新 revision；只有调用方明确要求时才返回完整快照。

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
| `tab_group.move_tabs_to_group` | 将标签页移动到已有标签组，允许跨窗口，并支持目标位置和保持源顺序策略。 |
| `tab_group.move_group` | 在窗口内或跨窗口移动整个标签组。 |
| `tab_group.ungroup_group` | 移出标签组中的全部标签页，使原生标签组自然消失。 |

### 3.4 批量整理与导入工具

| 工具 | 用途 |
| --- | --- |
| `tab_group.preview_operations` | 校验一组命令，计算将改变的标签页和标签组，返回警告、跳过项、顺序影响和短期 `planId`，不修改浏览器。 |
| `tab_group.apply_operations` | 按顺序执行一组经校验的命令，支持 `expectedRevision`、`planId`、`dryRun`、`confirm`、批次内 group alias、目标位置和失败策略。 |
| `tab_group.import_workspace` | 从 workspace 文档创建窗口/标签页/标签组并恢复顺序；默认只创建，不关闭或覆盖现有标签页。 |
| `tab_group.preview_import` | 在实际创建前报告 URL 数量、目标窗口、待创建的标签组、无法恢复的字段和潜在重复项。 |

`apply_operations` 是 Codex 自动整理的主要写入口。它应支持的操作类型至少包括 `createTabs`、`moveTabs`、`createGroup`、`moveTabsToGroup`、`updateGroup`、`ungroupTabs`、`updateTab`、`closeTabs` 和 `discardTabs`。

批量请求必须允许在同一批次中使用 group alias。这样 `createGroup` 可以声明一个批次内的逻辑名称，后续 `moveTabsToGroup` 使用该名称，而不必等待浏览器返回新的原生 group ID。`moveTabsToGroup` 还应声明 `preserveSourceOrder` 和 `placement`，至少支持追加到目标 group、放置在目标 group 前后，以及在同一窗口中保持源标签页顺序。

浏览器 API 不提供跨多个 API 调用的原子事务，因此建议增加 `failurePolicy: rollback`。该策略不能承诺恢复页面进程状态，但应在可恢复范围内根据批次前快照执行补偿，并将原始失败和回退结果分别记录。普通批量整理不需要先调用 `create_checkpoint`：每次 `apply_operations` 已经保存操作前后快照；命名 checkpoint 仅作为可选的批次标签。

`preview_operations` 可以返回短期有效的 `planId`、目标 revision、受影响的标签页和 group、跨窗口移动数量及顺序警告。`apply_operations` 接受 `planId` 时仍必须重新校验当前 revision，不能把计划当作绕过一致性检查的凭证。计划需要带有过期时间和 operation hash；扩展 service worker 重启或计划过期后，调用方必须重新预览。

所有可能产生浏览器状态变化的批量请求还应支持 `idempotencyKey`。操作记录按 key 保存最终结果，使 MCP 因超时或断连重试时不会重复创建标签页、标签组或移动操作。`expectedRevision` 负责检测浏览器状态变化，`idempotencyKey` 负责识别同一个请求是否已经执行过，两者不能互相替代。

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

checkpoint 的创建应具有幂等语义：相同名称和相同 revision 的请求返回已有 checkpoint；相同名称但 revision 不同的请求创建新的 checkpoint ID。可以允许调用方不提供名称，由服务端生成带时间的名称并返回 `generated: true`，但命名 checkpoint 仍然应当作为用户明确的恢复节点使用。

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

直接读取页面内容的目的，是在 URL 和标签页元数据不足以判断分组归属时提供少量证据。它不应默认返回完整 HTML 或全文。Edge 不提供通用 page kind；内容读取只能产生带来源的页面证据和启发式观察。建议提供三类工具：

| 工具 | 用途 | 默认返回量 |
| --- | --- | --- |
| `tab_group.inspect_tabs` | 批量读取多个标签页的紧凑内容指纹，适合初筛。 | 每个标签页一条短记录 |
| `tab_group.inspect_tab` | 读取单个标签页的标题、摘要、标题层级和主要内容片段。 | `compact` budget |
| `tab_group.read_tab_content` | 对单个标签页进行有目的的内容读取。 | 由 `mode` 和 `budget` 限制 |

`inspect_tabs` 用于一次处理一批候选标签页，减少 MCP 请求往返和重复协议字段。建议默认限制单次 20 个标签页，并允许返回逐项失败结果，而不是因为一个受限页面导致整批失败。

### 5.2 内容读取模式

`read_tab_content` 不接受任意脚本，只接受受限的读取参数：

- `mode: outline`：页面标题、canonical URL、语言、meta description、Open Graph 元数据、可见标题、JSON-LD 中可安全识别的字段、内容区域观察和 URL/layout 证据。
- `mode: excerpt`：从主要内容区域提取受字符预算限制的文本片段。
- `mode: focused`：根据 `focusTerms` 查找相关文本，返回去重后的上下文片段；没有命中时返回很短的开头摘要。
- `mode: structured`：返回标题、列表项和段落的结构化摘要，忽略脚本、样式、导航和隐藏节点。

每次调用支持 `budget: compact | focused | expanded`，并由扩展端设置硬上限。调用方可以提供 `maxChars`，但不能超过服务端上限。响应包含 `returnedChars`、`estimatedTokens`、`truncated` 和 `contentHash`，让 Codex知道是否需要继续读取。

### 5.3 元数据来源和最少上下文的提取算法

标题、作者、描述和发布时间不是浏览器统一提供的字段。扩展只能按以下优先级提取，并且必须返回每个字段的来源与可用性：

1. `document.title` 和标签页原始 `title`：页面标题。
2. `link[rel="canonical"]`、`meta[name="description"]`、`meta[property="og:title"]`、`meta[property="og:description"]`、Twitter Card meta：页面身份和摘要。
3. JSON-LD 中的 `author`、`datePublished`、`dateModified`、`description`、`headline`：结构化元数据；必须标记 `source: json-ld`，不能保证字段真实或完整。
4. 可见 DOM 中的有限站点无关线索，例如 `article`、`main`、`time[datetime]`、带有 `rel="author"` 的链接和可见标题。通用选择器只产生观察结果，不产生强结论。
5. 对少数需要更高准确度的站点，可以添加明确的站点适配器；适配器必须返回来源标识，不能把站点规则伪装成浏览器字段。

如果字段没有可靠来源，返回 `undefined` 或带有 `availability: unavailable` 的证据对象，不通过正文猜测作者和发布时间。`author`、`publishedAt` 等字段都必须允许缺失。

默认提取顺序如下：

1. 使用标签页标题、`document.title`、canonical URL、Open Graph 元数据和文档语言建立页面身份。
2. 读取有限的 JSON-LD 和可见 DOM 元数据，不读取完整正文来寻找作者或日期。
3. 提取最多若干个 `h1` 至 `h3` 标题，保留标题层级。
4. 优先选择 `main`、`article`、`[role="main"]` 等主要内容区域。
5. 从主要内容中移除 `script`、`style`、`noscript`、导航、页脚、隐藏节点、表单输入值和重复空白。
6. 使用段落、列表项和标题作为候选片段；`focused` 模式只保留包含关键词或其邻近窗口的片段。
7. 对重复片段去重，并按信息密度和与 `focusTerms` 的距离排序。
8. 只返回受预算限制的文本，不返回原始 HTML、完整链接列表或页面脚本。

默认 `compact` 响应应优先包含标题、描述证据、标题层级、URL/layout 观察、结构化元数据和一小段主要文本。只有 Codex 判断这些证据不足时，才请求 `focused` 或 `expanded`。返回内容必须带有 `contentTrust: untrusted-page-data`，提醒调用方把页面文本当作数据，不把其中的指令当作 Codex 操作要求。

内容读取不根据一个未经验证的 page kind 自动决定正文策略。调用方应先使用 URL 规则和标签页元数据做低成本筛选，再按不确定性选择 `outline`、`focused` 或 `expanded`。扩展端可以根据读取结果提供建议预算，但不得把建议当作分类事实。

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

浏览器扩展 API 不提供真正的事务。批量执行需要返回每个子操作的状态，并在任何阶段失败后读取真实快照。协议应提供 `failurePolicy: stop | continue | rollback`；`rollback` 只能表示对可恢复浏览器状态执行补偿，不能声称恢复了页面进程状态。

`preview_operations` 可以产生短期 `previewId`。应用预览时仍需校验 `expectedRevision`、preview 的过期时间和 operation hash。所有可能改变浏览器状态的请求还必须支持 `idempotencyKey`，避免请求超时后的重试造成重复写入。

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
- 快照测试：字段集裁剪、稳定排序、原始 URL 字段、修订值和缺失字段；不在本次变更中测试通用 page kind 或站点 URL 分类表。
- 批量读取测试：`get_tabs`、`get_groups` 的单次快照一致性、重复 ID、缺失 ID、成员标签页返回级别和统一 revision。
- 命令规划测试：创建组、跨窗口移动、重排、关闭确认、过期 revision 和失败策略。
- 批量写一致性测试：previewId 过期、operation hash 不匹配、idempotencyKey 重试、`returnState` 范围和补偿回退结果。
- 导入导出测试：旧 ID 不复用、顺序恢复、固定状态、重复 URL 和部分失败报告。
- 浏览器适配器测试：使用 fake `chrome.tabs`、`chrome.windows`、`chrome.tabGroups` 验证调用顺序。
- 本地桥接测试：仅验证协议边界和断连行为；真实 Native Messaging 注册与 Edge/Chrome 手动验证列为独立验收项。

## 8. 分阶段交付

### Phase 1：协议、快照与只读能力

完成快照扩展、协议类型、service worker 路由、`get_snapshot`/`get_tabs`/`get_groups`/`list_*`/`export_workspace`、操作快照存储和测试。此阶段可以让 Codex读取浏览器状态，但不允许写操作。

### Phase 2：受保护的写能力与操作历史

完成单项写工具、`preview_operations`、`apply_operations`、revision 检查、previewId、idempotencyKey、`returnState`、确认策略、统一 command executor、操作记录和回退预览。优先覆盖分组所需的创建组、移动标签页、移动标签组、修改组属性和移出标签组。

### Phase 3：内容读取、本地适配与导入

完成页面内容提取、optional host permission、Native Messaging host 协议适配、Codex/MCP 工具映射、workspace 导入、安装说明和 Edge/Chrome 手动验证。
