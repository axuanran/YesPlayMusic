import {
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import { isLooseLoggedIn, isAccountLoggedIn } from '@/utils/auth';
import { isElectron } from '@/utils/env';
import { getPluginRoutes } from '@/plugins';

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('@/views/home.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/login.vue'),
  },
  {
    path: '/login/username',
    name: 'loginUsername',
    component: () => import('@/views/loginUsername.vue'),
  },
  {
    path: '/login/account',
    name: 'loginAccount',
    component: () => import('@/views/loginAccount.vue'),
  },
  {
    path: '/playlist/:id',
    name: 'playlist',
    component: () => import('@/views/playlist.vue'),
  },
  {
    path: '/album/:id',
    name: 'album',
    component: () => import('@/views/album.vue'),
  },
  {
    path: '/artist/:id',
    name: 'artist',
    component: () => import('@/views/artist.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/artist/:id/mv',
    name: 'artistMV',
    component: () => import('@/views/artistMV.vue'),
    meta: {
      keepAlive: true,
    },
  },
  {
    path: '/mv/:id',
    name: 'mv',
    component: () => import('@/views/mv.vue'),
  },
  {
    path: '/next',
    name: 'next',
    component: () => import('@/views/next.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/tui',
    name: 'tui',
    component: () => import('@/views/tui.vue'),
  },
  {
    path: '/search/:keywords?',
    name: 'search',
    component: () => import('@/views/search.vue'),
    meta: {
      keepAlive: true,
    },
  },
  {
    path: '/search/:keywords/:type',
    name: 'searchType',
    component: () => import('@/views/searchType.vue'),
  },
  {
    path: '/new-album',
    name: 'newAlbum',
    component: () => import('@/views/newAlbum.vue'),
  },
  {
    path: '/explore',
    name: 'explore',
    component: () => import('@/views/explore.vue'),
    meta: {
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/library',
    name: 'library',
    component: () => import('@/views/library.vue'),
    meta: {
      requireLogin: true,
      keepAlive: true,
      savePosition: true,
    },
  },
  {
    path: '/library/liked-songs',
    name: 'likedSongs',
    component: () => import('@/views/playlist.vue'),
    meta: {
      requireLogin: true,
    },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/views/settings.vue'),
  },
  {
    path: '/daily/songs',
    name: 'dailySongs',
    component: () => import('@/views/dailyTracks.vue'),
    meta: {
      requireAccountLogin: true,
    },
  },
  {
    path: '/lastfm/callback',
    name: 'lastfmCallback',
    component: () => import('@/views/lastfmCallback.vue'),
  },
  ...getPluginRoutes(),
];

const router = createRouter({
  history: isElectron ? createWebHashHistory() : createWebHistory(),
  routes,
});

router.beforeEach((to, from, next) => {
  // 需要登录的逻辑
  if (to.meta.requireAccountLogin) {
    if (isAccountLoggedIn()) {
      return next();
    } else {
      return next({ path: '/login/account' });
    }
  }
  if (to.meta.requireLogin) {
    if (isLooseLoggedIn()) {
      return next();
    } else {
      if (isElectron) {
        return next({ path: '/login/account' });
      } else {
        return next({ path: '/login' });
      }
    }
  } else {
    return next();
  }
});

export default router;
