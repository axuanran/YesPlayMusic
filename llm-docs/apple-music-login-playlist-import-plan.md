# Apple Music 登录与歌单导入计划

## 目标

为桌面客户端增加 Apple Music 授权和歌单导入能力：

- 用户通过 Apple 官方 MusicKit 授权访问自己的音乐资料库。
- 分页读取用户的 Apple Music 资料库歌单和歌单曲目。
- 将 Apple Music 曲目匹配为网易云音乐曲目。
- 在用户确认后创建新的网易云歌单，或追加到已有歌单。
- 展示匹配、待确认、未匹配和导入失败的明细，支持重试。
- 安全保存 Music User Token，退出登录时清除本地授权状态。

首版仅导入歌单元数据和曲目映射，不直接播放 Apple Music 音频，不绕过
Apple Music 的订阅、地区或 DRM 限制。

## 现状

当前首页的 “by Apple Music” 是 `src/utils/staticData.js` 中维护的一组网易云
歌单 ID。它只用于展示静态推荐内容，与 Apple Music API、Apple ID 登录或用户
资料库无关。

仓库已经具备可复用能力：

- `src/api/playlist.js` 可以创建网易云歌单，并批量添加曲目。
- 主进程、preload 和 renderer 之间已有受限 IPC 模式。
- 生产环境 renderer 通过本机动态端口的 HTTP 服务加载。
- 本地音乐和流媒体功能已有适配器、统一 Track 模型及凭据隔离实践。

Apple Music 功能应使用独立命名，避免与首页静态推荐混淆。建议后续把现有
设置项 `showPlaylistsByAppleMusic` 更名为表达“Apple Music 风格推荐”的名称，
但该清理不阻塞登录和导入。

## 官方接口依据

### 开发者认证

所有 Apple Music API 请求都需要 Developer Token。非 Apple 原生平台需要创建
Media ID 和 MusicKit 私钥，使用 ES256 签发 JWT。JWT 包含 Team ID、Key ID、
签发时间和过期时间。

参考：

- <https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens>
- <https://developer.apple.com/musickit/>

### 用户授权

访问用户资料库还需要 Music User Token。用户授权必须由 MusicKit 完成；
客户端不得收集或转发 Apple ID、密码、双重认证码。

个性化请求包含：

- `Authorization: Bearer <developer-token>`
- `Music-User-Token: <music-user-token>`

参考：

- <https://developer.apple.com/documentation/applemusicapi/user-authentication-for-musickit>
- <https://developer.apple.com/documentation/musickit/musicauthorization>

### 歌单和曲目

首版使用的主要接口：

- `GET /v1/me/storefront`：获取用户 storefront。
- `GET /v1/me/library/playlists`：分页获取资料库歌单。
- `GET /v1/me/library/playlists/{id}`：获取单个资料库歌单。
- `GET /v1/me/library/playlists/{id}/tracks`：分页获取歌单曲目。
- Library Song 的 `catalog` relationship：取得可用的 Apple Catalog Song。
- `GET /v1/catalog/{storefront}/songs?filter[isrc]=...`：按 ISRC 补全目录曲目；
  单个 ISRC 可能返回多个版本，每次最多查询 25 个 ISRC。

资料库歌单的 `tracks` relationship 默认和最大页大小均为 100，必须跟随
响应中的 `next` 字段读取完整歌单。

参考：

- <https://developer.apple.com/documentation/applemusicapi/get-all-library-playlists>
- <https://developer.apple.com/documentation/applemusicapi/libraryplaylists/relationships-data.dictionary>
- <https://developer.apple.com/documentation/applemusicapi/librarysongs/relationships-data.dictionary>
- <https://developer.apple.com/documentation/applemusicapi/get-multiple-catalog-songs-by-isrc>
- <https://developer.apple.com/documentation/applemusicapi/fetching-resources-by-page>

## 前置条件

实现开始前必须完成：

