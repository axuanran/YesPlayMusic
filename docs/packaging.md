# 打包与产物体积

本文记录 XuMP 的打包链路、产物体积构成，以及为缩小安装包所做的裁剪与其验证方式。

## 打包链路

| 形态 | 命令 | 产物目录 |
| --- | --- | --- |
| Web | `yarn build` | `dist/` |
| 桌面（当前平台） | `yarn desktop:build` | `dist_electron/` |
| Windows 未打包目录 | `yarn electron:build-win-dir` | `dist_electron/win-unpacked/` |
| Windows 安装包 | `yarn electron:build-win-installer` | `dist_electron/XuMP Setup <version>.exe` |
| Windows 便携版 | `yarn electron:build-win-portable` | `dist_electron/XuMP.exe` |
| Linux | `yarn electron:build-linux` | AppImage / deb / rpm / snap / pacman / tar.gz |
| macOS | `yarn electron:build-mac` | dmg |
| Android | `yarn mobile:sync` + Android Studio | `android/` |
| Docker | `docker build -f Dockerfile .` | 镜像 `ghcr.io/axuanran/xump` |
| TUI 与 mpv | `.github/workflows/tui-bundle.yaml` | R2：`tui/v<version>/` |

桌面打包配置位于 `package.json` 的 `build` 字段（electron-builder 26）。TUI 与 mpv 不再进安装包，见 [TUI 与 mpv 的可选下载](tui-bundle.md)。

## 体积构成（Windows x64）

解包目录 `win-unpacked` 约 **362 MB**：

| 组成 | 体积 | 说明 |
| --- | --- | --- |
| `XuMP.exe` | 222 MB | Electron 42 运行时，随上游 Electron 版本变化 |
| `resources/app.asar` | 49 MB | 应用代码 + 运行时依赖 |
| Electron 资源 | 约 85 MB | dll、`icudtl.dat`、`resources.pak`、`LICENSES.chromium.html` 等 |

TUI 与 mpv（约 209 MB）已移出安装包，改为按需下载。

## 已做的裁剪

只动打包配置与分发方式，不改主流程逻辑。

| 项 | 做法 | 实测效果 |
| --- | --- | --- |
| TUI 与 mpv 移出安装包 | 删除 `win`/`linux` 的 `extraResources`，改为主进程从 R2 按需下载 | 解包 −209 MB，payload −56 MB |
| Electron 语言包 | `electronLanguages: ["en-US", "zh-CN", "zh-TW"]` | `locales` 47.2 → 1.6 MB |
| asar 内依赖裁剪 | `files` 中的否定规则，见下 | `app.asar` 94.2 → 48.8 MB |
| 压缩等级 | `compression: "maximum"` | 与其他改动合计计入 payload |

`files` 里被排除的依赖：

- 前端依赖：`vue`、`vue-router`、`vuex`、`vue-i18n`、`vue-slider-component`、`plyr`、`dexie`、`node-vibrant`、`xstate`、`jsbi`、`dayjs`、`core-js`、`@vscode/codicons`
- 网易云 API 的 Web UI：`@neteasecloudmusicapienhanced/api/public/**`（约 12.9 MB）
- 依赖内的冗余文件：`node_modules/**/*.md`、`node_modules/**/*.map`、`node_modules/**/{test,tests,__tests__,__mocks__,example,examples}/**`
- 测试文件：`server/__tests__/**`

> 前端依赖由 Vite 打进 `out/renderer`，运行时不会再从 `node_modules` 读取，因此可以从 asar 中移除。
> 主进程、preload、`server/` 与 TUI 脚本的运行时依赖**必须保留**。

### 实测对比（同一份源码）

| 指标 | 最初 | 现在 | 变化 |
| --- | --- | --- | --- |
| 解包总大小 | 664.1 MB | 362.0 MB | −302.1 MB（−45.5%） |
| `app.asar` | 94.2 MB | 48.8 MB | −45.4 MB（−48.2%） |
| `locales` | 47.2 MB | 1.6 MB | −45.6 MB |
| TUI 资源 | 209.5 MB | 0（按需下载） | −209.5 MB |
| 压缩 payload（`*.nsis.7z`） | 179.3 MB | 98.4 MB | −80.9 MB（−45.1%） |

安装包体积约为 payload 再加数 MB 的 NSIS 外壳。

## 验证方式

裁剪 asar 后必须确认运行时依赖没有误删：

```bash
# 打包未压缩目录
yarn electron:build-win-dir

# 主进程真正 require 的包（externalizeDepsPlugin 会把它们保留为 require）
grep -o 'require("[^"./][^"]*")' out/main/index.js | sort -u

# 确认关键模块仍在 asar 内
npx asar list dist_electron/win-unpacked/resources/app.asar \
  | grep -E 'out/main/index.js|out/preload/index.js|server/index.js|node_modules/(express|axios|music-metadata|qrcode|electron-updater)/'
```

主进程另有动态导入，不在 `require` 扫描范围内：

```js
import('@neteasecloudmusicapienhanced/api/server.js');
import('@neteasecloudmusicapienhanced/api/generateConfig.js');
```

## 已知问题：本机 NSIS 出包失败

在本机执行安装包构建时，electron-builder 生成卸载程序那一步会失败：

```
⨯ ...\XuMP Setup <version>.exe process failed 2
Error writing temporary file. Make sure your temp folder is valid.
```

已确认与打包配置无关：用调整前的 `package.json` 重新构建会复现同样的错误，且 `%TEMP%` 与磁盘空间均正常。建议在 GitHub Actions 的 Windows runner 上出包（见 `.github/workflows/win-installer.yaml`），`--dir` 产物与 `*.nsis.7z` payload 不受影响。

## 进一步压缩的空间

1. **把前端依赖从 `dependencies` 移到 `devDependencies`**——目前 `files` 只挡住了包目录本身，electron-builder 仍按依赖树打包 `@vue/*` 等传递依赖（约 6 MB）。注意 Docker 运行阶段用的是 `yarn install --production`，移动前需确认不影响 `server/`。
2. **`dxcompiler.dll`（24.4 MB）与 `vk_swiftshader.dll`（5.3 MB）**——可以删，但会牺牲软件渲染兜底与部分 GPU 场景，不建议。
3. **`LICENSES.chromium.html`（19.4 MB）**——Electron 的许可文件，属于合规要求，保留。

剩下的 222 MB 基本就是 Electron 运行时本身，除非换成更小的运行时（如自建精简 Electron 或改用 Web 版），否则无法再显著压缩。
