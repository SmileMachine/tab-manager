import type { CodexRpcResponse } from '../codex/protocol';
import { CODEX_BRIDGE_MESSAGE_TYPE } from '../codex/readService';

/** Sends Codex/import/rollback requests to the background dispatcher. */
export function createCodexRuntimeClient(
  send: (message: unknown) => Promise<unknown> = (message) => chrome.runtime.sendMessage(message)
) {
  return async function request<T = unknown>(request: unknown): Promise<CodexRpcResponse<T>> {
    return await send({ type: CODEX_BRIDGE_MESSAGE_TYPE, request }) as CodexRpcResponse<T>;
  };
}
