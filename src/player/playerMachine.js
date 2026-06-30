import { assign, createMachine, fromPromise } from 'xstate';

export function createPlayerMachine({ loadTarget }) {
  return createMachine({
    id: 'player',
    initial: 'idle',
    context: {
      targetTrackId: 0,
      autoplay: true,
      ifUnplayableThen: undefined,
      pending: false,
      error: null,
    },
    states: {
      idle: {
        on: {
          TARGET_CHANGED: {
            target: 'loading',
            actions: assignTarget,
          },
        },
      },
      loading: {
        invoke: {
          src: fromPromise(({ input, signal }) =>
            loadTarget({
              trackId: input.targetTrackId,
              autoplay: input.autoplay,
              ifUnplayableThen: input.ifUnplayableThen,
              signal,
            })
          ),
          input: ({ context }) => ({
            targetTrackId: context.targetTrackId,
            autoplay: context.autoplay,
            ifUnplayableThen: context.ifUnplayableThen,
          }),
          onDone: {
            target: 'ready',
            actions: assign({
              pending: false,
              error: null,
            }),
          },
          onError: {
            target: 'error',
            actions: assign({
              pending: false,
              error: ({ event }) => event.error,
            }),
          },
        },
        on: {
          TARGET_CHANGED: {
            target: 'loading',
            reenter: true,
            actions: assignTarget,
          },
        },
      },
      ready: {
        on: {
          TARGET_CHANGED: {
            target: 'loading',
            actions: assignTarget,
          },
        },
      },
      error: {
        on: {
          TARGET_CHANGED: {
            target: 'loading',
            actions: assignTarget,
          },
        },
      },
    },
  });
}

const assignTarget = assign({
  targetTrackId: ({ event }) => event.trackId,
  autoplay: ({ event }) => event.autoplay ?? true,
  ifUnplayableThen: ({ event }) => event.ifUnplayableThen,
  pending: true,
  error: null,
});
