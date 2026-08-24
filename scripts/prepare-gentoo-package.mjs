#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const positionalArgs = args.filter(arg => !arg.startsWith('--'));
const [versionArg, overlayArg] = positionalArgs;
const optionValue = name =>
  args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const pattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/;

if (!versionArg || !overlayArg || !pattern.test(versionArg.replace(/^v/, ''))) {
  console.error(
    'Usage: node scripts/prepare-gentoo-package.mjs <version> <overlay-directory>'
  );
  console.error(
    'Example: node scripts/prepare-gentoo-package.mjs 0.1.1-alpha.5 ../overlay'
  );
  process.exit(1);
}

const releaseVersion = versionArg.replace(/^v/, '');
const gentooVersion = releaseVersion.replace(
  /-(alpha|beta|rc)\.(\d+)$/,
  '_$1$2'
);
const amd64Asset =
  optionValue('amd64-asset') ||
  `XuMP-linux-${releaseVersion}-x64.tar.gz`;
const arm64Asset =
  optionValue('arm64-asset') ||
  `XuMP-linux-${releaseVersion}-arm64.tar.gz`;
const repositoryRoot = path.resolve(import.meta.dirname, '..');
const templateRoot = path.join(repositoryRoot, '.github', 'gentoo');
const packageRoot = path.resolve(overlayArg, 'media-sound', 'yesplaymusic-bin');
const filesRoot = path.join(packageRoot, 'files');

fs.mkdirSync(filesRoot, { recursive: true });

const template = fs.readFileSync(
  path.join(templateRoot, 'yesplaymusic-bin.ebuild'),
  'utf8'
);
fs.writeFileSync(
  path.join(packageRoot, `yesplaymusic-bin-${gentooVersion}.ebuild`),
  template
    .replaceAll('@RELEASE_VERSION@', releaseVersion)
    .replaceAll('@AMD64_ASSET@', amd64Asset)
    .replaceAll('@ARM64_ASSET@', arm64Asset)
);
fs.copyFileSync(
  path.join(templateRoot, 'metadata.xml'),
  path.join(packageRoot, 'metadata.xml')
);
fs.copyFileSync(
  path.join(templateRoot, 'files', 'yesplaymusic.desktop'),
  path.join(filesRoot, 'yesplaymusic.desktop')
);
fs.copyFileSync(
  path.join(repositoryRoot, 'images', 'logo.png'),
  path.join(filesRoot, 'yesplaymusic.png')
);

console.log(`Prepared media-sound/yesplaymusic-bin-${gentooVersion}`);
console.log(`Package directory: ${packageRoot}`);
console.log('Next: run `pkgdev manifest` in the package directory.');
