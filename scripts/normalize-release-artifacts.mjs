#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const [directoryArg, appVersion, releaseVersion] = process.argv.slice(2)

if (!directoryArg || !appVersion || !releaseVersion) {
  console.error(
    'Usage: node scripts/normalize-release-artifacts.mjs <directory> <app-version> <release-version>'
  )
  process.exit(1)
}

const directory = path.resolve(directoryArg)
if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
  console.error(`Artifact directory does not exist: ${directory}`)
  process.exit(1)
}

const textExtensions = new Set([
  '.yml',
  '.yaml',
  '.json',
  '.blockmap',
  '.txt',
  '.xml',
])

function walkFiles(currentDirectory) {
  return fs.readdirSync(currentDirectory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(currentDirectory, entry.name)
    return entry.isDirectory() ? walkFiles(entryPath) : [entryPath]
  })
}

const files = walkFiles(directory)

for (const filePath of files) {
  if (!textExtensions.has(path.extname(filePath).toLowerCase())) {
    continue
  }

  const original = fs.readFileSync(filePath, 'utf8')
  const normalized = original.split(appVersion).join(releaseVersion)
  if (normalized !== original) {
    fs.writeFileSync(filePath, normalized)
    console.log(`Updated metadata: ${path.relative(directory, filePath)}`)
  }
}

for (const filePath of files.sort((a, b) => b.length - a.length)) {
  const fileName = path.basename(filePath)
  if (!fileName.includes(appVersion)) {
    continue
  }

  const targetPath = path.join(
    path.dirname(filePath),
    fileName.split(appVersion).join(releaseVersion)
  )

  if (fs.existsSync(targetPath)) {
    console.error(`Cannot rename artifact because target exists: ${targetPath}`)
    process.exit(1)
  }

  fs.renameSync(filePath, targetPath)
  console.log(
    `Renamed artifact: ${path.relative(directory, filePath)} -> ${path.relative(directory, targetPath)}`
  )
}

const staleFiles = walkFiles(directory).filter((filePath) =>
  path.basename(filePath).includes(appVersion)
)

if (staleFiles.length > 0) {
  console.error('Artifacts still contain the internal application version:')
  for (const filePath of staleFiles) {
    console.error(path.relative(directory, filePath))
  }
  process.exit(1)
}
