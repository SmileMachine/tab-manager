import type { NativeCodexBridge } from './nativeMessaging';

export const NATIVE_INTEGRATION_ENABLED_KEY = 'codexNativeIntegrationEnabled';
export const NATIVE_INTEGRATION_STATUS_KEY = 'codexNativeIntegrationStatus';
export type NativeIntegrationStatus = { state: 'disabled' | 'connecting' | 'connected' | 'unavailable'; message?: string };

export interface NativeIntegrationDependencies {
  readEnabled(): Promise<boolean>;
  onEnabledChanged(listener: (enabled: boolean) => void): () => void;
  connect(onStatus: (status: NativeIntegrationStatus) => void): NativeCodexBridge | undefined;
  publish(status: NativeIntegrationStatus): void;
}

/** Missing settings are disabled. A setting change wins over an in-flight initial read. */
export function startNativeIntegration(dependencies: NativeIntegrationDependencies) {
  let bridge: NativeCodexBridge | undefined;
  let disposed = false;
  let revision = 0;
  let enabled = false;
  const apply = (next: boolean) => {
    if (disposed) return;
    if (next === enabled && (bridge || !next)) {
      if (!next) dependencies.publish({ state: 'disabled' });
      return;
    }
    enabled = next;
    bridge?.close();
    bridge = undefined;
    if (!next) {
      dependencies.publish({ state: 'disabled' });
      return;
    }
    try {
      bridge = dependencies.connect((status) => {
        if (!disposed && enabled) dependencies.publish(status);
      });
    } catch (error) {
      dependencies.publish({ state: 'unavailable', message: error instanceof Error ? error.message : 'Unable to connect to the local host.' });
    }
  };
  const unsubscribe = dependencies.onEnabledChanged((next) => {
    revision += 1;
    apply(next);
  });
  const initialRevision = revision;
  const ready = dependencies.readEnabled().then((next) => {
    if (revision === initialRevision) apply(next === true);
  }).catch(() => {
    if (revision === initialRevision) apply(false);
  });
  return {
    ready,
    get bridge() { return bridge; },
    close() {
      disposed = true;
      unsubscribe();
      bridge?.close();
      bridge = undefined;
    }
  };
}
