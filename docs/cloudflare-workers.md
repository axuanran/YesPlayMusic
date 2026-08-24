# Cloudflare Workers 部署

YesPlayMusic 的 Web 端可以直接使用 Cloudflare Workers Static Assets 部署。该方案只托管 Vite 构建出的 SPA，不在 Worker 内启动 Electron/Express/网易云 API 服务。

## Cloudflare Git 部署

在 Cloudflare Dashboard 的 **Workers & Pages → Create application → Import a repository** 中选择 `axuanran/YesPlayMusic`，并使用以下设置：

- Production branch: `dev`
- Root directory: `/`
- Build command: `yarn cloudflare:build`
- Deploy command: `npx wrangler@4 deploy`

`wrangler.jsonc` 会将 `dist` 作为 Workers Static Assets 上传，并启用 SPA fallback，因此 Vue Router 的深层链接刷新时不会返回 404。

Cloudflare Workers Builds 会设置 `WORKERS_CI=1`。仓库的 `postinstall` 会在该环境下跳过 `electron-builder install-app-deps`，避免纯 Web 构建执行无关的 Electron 原生依赖安装。本地、GitHub Actions 和桌面构建保持原有行为。

## 网易云 API

Cloudflare Worker 在这里仅负责 YesPlayMusic 前端静态资源，不内置 `NeteaseCloudMusicApiEnhanced/api-enhanced` 的 Node 服务。

部署完成后，应在 YesPlayMusic 的网易云 API 地址配置中填写独立部署的 `api-enhanced` Serverless 地址，例如你的 Workers/Vercel/其他 Serverless API 根地址。

在 API 地址配置完成前，当前 Web 端默认的 `/api` 仅适用于本地开发代理或自带后端的部署方式；纯 Workers Static Assets 不会自动提供 `/api` 后端。

## 本地手动部署

登录 Wrangler 后可直接执行：

```bash
yarn cloudflare:deploy
```

该命令只执行 Vite Web 构建并部署 `dist`，不会触发项目原有 `postbuild` 的 TUI 构建步骤。
