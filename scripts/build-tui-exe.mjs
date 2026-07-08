#!/usr/bin/env node
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { path7za } from '7zip-bin';
import esbuild from 'esbuild';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const distDir = path.join(projectRoot, 'dist_tui');
const buildDir = path.join(distDir, '.build');
const bundlePath = path.join(buildDir, 'yesplaymusic-tui.bundle.cjs');
const seaConfigPath = path.join(buildDir, 'sea-config.json');
const seaBlobPath = path.join(buildDir, 'yesplaymusic-tui.blob');
const executableName =
  process.platform === 'win32' ? 'yesplaymusic-tui.exe' : 'yesplaymusic-tui';
const exePath = path.join(distDir, executableName);
const postjectPath = path.join(projectRoot, 'node_modules', 'postject', 'dist', 'cli.js');
const seaFuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
const mpvDownloadUrl =
  process.env.YPM_TUI_MPV_URL ||
  'https://sourceforge.net/projects/mpv-player-windows/files/64bit-v3/mpv-x86_64-v3-20260607-git-71ebd08.7z/download';
const localMpvExe =
  process.env.YPM_TUI_MPV ||
  path.join(projectRoot, 'vendor', 'mpv', process.platform === 'win32' ? 'mpv.exe' : 'mpv');
const distMpvDir = path.join(distDir, 'player', 'mpv');
const neteaseApiDir = path.join(
  projectRoot,
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api'
);
const distNeteaseApiDir = path.join(
  distDir,
  'node_modules',
  '@neteasecloudmusicapienhanced',
  'api'
);

const unblockStubPlugin = {
  name: 'standalone-tui-unblock-stub',
  setup(build) {
    build.onResolve(
      { filter: /(^\.\/providers\/unblock\.js$|server[\\/]providers[\\/]unblock\.js$)/ },
      args => {
        if (
          args.path === './providers/unblock.js' &&
          !args.importer.endsWith(path.join('server', 'index.js'))
        ) {
          return null;
        }
        return {
          path: 'standalone-tui-unblock-stub',
          namespace: 'standalone-tui',
        };
      }
    );
    build.onLoad(
      { filter: /^standalone-tui-unblock-stub$/, namespace: 'standalone-tui' },
      () => ({
        loader: 'js',
        contents: `
          export const providerName = 'unblock';
          export async function resolve() {
            return {
              ok: false,
              errorCode: 'PROVIDER_DISABLED',
              errorMessage: 'Unblock provider is disabled in the standalone TUI build.',
            };
          }
        `,
      })
    );
  },
};

function run(command, args) {
  execFileSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    windowsHide: true,
  });
}

async function downloadFile(url, targetPath) {
  if (process.platform === 'win32') {
    run('curl.exe', [
      '-L',
      '--fail',
      '--retry',
      '3',
      '--output',
      targetPath,
      url,
    ]);
    return;
  }
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed ${response.status} ${response.statusText}`);
  }
  await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(targetPath));
}

function copyDirectoryContainingMpv(sourceMpvExe) {
  fs.mkdirSync(distMpvDir, { recursive: true });
  fs.cpSync(path.dirname(sourceMpvExe), distMpvDir, { recursive: true });
}

async function includeMpv() {
  if (process.env.YPM_TUI_SKIP_MPV === '1') {
    console.log('Skipping bundled mpv because YPM_TUI_SKIP_MPV=1');
    return;
  }
  if (fs.existsSync(localMpvExe)) {
    copyDirectoryContainingMpv(localMpvExe);
    console.log(`Bundled mpv from ${path.relative(projectRoot, localMpvExe)}`);
    return;
  }
  if (process.platform !== 'win32') {
    console.log('Skipping bundled mpv download on non-Windows platform.');
    return;
  }

  const archivePath = path.join(buildDir, 'mpv.7z');
  const extractDir = path.join(buildDir, 'mpv-extract');
  console.log(`Downloading mpv from ${mpvDownloadUrl}`);
  await downloadFile(mpvDownloadUrl, archivePath);
  fs.mkdirSync(extractDir, { recursive: true });
  run(path7za, ['x', archivePath, `-o${extractDir}`, '-y']);
  const mpvExe = findFile(extractDir, 'mpv.exe');
  if (!mpvExe) throw new Error('Downloaded mpv archive did not contain mpv.exe');
  copyDirectoryContainingMpv(mpvExe);
  console.log(`Bundled mpv to ${path.relative(projectRoot, distMpvDir)}`);
}

function findFile(dir, filename) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(projectRoot, 'scripts', 'yesplaymusic-tui.mjs')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: bundlePath,
  define: {
    'import.meta.url': 'undefined',
    'process.env.YPM_TUI_STANDALONE': JSON.stringify('1'),
  },
  plugins: [unblockStubPlugin],
  logLevel: 'warning',
});

fs.writeFileSync(
  seaConfigPath,
  JSON.stringify(
    {
      main: bundlePath,
      output: seaBlobPath,
      disableExperimentalSEAWarning: true,
    },
    null,
    2
  )
);

run(process.execPath, ['--experimental-sea-config', seaConfigPath]);
fs.copyFileSync(process.execPath, exePath);
if (process.platform !== 'win32') {
  fs.chmodSync(exePath, 0o755);
}
run(process.execPath, [
  postjectPath,
  exePath,
  'NODE_SEA_BLOB',
  seaBlobPath,
  '--sentinel-fuse',
  seaFuse,
  '--overwrite',
]);

fs.writeFileSync(
  path.join(distDir, 'package.json'),
  JSON.stringify({ type: 'commonjs', private: true }, null, 2),
  'utf-8'
);
fs.cpSync(neteaseApiDir, distNeteaseApiDir, { recursive: true });
await includeMpv();
fs.writeFileSync(
  path.join(distDir, 'README.txt'),
  [
    'YesPlayMusic Terminal TUI',
    '',
    `Run ${executableName} from your terminal.`,
    'This build is a real console executable and does not use the Electron GUI launcher.',
    '',
  ].join('\n'),
  'utf-8'
);

console.log(`TUI executable written to ${path.relative(projectRoot, exePath)}`);
