export function scheduleAfterFirstPaint(callback) {
  let frame = null;
  let timer = null;
  let canceled = false;

  const run = () => {
    if (!canceled) callback();
  };
  if (typeof requestAnimationFrame === 'function') {
    frame = requestAnimationFrame(() => {
      frame = null;
      timer = setTimeout(run, 0);
    });
  } else {
    timer = setTimeout(run, 0);
  }

  return () => {
    canceled = true;
    if (frame !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frame);
    }
    clearTimeout(timer);
  };
}
