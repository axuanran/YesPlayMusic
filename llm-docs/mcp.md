# MCP server (drive XuMP from an agent)

`xumpctl mcp` speaks MCP over stdio, so any MCP client can control the running
XuMP instance. The adapter lives in the CLI on purpose: MCP clients launch stdio
servers as subprocesses, and a desktop app is a single-instance GUI process that
should not be started a second time. The app itself only exposes the local
control socket (see `docs/control-api.md`).

```jsonc
// Claude Desktop / Cursor / Codex / pi ...
{
  "mcpServers": {
    "xump": { "command": "xumpctl", "args": ["mcp"] }
  }
}
```

From a source checkout use the absolute path so the client can find it:

```jsonc
{
  "mcpServers": {
    "xump": {
      "command": "node",
      "args": ["/path/to/YesPlayMusic/scripts/xumpctl.mjs", "mcp"]
    }
  }
}
```

`xumpctl mcp --socket /run/user/1000/xump-control.sock` pins the session to one
instance; the same path can come from `XUMP_CONTROL_SOCKET`.

## Streamable HTTP

The desktop app can run this transport in-process: **Settings → MCP 服务**
toggle, with configurable listen address and port (persisted as the
`mcpServer` setting, `{ enabled, host, port }`, default
`127.0.0.1:27233`). Tool calls dispatch straight into the control channel, so
it works on Windows too (where the unix control socket is off). Status and
startup errors are pushed to the settings page over
`mcp-server:status` / `mcp-server:get-status` IPC.

Without the app, serve the same tools over Streamable HTTP from the CLI:

```sh
xumpctl mcp-http                    # http://127.0.0.1:27233/mcp
xumpctl mcp-http --port 3000 --socket /run/user/1000/xump-control.sock
# or standalone:
node scripts/xump-mcp-http.mjs --host 127.0.0.1 --port 27233
```

```jsonc
// DSH (cordis patch): transport streamable-http
{
  "mcpServers": {
    "xump": { "transport": "streamable-http", "url": "http://127.0.0.1:27233/mcp" }
  }
}
```

The endpoint is stateless: every POST carries one complete JSON-RPC message
and no `mcp-session-id` is allocated, so GET (SSE) and DELETE answer 405 by
design. Requests must accept `application/json` or `text/event-stream`
(406 otherwise); an unsupported `MCP-Protocol-Version` header gets 400, a
malformed body 400, an oversized body 413.

Keep it on loopback. There is no authentication: anyone who can reach the
port can drive the player and (with account writes enabled) the NetEase
account.

## Protocol

* stdio, newline-delimited JSON-RPC 2.0.
* Supported protocol revisions: `2025-06-18`, `2025-03-26`. A client asking for
  anything else gets `2025-06-18` as a counter-offer instead of an echo.
* Requests before `initialize` (except `ping`) fail with `-32002`; unknown
  methods get `-32601`; malformed envelopes `-32600`; invalid tool arguments
  `-32602`.
* Notifications are never answered and never execute anything - a
  notification-shaped `tools/call` is ignored. Only `notifications/initialized`
  and `notifications/cancelled` are understood.
* `structuredContent` is only sent for object results (the schema requires an
  object); list results are returned in the text block.
* Tool failures come back as `isError: true` with the control API error code in
  the text (for example `not_logged_in`, `account_write_disabled`,
  `invalid_params`).

## Tools

| tool | arguments | notes |
| --- | --- | --- |
| `music_status` | - | current track **with its NetEase song id**, position, volume, repeat/shuffle, queue sizes, liked |
| `music_control` | `action`, `value` | play/pause/play_pause/stop/next/previous/volume/seek/repeat/shuffle |
| `music_search` | `query`, `type`, `offset`, `limit` | songs/albums/artists/playlists, ids usable with `music_play` |
| `music_play` | exactly one of `id`, `query`, `playlist_id`, `album_id`, `artist_id` | replaces what is playing; replies "accepted", verify with `music_status` |
| `music_queue` | `action: list\|add`, `id`/`ids`, `offset`, `limit` | `add` inserts into the priority list that plays right after the current track |
| `music_lyrics` | `id`, `offset`, `limit` | timed lyrics in ms + translation |
| `music_recommend` | `offset`, `limit` | daily recommendation list of the logged-in account |
| `music_like` | `id`, `liked` | changes the remote account, see below |

Notes for agents: check `music_status` before interrupting playback; prefer
`music_queue` over `music_play` when the user did not ask to change the current
song; `music_play` with `query` picks the best match (exact title or an artist
named in the query) rather than the raw first hit.

## Account writes

`music_like` changes the remote NetEase account, so it is disabled by default.
Enable it explicitly:

* app setting (electron-store `settings.json`): `"controlAccountWrite": true`, or
* `XUMP_CONTROL_ACCOUNT_WRITE=1` in the app's environment.

The app enforces this before dispatching, so a raw socket client cannot bypass
it: calls fail with `account_write_disabled`. Everything else in this API only
affects local playback and needs no extra permission.

## Limits

Socket results are capped at 96 KiB, so lists are paginated: `limit` ≤ 256 for
queue/lyrics/recommend, ≤ 50 for search. Exceeding a limit is an
`invalid_params` error rather than silent truncation. A timed-out call is
reported as `timeout`; read-only CLI calls are retried once, write calls never.
