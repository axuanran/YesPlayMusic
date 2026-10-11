import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import clc from 'cli-color';
import { ensureAnonymousToken } from '../utils/checkAuthToken';

export const NETEASE_API_PORT = 10754;

const ANONYMOUS_TOKEN_PATH = path.resolve(os.tmpdir(), 'anonymous_token');

/**
 * `generateConfig()` swallows its own failures, so a failed anonymous-token
 * request is invisible to the caller. Detect it by reading the token file it
 * is supposed to write.
 */
export function hasAnonymousToken() {
  try {
    return fs.readFileSync(ANONYMOUS_TOKEN_PATH, 'utf-8').trim().length > 0;
  } catch {
    return false;
  }
}
export function createNeteaseApiGate(apiReady) {
  return async (_req, res, next) => {
    if (await apiReady) {
      next();
      return;
    }
    res.status(503).json({
      code: 'NETEASE_API_UNAVAILABLE',
      message: 'NetEase API failed to start',
    });
  };
}

export async function startNeteaseMusicApi() {
  ensureAnonymousToken();
  const [{ default: server }, { default: generateConfig }] = await Promise.all([
    import('@neteasecloudmusicapienhanced/api/server.js'),
    import('@neteasecloudmusicapienhanced/api/generateConfig.js'),
  ]);

  // Let user know that the service is starting
  console.log(`${clc.redBright('[NetEase API]')} initiating NCM API`);

  // Generate config (anonymous token, xEAPI key).
  // The anonymous-token request reliably fails on the first attempt against a
  // cold temp directory and only succeeds on a retry. Without a token every
  // signed endpoint (recommendations, podcasts, login QR) fails, so retry
  // until the token file is actually populated instead of trusting the
  // first call.
  const MAX_CONFIG_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_CONFIG_ATTEMPTS; attempt += 1) {
    try {
      await generateConfig();
    } catch (error) {
      console.error(
        `${clc.redBright('[NetEase API]')} config generation failed:`,
        error.message
      );
    }
    if (hasAnonymousToken()) break;
    console.warn(
      `${clc.redBright('[NetEase API]')} anonymous token still empty after attempt ${attempt}/${MAX_CONFIG_ATTEMPTS}`
    );
  }

  // Start the NCM API server
  await server.serveNcmApi({
    port: NETEASE_API_PORT,
  });
}
