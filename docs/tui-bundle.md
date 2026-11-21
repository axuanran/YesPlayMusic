# TUI 与 mpv 的可选下载

终端界面（TUI）依赖 mpv，两者加起来约 **209 MB**（`mpv.exe` 115 MB + `yesplaymusic-tui.exe` 90 MB），对绝大多数用户没有意义。因此它们不再打进安装包，改为在需要时从 Cloudflare R2 下载，**默认不下载**。

## 用户侧行为

1. 安装包体积回到「只有桌面应用」的水平。
2. 需要 TUI 时，在 **设置 → TUI 与 mpv（可选下载）** 点击下载。
3. 下载完成后：
   - `xump --tui` 会使用下载下来的 mpv（主进程通过 `YPM_TUI_MPV` 传给 TUI 入口）；
   - 独立程序 `<userData>/tui/yesplaymusic-tui.exe` 可直接双击或在终端运行（相当于之前的 `xump-tui`，但不在 PATH 中）。
4. 可以随时「删除已下载文件」回收空间。

下载目录：`<userData>/tui/`（Windows 为 `%APPDATA%\XuMP\tui`）。目录内 `bundle.json` 记录版本、来源与安装时间。

## 目录与清单结构

```
<userData>/tui/
├── bundle.json              # 本地安装记录
├── yesplaymusic-tui.exe     # 独立程序
└── player/mpv/mpv.exe       # 播放器
```

R2 上的布局：

```
tui/
├── latest.json              # 指向最新一份，作为兜底
└── v<version>/
    ├── latest.json          # 该版本清单
    ├── win-x64.tar.gz
    └── linux-x64.tar.gz
```

清单格式：

```json
{
  "version": "0.1.6",
  "generatedAt": "2026-11-21T11:00:00.000Z",
  "platforms": {
    "win-x64": {
      "url": "win-x64.tar.gz",
      "sha256": "…",
      "size": 213456789,
      "files": 214
    }
  }
}
```

客户端先取 `tui/v<appVersion>/latest.json`，取不到再回退到 `tui/latest.json`，因此老版本安装也能拿到可用的包。

## 下载实现要点

主进程 `src/electron/tuiBundle.js` 负责全部逻辑：

- 通过 Electron `net` 请求，跟随重定向、走系统代理；
- 下载完成后校验 `sha256`，再解压；
- 只解压 `yesplaymusic-tui.exe` 与 `player/**`；
- 解压先落到 `<userData>/tui.staging`，成功后整体改名，避免半成品；
- 自带最小 tar 解析（`node:zlib` + 512 字节头解析），**不新增任何依赖**；
- 拒绝包含 `..` 或绝对路径的归档条目。

IPC：`tui-bundle:get-status`、`tui-bundle:install`、`tui-bundle:uninstall`、`tui-bundle:open-folder`，进度通过 `tui-bundle:progress` 事件推送。渲染层通过 `window.electronAPI.tuiBundle.*` 调用。

调试时可以用环境变量覆盖下载源：

```bash
YPM_TUI_BUNDLE_URL=http://127.0.0.1:8787/tui yarn desktop:dev
```

## 发布到 R2

工作流：`.github/workflows/tui-bundle.yaml`。

- 触发：推送 `v*` 标签，或手动 `workflow_dispatch`；
- 矩阵：`windows-latest`（含 mpv）与 `ubuntu-22.04`（无 mpv，构建脚本在非 Windows 平台按设计跳过 mpv）；
- 打包：`node scripts/pack-tui-bundle.mjs --platform <key> --version <ver>`
  只收 `yesplaymusic-tui(.exe)` 与 `player/`，生成 `tar.gz` + `sha256` + 每平台清单；
- 汇总：把所有平台清单合并成 `latest.json`；
- 上传：`aws s3 cp` 到 R2（S3 兼容端点）。

需要的仓库配置（与现有 Release 流程共用）：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `R2_ACCOUNT_ID` | Variable | `<account>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | Variable | 目标桶 |
| `R2_ACCESS_KEY_ID` | Secret | R2 令牌 Access Key |
| `R2_SECRET_ACCESS_KEY` | Secret | R2 令牌 Secret |

公开访问地址由工作流里的 `R2_PUBLIC_BASE_URL`（默认 `https://ypmdl.repo.oxiilo.com`）决定，需与客户端 `src/electron/tuiBundle.js` 的默认值一致。

> 只有标签触发时才自动发布；手动触发可以直接指定版本号，方便先发一版测试包验证客户端下载链路。

## 本地打包一份试试

```bash
yarn tui:build
yarn tui:exe
node scripts/pack-tui-bundle.mjs --platform win-x64 --version 0.1.6 --out dist_bundle
# 产物：dist_bundle/win-x64.tar.gz + win-x64.json + win-x64.sha256
```

把 `dist_bundle` 丢到任意静态服务器，用 `YPM_TUI_BUNDLE_URL` 指过去即可端到端验证，无需碰 R2。

## 注意事项

- **`xump-tui` 命令**：下载前该命令不可用。下载后指向 `<userData>/tui/yesplaymusic-tui.exe`。
- **Linux**：CI 上的打包脚本不会下载 mpv（上游只提供 Windows 版 7z），Linux 依赖系统 `mpv`；TUI 独立程序仍会随包提供。
- **代理/镜像**：全部走 Electron `net`，会遵循系统代理设置；网络受限时可以先用 `YPM_TUI_BUNDLE_URL` 指向内网镜像。
- **升级**：更换版本后重新下载会整体替换 `<userData>/tui`，旧的 `bundle.json` 一并覆盖。
