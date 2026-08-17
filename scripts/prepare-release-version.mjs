#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const writePackage = args.includes('--write-package');
const emitGitHubOutput = args.includes('--github-output');
const versionArg = args.find(arg => !arg.startsWith('--'));

if (!versionArg) {
  console.error(
    'Usage: node scripts/prepare-release-version.mjs <version-or-tag> [--write-package] [--github-output]'
  );
  process.exit(1);
}

const inputVersion = versionArg.replace(/^v/, '');

const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;

if (!semverPattern.test(inputVersion)) {
  console.error(`Unsupported release version: ${inputVersion}`);
  console.error(
    'Use versions such as 0.1.1-alpha.1, 0.1.1-beta.1, 0.1.1-rc.1, or 0.1.1'
  );
  process.exit(1);
}

const releaseVersion = inputVersion;
const appVersion = inputVersion;
const aurPkgver = inputVersion.replace('-', '_');
const isPrerelease = inputVersion.includes('-');
const pacmanAsset = `YesPlayMusic-${releaseVersion}.pacman`;
const androidAsset = `YesPlayMusic-android-${releaseVersion}-debug.apk`;

if (writePackage) {
  const packagePath = path.resolve('package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  packageJson.version = appVersion;
  packageJson.releaseVersion = releaseVersion;
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

const outputs = {
  release_version: releaseVersion,
  app_version: appVersion,
  aur_pkgver: aurPkgver,
  is_prerelease: String(isPrerelease),
  pacman_asset: pacmanAsset,
  android_asset: androidAsset,
};

if (emitGitHubOutput) {
  if (!process.env.GITHUB_OUTPUT) {
    console.error('GITHUB_OUTPUT is not available');
    process.exit(1);
  }

  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  );
} else {
  console.log(JSON.stringify(outputs, null, 2));
}
