import { describe, it, expect, vi } from 'vitest';
import { startNativeIntegration, type NativeIntegrationDependencies } from './nativeIntegration';

function setup(readEnabled: () => Promise<boolean> = async () => false) {
  let changed = (_enabled: boolean) => {};
  const close = vi.fn();
  const dependencies: NativeIntegrationDependencies = {
    readEnabled,
    onEnabledChanged: (listener) => { changed = listener; return vi.fn(); },
    connect: vi.fn(() => ({ hostName: 'host', close })),
    publish: vi.fn()
  };
  const integration = startNativeIntegration(dependencies);
  return { integration, dependencies, close, change: (enabled: boolean) => changed(enabled) };
}

describe('optional native integration lifecycle', () => {
  it('does not connect for a missing or disabled setting', async () => {
    const { integration, dependencies, change } = setup();
    await integration.ready;
    change(false);
    expect(dependencies.connect).not.toHaveBeenCalled();
    expect(dependencies.publish).toHaveBeenCalledWith({ state: 'disabled' });
  });
  it('connects once on explicit enable and disconnects on disable', async () => {
    const { integration, dependencies, change, close } = setup();
    await integration.ready;
    change(true); change(true);
    expect(dependencies.connect).toHaveBeenCalledTimes(1);
    change(false);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('restores an explicitly enabled setting on restart', async () => {
    const { integration, dependencies } = setup(async () => true);
    await integration.ready;
    expect(dependencies.connect).toHaveBeenCalledTimes(1);
    integration.close();
  });
  it('a newer disable event wins over a slow initial read', async () => {
    let resolve!: (value: boolean) => void;
    const { integration, dependencies, change } = setup(() => new Promise(r => { resolve = r; }));
    change(false); resolve(true);
    await integration.ready;
    expect(dependencies.connect).not.toHaveBeenCalled();
  });
  it('does not reconnect after disposal or failed setting read', async () => {
    const { integration, dependencies, change } = setup(async () => { throw Error('storage unavailable'); });
    await integration.ready;
    integration.close(); change(true);
    expect(dependencies.connect).not.toHaveBeenCalled();
  });
});
