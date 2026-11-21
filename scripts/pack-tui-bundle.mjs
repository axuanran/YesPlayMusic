#!/usr/bin/env node
// Pack dist_tui into a tar.gz that the desktop app downloads on demand.
//
// The archive intentionally contains only the standalone console executable and
// the bundled mpv directory: build caches, node_modules and docs stay out.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(projectRoot, 'dist_tui');

const args = process.argv.slice(2);
function arg(name, fallback = null) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

const platformKey =
  arg('platform') || `${process.platform}-${process.arch === 'arm64' ? 'arm64' : 'x64'}`;
const outDir = path.resolve(projectRoot, arg('out', 'dist_bundle'));
const version = arg('version', '0.0.0');

const executableName =
  platformKey.startsWith('win') ? 'yesplaymusic-tui.exe' : 'yesplaymusic-tui';

// Mirrors the skip list in src/electron/tarExtract.js so the archive never
// carries mpv docs or installer scripts.
const SKIP_SEGMENTS = new Set(['doc', 'installer', 'documentation']);

function isSkipped(archivePath) {
  if (/\.pdf$/i.test(archivePath)) return true;
  return archivePath
    .split(/[\\/]+/)
    .some(segment => SKIP_SEGMENTS.has(segment.toLowerCase()));
}

function collect(file, archivePath, entries) {
  const stat = fs.statSync(file);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(file)) {
      collect(path.join(file, name), `${archivePath}/${name}`, entries);
    }
    return;
  }
  if (!stat.isFile() || isSkipped(archivePath)) return;
  entries.push({ file, archivePath, size: stat.size, mode: stat.mode & 0o777 });
}

function writeTarHeader(name, size, mode, mtimeSeconds) {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, 'utf8');
  header.write(mode.toString(8).padStart(7, '0') + '\0', 100, 8, 'utf8');
  header.write('0000000\0', 108, 8, 'utf8'); // uid
  header.write('0000000\0', 116, 8, 'utf8'); // gid
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8');
  header.write(mtimeSeconds.toString(8).padStart(11, '0') + '\0', 136, 12, 'utf8');
  header.write('        ', 148, 8, 'utf8'); // checksum placeholder
  header.write('0', 156, 1, 'utf8'); // regular file
  header.write('ustar\0', 257, 6, 'utf8');
  header.write('00', 263, 2, 'utf8');

  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');
  return header;
}

function pad512(buffer) {
  const remainder = buffer.length % 512;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(512 - remainder, 0)]);
}

function buildArchive(entries) {
  const mtimeSeconds = Math.floor(Date.now() / 1000);
  const parts = [];
  for (const entry of entries) {
    parts.push(writeTarHeader(entry.archivePath, entry.size, entry.mode, mtimeSeconds));
    parts.push(pad512(fs.readFileSync(entry.file)));
  }
  parts.push(Buffer.alloc(1024, 0)); // two zero blocks terminate the archive
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 });
}

function main() {
  const executable = path.join(distDir, executableName);
  const mpvDir = path.join(distDir, 'player');
  if (!fs.existsSync(executable) && !fs.existsSync(mpvDir)) {
    throw new Error(`Nothing to pack: ${distDir} has no ${executableName} and no player/`);
  }

  const entries = [];
  if (fs.existsSync(executable)) collect(executable, executableName, entries);
  if (fs.existsSync(mpvDir)) collect(mpvDir, 'player', entries);
  if (!entries.length) throw new Error('Refusing to publish an empty TUI bundle');

  const archive = buildArchive(entries);
  fs.mkdirSync(outDir, { recursive: true });
  const archiveName = `${platformKey}.tar.gz`;
  const archivePath = path.join(outDir, archiveName);
  fs.writeFileSync(archivePath, archive);

  const digest = crypto.createHash('sha256').update(archive).digest('hex');
  const manifest = {
    version,
    generatedAt: new Date().toISOString(),
    platforms: {
      [platformKey]: {
        url: `${platformKey}.tar.gz`,
        sha256: digest,
        size: archive.length,
        files: entries.length,
      },
    },
  };
  fs.writeFileSync(path.join(outDir, `${platformKey}.json`), JSON.stringify(manifest, null, 2));
  fs.writeFileSync(path.join(outDir, `${platformKey}.sha256`), `${digest}  ${archiveName}\n`);

  console.log(
    'packed %s MB (%d files) -> %s',
    (archive.length / 1048576).toFixed(1),
    entries.length,
    path.relative(projectRoot, archivePath)
  );
  console.log('sha256 %s', digest);
}

main();
