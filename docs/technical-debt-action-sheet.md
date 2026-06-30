# Technical Debt Action Sheet

Scope: YesPlayMusic migration debt and runtime-risk debt.

Generated from current workspace state on 2026-06-30. Active user changes are present in `src/plugins/providers/audio/quality.js`, `src/plugins/providers/audio/registry.js`, `src/store/index.js`, and `src/utils/Player.js`; do not fold those changes into a broad cleanup without reviewing their intent first.

## P0: Runtime Risk

### `src/utils/request.js`

Status:
- First hardening pass completed: settings parsing is safe when storage is empty or invalid, request URL checks tolerate missing `config.url`, and HTTP failures stay rejected.
- Covered by `src/utils/__tests__/request.test.js`.

Why it matters:
- This is the shared API boundary for login state, cookie propagation, retry behavior, proxy params, and API error normalization.
- A small mistake here can turn an API failure into a fulfilled `undefined` response or cause repeated logout/refresh loops.

Debt signals:
- Refresh retry behavior spans both success and error interceptors.
- `localStorage.getItem('settings')` is parsed directly in the request interceptor.
- Default `realIP` and user-configured proxy parameters are mixed into every request path.
- Historical compatibility branch still checks for the old `baseURL is undefined` failure.

Recommended action:
- Extract settings parsing into a small helper with safe defaults.
- Keep refresh retry behavior in one clearly named function.
- Add tests for no-settings, expired-session, refresh-failed, and proxy-enabled requests.

Pass criteria:
- `yarn test` passes.
- A request without `localStorage.settings` does not throw.
- A `301` login-required response retries once and rejects cleanly if refresh fails.
- Failed HTTP responses remain rejected promises.

## P0: Playback Path

### `src/utils/Player.js`

Status:
- First hardening pass completed with tests around resolver-first behavior, legacy fallback after resolver failure, and stale audio callback suppression.
- Covered by `src/utils/__tests__/Player.test.js`.

Why it matters:
- This file owns the user-visible playback path.
- It bridges the new resolver flow, the legacy audio source chain, and desktop integrations.

Debt signals:
- MPRIS is disabled with an Electron migration note.
- Resolver flow falls back to a full legacy source chain.
- Playback callbacks rely on `_audioToken` guards, which are important and easy to regress.
- Existing TODO notes point to missing loading-state UX.

Recommended action:
- Keep resolver-first behavior, but document the exact fallback order in code or tests.
- Add targeted tests around resolver success, resolver failure with legacy fallback, and stale audio callback suppression.
- Treat MPRIS as a separate recovery task, not part of resolver cleanup.

Pass criteria:
- Resolver success never calls the legacy chain.
- Resolver failure still reaches legacy source lookup.
- Stale audio callbacks cannot advance or error the current track.
- Desktop build still completes with MPRIS disabled.

## P1: Migration Residue

### `package.json`

Why it matters:
- The package now uses Vite and electron-vite, but still carries Vue CLI and Webpack dependencies.
- Duplicate script names preserve old entrypoints while forwarding to new ones, which is useful during transition but confusing long-term.

Debt signals:
- `dev`, `build`, and `desktop:*` use Vite/electron-vite.
- `electron:*` scripts mostly wrap the newer `desktop:*` scripts.
- `@vue/cli-*`, `@vue/cli-service`, and `webpack` remain in dev dependencies.

Recommended action:
- Mark wrapper scripts as compatibility aliases in README or remove them after users switch.
- Confirm no live scripts require `@vue/cli-*` or `webpack`.
- Remove Vue CLI/Webpack dependencies only after `vue.config.js` is retired.

Pass criteria:
- `yarn build` passes.
- `yarn desktop:build` passes.
- `rg "vue-cli-service|chainWebpack|electronBuilder" .` returns no active runtime dependency before removal.

### `vue.config.js`

Why it matters:
- This is an old Vue CLI/Electron Builder configuration file in a repo that now builds through Vite/electron-vite.
- It duplicates dev server proxy, PWA, SVG, Electron Builder, and Webpack rules that should live elsewhere or disappear.

Debt signals:
- Contains Webpack-only config and `electronBuilder` plugin options.
- Defines an old `/api` proxy on port `8080`, while current Vite config is the active dev path.
- Duplicates packaging settings now also present in `package.json`.

Recommended action:
- Compare `vue.config.js` with `vite.config.mjs`, `electron.vite.config.js`, and `package.json` build config.
- Move any still-needed behavior to the current config files.
- Delete `vue.config.js` once nothing references Vue CLI.

Pass criteria:
- `rg "vue.config|vue-cli-service|@vue/cli" .` shows no required active path.
- Vite dev proxy and Electron packaging still work.
- `yarn build` and `yarn desktop:build` pass after removal.

## P2: Comment Debt

### Known low-risk items

- `src/views/lyrics.vue`: TODO for double-click text selection and lyric copy UX.
- `src/utils/Player.js`: TODO for loading state when switching tracks.
- `src/store/actions.js`: TODO comments for ID login user search.
- `src/store/actions.js`: FIXME for issue `#1242`.

Recommended action:
- Convert each comment into either an issue, a small fix, or delete it if obsolete.
- Handle these after P0 and P1 work; none should block migration cleanup.

Pass criteria:
- Every `TODO` or `FIXME` has an owner decision: fix now, issue link, or remove.
- No broad cleanup touches runtime behavior without a test or manual verification note.

## Execution Order

1. Stabilize `src/utils/request.js`.
2. Add playback fallback tests around `src/utils/Player.js`.
3. Audit `package.json` scripts and dependency reachability.
4. Retire `vue.config.js` after current config parity is proven.
5. Sweep comment debt.

## Guardrails

- Do not rewrite active plugin provider work as part of this debt pass.
- Do not remove `vue.config.js` until the Vue CLI dependency chain is proven unused.
- Do not restore MPRIS in the same change as resolver or playback fallback cleanup.
- Prefer small commits with one verification command per batch.
