import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';

const r = p => fileURLToPath(new URL(p, import.meta.url));

function createProcessEnv(mode) {
  const env = process.env;
  return {
    ...Object.fromEntries(
      Object.entries(env).filter(
        ([k]) => k.startsWith('VITE_') || k.startsWith('VUE_APP_')
      )
    ),
    BASE_URL: '/',
    IS_ELECTRON: true,
    NODE_ENV: mode === 'production' ? 'production' : 'development',
  };
}

export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': r('./src'),
        jsbi: r('./node_modules/jsbi/dist/jsbi-cjs.js'),
      },
    },
    define: {
      __static: 'global.__static',
    },
    build: {
      rollupOptions: {
        input: r('./src/main/index.js'),
      },
    },
  },

  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': r('./src'),
      },
    },
    build: {
      rollupOptions: {
        input: r('./src/preload/index.js'),
      },
    },
  },

  renderer: {
    root: r('.'),
    publicDir: r('./public'),
    plugins: [
      vue({
        template: {
          compilerOptions: {
            compatConfig: {
              MODE: 2,
            },
          },
        },
      }),
      createSvgIconsPlugin({
        iconDirs: [path.resolve(r('.'), 'src/assets/icons')],
        symbolId: 'icon-[name]',
      }),
    ],
    resolve: {
      alias: {
        '@': r('./src'),
        '~@': r('./src'),
        vue: '@vue/compat',
      },
    },
    optimizeDeps: {
      exclude: ['@vue/compat'],
    },
    define: {
      'process.env': JSON.stringify(createProcessEnv(mode)),
    },
    server: {
      host: process.env.DEV_SERVER_HOST || '127.0.0.1',
      port: Number(process.env.DEV_SERVER_PORT || 20201),
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          rewrite: value => value.replace(/^\/api/, ''),
        },
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vue: ['vue', 'vue-router', 'vuex', 'vue-i18n'],
            player: ['howler', 'plyr'],
            vendor: ['axios', 'lodash', 'dayjs', 'dexie'],
          },
        },
      },
    },
  },
}));