1. 加入 Apple Developer Program。
2. 创建用于 YesPlayMusic 的 Media ID 和 MusicKit 私钥。
3. 确认开源项目维护方是否愿意运营 Developer Token 代理服务。
4. 在开发环境验证 MusicKit on the Web 能否从 Electron 当前的本机 HTTP
   origin 完成授权。
5. 确认 Apple 对 Electron 分发、授权窗口和 Developer Token 使用方式的要求。

第 3 项未完成时，不应在正式版本启用 Apple Music 登录。`.p8` 私钥不得进入
源码、构建产物、客户端设置或 GitHub Actions 可下载制品。

## 架构

```text
Apple Developer private key
          |
          v
Developer Token broker -- short-lived Developer Token --> Electron auth window
                                                        |
                                                        v
                                                MusicKit authorization
                                                        |
                                                        v
                                                Music User Token
                                                        |
                         encrypted local storage <------+
                                                        |
                                                        v
                                                Apple Music API
                                                        |
                                                        v
                                           import preview + matcher
                                                        |
                                                        v
                                      confirmed NetEase playlist write
```

### Developer Token 代理

推荐由项目维护方部署最小令牌代理：

- 私钥只存在于服务端密钥管理系统。
- 仅签发短时 Developer Token；建议有效期 15 至 60 分钟。
- 使用 ES256，并限制 `iss`、`kid`、`iat`、`exp`。
- 对客户端版本、IP 和请求频率限流。
- 不接收 Music User Token、Apple ID、网易云 Cookie 或歌单内容。
- 返回 `Cache-Control: no-store`，日志中不记录完整 token。
- 支持密钥轮换和紧急吊销。

Apple 推荐 web token 使用 `origin` claim，但生产客户端使用动态本机端口，
无法预先枚举稳定 origin。第一阶段原型必须验证以下方案，按优先级选择：

1. 为授权页提供可控的稳定 HTTPS origin，并使用 `origin` claim。
2. 若必须使用动态 loopback origin，则使用极短期 token、严格限流和版本
   策略补偿，并记录 Apple 审核结论。

不得把长期 Developer Token 硬编码到 renderer。即使是短期 token，也应视为
可被客户端用户读取，服务端必须限制其价值和寿命。

### Electron 主进程

新增 `src/electron/appleMusic/`：

- `service.js`：授权状态、资料库请求、分页、取消和错误归一化。
- `tokenBrokerClient.js`：获取和缓存短期 Developer Token。
- `tokenStore.js`：使用 Electron `safeStorage` 加密 Music User Token。
- `apiClient.js`：构造 Apple Music API 请求，处理 401、403、429 和分页。
- `authWindow.js`：创建隔离授权窗口并执行 MusicKit 授权流程。

主进程只向 renderer 返回：

- 是否已授权。
- storefront、订阅/权限可用状态。
- 经过裁剪的歌单和曲目元数据。
- 导入任务进度和无敏感信息的错误码。

不得返回 Developer Token、Music User Token、私钥、完整请求头或授权窗口
cookie。

### Preload 和 IPC

在 `src/preload/index.js` 暴露最小 API：

```js
appleMusic.getStatus()
appleMusic.authorize()
appleMusic.signOut()
appleMusic.listPlaylists({ cursor })
appleMusic.getPlaylistTracks({ playlistId, cursor })
appleMusic.prepareImport({ playlistId })
appleMusic.cancelImport({ taskId })
```

IPC 约束：

- `playlistId`、cursor、task ID 必须校验类型和长度。
- renderer 不得传入任意 URL、HTTP header 或 Apple API path。
- 每页数量由主进程固定，不接受无限 limit。
- 同一时间限制匹配任务数量，窗口关闭或退出登录时取消任务。
- 错误只返回稳定错误码和可本地化参数。

### Renderer

新增 Apple Music 连接页或设置区：

- 未连接：说明权限用途，提供“连接 Apple Music”。
- 授权中：显示等待状态和取消按钮。
- 已连接：显示已连接状态、刷新歌单、退出登录。
- 错误：区分取消、无订阅/无权限、地区不可用、token 过期、限流和网络故障。

