# 更新说明

本次更新聚焦音频解析与调试能力，主要内容如下：

- 新增 Audio Resolver 面板，支持查看状态、Cookie、缓存、日志与测试解析结果。
- 支持从前端同步网易云 Cookie 到后端 resolver，并保存在后端本地文件中。
- 音质策略改为网易云 `level` 体系，支持 `standard / exhigh / lossless / hires / jyeffect / sky / jymaster`。
- 解析逻辑支持按当前 `level` 向下逐级降级，避免直接跳到不相关档位。
- Resolver 日志增加 `requestedQuality / resolvedQuality`，并支持按开关显示 `br / size / md5 / urlExt / note`。
- `size` 在面板中会自动显示为 `KB / MB`，便于快速判断资源大小。
- 修复了若干页面空引用与音频代理问题，提升了播放与调试稳定性。

适用场景：

- 想排查为什么某首歌只能拿到低音质
- 想确认 resolver 实际请求到了哪个 `level`
- 想查看后端缓存、Cookie 状态、流代理日志
