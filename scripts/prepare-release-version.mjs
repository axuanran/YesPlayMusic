#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const writePackage = args.includes('--write-package')
const emitGitHubOutput = args.includes('--github-output')
const versionArg = args.find((arg) => !arg.startsWith('--'))

if (!versionArg) {
  console.error(
    'Usage: node scripts/prepare-release-version.mjs <version-or-tag> [--write-package] [--github-output]'
  )
  process.exit(1)
}

const releaseVersion = versionArg.replace(/^v/, '')

function normalizeLegacyVersion(version) {
  const compact = version.match(/^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$/i)
  if (compact) {
    const prerelease = {
      a: 'alpha',
      b: 'beta',
      rc: 'rc',
    }[compact[2].toLowerCase()]

    return `${compact[1]}-${prerelease}.${compact[3]}`
  }

  const joined = version.match(
    /^(\d+\.\d+\.\d+)-(alpha|beta|rc)(\d+)$/i
  )
  if (joined) {
    return `${joined[1]}-${joined[2].toLowerCase()}.${joined[3]}`
  }

  return version
}

const appVersion = normalizeLegacyVersion(releaseVersion)
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

if (!semverPattern.test(appVersion)) {
  console.error(`Invalid release version: ${releaseVersion}`)
  console.error(`Normalized application version is not SemVer: ${appVersion}`)
  process.exit(1)
}

const aurPkgver = releaseVersion.replaceAll('-', '_')
if (!/^[0-9A-Za-z._+]+$/.test(aurPkgver)) {
  console.error(`Version cannot be converted to a valid AUR pkgver: ${releaseVersion}`)
  process.exit(1)
}

const isPrerelease = appVersion.includes('-')
const pacmanAsset = `YesPlayMusic-${appVersion}.pacman`

if (writePackage) {
  const packagePath = path.resolve('package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  packageJson.version = appVersion
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

const outputs = {
  release_version: releaseVersion,
  app_version: appVersion,
  aur_pkgver: aurPkgver,
  is_prerelease: String(isPrerelease),
  pacman_asset: pacmanAsset,
}

if (emitGitHubOutput) {
  if (!process.env.GITHUB_OUTPUT) {
    console.error('GITHUB_OUTPUT is not available')
    process.exit(1)
  }

  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')}\n`
  )
} else {
  console.log(JSON.stringify(outputs, null, 2))
}
