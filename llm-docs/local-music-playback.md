# 本地音乐播放实现

## 目标与范围

桌面客户端允许用户从文件选择器导入本地音频，读取文件标签，在独立的“本地音乐”页面展示，并复用现有播放器完成队列播放、切歌、倍速、Media Session、SMTC 和 MPRIS 集成。

首版支持 MP3、FLAC、M4A、AAC、Ogg、Opus 和 WAV。Web 版不具备本地文件目录能力，只显示桌面端可用提示。

“从本地音乐中移除”只删除应用目录记录，不会移动或删除源文件。

## 架构

### 主进程

`src/electron/localMusic.js` 是本地音乐目录的可信边界。

- 文件只能通过 Electron 原生文件选择器进入目录。
- 使用 `music-metadata` 读取标题、歌手、专辑、曲号、时长和内嵌封面。
- 以规范化绝对路径的 SHA-256 摘要生成稳定的 `local:<digest>` 曲目 ID。
- Electron Store 只在本机保存曲目元数据和源文件绝对路径。
- 列出目录时自动移除已经不存在的文件。
- IPC 只接受有长度和前缀约束的本地曲目 ID，不接受渲染层提供的任意文件路径。

### 音频与封面传输

主进程内置 Express 服务提供两个受控资源端点：

- `/local-music/:id/audio`
- `/local-music/:id/artwork`

端点先用 ID 查询 Electron Store 中已导入的记录，再读取对应文件。请求参数不能直接转换为文件路径，因此渲染层无法借此读取未导入文件。

音频使用 Express `sendFile`，保留浏览器媒体元素所需的范围请求行为。封面按需从文件标签读取，并设置一天的私有缓存。

返回给渲染层的曲目对象包含当前运行实例的完整 HTTP 地址。端口变化时会重新生成地址，持久化队列只保存稳定曲目 ID，不依赖旧端口。

### Preload 与 IPC

`src/preload/index.js` 暴露最小 API：

- `localMusic.list()`：读取仍然存在的目录曲目。
- `localMusic.get(id)`：播放器按 ID 恢复或切换曲目。
- `localMusic.selectFiles()`：打开文件选择器并导入。
- `localMusic.remove(ids)`：从应用目录移除。

渲染进程不能访问 Node.js、文件系统或 Electron IPC 原始对象。

### 播放器接入

`src/player/playerResolver.js` 用 `local:` 前缀区分本地曲目。

- `loadTrack` 通过受限 preload API 获取曲目元数据。
- `resolveSource` 直接使用主进程生成的受控音频地址。
- 网络曲目继续走原有网易详情、音源解析和缓存链路。

这使本地曲目能够进入原有 `PlayerQueue`，并自然获得播放/暂停、上一首/下一首、随机、循环、播放进度、倍速、SMTC、Media Session 和 MPRIS 能力。

本地曲目不会调用网易云听歌上报接口；启用 Last.fm 时仍可使用标签信息进行 Last.fm scrobble。

### 界面

`src/views/localMusic.vue` 提供：

- 导入多个音频文件。
- 播放全部。
- 双击指定曲目并以本地目录建立播放队列。
- 右键播放、下一首播放、从本地音乐目录移除。
- 空目录、加载中、桌面端限定状态。

导航和四种内置语言均增加本地音乐文案。

## 持久化与恢复

目录保存在主进程 Electron Store；播放器队列继续使用现有 localStorage 持久化。应用重启后，播放器通过稳定的本地 ID 调用 `localMusic.get(id)`，获得新端口下的音频地址。

若源文件已移动或删除，目录读取会清除失效记录；播放器恢复该 ID 时返回不可用，不会回退到网易音源请求。

## 安全约束

- 不向渲染层提供通用“读取路径”IPC。
- 不根据 URL 参数拼接文件路径。
- 资源端点只服务 Electron Store 中已授权导入且仍存在的文件。
- IPC 限制数组长度、ID 长度和 `local:` 前缀。
- 删除目录记录不删除用户文件。

## 验证要点

1. 导入带标签和封面的 MP3/FLAC，检查标题、歌手、专辑、时长和封面。
2. 双击任意曲目，检查播放、暂停、拖动进度、倍速和上下曲。
3. 开启随机与循环，检查字符串曲目 ID 的队列行为。
4. 重启客户端，检查目录和当前本地队列恢复。
5. 移动或删除源文件后重启页面，检查失效记录自动清理。
6. 从目录移除曲目，确认源文件仍存在。
7. 检查 Windows SMTC、Linux MPRIS 和浏览器 Media Session 元数据。
8. 确认 Web 版不显示本地音乐导航入口，手动访问路由时显示桌面端提示。
