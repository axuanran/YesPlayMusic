import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { extractTarGz } from '../tarExtract.js';

// Minimal tar writer, mirrors the one in scripts/pack-tui-bundle.mjs so the tests
// stay independent from CI tooling.
function tarHeader(name, size, mode = 0o644, type = '0') {
  const header = Buffer.alloc(512, 0);
  header.write(name, 0, 100, 'utf8');
  header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100, 8, 'utf8');
  header.write('0000000\0', 108, 8, 'utf8');
  header.write('0000000\0', 116, 8, 'utf8');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12, 'utf8');
  header.write(
    `${Math.floor(Date.now() / 1000)
      .toString(8)
      .padStart(11, '0')}\0`,
    136,
    12,
    'utf8'
  );
  header.write('        ', 148, 8, 'utf8');
  header.write(type, 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  header.write('00', 263, 2, 'utf8');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
  return header;
}

function buildTarBytes(entries) {
  const blocks = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content || '', 'utf8');
    if (entry.type === '5') {
      blocks.push(tarHeader(entry.name, 0, 0o755, '5'));
      continue;
    }
    blocks.push(tarHeader(entry.name, content.length, entry.mode || 0o644));
    const padded = Buffer.alloc(Math.ceil(content.length / 512) * 512, 0);
    content.copy(padded);
    blocks.push(padded);
  }
  blocks.push(Buffer.alloc(1024, 0));
  return Buffer.concat(blocks);
}

function buildArchive(entries) {
  return zlib.gzipSync(buildTarBytes(entries));
}

let tempDirs = [];
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xump-tar-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeArchive(entries) {
  const dir = makeTempDir();
  const archive = path.join(dir, 'bundle.tar.gz');
  fs.writeFileSync(archive, buildArchive(entries));
  return archive;
}

afterEach(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe('extractTarGz', () => {
  it('writes files and nested directories', () => {
    const archive = writeArchive([
      { name: 'yesplaymusic-tui.exe', content: 'binary' },
      { name: 'player/mpv/mpv.exe', content: 'mpv' },
    ]);
    const target = makeTempDir();

    expect(extractTarGz(archive, target)).toBe(2);
    expect(
      fs.readFileSync(path.join(target, 'yesplaymusic-tui.exe'), 'utf8')
    ).toBe('binary');
    expect(
      fs.readFileSync(path.join(target, 'player/mpv/mpv.exe'), 'utf8')
    ).toBe('mpv');
  });

  it('skips mpv docs and installers', () => {
    const archive = writeArchive([
      { name: 'player/mpv/mpv.exe', content: 'mpv' },
      { name: 'player/mpv/doc/manual.pdf', content: 'pdf' },
      { name: 'player/mpv/installer/mpv-install.bat', content: 'bat' },
      { name: 'player/mpv/README.txt', content: 'kept' },
    ]);
    const target = makeTempDir();

    expect(extractTarGz(archive, target)).toBe(2);
    expect(fs.existsSync(path.join(target, 'player/mpv/doc'))).toBe(false);
    expect(fs.existsSync(path.join(target, 'player/mpv/installer'))).toBe(
      false
    );
    expect(fs.existsSync(path.join(target, 'player/mpv/README.txt'))).toBe(
      true
    );
  });

  it('rejects path traversal entries', () => {
    const archive = writeArchive([{ name: '../evil.txt', content: 'nope' }]);
    const target = makeTempDir();

    expect(() => extractTarGz(archive, target)).toThrow(/unsafe path/);
    expect(fs.existsSync(path.join(target, '..', 'evil.txt'))).toBe(false);
  });

  it('handles an archive that ends without an end-of-archive marker', () => {
    const dir = makeTempDir();
    const full = buildTarBytes([{ name: 'a.txt', content: 'a' }]);
    const withoutTrailer = full.subarray(0, full.length - 1024);
    const archive = path.join(dir, 'truncated.tar.gz');
    fs.writeFileSync(archive, zlib.gzipSync(withoutTrailer));
    const target = makeTempDir();

    expect(extractTarGz(archive, target)).toBe(1);
  });
});
