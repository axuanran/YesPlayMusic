const ERROR_UPLOAD_URL = 'http://127.0.0.1:27232/dev/error';

const isEnabled = () =>
  process.env.NODE_ENV === 'development' &&
  process.env.VUE_APP_RENDERER_ERROR_UPLOAD !== 'false';

const isConsoleUploadEnabled = () =>
  process.env.VUE_APP_RENDERER_CONSOLE_UPLOAD !== 'false';

const sentConsoleMessages = new Map();
const MAX_CONSOLE_UPLOADS = 30;

const serializeReason = reason => {
  if (reason instanceof Error) {
    return {
      name: reason.name,
      message: reason.message,
      stack: reason.stack,
    };
  }

  return {
    message:
      typeof reason === 'string' ? reason : JSON.stringify(reason ?? null),
  };
};

const serializeConsoleArg = value => {
  if (value instanceof Error) return serializeReason(value);
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    try {
      return Object.prototype.toString.call(value);
    } catch {
      return '[unserializable]';
    }
  }
};

const sendError = payload => {
  if (!isEnabled() || typeof navigator?.sendBeacon !== 'function') return;

  navigator.sendBeacon(
    ERROR_UPLOAD_URL,
    new Blob([JSON.stringify(payload)], { type: 'text/plain' })
  );
};

const installConsoleReporter = () => {
  if (!isConsoleUploadEnabled()) return;

  for (const level of ['error', 'warn']) {
    const original = console[level];

    console[level] = (...args) => {
      original.apply(console, args);

      const message = args.map(serializeConsoleArg).join(' ');
      const count = sentConsoleMessages.get(message) || 0;
      if (count >= 3 || sentConsoleMessages.size >= MAX_CONSOLE_UPLOADS) return;

      sentConsoleMessages.set(message, count + 1);
      sendError({
        type: 'console',
        level,
        message,
        href: window.location.href,
        at: new Date().toISOString(),
      });
    };
  }
};

export function installDevErrorReporter() {
  if (!isEnabled() || typeof window === 'undefined') return;

  installConsoleReporter();

  window.addEventListener('error', event => {
    sendError({
      type: 'error',
      message: event.message,
      source: event.filename,
      line: event.lineno,
      column: event.colno,
      error: serializeReason(event.error),
      href: window.location.href,
      at: new Date().toISOString(),
    });
  });

  window.addEventListener('unhandledrejection', event => {
    sendError({
      type: 'unhandledrejection',
      reason: serializeReason(event.reason),
      href: window.location.href,
      at: new Date().toISOString(),
    });
  });
}
