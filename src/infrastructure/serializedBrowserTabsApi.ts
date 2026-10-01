import type { BrowserTabsApi } from './browserTabsApi';

/** One queue per manager: a compound action owns the queue until all its writes finish. */
export function createSerializedBrowserTabsApi(api: BrowserTabsApi): BrowserTabsApi {
  let tail: Promise<unknown> = Promise.resolve();

  function enqueue<T>(action: () => Promise<T>): Promise<T> {
    const result = tail.then(action);
    // A failed request must not prevent subsequent user requests from executing.
    tail = result.catch(() => undefined);
    return result;
  }

  const scoped: BrowserTabsApi = {
    ...api,
    runExclusive: (action) => action(scoped)
  };

  return new Proxy(scoped, {
    get(target, property, receiver) {
      if (property === 'runExclusive') {
        return <T>(action: (api: BrowserTabsApi) => Promise<T>) => enqueue(() => action(scoped));
      }
      const method: unknown = Reflect.get(target, property, receiver);
      if (typeof method !== 'function') return method;
      // Reads also wait for compound writes, so refresh never sees a half-completed drag.
      return (...args: unknown[]) => enqueue(() => Reflect.apply(method, target, args));
    }
  });
}
