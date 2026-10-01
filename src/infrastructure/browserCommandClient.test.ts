import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserCommandClient } from './browserCommandClient';
import { browserCommandResult } from './browserCommandProtocol';

describe('createBrowserCommandClient', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports an absent background response instead of throwing while reading ok', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = createBrowserCommandClient({ send: vi.fn().mockResolvedValue(undefined) });

    await expect(api.loadSnapshot()).rejects.toThrow(
      'The extension background service worker did not return a response. Reload the extension and reopen Manager.'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[Tab Group Manager] Browser command failed.',
      expect.objectContaining({
        request: expect.objectContaining({
          type: 'browser-command',
          action: 'execute',
          command: { kind: 'loadSnapshot' }
        }),
        error: expect.any(Error)
      })
    );
  });

  it('preserves an error response from the background service worker', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const api = createBrowserCommandClient({ send: vi.fn().mockResolvedValue({ ok: false, error: 'tabs permission denied' }) });

    await expect(api.loadSnapshot()).rejects.toThrow('tabs permission denied');
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('browserCommandResult', () => {
  it('rejects an empty response with a transport-level error', () => {
    expect(() => browserCommandResult(undefined)).toThrow('The browser command response was empty or invalid.');
  });
});
