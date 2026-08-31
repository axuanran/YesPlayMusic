# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- Added configurable desktop-lyrics overflow handling and top, center, or bottom lyric placement within the window.
- Added built-in and user-saved desktop-lyrics style templates plus an off-screen window recovery action.
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
- Kept centered playback controls independent from a compact, background-integrated lyrics-behavior icon and translation action, with configurable follow, centering, click-to-seek, and auto-resume behavior.
- Deferred account synchronization and mobile-only modules until after first paint, reducing startup work and the initial web bundle.
- Reused fresh Home feed data across navigation, coalesced in-flight loads, and added polished loading, partial-failure, retry, and keyboard-focus states.
- Reduced long-list work with constant-time liked-track lookup, offscreen rendering containment, and narrower hover transitions.
- Reused Explore category results, coalesced pagination, rejected stale Artist and Explore responses, and added retryable Explore failures.
- Honored reduced-motion preferences across animations, transitions, and smooth scrolling.
- Rejected stale Album, Playlist, and artist-video responses during rapid navigation, coalesced pagination, and cleaned delayed progress work.
- Loaded lyrics and modal surfaces only when first opened, reducing initial JavaScript and avoiding hidden modal listeners.
- Lazily loaded and bounded-cache cover color extraction, skipped hidden lyrics work, and rejected stale artwork gradients.
- Skipped unchanged local and Electron settings persistence, bulk-read exact cached track details, and deferred cache accounting until browser idle time.
- Improved player icon-button semantics, disabled states, pressed-state announcements, localized labels, and keyboard-accessible track metadata navigation.
- Added accessible modal focus trapping, Escape dismissal, focus restoration, background scroll locking, and safe-area-aware sizing.
- Coalesced duplicate lyric and cover warmup requests and reused parsed request settings until their stored value changes.
- Added keyboard-complete context menus with focus restoration and accessible, safe-area-aware toast presentation.
- Improved desktop and mobile navigation semantics, account-menu keyboard access, and global Space playback shortcut safety.
- Added responsive Settings section navigation, reduced repeated desktop-lyrics normalization, and cleaned proxy, shortcut-recording, and Last.fm lifecycle state.

### Fixed

- Restored the main window after dismissing or failing the update-available dialog.
- Coalesced repeated cached-track refreshes.
- Hid instrumental and no-lyrics placeholders from the desktop-lyrics overlay.
- Prevented echoed desktop-lyrics settings from repeatedly resizing the overlay window.
- Restored the transparent mobile search input inside its rounded search bar.
- Restored desktop-lyrics wheel opacity adjustment over draggable regions.
- Prevented desktop-lyrics shadows from being clipped by line overflow.
- Kept the logged-out local-playlist import control below the desktop title bar.
- Stopped slow local API initialization from blocking the first application window.
- Removed a request/store initialization cycle that could leave the web application shell blank.

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
