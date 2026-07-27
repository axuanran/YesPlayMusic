# 桌面歌词设计与实施计划

## 当前状态

第一阶段已经完成：

- Electron 内置透明、无边框、置顶歌词窗口。
- Windows、Linux、macOS 共用 `enableDesktopLyrics` 开关。
- 复用歌词页现有解析、翻译和发音显示状态。
- 主歌词页隐藏时仍能更新桌面歌词。
- 窗口使用 `contextIsolation` 和 preload API，不启用 Node 集成。
- 本地歌曲、流媒体歌曲及无歌词状态会清空旧歌词。

当前限制：

- 窗口固定在主屏幕底部，不能移动或缩放。
- 始终点击穿透，没有临时解锁模式。
- 只能设置启用状态，不能调整字体、颜色、透明度和对齐方式。
- 没有播放控制栏、托盘入口或标准化快捷键。

## 设计原则

1. 现有歌词解析与同步逻辑是唯一数据源，不新增定时轮询桥接器。
2. 桌面歌词窗口不加载 HTTP 页面，不依赖固定端口。
3. 保持 `contextIsolation: true`、`nodeIntegration: false`。
4. 使用独立 preload，只暴露桌面歌词所需的接收和控制接口。
5. 主进程拥有窗口状态和窗口边界；渲染进程不能覆盖完整设置对象。
6. 所有 IPC payload 必须验证类型、长度、范围和发送窗口。
7. 锁定后必须保留窗口之外的解锁路径，避免 Linux 无法恢复。

## 设置模型

新增独立、可校验的设置对象：

```js
desktopLyrics: {
  enabled: false,
  visible: false,
  locked: true,
  alwaysOnTop: true,
  showSecondary: true,
  fontSize: 32,
  secondaryFontSize: 18,
  textAlign: 'center',
  textColor: '#ffffff',
  secondaryColor: '#d6e0ff',
  backgroundOpacity: 0,
  width: 960,
  height: 120,
  x: null,
  y: null,
}
```

约束：

- `fontSize`: 18–72。
- `secondaryFontSize`: 12–48。
- `backgroundOpacity`: 0–1。
- `textAlign`: `left | center | right`。
- 颜色只接受完整十六进制颜色。
- 窗口尺寸设置最小值，并限制在当前显示器工作区内。
- 旧 `enableDesktopLyrics` 自动迁移到 `desktopLyrics.enabled`。

## 窗口与交互

### 锁定状态

- 默认锁定并启用点击穿透。
- 不显示控制栏，不接受鼠标交互。
- 通过设置页、托盘菜单或可单独禁用的全局快捷键解锁。
- Linux 不依赖 `forward: true` 的鼠标事件恢复交互。

### 解锁状态

- 关闭点击穿透。
- 窗口背景显示轻量控制层和拖动区域。
- 支持拖动、调整大小、重新锁定和关闭。
- 控制栏提供上一首、播放/暂停、下一首、音量和打开设置。
- 控制命令复用主窗口现有播放器事件，不在歌词窗口创建播放器实例。

### 位置恢复

- 移动和缩放事件使用 250ms 防抖保存。
- 启动时使用 `screen.getDisplayMatching()` 验证保存位置。
- 显示器被移除或分辨率变化时，将窗口收回主显示器可视区域。
- 提供“重置位置”和“重置样式”操作。

## 安全 IPC

独立 preload 仅暴露：

```js
desktopLyricsAPI.onState(callback);
desktopLyricsAPI.onSettings(callback);
desktopLyricsAPI.setLocked(boolean);
desktopLyricsAPI.hide();
desktopLyricsAPI.playerCommand(command);
desktopLyricsAPI.setVolume(number);
desktopLyricsAPI.openSettings();
```

主进程要求：

- 验证 IPC sender 必须来自当前桌面歌词窗口。
- `playerCommand` 只允许固定枚举值。
- 音量限制为 0–1。
- 文本限制长度并继续使用 `textContent` 渲染。
- 设置更新使用字段级 patch，不接受任意对象合并。

## 歌词同步

- 沿用歌词页的当前行定位和 `publishDesktopLyrics()`。
- 只在歌词行、第二行、播放状态或音量变化时发送 IPC。
- 切歌时立即发送 `loading` 或空状态，避免残留上一首歌词。
- 未启用桌面歌词时不创建窗口、不发送歌词 IPC。
- 翻译/发音显示遵循歌词页当前循环模式，并允许桌面歌词单独关闭第二行。

## 设置与快捷入口

设置页“歌词”区域增加：

- 启用桌面歌词。
- 显示/隐藏。
- 锁定/解锁。
- 始终置顶。
- 显示第二行。
- 字体大小、颜色、背景透明度、对齐方式。
- 重置位置、重置样式。

快捷入口：

- 播放栏按钮：显示或隐藏。
- 托盘菜单：显示、隐藏、锁定、解锁。
- 标准化快捷键：使用现有快捷键模型，可单独禁用；不直接硬编码注册。

## 分阶段实施

### A. 设置和窗口边界

- 设置校验、迁移和持久化。
- 可移动、可缩放窗口。
- 多显示器边界恢复。
- 设置页样式选项。

### B. 安全交互

- 独立 preload。
- sender 校验和命令白名单。
- 锁定、解锁和点击穿透。
- 托盘与快捷键恢复路径。

### C. 控制栏

- 播放控制、音量、设置和关闭按钮。
- 播放状态同步。
- 解锁状态下的拖动与悬浮反馈。

### D. 入口与平台适配

- 播放栏快捷按钮。
- Windows 缩放、Linux 窗口管理器、macOS 全屏空间验证。
- 无透明窗口支持时的降级提示。

建议按 A–D 分开提交，避免桌面歌词再次成为跨大量无关文件的单一提交。

## 自动测试

- 设置默认值、迁移、非法输入和范围限制。
- 多显示器位置校正。
- 窗口创建、显示、隐藏、锁定、销毁和重复启用。
- IPC sender、命令枚举、音量和文本长度校验。
- 切歌、无歌词、翻译/发音关闭和功能关闭时清空状态。
- 锁定后仍可通过托盘、设置和快捷键解锁。

## 手动验收

- Windows：缩放比例 100%/150%，普通和低性能模式。
- Linux：X11/Wayland，锁定后点击穿透及外部解锁。
- macOS：多桌面、全屏空间和始终置顶。
- 拔除副显示器后窗口能回到主显示器。
- 重启应用后恢复位置、尺寸和样式。
- 主窗口最小化或隐藏时歌词与控制命令仍正常。

## 完成标准

- 默认关闭，不产生窗口或后台轮询。
- 开启后原文与可选第二行同步准确。
- 窗口可移动、缩放、锁定、穿透并安全恢复。
- 不抢焦点、不显示在任务栏、不加载网络页面。
- 无 Node 集成、无固定端口、无未校验 IPC。
- ESLint、单元测试、Web 构建和 Electron 构建全部通过。
