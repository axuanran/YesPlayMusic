# 流媒体平台支持实现

## 目标与首版范围

桌面客户端可以连接自托管音乐服务器，在不暴露访问令牌的前提下浏览媒体库、搜索音乐并使用现有播放器播放。

首版提供：

- Emby。
- Jellyfin（使用兼容的 Emby API 适配器）。
- 多服务器连接。
- 媒体库筛选、搜索、分页加载和播放队列。
- 封面、时长、歌手、专辑和曲号元数据。
- 播放/暂停、上一首/下一首、随机、循环、倍速、Media Session、SMTC 和 MPRIS。

Web 版不保存服务器凭据，只显示桌面端限定提示。

## 官方接口依据

实现依据 Emby 官方文档：

- REST API 根路径：`http[s]://host/emby/{apiPath}`。
- 用户登录：`POST /Users/AuthenticateByName`。
- 后续请求通过 `X-Emby-Token` 和 `X-Emby-Authorization` 认证。
- 用户媒体项：`/Users/{UserId}/Items`。
- 用户媒体库：`/Users/{UserId}/Views`。
- 音频直传：`/Audio/{Id}/stream?static=true`。
- 断开连接：`POST /Sessions/Logout`。

参考：

- <https://dev.emby.media/doc/restapi/index.html>
- <https://dev.emby.media/doc/restapi/User-Authentication.html>
- <https://dev.emby.media/doc/restapi/Audio-Streaming.html>
- <https://dev.emby.media/doc/restapi/Item-Information.html>

## 目录结构

### `src/electron/streaming/embyAdapter.js`

实现 Emby/Jellyfin API 适配器：

- 规范化并验证 HTTP/HTTPS 服务器地址。
- 禁止在服务器 URL 内嵌用户名和密码。
- 登录并提取访问令牌、用户 ID 和服务器信息。
- 查询媒体库、分页曲目和单曲详情。
- 将 Emby Audio 项转换为统一播放器 Track 模型。
- 生成上游音频和封面请求。
- 退出时撤销本应用创建的访问令牌。
- 所有带凭据的请求禁止自动重定向，避免自定义认证头跨主机泄漏。

### `src/electron/streaming/service.js`

提供平台无关的连接和代理服务：

- Electron Store 保存连接、设备 ID、用户 ID 和访问令牌。
- 返回渲染层的连接摘要不包含令牌、设备 ID或其他认证材料。
- 通过适配器注册表选择平台。
- 将曲目映射为稳定 ID：`stream:<connectionId>:<itemId>`。
- 限制连接数量、字符串长度、搜索长度和分页大小。
- 将音频 Range 请求及必要响应头安全转发。
- 上游失败时返回 502，不把上游地址或令牌写入播放器 URL。

当前适配器注册表把 `emby` 和 `jellyfin` 指向同一个兼容适配器。新增平台时实现相同接口并注册新的工厂即可。

## 适配器接口

每个平台适配器需要实现：

- `authenticate(input)`：认证并返回主进程连接机密。
- `getLibraries(connection)`：返回可浏览媒体库。
- `getTracks(connection, query)`：分页查询音频项。
- `getTrack(connection, itemId)`：获取单曲完整信息。
- `createAudioUrl(connection, itemId)`：生成上游音频 URL。
- `createImageUrl(connection, itemId)`：生成上游封面 URL。
- `createRequestHeaders(connection)`：生成仅用于主进程上游请求的认证头。
- `logout(connection)`：撤销连接令牌。

适配器不得把令牌写入公共 Track、连接摘要或本机代理 URL。

## IPC 与权限边界

`src/preload/index.js` 只暴露以下受限能力：

- `streaming.listConnections()`。
- `streaming.connect(input)`。
- `streaming.disconnect(connectionId)`。
- `streaming.getLibraries(connectionId)`。
- `streaming.getTracks(query)`。
- `streaming.getTrack(trackId)`。

主进程校验连接 ID、Track ID、查询对象、分页参数和字符串长度。渲染层无法访问 Electron Store、上游令牌或任意代理目标。

用户名和密码只用于一次登录调用；密码不会持久化。访问令牌保存在 Electron Store 的当前 OS 用户配置目录中，不会发送给 YesPlayMusic、网易云或页面脚本。

## 本机媒体代理

播放器只访问：

- `/streaming/:connectionId/items/:itemId/audio`
- `/streaming/:connectionId/items/:itemId/image`

服务按连接 ID 查找主进程凭据，再请求配置的上游服务器。音频代理转发 `Range`、`Content-Range`、`Content-Length`、`Accept-Ranges`、`Content-Type`、ETag 和缓存相关响应头，因此 HTML 音频元素可以进行按需加载与拖动。

访问令牌不会出现在 URL、渲染层状态、播放队列、Media Session、SMTC 或 MPRIS 元数据中。

## 播放器接入

`src/player/playerResolver.js` 识别 `stream:` Track ID：

- 切歌或恢复时通过 preload API 获取最新曲目和当前本机代理端口。
- 音源解析直接使用主进程生成的代理 URL。
- 不进入网易云详情、网易音源解析和歌曲缓存链路。

流媒体曲目不会调用网易云听歌上报；启用 Last.fm 时仍可用服务器元数据进行 Last.fm scrobble。

“即将播放”页面能同时加载网易、本地和流媒体 Track ID。底部播放器及右键菜单对流媒体曲目隐藏网易收藏、收藏到歌单和复制网易链接操作。

## 界面

`src/views/streaming.vue` 提供：

- Emby/Jellyfin 平台选择。
- 服务器地址、用户名和密码登录。
- 多连接切换和安全断开。
- 媒体库选择。
- 服务器端搜索。
- 每页 100 首的增量加载。
- 播放全部和双击曲目建立流媒体队列。
- 连接、加载、空结果和错误状态。

内置中文简体、中文繁体、英文和土耳其文文案。

## 已知边界

- 首版仅播放音频，不展示 Emby/Jellyfin 视频。
- 使用 Emby 静态音频流，常见 MP3、AAC、M4A、FLAC、Ogg、Opus 和 WAV 可由 Chromium 直接播放；仅服务器端专有格式转码可作为后续适配器能力扩展。
- 自签名 HTTPS 证书不会被自动信任。
- 为避免认证头泄漏，带凭据的上游请求不跟随重定向；应填写服务器最终可访问地址，包括反向代理 Base URL。
- 当前不向服务器回写播放进度或播放历史。

## 验证清单

1. 连接 Emby 和 Jellyfin，确认连接摘要不含令牌。
2. 选择不同音乐媒体库，检查分页与搜索。
3. 播放带专辑封面的曲目，检查标题、歌手、专辑、时长和封面。
4. 检查暂停、拖动、倍速、随机、循环和上下曲。
5. 重启客户端，检查连接与流媒体队列恢复。
6. 检查音频请求支持 Range，且本机 URL 不包含上游令牌。
7. 断开连接，确认本地连接删除；服务器在线时令牌被撤销。
8. 检查 Windows SMTC、Linux MPRIS 和浏览器 Media Session。
9. 检查 Web 版不显示流媒体导航入口。
