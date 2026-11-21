import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// Entries that are never useful for playback; skipping them keeps the downloaded
// bundle smaller without affecting the TUI.
const SKIP_SEGMENTS = new Set(['doc', 'installer', 'documentation']);

function shouldSkip(entryName) {
  if (/\.pdf$/i.test(entryName)) return true;
  const segments = entryName
    .split(/[\\/]+/)
    .map(segment => segment.toLowerCase());
  return segments.some(segment => SKIP_SEGMENTS.has(segment));
}

/**
 * Minimal tar reader for `tar -czf` output produced by CI, so the app needs no
 * extra extraction dependency. Rejects entries that would escape the target
 * directory. Returns the number of files written.
 */
export function extractTarGz(archivePath, targetDir) {
  const tar = zlib.gunzipSync(fs.readFileSync(archivePath));
  let offset = 0;
  let extracted = 0;

  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;

    if (header.every(byte => byte === 0)) break; // end-of-archive marker

    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '');
    if (!name) continue;
    const prefix = header
      .subarray(345, 500)
      .toString('utf8')
      .replace(/\0.*$/, '');
    const entryName = prefix ? `${prefix}/${name}` : name;
    const sizeField = header
      .subarray(124, 136)
      .toString('utf8')
      .replace(/\0.*$/, '')
      .trim();
    const size = sizeField ? parseInt(sizeField, 8) : 0;
    const typeFlag = String.fromCharCode(header[156] || 0);
    const rawMode = header
      .subarray(100, 108)
      .toString('utf8')
      .replace(/\0.*$/, '')
      .trim();
    const mode = (rawMode ? parseInt(rawMode, 8) : 0o644) || 0o644;

    const normalized = path.normalize(entryName).replace(/^([/\\])+/, '');
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error(`Refusing to extract unsafe path: ${entryName}`);
    }

    const isDirectory = typeFlag === '5' || entryName.endsWith('/');
    const payload = tar.subarray(offset, offset + size);

    if (isDirectory) {
      fs.mkdirSync(path.join(targetDir, normalized), { recursive: true });
    } else if (typeFlag === '0' || typeFlag === '\0') {
      if (!shouldSkip(entryName)) {
        const destination = path.join(targetDir, normalized);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, payload);
        try {
          fs.chmodSync(destination, mode & 0o777);
        } catch {
          // permission bits are best-effort on Windows
        }
        extracted += 1;
      }
    }

    offset += Math.ceil(size / 512) * 512;
  }

  return extracted;
}