新增歌单导入向导：

1. 选择 Apple Music 歌单。
2. 获取完整曲目并显示数量。
3. 执行网易云匹配。
4. 预览匹配结果并处理歧义。
5. 选择“创建新歌单”或“追加到已有歌单”。
6. 明确确认后写入网易云。
7. 显示成功、跳过和失败结果，允许导出未匹配清单。

## 授权流程

1. renderer 请求 `appleMusic.authorize()`。
2. 主进程从令牌代理取得短期 Developer Token。
3. 主进程打开专用授权窗口：
   - `nodeIntegration: false`
   - `contextIsolation: true`
   - sandbox 可用时启用
   - 独立 session partition
   - 禁止任意新窗口
   - 导航和重定向使用 allowlist
4. 授权页加载 Apple 官方 MusicKit 脚本并调用 MusicKit 授权。
5. 用户在 Apple 提供的界面完成登录和同意。
6. 授权窗口把 Music User Token 通过一次性受限通道交给主进程。
7. 主进程立即验证 token：
   - 查询用户 storefront。
   - 读取第一页资料库歌单。
8. 验证成功后使用 `safeStorage` 加密并持久化。
9. renderer 只收到 `{ authorized: true, storefront }`。

启动时不主动弹出登录。应用仅在用户进入 Apple Music 页或手动刷新时验证
授权，避免启动请求和无意义的 token 刷新。

### 退出登录

退出时：

1. 调用 MusicKit 的未授权/注销能力。
2. 删除加密 Music User Token 和内存中的 Developer Token。
3. 清空 Apple Music 专用 session。
4. 取消正在运行的获取或导入准备任务。
5. 保留已经导入到网易云的歌单，不自动删除用户数据。

## 歌单读取和规范化

统一模型：

```js
{
  source: 'apple-music',
  sourcePlaylistId,
  name,
  description,
  artworkUrl,
  tracks: [{
    sourceTrackId,
    catalogId,
    isrc,
    name,
    artistName,
    albumName,
    durationMs,
    discNumber,
    trackNumber,
    storefront
  }]
}
```

读取规则：

- 始终跟随 Apple 响应的 `next`，不自行拼接未知 URL。
- `next` 只允许 Apple Music API 同源相对路径。
- 忽略 music video，首版只导入 song。
- 保留原始顺序和重复曲目；预览阶段由用户决定是否去重。
- 对无 catalog relationship 的资料库曲目保留基础元数据并进入模糊匹配。
- 歌单文件夹按层级展示；首版不把文件夹本身映射为网易云结构。
- 智能歌单、共享歌单和目录歌单统一按只读来源处理。

## 网易云曲目匹配

匹配器应独立于 UI，并设计为未来可复用的导入适配器。

### 规范化

- Unicode NFKC。
- trim 并合并连续空白。
- 英文大小写不敏感。
- 统一常见全角/半角标点。
- 拆分 `feat.`、`featuring`、`with` 等合作歌手，但保留原值。
- 标题中的 live、remaster、version、karaoke、instrumental 等版本词不能直接
  删除，只能作为版本特征参与评分。

### 候选检索

按以下顺序获取候选：

1. Apple catalog ID/ISRC 可用时，优先使用 ISRC 和完整元数据。
2. 网易云搜索“曲名 + 主艺人”。
3. 无结果时回退到“曲名 + 专辑”。
4. 仍无结果时只用曲名，但降低置信度并要求人工确认。

Apple catalog ID 不能直接当作网易云 ID。ISRC 也不能单独证明版本唯一，因为
Apple 明确说明一个 ISRC 可能返回多个歌曲版本。

### 评分

建议满分 100：

- ISRC 完全一致：+55。
- 规范化曲名完全一致：+25；高相似：+15 至 +24。
- 主艺人完全一致：+15；艺人集合大部分一致：+8 至 +14。
- 专辑名完全一致：+5；高相似：+2 至 +4。
- 时长差不超过 2 秒：+10；不超过 5 秒：+6；不超过 10 秒：+2。
- live/remaster/instrumental 等版本特征冲突：-20。
- 纯伴奏、翻唱或 karaoke 冲突：-30。

