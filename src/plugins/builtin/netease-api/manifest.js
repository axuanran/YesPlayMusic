export default {
  id: 'netease-api',
  name: '网易云音乐 API',
  description: '配置自建或 Serverless 部署的 NeteaseCloudMusicApiEnhanced 地址',
  version: '0.1.0',
  type: 'builtin',
  capabilities: ['routes', 'settings'],
  enabledByDefault: true,
  routes: [
    {
      path: '/settings/plugins/netease-api',
      name: 'pluginNeteaseApi',
      component: () => import('./pages/index.vue'),
    },
  ],
};
