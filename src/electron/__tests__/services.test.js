import { describe, expect, it, vi } from 'vitest';

import { createNeteaseApiGate } from '../services';

function deferred() {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('NetEase API readiness gate', () => {
  it('holds API requests until background initialization succeeds', async () => {
    const readiness = deferred();
    const next = vi.fn();
    const response = { json: vi.fn(), status: vi.fn() };
    response.status.mockReturnValue(response);
    const request = createNeteaseApiGate(readiness.promise)({}, response, next);

    expect(next).not.toHaveBeenCalled();
    readiness.resolve(true);
    await request;

    expect(next).toHaveBeenCalledOnce();
    expect(response.status).not.toHaveBeenCalled();
  });

  it('returns a service-unavailable response after initialization fails', async () => {
    const next = vi.fn();
    const response = { json: vi.fn(), status: vi.fn() };
    response.status.mockReturnValue(response);

    await createNeteaseApiGate(Promise.resolve(false))({}, response, next);

    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(503);
    expect(response.json).toHaveBeenCalledWith({
      code: 'NETEASE_API_UNAVAILABLE',
      message: 'NetEase API failed to start',
    });
  });
});
