export function scheduleWhenIdle(
  callback,
  { fallbackDelay = 2000, timeout = 5000 } = {}
) {
  let canceled = false;
  let handle = null;
  const run = () => {
    if (canceled) return;
    callback();
  };

  if (typeof globalThis.requestIdleCallback === 'function') {
    handle = globalThis.requestIdleCallback(run, { timeout });
    return () => {
      canceled = true;
      globalThis.cancelIdleCallback?.(handle);
    };
  }

  handle = setTimeout(run, fallbackDelay);
  return () => {
    canceled = true;
    clearTimeout(handle);
  };
}
