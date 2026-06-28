import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
import axios from 'axios';

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

// Audio proxy middleware for web dev mode.
// Intercepts /__audio_proxy/:trackId and streams audio from music.163.com
// through the Vite dev server to avoid CORS issues.
function audioProxyMiddleware(req, res, next) {
  const match = req.url?.match(/^\/__audio_proxy\/(\d+)/);
  if (!match) return next();

  const trackId = match[1];
  const outerUrl = "https://music.163.com/song/media/outer/url?id=".concat(trackId);

  console.log("[vite-audio-proxy] proxying track ".concat(trackId));

  axios
    .get(outerUrl, {
      responseType: 'stream',
      maxRedirects: 5,
      timeout: 30000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      validateStatus: status => status === 200,
    })
    .then(proxyResponse => {
      res.statusCode = 200;
      res.setHeader('Content-Type', proxyResponse.headers['content-type'] || 'audio/mpeg');
      if (proxyResponse.headers['content-length']) {
        res.setHeader('Content-Length', proxyResponse.headers['content-length']);
      }
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      proxyResponse.data.pipe(res);
    })
    .catch(err => {
      console.error("[vite-audio-proxy] failed to proxy track ".concat(trackId, ":", err.message));
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'PROXY_FAILED' }));
      }
    });
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
    __IS_WEB_DEV__: mode === 'development',
  },
  server: {
    host: process.env.DEV_SERVER_HOST || '127.0.0.1',
    port: Number(process.env.DEV_SERVER_PORT || 20201),
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: value => value.replace(/^\/api/, ''),
        bypass: req => req.url?.startsWith('/resolver-api') ? false : undefined,
      },
      '/resolver-api': {
        target: 'http://127.0.0.1:27232',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/resolver-api/, ''),
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
  configureServer(server) {
    server.middlewares.use(audioProxyMiddleware);
  },
}));