置信度：

- `>= 85` 且领先第二候选至少 10 分：自动匹配。
- `65-84`，或前两名差值小于 10：待用户确认。
- `< 65`：未匹配。

阈值必须通过真实中、英、日、韩歌单样本校准，不能只依赖单元测试造数。

### 批量与限流

- 网易云搜索并发默认 3，可配置上限 5。
- 相同规范化检索键在单次任务内去重。
- 支持取消，取消后不得继续写入歌单。
- 429 或临时网络错误使用带抖动的指数退避。
- 匹配结果按 source playlist ID、source track ID、匹配算法版本缓存。
- 缓存只保存元数据和网易云 ID，不保存 Apple token。

## 写入网易云歌单

只有用户完成预览并确认后才允许写入：

1. 检查网易云已登录。
2. 创建新歌单，或验证目标歌单属于当前用户。
3. 默认只提交“自动匹配”和用户确认的曲目。
4. 按 API 可接受大小分批调用 `addOrRemoveTrackFromPlaylist`。
5. 每批记录成功、失败和可重试状态。
6. 不因部分失败删除已成功加入的曲目。
7. 完成后刷新用户歌单，并展示导入报告。

去重选项：

- 默认：同一网易云曲目在本次导入中只加入一次。
- 可选：保留源歌单重复项；若网易云 API 不支持重复曲目，UI 必须提前说明。
- 追加到已有歌单时，默认跳过目标歌单已存在的曲目。

歌单名称默认使用 Apple Music 原名称。名称冲突时默认追加
“（来自 Apple Music）”，用户可以在确认页修改。

## 状态与错误

稳定错误码至少包含：

- `APPLE_MUSIC_NOT_CONFIGURED`
- `APPLE_MUSIC_AUTH_CANCELLED`
- `APPLE_MUSIC_AUTH_DENIED`
- `APPLE_MUSIC_TOKEN_EXPIRED`
- `APPLE_MUSIC_SUBSCRIPTION_REQUIRED`
- `APPLE_MUSIC_STOREFRONT_UNAVAILABLE`
- `APPLE_MUSIC_RATE_LIMITED`
- `APPLE_MUSIC_NETWORK_ERROR`
- `APPLE_MUSIC_PLAYLIST_NOT_FOUND`
- `APPLE_MUSIC_PLAYLIST_PARTIAL`
- `NETEASE_LOGIN_REQUIRED`
- `NETEASE_PLAYLIST_WRITE_FAILED`
- `IMPORT_CANCELLED`

错误对象不得携带 token、请求头、Apple 用户标识、完整响应正文或上游 URL
查询参数。

## 安全与隐私

- 不收集 Apple ID、密码、验证码或支付信息。
- `.p8` 私钥只在服务端存在。
- Music User Token 使用 `safeStorage` 加密后再写入 Electron Store。
- 若当前系统不支持安全存储，默认不持久化 token，仅维持本次会话。
- token 不进入 Vuex 持久化、localStorage、崩溃报告、分析事件或日志。
- Apple Music API 请求从主进程发起，renderer 不持有授权头。
- artwork URL 仅允许 Apple CDN 的 HTTPS 地址；加载失败使用本地占位图。
- 授权窗口禁止下载、权限请求、任意外链导航和 opener 注入。
- 日志使用请求 ID 和错误码，不记录曲目清单，除非用户显式启用诊断导出。
- 首次连接前展示隐私说明和“将读取哪些数据、写入哪些平台”。

## 分阶段实施

### 阶段 0：可行性原型

- 部署非生产 Developer Token 代理。
- 在开发版 Electron 中完成 MusicKit 授权。
- 验证动态 loopback origin、CSP、授权弹窗、退出授权和 token 恢复。
- 验证 Windows、Linux、macOS 至少各一个环境。
- 记录 Apple 条款和分发要求。

