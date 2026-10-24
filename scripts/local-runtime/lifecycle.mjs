/** Serialize shutdown against startup and make repeated termination requests idempotent. */
export function createRuntimeLifecycle({ stopDevelopment, restoreStandalone, release }) {
  let stopRequested = false;
  let published = false;
  let cleanup;
  let startupSettled;
  const startup = new Promise(resolve => { startupSettled = resolve; });
  return {
    get stopping() { return stopRequested; },
    get published() { return published; },
    markPublished() { published = true; },
    finishStartup() { startupSettled(); },
    shutdown() {
      stopRequested = true;
      cleanup ??= (async () => {
        await startup;
        try {
          await stopDevelopment();
          if (published) await restoreStandalone();
        } finally { await release(); }
      })();
      return cleanup;
    }
  };
}
