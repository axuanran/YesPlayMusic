import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { app, net } from 'electron';
import { extractTarGz } from './tarExtract.js';

// The TUI bundle (mpv + the standalone console executable) is no longer shipped
// inside the installer: it is roughly 200 MB and most users never launch it.
// It is downloaded on demand from Cloudflare R2 into the user data directory.
const DEFAULT_BASE_URL = 'https://ypmdl.repo.oxiilo.com/tui';
const MANIFEST_FILENAME = 'latest.json';
const INSTALLED_MANIFEST = 'bundle.json';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

export const TUI_BUNDLE_EXECUTABLE =
  process.platform === 'win32' ? 'yesplaymusic-tui.exe' : 'yesplaymusic-tui';

export function getBundleBaseUrl() {
  return (process.env.YPM_TUI_BUNDLE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ''
  );
}

export function getPlatformKey() {
  return `${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
}

export function getTuiHome() {
  return path.join(app.getPath('userData'), 'tui');
}

export function getInstalledMpvPath() {
  return path.join(
    getTuiHome(),
    'player',
    'mpv',
    process.platform === 'win32' ? 'mpv.exe' : 'mpv'
  );
}

export function getInstalledExecutablePath() {
  return path.join(getTuiHome(), TUI_BUNDLE_EXECUTABLE);
}

function readInstalledManifest() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(getTuiHome(), INSTALLED_MANIFEST), 'utf8')
    );
  } catch {
    return null;
  }
}

function directorySize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) {
        try {
          total += fs.statSync(entryPath).size;
        } catch {
          // size is cosmetic, ignore unreadable entries
        }
      }
    }
  }
  return total;
}

/**
 * Current state of the optional TUI bundle, consumed by the settings UI.
 */
export function getBundleStatus() {
  const manifest = readInstalledManifest();
  const executable = getInstalledExecutablePath();
  const mpv = getInstalledMpvPath();
  const hasExecutable = fs.existsSync(executable);
  const hasMpv = fs.existsSync(mpv);
  const installed = Boolean(manifest) && (hasExecutable || hasMpv);
  return {
    platform: getPlatformKey(),
    baseUrl: getBundleBaseUrl(),
    installed,
    version: installed ? manifest.version || null : null,
    installedAt: installed ? manifest.installedAt || null : null,
    sizeBytes: installed ? directorySize(getTuiHome()) : 0,
    hasExecutable,
    hasMpv,
    home: getTuiHome(),
  };
}

/**
 * Paths the TUI launcher prefers: a downloaded bundle first, then whatever a
 * previous packaged build might still ship.
 */
export function resolveTuiPaths() {
  try {
    const executable = getInstalledExecutablePath();
    const mpv = getInstalledMpvPath();
    return {
      executable: fs.existsSync(executable) ? executable : null,
      mpv: fs.existsSync(mpv) ? mpv : null,
    };
  } catch {
    // userData is not always resolvable this early in startup
    return { executable: null, mpv: null };
  }
}

/**
 * Follows redirects and resolves with the whole body. Used for the small
 * manifest; the bundle itself goes through `downloadToFile` to report progress.
 */
function fetchBuffer(url, onChunk, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error('Too many redirects'));
      return;
    }
    const request = net.request({ url, redirect: 'manual' });
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error(`Request timed out: ${url}`));
    }, REQUEST_TIMEOUT_MS);

    request.on('response', response => {
      const status = response.statusCode;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        clearTimeout(timer);
        response.resume();
        const next = new URL(
          Array.isArray(location) ? location[0] : location,
          url
        ).toString();
        fetchBuffer(next, onChunk, redirects + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        clearTimeout(timer);
        response.resume();
        reject(new Error(`HTTP ${status} for ${url}`));
        return;
      }
      const chunks = [];
      let received = 0;
      response.on('data', chunk => {
        chunks.push(chunk);
        received += chunk.length;
        if (onChunk) onChunk(received);
      });
      response.on('end', () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
      response.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
    request.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    request.end();
  });
}

export async function fetchBundleManifest() {
  const base = getBundleBaseUrl();
  // Prefer the manifest published for this exact app version; fall back to the
  // shared one so an older install can still fetch a compatible bundle.
  const candidates = [
    `${base}/v${app.getVersion()}/${MANIFEST_FILENAME}`,
    `${base}/${MANIFEST_FILENAME}`,
  ];

  let lastError = null;
  for (const url of candidates) {
    try {
      const raw = await fetchBuffer(url);
      const manifest = JSON.parse(raw.toString('utf8'));
      const entry = manifest?.platforms?.[getPlatformKey()];
      if (!entry?.url) {
        lastError = new Error(
          `No TUI bundle published for ${getPlatformKey()}`
        );
        continue;
      }
      return {
        version: manifest.version || null,
        url: new URL(entry.url, `${base}/`).toString(),
        sha256: entry.sha256 || null,
        sizeBytes: Number(entry.size) || 0,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No TUI bundle manifest available');
}

function sha256OfFile(file) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex');
}

function removePath(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * Download, verify and install the TUI bundle.
 *
 * `onProgress` receives `{ phase, percent, received, total }` where phase is one
 * of `manifest | download | verify | extract | done`.
 */
export async function installBundle(onProgress = () => {}) {
  const manifest = await fetchBundleManifest();
  onProgress({ phase: 'manifest', percent: 0 });

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xump-tui-'));
  const archivePath = path.join(tempRoot, 'bundle.tar.gz');

  try {
    const payload = await fetchBuffer(manifest.url, received => {
      const percent = manifest.sizeBytes
        ? Math.min(99, Math.round((received / manifest.sizeBytes) * 100))
        : 0;
      onProgress({
        phase: 'download',
        percent,
        received,
        total: manifest.sizeBytes,
      });
    });
    fs.writeFileSync(archivePath, payload);

    onProgress({ phase: 'verify', percent: 100 });
    if (
      manifest.sha256 &&
      sha256OfFile(archivePath).toLowerCase() !== manifest.sha256.toLowerCase()
    ) {
      throw new Error('Downloaded TUI bundle failed its checksum');
    }

    onProgress({ phase: 'extract', percent: 100 });
    const staging = `${getTuiHome()}.staging`;
    removePath(staging);
    fs.mkdirSync(staging, { recursive: true });
    if (!extractTarGz(archivePath, staging)) {
      throw new Error('TUI bundle archive was empty');
    }

    removePath(getTuiHome());
    fs.mkdirSync(path.dirname(getTuiHome()), { recursive: true });
    fs.renameSync(staging, getTuiHome());

    fs.writeFileSync(
      path.join(getTuiHome(), INSTALLED_MANIFEST),
      JSON.stringify(
        {
          version: manifest.version,
          sha256: manifest.sha256,
          source: manifest.url,
          installedAt: new Date().toISOString(),
        },
        null,
        2
      )
    );

    onProgress({ phase: 'done', percent: 100 });
    return getBundleStatus();
  } finally {
    removePath(tempRoot);
  }
}

export function uninstallBundle() {
  removePath(getTuiHome());
  return getBundleStatus();
}
