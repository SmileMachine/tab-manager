# Codex 本地连接边界

扩展内的 `tab_group.*` 请求仍然由 service worker 统一分派。`src/codex/nativeMessaging.ts` 提供 Native Messaging 的协议边界：本地 host 发送带有 `protocolVersion`、`kind: "request"` 和 Codex JSON-RPC 请求的消息，扩展返回 `kind: "response"` 消息。扩展不会把浏览器控制接口暴露给网页页面。

## Host 清单

Native host 清单必须限制扩展 ID，并把 `allowed_origins` 设置为实际加载的扩展 ID。例如：

```json
{
  "name": "com.tab_group.codex",
  "description": "Local Codex bridge for Tab Group Manager",
  "path": "/absolute/path/to/tab-group-codex-host",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://EXTENSION_ID/"
  ]
}
```

Chrome 和 Edge 的 host 注册目录、扩展 ID 以及可执行文件路径由安装环境决定，不能由扩展构建产物自动写入。生产 host 还应在自身边界保存认证 Token，并与扩展侧的 `authToken` 配置一致。

## 版本约束

MCP server 的 `serverInfo.version` 和 Native host hello 中的 `instance.serverVersion` 必须在增加协议能力或发生显著实现变化时同步递增。当前版本为 `0.3.0`。兼容性扩展只递增 server version；只有线缆消息格式不兼容时才递增 `protocolVersion`。

## 消息约束

- 请求必须使用当前 `protocolVersion`，并通过 `isCodexRpcRequest` 校验。
- `authToken` 如果启用，缺失或不匹配的消息会返回 `invalid-request`，不会调用浏览器 API。
- Native Messaging 的连接是本机进程边界；host 仍需校验扩展 ID、限制可执行文件权限，并对请求设置超时。
- 浏览器控制请求必须继续经过已有的 service worker handler，不能在 host 中直接调用浏览器 API。

## MCP 映射建议

MCP server 可以把 `tab_group.get_snapshot`、`tab_group.get_tabs`、`tab_group.get_groups`、`tab_group.list_tabs`、`tab_group.find_duplicate_tabs`、`tab_group.inspect_tabs`、`tab_group.preview_operations`、`tab_group.apply_operations`、`tab_group.preview_import`、`tab_group.import_workspace`、`tab_group.preview_rollback` 和 `tab_group.rollback_operation` 映射为同名工具。工具目录应为每个工具提供严格的输入 schema；MCP 会话内的 `get_capabilities` 结果可以缓存，Native host 断开后再刷新。工具调用的完整协议结果放在 `structuredContent`，`content` 仅保留简短状态文本，避免把同一份 JSON 复制两次。重复检测工具 `tab_group.find_duplicate_tabs` 默认使用完整的 title/URL 数据进行匹配，并可通过 `fieldSet` 控制返回字段；其他读取工具默认使用 `grouping` 或 `compact` 预算；批量写操作必须先预览，并把返回的 `revision` 作为后续请求的 `expectedRevision`。

## 本地开发连接步骤

在仓库根目录执行：

```bash
npm install
npm run build
```

然后在 Edge 或 Chrome 的扩展管理页面加载对应的构建目录，并记下扩展 ID。Native Messaging manifest 的 `allowed_origins` 必须使用这个 ID。

Chrome：

```bash
npm run install:native-messaging -- \
  --browser chrome \
  --extension-id YOUR_EXTENSION_ID
```

Edge：

```bash
npm run install:native-messaging -- \
  --browser edge \
  --extension-id YOUR_EXTENSION_ID
```

安装脚本会把 manifest 写入当前用户的浏览器 Native Messaging 目录。在 macOS 和 Linux 上，脚本还会生成一个 launcher，让浏览器通过绝对路径找到本机的 Node.js；这对于使用 `fnm`、`nvm` 或其他 shell 环境管理 Node.js 的开发机是必要的。Windows 需要另外把生成的 manifest 路径注册到浏览器对应的 Native Messaging Host 注册表；脚本会在 Windows 上只校验并输出 manifest，不会修改注册表。

