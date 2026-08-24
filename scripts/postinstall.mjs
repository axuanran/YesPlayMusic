import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.env.WORKERS_CI === '1') {
  console.log(
    '[postinstall] Cloudflare Workers Builds detected; skipping Electron native dependency install.'
  );
  process.exit(0);
}

const executable = path.resolve(
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
);
const result = spawnSync(executable, ['install-app-deps'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error('[postinstall] Failed to run electron-builder install-app-deps');
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
