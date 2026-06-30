import { createActor } from 'xstate';
import { describe, expect, it, vi } from 'vitest';
import { createPlayerMachine } from '../playerMachine';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

describe('playerMachine', () => {
  it('cancels the previous target load when a newer target arrives', async () => {
    const first = deferred();
    const second = deferred();
    const aborted = [];
    const loadTarget = vi
      .fn()
      .mockImplementationOnce(({ signal }) => {
        signal.addEventListener('abort', () => aborted.push('first'));
        return first.promise;
      })
      .mockImplementationOnce(({ signal }) => {
        signal.addEventListener('abort', () => aborted.push('second'));
        return second.promise;
      });
    const actor = createActor(createPlayerMachine({ loadTarget })).start();

    actor.send({ type: 'TARGET_CHANGED', trackId: 1 });
    actor.send({ type: 'TARGET_CHANGED', trackId: 2 });
    second.resolve(true);
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('ready');
    });

    expect(loadTarget).toHaveBeenCalledTimes(2);
    expect(loadTarget.mock.calls[0][0].trackId).toBe(1);
    expect(loadTarget.mock.calls[1][0].trackId).toBe(2);
    expect(aborted).toEqual(['first']);
    expect(actor.getSnapshot().context.targetTrackId).toBe(2);
  });

  it('exposes loading errors in context', async () => {
    const loadTarget = vi.fn().mockRejectedValue(new Error('timeout'));
    const actor = createActor(createPlayerMachine({ loadTarget })).start();

    actor.send({ type: 'TARGET_CHANGED', trackId: 3 });
    await vi.waitFor(() => {
      expect(actor.getSnapshot().value).toBe('error');
    });

    expect(actor.getSnapshot().context.pending).toBe(false);
    expect(actor.getSnapshot().context.error.message).toBe('timeout');
  });
});
