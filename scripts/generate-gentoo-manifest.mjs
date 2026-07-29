#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const [versionArg, packageDirectoryArg, ...assetNames] = process.argv.slice(2);

if (!versionArg || !packageDirectoryArg || assetNames.length !== 2) {
  console.error(
    'Usage: node scripts/generate-gentoo-manifest.mjs <version> <package-directory> <amd64-asset> <arm64-asset>'
  );
  process.exit(1);
}

const releaseVersion = versionArg.replace(/^v/, '');
const baseUrl =
  `https://github.com/axuanran/YesPlayMusic/releases/download/` +
  `v${releaseVersion}`;

async function hashAsset(assetName) {
  const headers = { 'User-Agent': 'YesPlayMusic-Gentoo-Publisher' };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`${baseUrl}/${assetName}`, { headers });
  if (!response.ok || !response.body) {
    throw new Error(
      `Could not download ${assetName}: ${response.status} ${response.statusText}`
    );
  }

  const blake2b = crypto.createHash('blake2b512');
  const sha512 = crypto.createHash('sha512');
  let size = 0;

  for await (const chunk of Readable.fromWeb(response.body)) {
    size += chunk.length;
    blake2b.update(chunk);
    sha512.update(chunk);
  }

  return [
    'DIST',
    assetName,
    size,
    'BLAKE2B',
    blake2b.digest('hex').toUpperCase(),
    'SHA512',
    sha512.digest('hex').toUpperCase(),
  ].join(' ');
}

const manifestLines = await Promise.all([...assetNames].sort().map(hashAsset));
const packageDirectory = path.resolve(packageDirectoryArg);

fs.writeFileSync(
  path.join(packageDirectory, 'Manifest'),
  `${manifestLines.join('\n')}\n`
);

console.log(`Generated Manifest for ${assetNames.join(', ')}`);
