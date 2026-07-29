
<p align="center">
  <img src="images/logo.png" alt="YesPlayMusic Logo" width="156" height="156">
</p>

<h2 align="center">YesPlayMusic</h2>

<p align="center">
  一个基于 Vue 3、Vite 与 Electron 的现代音乐播放器
  <br>
  支持网易云音乐、本地音乐与 Emby 兼容媒体服务器
  <br>
  求STAR ~
</p>

<p align="center">
  <a href="https://github.com/axuanran/YesPlayMusic/releases/latest">
    <img src="https://img.shields.io/github/v/release/axuanran/YesPlayMusic?include_prereleases&label=Release" alt="Release">
  </a>
  <a href="https://github.com/axuanran/YesPlayMusic/actions/workflows/build.yaml">
    <img src="https://img.shields.io/github/actions/workflow/status/axuanran/YesPlayMusic/build.yaml?branch=dev&label=Build" alt="Build">
  </a>
  <a href="https://github.com/axuanran/YesPlayMusic/stargazers">
    <img src="https://img.shields.io/github/stars/axuanran/YesPlayMusic?style=flat" alt="Stars">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/github/license/axuanran/YesPlayMusic" alt="License">
  </a>
</p>

<p align="center">
  <a href="https://github.com/axuanran/YesPlayMusic/releases/latest"><strong>下载安装包</strong></a>
  ·
  <a href="https://github.com/axuanran/YesPlayMusic/wiki"><strong>项目 Wiki</strong></a>
  ·
  <a href="https://github.com/axuanran/YesPlayMusic/issues"><strong>问题反馈</strong></a>
  ·
  <a href="https://t.me/ypmaxuanran"><strong>Telegram 频道</strong></a>
</p>


---

## 项目说明

这是由 `axuanran` 维护的 YesPlayMusic 分支。

目前已可以稳定使用～

