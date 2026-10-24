export interface LocalRuntimeConfig {
  browser: 'edge' | 'chrome';
  installation: string;
  generation: string;
  mode: 'development' | 'standalone';
  token: string;
  hostName?: string;
}
export interface DevelopmentPort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Included only in local self-use builds. No file/server polling or alarm permission. */
export function startDevelopmentControl(config: LocalRuntimeConfig, runtime: {
  id: string;
  connectNative(host: string): DevelopmentPort;
  reload(): void;
  lastError?: { message?: string };
} = chrome.runtime) {
  let port: DevelopmentPort | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let reloading = false;
  let delay = 1000;
  const bootId = crypto.randomUUID();
  const target = { browser: config.browser, installation: config.installation, extensionId: runtime.id };
  const connect = () => {
    if (closed) return;
    try {
      const current = runtime.connectNative(config.hostName ?? 'com.shawn.tab_group.codex');
      port = current;
      current.onMessage.addListener((value) => {
        if (closed || reloading || port !== current || !isRecord(value)) return;
        if (value.kind !== 'development-reload' || value.protocolVersion !== 1 || value.token !== config.token ||
          !isRecord(value.target) || value.target.browser !== target.browser || value.target.installation !== target.installation ||
          value.target.extensionId !== target.extensionId || typeof value.requestId !== 'string' || value.requestId.length > 100 ||
          typeof value.generation !== 'string' || !value.generation || value.generation.length > 100 ||
          (value.mode !== 'development' && value.mode !== 'standalone')) return;
        reloading = true;
        current.postMessage({ kind: 'development-accepted', protocolVersion: 1, requestId: value.requestId, target });
        // Allow the host to deliver acceptance before this port disappears during reload.
        setTimeout(() => { if (!closed) runtime.reload(); }, 100);
      });
      current.onDisconnect.addListener(() => {
        // Reading lastError consumes Chromium's optional native connection error.
        const error = runtime.lastError;
        if (port !== current || closed || reloading) return;
        port = undefined;
        console.warn('[tab-group development] Local host disconnected.', error?.message ?? '');
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      });
      current.postMessage({ kind: 'development-ready', protocolVersion: 1, target, token: config.token, bootId, generation: config.generation, mode: config.mode });
    } catch {
      if (!closed && !reloading) {
        retry = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
  };
  connect();
  return { close() { closed = true; clearTimeout(retry); port?.disconnect(); } };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
