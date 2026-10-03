# Local control API (control socket + `xumpctl`)

XuMP exposes a small local API so scripts and agents can read player state and
start playback. MPRIS already covers "what is playing" and transport keys, but
it cannot express *what to play*, cannot queue a specific track, and cannot read
the catalog. This API reuses the app's own player and its authenticated NetEase
API layer instead of growing a second client.

## Socket

* Path: `$XDG_RUNTIME_DIR/xump-control.sock` (mode `0600`).
* `XUMP_CONTROL_SOCKET=/some/path.sock` moves it, `XUMP_CONTROL_SOCKET=0`
  disables the server.
* Unix only; the server does not start on Windows (named pipes are not
  implemented).
* If the path already exists and is not a socket, or a live XuMP answers on it,
  the server refuses to start instead of stealing or deleting it.

Anything running as the same user can use the socket - the same trust boundary
as `playerctl` or an MPRIS client. Disable it if that is not wanted.

## Protocol

One JSON request per line, one JSON response per line:

```jsonc
// -> {"id": 1, "method": "status", "params": {}}
// <- {"id": 1, "result": { ... }}
// <- {"id": 1, "error": {"code": "invalid_params", "message": "..."}}
```

* Requests are limited to 64 KiB, results to 96 KiB; oversized results fail with
  `result_too_large` instead of being truncated.
* At most 8 connections and 32 in-flight requests at a time (`busy`).

Error codes: `invalid_params`, `unknown_method`, `invalid_json`,
`request_too_large`, `result_too_large`, `busy`, `renderer_unavailable`,
`timeout`, `transport_error`, `app_not_running`, plus renderer codes such as
`internal_error` and `not_logged_in`.

Units are milliseconds for timestamps and seconds for `position`/`seek`.

### Methods answered in the main process

| method | result |
| --- | --- |
| `ping` | `{ok: true, time}` |
| `version` | `{app, electron, platform}` |

### Methods answered by the renderer

`status` - no parameters. Counts only, never the whole queue:

```jsonc
{
  "playing": true, "positionMs": 12500, "volume": 0.4,
  "repeatMode": "off", "shuffle": false, "isPersonalFM": false,
  "currentTrack": {"id": 347230, "name": "海阔天空", "artists": ["Beyond"],
                   "album": "海阔天空", "durationMs": 326000},
  "source": {"type": "playlist", "id": 18857},
  "queue": {"playlistTotal": 40, "priorityTotal": 0},
  "liked": true
}
```

`control` - `{type, ...}` with `type` one of `play`, `pause`, `playPause`,
`stop`, `next`, `previous`, `seek` (`{offset}` seconds), `setPosition`
(`{position}` seconds), `setLoopStatus` (`{mode: off|on|one}`), `setShuffle`
(`{enabled}`), `setVolume` (`{volume: 0..1}`), `setRate` (`{rate}`).
Invalid or unknown values are rejected, not ignored. Result: `{accepted, type}`.

`play` - exactly one target: `id`/`trackId` (song), `playlistId`, `albumId`,
`artistId`. Result: `{accepted: true, target: {type, id}}`.

* A track that is already in the queue is jumped to, the queue is kept.
* A track from outside the queue is played on its own; the queue source is the
  player's "no list source" sentinel (`id: 0`), so no source link is rendered.
* `accepted` means the request was handed to the player. It is **not** a promise
  that playback started - use `status` to observe the result.
* Playback requests are serialized and last-wins: an earlier playlist fetch that
  finishes late cannot overwrite a later request.

`enqueue` - `{id}` or `{ids: []}` (max 256). Result
`{accepted: true, queued: [...], position: "priority"}`. The queue has a single
insertion point: the priority FIFO that plays before the rest of the playlist.
There is no "append to the end of the playlist" operation in the player, so no
such mode is offered.

`queue` - `{offset, limit}` (limit ≤ 256, default 100). Returns independent
pages for the playlist and the priority FIFO:

```jsonc
{
  "playlist": {"items": [ids...], "total": 40, "offset": 0, "limit": 100, "nextOffset": null},
  "priority": {"items": [], "total": 0, "offset": 0, "limit": 100, "nextOffset": null},
  "currentIndex": 3, "shuffle": false, "repeatMode": "off", "source": {...}
}
```

`currentIndex` indexes the playlist order; with shuffle enabled the player walks
its own shuffled order, so treat it as informational.

`search` - `{keywords, type: song|album|artist|playlist, offset, limit}`
(limit ≤ 50, default 10). Returns `{type, items, total, offset, limit,
nextOffset}`; song items are `{id, name, artists, album, durationMs}`.

`lyrics` - `{id, offset, limit}` (limit ≤ 256). Returns
`{id, synced, items: [{timeMs, text, translation?}], total, offset, limit,
nextOffset}`. `timeMs` is milliseconds; the app's parser reports seconds and the
conversion happens here.

## `xumpctl`

```bash
xumpctl status
xumpctl play "Beyond 海阔天空"       # search, then play the best match
xumpctl play 347230                 # play a song id
xumpctl play --playlist 18857 | --album 18857 | --artist 6452
xumpctl pause | next | prev | stop | toggle
xumpctl volume 40 | seek 95
xumpctl repeat on | shuffle on
xumpctl queue [--limit N] [--offset N]
xumpctl search "海阔天空" [--type album] [--limit N]
xumpctl lyrics 347230 [--offset N] [--limit N]
```

`--json` prints raw results (and JSON errors) for scripting, `--socket <path>`
selects a specific instance. Read-only calls are retried once after a timeout
because the first call after a cold start can be slow while the app warms up its
NetEase session; write calls are never retried. CLI output is English - CLI
localization is out of scope for this change.

Install: the CLI is `scripts/xumpctl.mjs` (also a `bin` entry). From a source
checkout run `node scripts/xumpctl.mjs ...`; packaged installs expose the same
file inside the app resources.

## Not in this API

Account writes (likes/follows) and the MCP adapter are separate changes; they
reuse the same socket and add an explicit opt-in for account writes.
