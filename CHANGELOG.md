# Changelog

All notable changes to this project will be documented in this file.

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