接着把本地 MCP server 加入 Codex 的 MCP 配置。配置的核心内容如下：

```toml
[mcp_servers.tab_group]
command = "node"
args = ["tools/tab-group-mcp/index.mjs"]
cwd = "<repository-root>"
enabled = true
required = true
startup_timeout_sec = 10
tool_timeout_sec = 15
```

`tool_timeout_sec = 15` 与 MCP 内部的 15 秒请求上限共同限制单次工具调用；MCP 还支持 `TAB_GROUP_CODEX_TOOL_TIMEOUT_MS` 作为本地测试或故障排查用的较短预算，但不会接受超过 15 秒的值。

将 `<repository-root>` 替换为仓库根目录；不要把真实本机路径提交到仓库。MCP server 使用标准输入输出与 Codex 通信；Native Messaging host 使用标准输入输出与浏览器通信；两者之间通过临时目录中的 Unix socket 通信。每个 MCP server 使用独立的 `mcp-<pid>.sock`，Native host 会自动发现同一目录中的多个 MCP server，因此 Codex 同时存在多个会话时不会互相覆盖。默认目录为：

```text
/tmp/tab-group-codex/
```

如需指定目录，可同时为 MCP server 和 Native host 设置 `TAB_GROUP_CODEX_SOCKET_DIRECTORY`；保留 `TAB_GROUP_CODEX_SOCKET` 可用于单实例调试。

不重启 Codex 也可以单独运行桥接测试：

```bash
# 只测试 MCP 的 initialize 和 tools/list
npm run test:bridge -- --protocol-only

# 测试 MCP → Native host → Edge 扩展的完整链路
npm run test:bridge
```

完整链路测试默认等待 15 秒。返回码为 `0` 表示收到扩展响应，返回码为 `2` 表示 MCP 已启动但在等待时间内没有收到 Native Messaging 响应。

桥接超时和实例信息可以单独检查：

```bash
# 验证请求超时、清理 pending，以及迟到响应不会污染后续请求
npm run test:bridge-timeout

# 验证 hello 会被 Native host 记录为实例诊断信息
npm run test:bridge-diagnostics

# 查看 socket、Native host peer、MCP PID、连接时间和最近请求/响应
npm run diagnose:bridge
```

MCP 连接建立后会发送一条内部 `hello` 消息，包含 PID、版本、启动时间和 socket。它不经过浏览器请求分派，也不会改变现有工具协议；Native host 将这些信息写入临时状态文件和诊断日志。

如果希望使用认证 Token，需要让扩展侧、Native host 和 MCP server 使用同一个 Token。当前 Node 侧支持：

```bash
export TAB_GROUP_CODEX_AUTH_TOKEN='replace-with-a-long-random-token'
```

扩展侧则需要在调用 `registerBackgroundListeners` 时传入 `nativeMessagingAuthToken`。没有配置扩展侧 Token 时，Native host 不会自行强制认证。

## 连接后的调用顺序

Codex 连接成功后，建议先调用：

```text
tab_group.get_capabilities
tab_group.get_snapshot(fieldSet="grouping")
```

需要判断页面主题时，只对少量候选标签页调用：

```text
tab_group.inspect_tabs(budget="compact")
tab_group.read_tab_content(budget="focused", focusTerms=[...])
```

批量分组应遵循：

```text
get_snapshot
→ inspect_tabs
→ preview_operations
→ apply_operations(expectedRevision=..., confirm=true)
```

导入和回退应遵循：

```text
preview_import
→ import_workspace(confirm=true)

preview_rollback
→ rollback_operation(confirm=true)
```

## 普通用户、可选业务连接与本地开发的边界

普通发行包无需安装 host、Node.js 或本地开发服务。扩展后台默认不连接 host，也不安排连接重试；旧版本没有启用设置时也按关闭处理。标签页与标签组管理不依赖本地桥接。

