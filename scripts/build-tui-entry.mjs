#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const source = path.join(projectRoot, 'scripts', 'yesplaymusic-tui.mjs');
const targetDir = path.join(projectRoot, 'out', 'tui');
const target = path.join(targetDir, 'yesplaymusic-tui.mjs');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
fs.chmodSync(target, 0o755);

console.log(`TUI entry written to ${path.relative(projectRoot, target)}`);
