# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added configurable desktop-lyrics overflow handling and screen-corner position presets.
- Exposed on-device playback history for signed-in users.
- Marked incomplete Android audio-cache entries and prevented offline playback until complete.

### Changed

- Reduced settings-update IPC work by sending coalesced key patches and running only affected main-process side effects.
- Made cached-track listing independent from cache byte scans and reused initialized cache totals.
- Improved navbar search with route synchronization, trimming, clear and Escape actions, and form semantics.
- Split playback progress, track, and semantic reactivity so global progress updates run at 1 Hz without invalidating track rows.
- Made lyric synchronization visibility-aware and disabled desktop lyrics by default for new users.
- Applied playback controls immediately without waiting for audio fades, while canceling stale intents and rolling back device failures.
- Coalesced player and settings persistence, flushed final state on lifecycle boundaries, and reported storage failures without rolling back effective state.
- Deferred context-menu measurement and expensive cover effects until needed.
- Limited route keep-alive caching, loaded Library collections once per account with stale-response guards, and paused hidden-window animations.

### Fixed

- Restored the main window after dismissing or failing the update-available dialog.
- Coalesced repeated cached-track refreshes.
- Hid instrumental and no-lyrics placeholders from the desktop-lyrics overlay.

## v0.1.0-alpha.3 - 2026-06-29

### Added

- Added a dedicated UnblockNeteaseMusic provider module for resolver-backed audio source handling.
- Added a separate resolver provider settings panel in the admin UI.

### Changed

- Moved UnblockNeteaseMusic configuration under the resolver configuration flow.
- Open resolver admin pages externally by default in desktop builds.
- Reduced preload responsibilities by moving resolver/admin startup logic into Electron main-process services.

### Fixed

- Fixed packaged desktop startup for the resolver admin service.
- Wait for the local API before opening the desktop window.
- Persist resolver log field visibility settings.

### Commits

- 4b57ea2 Fix packaged resolver admin startup
- d1c6a2a fix: wait for local api before opening window
- abb027d Split resolver provider settings into own panel
- ffac92d Move UnblockNeteaseMusic config into resolver
- 4814845 fix: persist resolver log field visibility
- f028b72 fix: open resolver admin panel externally by default
