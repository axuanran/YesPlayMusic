# YesPlayMusic Plugins

The plugin layer is experimental and currently supports built-in plugins only.
External JavaScript packages are intentionally out of scope.

## Manifest

Each built-in plugin exports a manifest:

```js
export default {
  id: 'resolver-admin',
  name: 'Resolver Admin',
  description: 'Audio resolver administration',
  version: '0.1.0',
  type: 'builtin',
  enabledByDefault: true,
  routes: [],
  setup(ctx) {
    return () => {};
  },
};
```

Required fields are `id`, `name`, `version`, and `type`.

## Context

`setup(ctx)` receives a restricted context:

- `ctx.router`
- `ctx.store`
- `ctx.events`
- `ctx.audioResolver`
- `ctx.settings.get(key, fallbackValue)`
- `ctx.settings.set(key, value)`

Return a cleanup function from `setup()` when the plugin registers listeners,
timers, or providers.

## Events

Use `ctx.events.on(event, handler)` and `ctx.events.emit(event, payload)`.
`on()` returns an unsubscribe function.

Player events are notification-only:

- `track:change`
- `audio:loaded`
- `audio:error`
- `audio:resolve:start`
- `audio:resolve:success`
- `audio:resolve:error`
- `playback:play`
- `playback:pause`

Handlers must not assume they can block or rewrite playback.

## Audio Providers

Audio providers are experimental:

```js
import { registerAudioProvider } from '@/plugins/providers/audio';

const dispose = registerAudioProvider({
  id: 'example-provider',
  name: 'Example Provider',
  priority: 100,
  enabled: () => true,
  async resolve(track, quality, ctx) {
    return {
      ok: true,
      playUrl: 'https://example.com/audio.mp3',
      providerId: 'example-provider',
      quality,
      meta: {},
    };
  },
});
```

Providers run from highest priority to lowest. Returning a string is still
accepted for compatibility, but new providers should return the object shape
above. Returning `null` or throwing an error lets the next provider run. If
every provider fails, playback falls back to the legacy resolver path.

Provider status includes `lastSuccessAt`, `lastErrorAt`, and `lastError` for
diagnostics.

## Internal Layout

- `manifest.js`: manifest validation and normalization.
- `settings.js`: plugin state and settings helpers.
- `runtime.js`: setup, dispose, and sync lifecycle. Use
  `createPluginRuntime()` for isolated tests; the module also exports the app
  singleton methods.
- `routes.js`: route collection.
- `providers/audio/`: experimental audio provider registry. Use
  `createAudioProviderRegistry()` for isolated tests; `providers/audio/index.js`
  exports the app singleton.
- `playerEvents.js`: notification-only player event helper.
- `logger.js`: shared plugin logger.

Built-in plugin pages can be split into local components under their own
`pages/components/` directory. Keep plugin UI state inside the plugin unless it
must be persisted through `ctx.settings` or Vuex.

## Checks

- `yarn test`: run Vitest tests.
- `yarn test:watch`: run Vitest in watch mode.
- `yarn verify`: run lint, tests, and build.
