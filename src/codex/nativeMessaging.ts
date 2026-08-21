import { CODEX_PROTOCOL_VERSION, createRpcError, isCodexRpcRequest, type CodexRpcResponse } from './protocol';

export interface NativeMessagingPort {
  postMessage(message: NativeMessage): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
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

export type NativeMessage = NativeResponseMessage;

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
}): NativeCodexBridge | undefined {
  let port: NativeMessagingPort;
  try {
    port = options.connection.connect(options.hostName);
  } catch {
    return undefined;
  }

  port.onMessage.addListener((message) => {
    void handleNativeMessage(message, options, port);
  });

  return {
    hostName: options.hostName,
    close: () => port.disconnect()
  };
}

async function handleNativeMessage(message: unknown, options: { dispatch(request: unknown): Promise<CodexRpcResponse<unknown>>; authToken?: string }, port: NativeMessagingPort) {
  const requestMessage = parseRequestMessage(message);
  if (!requestMessage || (options.authToken !== undefined && requestMessage.authToken !== options.authToken)) {
    port.postMessage({
      protocolVersion: CODEX_PROTOCOL_VERSION,
      kind: 'response',
      response: createRpcError('unknown', { code: 'invalid-request', message: 'The native message is not a valid authenticated Codex request.' })
    });
    return;
  }

  try {
    port.postMessage({ protocolVersion: CODEX_PROTOCOL_VERSION, kind: 'response', response: await options.dispatch(requestMessage.request) });
  } catch (error) {
    const requestId = isRecord(requestMessage.request) && typeof requestMessage.request.requestId === 'string' ? requestMessage.request.requestId : 'unknown';
    port.postMessage({
      protocolVersion: CODEX_PROTOCOL_VERSION,
      kind: 'response',
      response: createRpcError(requestId, { code: 'operation-failed', message: error instanceof Error ? error.message : 'Native request failed.' })
    });
  }
}

function parseRequestMessage(value: unknown): NativeRequestMessage | undefined {
  if (!isRecord(value) || value.protocolVersion !== CODEX_PROTOCOL_VERSION || value.kind !== 'request' || !isCodexRpcRequest(value.request)) return undefined;
  return value as unknown as NativeRequestMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
