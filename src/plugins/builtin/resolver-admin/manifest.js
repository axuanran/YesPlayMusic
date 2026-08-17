export default {
  id: 'resolver-admin',
  name: '内置音频解析',
  description: '桌面端与 Android 共用的 UI 音频解析器',
  version: '0.1.0',
  type: 'builtin',
  capabilities: ['routes', 'settings', 'audioProvider'],
  enabledByDefault: true,
  routes: [
    {
      path: '/settings/plugins/resolver-admin',
      name: 'pluginResolverAdmin',
      component: () => import('./pages/index.vue'),
    },
  ],
};
