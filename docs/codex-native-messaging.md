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

## 消息约束

- 请求必须使用当前 `protocolVersion`，并通过 `isCodexRpcRequest` 校验。
- `authToken` 如果启用，缺失或不匹配的消息会返回 `invalid-request`，不会调用浏览器 API。
- Native Messaging 的连接是本机进程边界；host 仍需校验扩展 ID、限制可执行文件权限，并对请求设置超时。
- 浏览器控制请求必须继续经过已有的 service worker handler，不能在 host 中直接调用浏览器 API。

## MCP 映射建议

MCP server 可以把 `tab_group.get_snapshot`、`tab_group.list_tabs`、`tab_group.inspect_tabs`、`tab_group.preview_operations`、`tab_group.apply_operations`、`tab_group.preview_import`、`tab_group.import_workspace`、`tab_group.preview_rollback` 和 `tab_group.rollback_operation` 映射为同名工具。读取工具默认使用 `grouping` 或 `compact` 预算；批量写操作必须先预览，并把返回的 `revision` 作为后续请求的 `expectedRevision`。

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

安装脚本会把 manifest 写入当前用户的浏览器 Native Messaging 目录。Windows 需要另外把生成的 manifest 路径注册到浏览器对应的 Native Messaging Host 注册表；脚本会在 Windows 上只校验并输出 manifest，不会修改注册表。

接着把本地 MCP server 加入 Codex 的 MCP 配置。配置的核心内容如下：

```toml
[mcp_servers.tab_group]
command = "node"
args = ["tools/tab-group-mcp/index.mjs"]
cwd = "<repository-root>"
enabled = true
```

将 `<repository-root>` 替换为仓库根目录；不要把真实本机路径提交到仓库。MCP server 使用标准输入输出与 Codex 通信；Native Messaging host 使用标准输入输出与浏览器通信；两者之间通过 `TAB_GROUP_CODEX_SOCKET` 指定的 Unix socket 通信，默认路径为：

```text
/tmp/tab-group-codex.sock
```

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