AUR: [yesplaymusic-axuanran-bin](https://aur.archlinux.org/packages/yesplaymusic-axuanran-bin)





项目在保留原版网易云音乐播放器体验的基础上，对前端、Electron 桌面端、音频解析和媒体库进行了持续重构。

主要变化包括：

- 从 Vue 2 迁移至 Vue 3、Vite 和 Vue Router 4
- 使用 `electron-vite` 重构 Electron 工程
- 内置网易云音乐 API 与音频 Resolver
- 支持插件式音频 Provider
- 支持本地音乐与本地文件夹歌单
- 支持 Emby 兼容媒体服务器
- 支持播客发现与播放
- 增强桌面歌词和系统媒体控制
- 提供 Windows、Linux、macOS 与 Docker 构建

> 项目仍处于 Alpha 开发阶段。开发分支可能出现功能变化或兼容性问题。

---

## 发布说明

### 稳定版本

请优先使用 Releases 页面中标记为 **Latest** 的版本：

[前往 Releases](https://github.com/axuanran/YesPlayMusic/releases/latest)

### 开发版本

`dev` 是项目的主要开发分支。

推送到 `dev` 后，GitHub Actions 会自动生成 prerelease。开发版本包含最新功能，但未经完整稳定性验证。

建议普通用户使用正式 Release；需要测试新功能时再使用 prerelease。

---

## 平台支持

| 平台 | 构建产物 | 状态 |
| --- | --- | --- |
| Windows x64 | NSIS 安装包、Portable | 已测试 |
| Linux x64 | AppImage、deb、rpm、tar.gz、snap、pacman、Gentoo ebuild | 已测试 |
| Linux ARM | deb、tar.gz、Gentoo ebuild | 构建支持 |
| macOS x64 | dmg | 自动构建 |
| macOS ARM64 | dmg | 自动构建 |
| Docker | Compose、GHCR 镜像 | 已测试 |
| Web / PWA | Vite Web 应用 | 支持 |

未充分测试的平台可能可以运行，但不保证不存在平台相关问题。

---

## 主要功能

### 网易云音乐

- Cookie 登录
- 内置浏览器网页登录
- 私人 FM
- 每日推荐
- 歌曲、专辑、歌手和歌单
- 音乐云盘
- MV 播放
- 搜索与云搜索
- 收藏及用户歌单管理

### 音频解析

内置统一音频 Resolver，并以 Provider 形式管理不同音频来源。

当前内置 Provider：

- Netease
- LX
- UnblockNeteaseMusic
- Fallback

支持：

- 独立音频解析
- 不同音质选择
- 灰色歌曲替换
- 音频缓存
- Resolver 管理接口
- 自定义 Provider 扩展

部分第三方音源的可用性可能受服务状态、网络环境和接口变化影响。

### 本地音乐

桌面端支持本地音乐库：

- 添加本地音乐文件夹
- 扫描并读取音频元数据
- 本地歌曲播放
- 本地封面显示
- 本地歌词匹配
- 文件夹歌单
- 本地媒体库管理
- 本地音乐与在线音乐统一播放

### 流媒体服务器

支持连接使用 Emby 兼容接口的媒体服务器：

- 配置服务器地址与认证信息
- 浏览媒体库
- 浏览专辑、歌手与歌曲
- 播放服务器中的音乐
- 在 YesPlayMusic 中统一管理流媒体内容

不同服务器实现可能存在接口兼容差异。遇到问题时请在 Issue 中附上服务器类型和版本。

### 播客

- 播客内容发现
- 播客搜索
- 节目列表
- 单集播放
- 播放速度控制
- 与音乐播放器共用播放队列和控制逻辑

### 歌词

- 滚动歌词
- 歌词翻译
- 罗马音或发音歌词
- 第二行歌词显示模式切换
- 原生桌面歌词窗口
- 桌面歌词锁定与点击穿透
- 桌面歌词位置和样式设置
- AMLL WebSocket 歌词同步
- 主窗口隐藏时继续同步桌面歌词

### 下载与缓存

桌面端提供：
- 已缓存歌曲浏览
- 缓存播放
- 缓存清理
- 更可靠的缓存目录处理

### 桌面集成

- Windows SMTC 媒体控制
- Windows SMTC 播放进度与媒体信息
- Linux MPRIS
- Discord Rich Presence
- Discord 播放状态与进度
- 系统托盘
- 深色主题托盘图标
- 全局快捷键
- 可配置快捷键
- 系统媒体按键
- 关闭或最小化到托盘
- 自动更新
- Windows 窗口阴影
- 低性能模式

### 播放体验

- 播放速度调节
- 鼠标滚轮调节音量
- 播放队列
- 在播放列表中定位当前歌曲
- 将歌曲添加到歌单
- 从播放器快速打开歌单操作
- 未登录状态下的本地播放历史
- 媒体封面与播放进度同步
- Light / Dark Mode

---

## 安装桌面客户端

前往项目 Releases 页面：

https://github.com/axuanran/YesPlayMusic/releases

根据系统下载相应文件。

### Windows

推荐使用：

- `Setup.exe`：安装版本
- `yesplaymusic.exe`：Portable 版本

### Linux

根据发行版选择：

- AppImage
- deb
- rpm
- tar.gz
- snap
- pacman

AppImage 下载后可能需要添加执行权限：

```bash
chmod +x YesPlayMusic-*.AppImage
./YesPlayMusic-*.AppImage
```

#### Arch Linux

推荐通过 AUR 安装
[yesplaymusic-axuanran-bin](https://aur.archlinux.org/packages/yesplaymusic-axuanran-bin)：

```bash
yay -S yesplaymusic-axuanran-bin
```

也可以使用 `paru`：

```bash
paru -S yesplaymusic-axuanran-bin
```

#### Gentoo

通过项目维护的
[xr-overlay](https://github.com/axuanran/xr-overlay)
安装 `media-sound/yesplaymusic-bin`：

```bash
sudo eselect repository add xr-overlay git https://github.com/axuanran/xr-overlay.git
sudo emaint sync -r xr-overlay
```

该软件包目前使用测试关键字。amd64 用户执行：

```bash
sudo mkdir -p /etc/portage/package.accept_keywords
echo "media-sound/yesplaymusic-bin ~amd64" | \
  sudo tee /etc/portage/package.accept_keywords/yesplaymusic
sudo emerge -av media-sound/yesplaymusic-bin
```

arm64 用户将上述 `~amd64` 替换为 `~arm64`。ebuild 的维护与发布流程见
[Gentoo 打包文档](docs/gentoo-package.md)。

### macOS

提供：

- Intel x64
- Apple Silicon ARM64

macOS 构建目前由 CI 自动生成，但测试覆盖程度可能低于 Windows 和 Linux。

可能需要自签名


---

## Docker 部署

推荐使用 Docker Compose。

Compose 会启动：

- YesPlayMusic Web 服务
- 内置网易云音乐 API
- 音频 Resolver 与管理后端
- UnblockNeteaseMusic 辅助服务

### 启动

```bash
mkdir YesPlayMusic
wget https://raw.githubusercontent.com/axuanran/YesPlayMusic/refs/heads/dev/docker-compose.yml
docker compose pull
docker compose up -d
```

默认访问地址：

```text
http://localhost
```

### 查看状态

```bash
docker compose ps
```

### 查看日志

```bash
docker compose logs -f
```

### 停止服务

```bash
docker compose down
```

Resolver 配置和运行数据会持久化到：

```text
yesplaymusic-data
```

### 使用指定镜像版本

默认使用：

```text
ghcr.io/axuanran/yesplaymusic:latest
```

可以通过环境变量指定版本：

```bash
YESPLAYMUSIC_IMAGE=ghcr.io/axuanran/yesplaymusic:<tag> docker compose up -d
```

由于 `latest` 可能跟随开发分支更新，长期部署建议固定到具体 Release 标签。

### 单容器运行

```bash
docker pull ghcr.io/axuanran/yesplaymusic:latest

docker run -d \
  --name yesplaymusic \
  --restart always \
  -p 80:80 \
  -v yesplaymusic-data:/data \
  ghcr.io/axuanran/yesplaymusic:latest
```

单容器模式不包含独立的 UnblockNeteaseMusic 服务。

---

## TUI

项目提供终端界面，可用于：

- 网易云登录
- Cookie 同步
- 搜索
- 私人漫游或私人 FM
- 终端音乐播放

TUI 使用 `mpv` 播放音频，并优先使用系统安装的 mpv。

### 从源码运行

```bash
yarn tui
```

### 从桌面程序启动

```bash
yesplaymusic --tui
```

也可以直接运行构建产生的独立 TUI 程序：

```bash
yesplaymusic-tui
```

Windows 和 Linux 构建流程会生成独立 TUI 产物。

### TUI 截图

<img width="1679" height="595" alt="YesPlayMusic TUI" src="https://github.com/user-attachments/assets/7193d0ef-5bef-462e-b2e7-332d2e08de68">

---

## 开发环境

### 环境要求

- Node.js `>=22 <26`
- Yarn `1.22.22`
- Git
- Electron 构建所需的平台依赖

启用 Yarn：

```bash
corepack enable
```

或者：

```bash
npm install -g yarn@1.22.22
```

### 克隆仓库

```bash
git clone --branch dev --recursive https://github.com/axuanran/YesPlayMusic.git
cd YesPlayMusic
```

### 安装依赖

```bash
yarn install
```

### 创建环境变量

Linux 或 macOS：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

---

## 开发命令

### Web 开发模式

```bash
yarn dev
```

### Electron 开发模式

```bash
yarn desktop:dev
```


### Electron 依赖修复后启动

当 Electron 二进制或原生依赖安装不完整时：

```bash
yarn electron:repair-and-serve
```

### 运行测试

```bash
yarn test
```

### 代码检查

```bash
yarn lint
```

### 完整验证

```bash
yarn verify
```

该命令会依次执行：

```text
lint → test → build
```

---

## 构建

### Web 构建

```bash
yarn build
```

输出目录：

```text
dist
```

### 当前平台桌面构建

```bash
yarn desktop:build
```

### Windows

建议windows开发测试使用 electron:build-win-dir，节省压缩时间，有其他平台构建需要直接使用github ci


```bash
yarn electron:build-win
```

Windows 安装包：

```bash
yarn electron:build-win-installer
```

Windows Portable：

```bash
yarn electron:build-win-portable
```

### Linux

```bash
yarn electron:build-linux
```

### macOS

```bash
yarn electron:build-mac
```

桌面构建输出目录：

```text
dist_electron
```

---

## 技术栈

### 前端

- Vue 3
- Vue Router 4
- Vuex 4
- Vue I18n
- Vite
- Sass

### 桌面端

- Electron
- electron-vite
- electron-builder
- electron-updater
- MPRIS
- Windows SMTC
- Discord Rich Presence

### 后端与媒体

- Node.js
- Express
- NeteaseCloudMusicApi Enhanced
- UnblockNeteaseMusic
- music-metadata
- mpv

### 测试与质量

- Vitest
- ESLint
- Prettier
- GitHub Actions

---

## 项目结构

```text
YesPlayMusic
├── src
│   ├── components          Vue 组件
│   ├── views               页面
│   ├── player              播放器与音频解析
│   ├── plugins             插件及音频 Provider
│   ├── electron            Electron 桌面功能
│   ├── main                Electron 主进程
│   ├── preload             安全 Preload 接口
│   └── utils               通用工具
├── server                  Resolver 与管理服务
├── admin                   Resolver 管理页面
├── scripts                 构建及 TUI 脚本
├── docs                    功能设计文档
├── llm-docs                开发规划与实现文档
└── .github                 CI、发布和打包配置
```

---

## 开发计划

正在规划或继续完善的方向包括：

- Apple Music 登录和歌单导入
- 更完整的音频 Provider 插件接口
- 更多流媒体服务器兼容
- 本地媒体库管理优化
- 桌面歌词跨平台适配
- 下载和缓存管理优化
- TUI 功能完善
- 播放器性能与稳定性优化
- 更多自动化测试

规划文档不代表功能已经在当前 Release 中完整实现。

---

## 问题反馈

遇到问题时请优先提交 Issue：

https://github.com/axuanran/YesPlayMusic/issues

建议附上：

- YesPlayMusic 版本
- 操作系统和版本
- 安装包类型
- 是否使用 Docker
- 问题复现步骤
- 控制台或应用日志
- 相关截图

功能建议也可以通过 Issue 提交。

---

## 贡献

欢迎提交：

- Bug 修复
- 新功能
- 平台适配
- 音频 Provider
- 文档改进
- 翻译
- 自动化测试

开发分支为：

```text
dev
```

提交 Pull Request 时，请将目标分支设置为 `dev`。

---

## 上游项目

本项目基于：

- [qier222/YesPlayMusic](https://github.com/qier222/YesPlayMusic)

相关项目：

- [NeteaseCloudMusicApi Enhanced](https://github.com/neteasecloudmusicapienhanced/api-enhanced)
- [UnblockNeteaseMusic](https://github.com/UnblockNeteaseMusic/server)

感谢原项目作者、贡献者以及所有参与测试和反馈的用户。

---

## 开源许可

本项目使用 [MIT License](LICENSE)。

使用本项目时，请同时遵守网易云音乐、媒体服务器以及其他第三方服务的服务条款和所在地区的法律法规。

本项目与网易云音乐官方无关。

---

## 截图

![lyrics][lyrics-screenshot]
![library-dark][library-dark-screenshot]
![album][album-screenshot]
![home-2][home-2-screenshot]
![artist][artist-screenshot]
![search][search-screenshot]
![home][home-screenshot]
![explore][explore-screenshot]

<!-- Markdown links and images -->

[album-screenshot]: images/album.png
[artist-screenshot]: images/artist.png
[explore-screenshot]: images/explore.png
[home-screenshot]: images/home.png
[home-2-screenshot]: images/home-2.png
[lyrics-screenshot]: images/lyrics.png
[library-screenshot]: images/library.png
[library-dark-screenshot]: images/library-dark.png
[search-screenshot]: images/search.png

---

<p align="center">
  Special thanks to Codex
</p>

[![Star History Chart](https://api.star-history.com/svg?repos=axuanran/YesPlayMusic&type=Date)](https://www.star-history.com/#axuanran/YesPlayMusic&Date)
