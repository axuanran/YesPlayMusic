import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

function createProcessEnv(mode) {
  const env = loadEnv(mode, rootDir, '');

  return {
    ...env,
    BASE_URL: '/',
    IS_ELECTRON: false,
    NODE_ENV: mode === 'production' ? 'production' : 'development',
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          compatConfig: {
            MODE: 3,
          },
        },
      },
    }),
    createSvgIconsPlugin({
      iconDirs: [path.resolve(rootDir, 'src/assets/icons')],
      symbolId: 'icon-[name]',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
      '~@': path.resolve(rootDir, 'src'),
    },
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
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ['vue', 'vue-router', 'vuex', 'vue-i18n'],
          player: ['plyr'],
          vendor: ['axios', 'lodash', 'dayjs', 'dexie'],
        },
      },
    },
  },
}));
