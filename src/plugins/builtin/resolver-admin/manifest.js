export default {
  id: 'resolver-admin',
  name: 'Resolver Admin',
  description: '音频解析服务管理入口',
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
