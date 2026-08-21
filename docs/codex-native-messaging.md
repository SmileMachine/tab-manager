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