需要本机 Codex/MCP 控制时，在扩展管理页打开该扩展的「扩展选项」（`options.html`），主动勾选 **Allow local Codex/MCP connections**，并按本文安装和授权 host。启用设置会持久化；关闭后会断开并取消重试。连接失败采用从 2 秒起、最大 60 秒的指数退避，不影响普通功能。设置页显示连接状态；收到业务消息才确认 connected，刚返回 Native Port 不等于 host 已可用。

本地开发切换使用单独的开发连接，不由这个业务开关控制，也不要求 Codex MCP server 正在运行。发行包没有开发控制处理器：开启业务桥接不会获得开发重载能力。

## 单安装目录开发：首次迁移

当前自动工作流的 host 注册查找默认支持 macOS。其他平台可通过 `TAB_GROUP_HOST_MANIFEST` 显式提供已安装的 host manifest 路径；本机 Unix socket 控制通道尚未在 Windows 验证，不宣称 Windows 开发工作流已支持。发行扩展本身不受此开发平台限制。

1. 保留当前 `.output/edge-mv3-dev/` 的安装，不另装一份日常版。
2. 确认 host 已按该扩展 ID 安装和授权；若尚未安装，运行：

   ```bash
   npm run install:native-messaging -- --browser edge --extension-id YOUR_EXTENSION_ID
   ```

3. 运行 `npm run prepare:local`，生成可独立运行、带受限开发连接的本地自用包到原目录。
4. **仅首次迁移**：在 Edge 扩展管理页重新加载这份扩展一次。这样新后台才能启动新 host 协议；旧进程不会因源文件更新自动获得新协议。核对安装 ID 未变。
5. 此后运行 `npm run dev`。命令会预检 host 与目标、准备恢复版本、启动 WXT，再主动通知扩展切换；收到新后台确认才报告成功。不要求每次手动重载。
6. 正常 `Ctrl+C` 后等待 **Standalone runtime confirmed**，确认已恢复独立构建。恢复构建失败时使用本次会话启动前最后成功的独立版本，终端会提示新改动未包含。

Chrome 对应命令为 `npm run prepare:local:chrome`、`npm run dev:chrome` 与 `npm run restore:local:chrome`，加载原 `.output/chrome-mv3-dev/` 目录。多 ID 注册时通过 `TAB_GROUP_EXTENSION_ID` 指定目标，不能误把其他安装当作本次目标。

`SIGKILL` 或断电不保证执行清理。浏览器与 host 可用后，运行 `npm run restore:local`，从保留的成功资源恢复并主动通知重载。host 不可用时命令报错，不会静默改用轮询或要求每次手动切换。

### 控制与文件边界

- 本地控制请求独立于 `tab_group.*` RPC，经当前用户私有 Unix socket 传输，验证 token、协议版本、浏览器、安装标识和扩展 ID。
- Token 保存在被 Git 忽略的 `.output/local-runtime/<browser>/config.json`；包含 token 的本地自用产物也受文件权限限制，不要分享或发布这些目录。
- `.output/<browser>-mv3-dev/` 是唯一安装目录；独立恢复副本与可变开发构建在 `.output/local-runtime/<browser>/` 隔离。不要在会话运行时删除这些目录。
- 命令区分资源发布、重载请求接受与新后台确认。确认超时不等于文件没有恢复，也不能被报告为切换成功。
- 不轮询标记文件、不探测 localhost 可用性、不增加 `alarms` 权限。仅在执行切换命令的有限超时内查询 host，以等待新后台确认。
- `npm run build` / `npm run build:chrome` 是正式独立包，不包含开发控制。不要为了本地热更新改加载这些目录。

### 验证命令与范围

```bash
npm run test:runtime    # 真实 host 进程、认证、发布恢复和退出状态机
npm run verify:runtime  # 真实 WXT/Vite/host；扩展端模拟，不等于浏览器验收
node scripts/local-runtime/verify-release.mjs # 先完成 Edge 与 Chrome 正式构建
```

完整浏览器验收仍需检查页面 HMR、真实自动切换、用户偏好和 ID。命令行/模拟测试不代替这一层。
