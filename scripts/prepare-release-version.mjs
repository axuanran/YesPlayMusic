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

const inputVersion = versionArg.replace(/^v/, '')

function toCompactReleaseVersion(version) {
  const compact = version.match(/^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$/i)
  if (compact) {
    return `${compact[1]}${compact[2].toLowerCase()}${compact[3]}`
  }

  const semverPrerelease = version.match(
    /^(\d+\.\d+\.\d+)-(alpha|beta|rc)\.(\d+)$/i
  )
  if (semverPrerelease) {
    const prerelease = {
      alpha: 'a',
      beta: 'b',
      rc: 'rc',
    }[semverPrerelease[2].toLowerCase()]

    return `${semverPrerelease[1]}${prerelease}${semverPrerelease[3]}`
  }

  if (/^\d+\.\d+\.\d+$/.test(version)) {
    return version
  }

  console.error(`Unsupported release version: ${version}`)
  console.error('Use versions such as 0.1.1a1, 0.1.1b1, 0.1.1rc1, or 0.1.1')
  process.exit(1)
}

function toApplicationVersion(version) {
  const compact = version.match(/^(\d+\.\d+\.\d+)(a|b|rc)(\d+)$/i)
  if (!compact) {
    return version
  }

  const prerelease = {
    a: 'alpha',
    b: 'beta',
    rc: 'rc',
  }[compact[2].toLowerCase()]

  return `${compact[1]}-${prerelease}.${compact[3]}`
}

const releaseVersion = toCompactReleaseVersion(inputVersion)
const appVersion = toApplicationVersion(releaseVersion)
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

if (!semverPattern.test(appVersion)) {
  console.error(`Normalized application version is not SemVer: ${appVersion}`)
  process.exit(1)
}

const isPrerelease = /(?:a|b|rc)\d+$/i.test(releaseVersion)
const pacmanAsset = `YesPlayMusic-${releaseVersion}.pacman`

if (writePackage) {
  const packagePath = path.resolve('package.json')
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  packageJson.version = appVersion
  packageJson.releaseVersion = releaseVersion
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
}

const outputs = {
  release_version: releaseVersion,
  app_version: appVersion,
  aur_pkgver: releaseVersion,
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
