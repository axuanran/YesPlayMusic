# Gentoo 打包与发布

本项目提供预编译 Electron 客户端的 ebuild 模板，包名为
`media-sound/yesplaymusic-bin`，支持 `amd64` 和 `arm64`。

## 生成 ebuild

先发布带有 Linux `tar.gz` 资产的 GitHub Release，再准备一个 Gentoo
overlay 工作区（本地测试可用
`eselect repository create yesplaymusic /var/db/repos/yesplaymusic` 创建）：

```bash
node scripts/prepare-gentoo-package.mjs 0.1.1-alpha.5 /var/db/repos/yesplaymusic
cd /var/db/repos/yesplaymusic/media-sound/yesplaymusic-bin
pkgdev manifest
pkgcheck scan
```

脚本会将 SemVer 预发布版本转换为 Gentoo 版本，例如：

- `0.1.1-alpha.5` → `0.1.1_alpha5`
- `0.1.1-beta.2` → `0.1.1_beta2`
- `0.1.1-rc.1` → `0.1.1_rc1`

不要手写 `Manifest`。`pkgdev manifest` 会下载 Release 中的 amd64 和
arm64 压缩包并写入真实校验值。

## 先在本地 overlay 测试

overlay 根目录至少需要：

```text
overlay/
├── metadata/
│   └── layout.conf
├── profiles/
│   └── repo_name
└── media-sound/
    └── yesplaymusic-bin/
```

`metadata/layout.conf` 示例：

```ini
masters = gentoo
auto-sync = false
```

`profiles/repo_name` 写入 overlay 名称，例如 `yesplaymusic`。用
`eselect repository create` 创建的 overlay 已经加入系统，可以直接测试：

```bash
emaint sync -r yesplaymusic
emerge -av media-sound/yesplaymusic-bin
```

## 发布方式

### GitHub Actions 自动发布

通过 Actions 运行 `Prepare Release` 并输入版本 Tag。它会更新版本并推送
Tag，随后自动触发 `Release` CI；Release 发布资产后，会在同一条 CI 中生成
Gentoo 包并推送到 `axuanran/xr-overlay` 的 `main` 分支。

需要在 YesPlayMusic 仓库的 Actions secrets 中配置：

- `XR_OVERLAY_DEPLOY_KEY`：为 `axuanran/xr-overlay` 创建且允许写入的 SSH
  deploy key 私钥。公钥添加到 overlay 的 Deploy keys，私钥添加到
  YesPlayMusic 的 Actions secrets；它只授予单个 overlay 仓库权限。

`Prepare Release` 会在创建 Tag 前检查这个 Secret，缺少配置时会立即失败。
Release CI 会兼容新旧两种 Linux 压缩包命名，并自动生成真实 `Manifest`。

### 发布到 GURU（推荐）

1. 按 GURU 文档准备 SSH/OpenPGP 密钥、接受 Certificate of Origin，并申请
   提交权限。
2. 克隆 GURU 的 `dev` 分支：

   ```bash
   git clone -b dev git@git.gentoo.org:repo/proj/guru.git
   ```

3. 用上面的脚本把包生成到 GURU 仓库根目录。
4. 在包目录运行 `pkgdev manifest`，然后运行 `pkgcheck scan --net`。
5. 使用 `pkgdev commit --signoff` 提交，最后执行：

   ```bash
   git pull --rebase
   pkgdev push -A
   ```

GURU 接收的是 ebuild、`metadata.xml`、`files/` 与 `Manifest`，不要上传
应用压缩包本身。

### 发布自建 overlay

将完整 overlay 提交到单独的 Git 仓库。用户可通过下面的方式添加：

```bash
eselect repository add yesplaymusic git https://example.com/yesplaymusic-overlay.git
emaint sync -r yesplaymusic
```

成熟后可向 Gentoo repositories
配置库提交收录请求，使用户能通过 `eselect repository enable` 启用。

## 正式版本发布顺序

1. 更新版本并推送形如 `v0.1.1` 或 `v0.1.1-alpha.5` 的 tag。
2. 等待 Release 工作流上传
   `YesPlayMusic-linux-<版本>-x64.tar.gz` 和
   `YesPlayMusic-linux-<版本>-arm64.tar.gz`。
3. 运行生成脚本和 `pkgdev manifest`。
4. 用 `pkgcheck scan` 校验，再发布到 GURU 或自建 overlay。
