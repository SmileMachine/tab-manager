import type { NativeIntegrationStatus } from './nativeIntegration';
import { CODEX_PROTOCOL_VERSION, createRpcError, isCodexRpcRequest, type CodexRpcResponse } from './protocol';

export interface NativeMessagingPort {
  postMessage(message: NativeMessage): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: (error?: { message?: string }) => void): void };
}

export interface NativeMessagingConnection {
  connect(hostName: string): NativeMessagingPort;
}

export interface NativeRequestMessage {
  protocolVersion: typeof CODEX_PROTOCOL_VERSION;
  kind: 'request';
  request: unknown;
  authToken?: string;
}

export interface NativeResponseMessage {
  protocolVersion: typeof CODEX_PROTOCOL_VERSION;
  kind: 'response';
  response: CodexRpcResponse<unknown>;
}

export type NativeMessage = NativeRequestMessage | NativeResponseMessage;

export interface NativeCodexBridge {
  hostName: string;
  close(): void;
}

export function createChromeNativeMessagingConnection(runtime: Pick<typeof chrome.runtime, 'connectNative'> = chrome.runtime): NativeMessagingConnection {
  return { connect: (hostName) => runtime.connectNative(hostName) as unknown as NativeMessagingPort };
}

export function connectNativeCodexBridge(options: {
  hostName: string;
  connection: NativeMessagingConnection;
  dispatch(request: unknown): Promise<CodexRpcResponse<unknown>>;
  authToken?: string;
  retryDelayMs?: number;
  maxRetryDelayMs?: number;
  onStatus?: (status: NativeIntegrationStatus) => void;
}): NativeCodexBridge | undefined {
  let port: NativeMessagingPort | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let connecting = false;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  let nextRetryDelayMs = retryDelayMs;

  const scheduleConnect = () => {
    if (closed || connecting || port || retryTimer) return;
    const delay = nextRetryDelayMs;
    nextRetryDelayMs = Math.min(delay * 2, options.maxRetryDelayMs ?? 60_000);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, delay);
  };

  const connect = () => {
    if (closed || connecting || port) return;
    connecting = true;
    options.onStatus?.({ state: 'connecting' });
    try {
      const nextPort = options.connection.connect(options.hostName);
      port = nextPort;
      nextPort.onMessage.addListener((message) => {
        nextRetryDelayMs = retryDelayMs;
        options.onStatus?.({ state: 'connected' });
        void handleNativeMessage(message, options, nextPort);
      });
      nextPort.onDisconnect.addListener((error) => {
        if (port !== nextPort) return;
        port = undefined;
        connecting = false;
        const message = error?.message ?? chrome.runtime.lastError?.message ?? 'Local host disconnected or is not installed. Install and authorize the Native Messaging host to use Codex/MCP.';
        options.onStatus?.({ state: 'unavailable', message });
        scheduleConnect();
      });
      connecting = false;
      console.info('[tab-group] Native Messaging host connected.');
    } catch (error) {
      connecting = false;
      options.onStatus?.({ state: 'unavailable', message: error instanceof Error ? error.message : 'Unable to connect to local host.' });
      scheduleConnect();
    }
  };

  connect();

  return {
    hostName: options.hostName,
    close: () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = undefined;
      port?.disconnect();
      port = undefined;
    }
  };
}

async function handleNativeMessage(message: unknown, options: { dispatch(request: unknown): Promise<CodexRpcResponse<unknown>>; authToken?: string }, port: NativeMessagingPort) {
  const requestMessage = parseRequestMessage(message);
  if (!requestMessage || (options.authToken !== undefined && requestMessage.authToken !== options.authToken)) {
    postResponse(port, createRpcError('unknown', { code: 'invalid-request', message: 'The native message is not a valid authenticated Codex request.' }));
    return;
  }

  try {
    console.debug('[tab-group] Dispatching Native Messaging request.', requestIdOf(requestMessage.request));
    postResponse(port, await options.dispatch(requestMessage.request));
  } catch (error) {
    postResponse(port, createRpcError(requestIdOf(requestMessage.request), {
      code: 'operation-failed',
      message: error instanceof Error ? error.message : 'Native request failed.'
    }));
  }
}

function postResponse(port: NativeMessagingPort, response: CodexRpcResponse<unknown>) {
  try {
    port.postMessage({ protocolVersion: CODEX_PROTOCOL_VERSION, kind: 'response', response });
  } catch (error) {
    console.warn('[tab-group] Unable to send Native Messaging response.', error instanceof Error ? error.message : error);
  }
}

function parseRequestMessage(value: unknown): NativeRequestMessage | undefined {
  if (!isRecord(value) || value.protocolVersion !== CODEX_PROTOCOL_VERSION || value.kind !== 'request' || !isCodexRpcRequest(value.request)) return undefined;
  return value as unknown as NativeRequestMessage;
}

function requestIdOf(value: unknown): string {
  return isRecord(value) && typeof value.requestId === 'string' ? value.requestId : 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