通过标准：

- 客户端制品不含私钥。
- 三个平台均能取得 Music User Token 并读取一页歌单。
- 退出后旧 token 不再被客户端使用。

### 阶段 1：只读连接

- 实现 token broker client、加密 token store、Apple API client 和受限 IPC。
- 增加连接/断开 UI。
- 分页展示用户歌单和曲目。
- 补充中、英、繁中、土耳其文本地化。

通过标准：

- 100 首以上歌单能完整加载。
- token 不出现在 renderer、日志或状态导出中。
- 401 自动触发一次恢复；恢复失败则要求重新授权，不死循环。

### 阶段 2：匹配预览

- 实现规范化、候选检索、评分、缓存和取消。
- 增加自动匹配、待确认、未匹配三类预览。
- 支持逐曲选择候选及导出未匹配清单。

通过标准：

- 使用至少 10 个跨语种真实歌单建立匿名测试集。
- 自动匹配准确率目标不低于 95%。
- 所有低置信度或版本冲突项必须进入人工确认。

### 阶段 3：网易云写入

- 接入创建歌单和追加歌单。
- 实现分批、去重、重试和部分失败报告。
- 仅在最终确认后写入。

通过标准：

- 新建和追加两种模式均保留已匹配歌曲顺序。
- 中途网络失败可安全重试，不重复加入已成功批次。
- 未登录、非本人目标歌单和取消任务均不会产生写入。

### 阶段 4：发布

- 使用 feature flag 灰度启用。
- 监控令牌代理可用率、Apple API 429、授权失败率和导入成功率。
- 指标只记录计数和错误码，不记录用户 token、歌单名或曲目名。
- 完成隐私政策、帮助文档和密钥轮换预案。

通过标准：

- 令牌代理故障时只影响 Apple Music 功能，不影响应用启动和网易云播放。
- 可远程关闭新授权入口；已导入的网易云歌单不受影响。

## 测试

### 单元测试

- JWT broker 响应校验和过期判断。
- token 加密、解密、删除及安全存储不可用回退。
- Apple API URL allowlist、分页和错误归一化。
- Track 规范化和多版本评分。
- 阈值边界、并列候选、重复歌曲和取消。
- 写入分批、部分失败及幂等重试。

### 集成测试

- 用 mock server 模拟 401、403、404、429、500 和畸形响应。
- 模拟 0、1、100、101 和多页歌单。
- 验证 Library Song 缺少 catalog relationship。
- 验证含 music video、地区不可用歌曲和已下架歌曲的歌单。
- 验证 Developer Token 过期和 Music User Token 失效。

### 手工验收

- Apple 授权取消、成功、拒绝、退出和重新连接。
- 中、英、日、韩歌单匹配。
- live、remaster、翻唱、纯音乐和同名歌曲消歧。
- 导入到新歌单、追加到已有歌单、取消和断网重试。
- DevTools、日志、Vuex、localStorage 和崩溃报告中不存在 token。

## 不纳入首版

- Apple Music 音频播放。
- Apple Music 离线下载或缓存。
- 修改、删除或创建 Apple Music 资料库歌单。
- 自动同步两个平台的后续变更。
- 导入播放历史、喜欢歌曲、智能歌单规则或歌单文件夹结构。
- 在未确认前自动创建网易云歌单。
- 用户自行粘贴 `.p8` 私钥或长期 Developer Token。

## 开始实现前的决策

维护方需要确认：

1. 是否运营 Developer Token 代理；若否，该功能只能保留为不可发布的原型。
2. 是否接受默认目标为网易云歌单，而非仅创建客户端本地歌单。
3. 是否允许追加到已有歌单；建议首版同时支持新建和追加。
4. 是否接受“高置信自动选择、低置信人工确认”的默认匹配策略。
5. 是否在同一版本重命名现有 `showPlaylistsByAppleMusic`，避免功能名称混淆。
