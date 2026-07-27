#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const electronDirectory = path.join(projectRoot, 'node_modules', 'electron');
const electronPackagePath = path.join(electronDirectory, 'package.json');
const installScriptPath = path.join(electronDirectory, 'install.js');
const distPath = path.join(electronDirectory, 'dist');
const pathFilePath = path.join(electronDirectory, 'path.txt');

const log = message => console.log(`[electron-repair] ${message}`);

function fail(message) {
  console.error(`[electron-repair] ${message}`);
  process.exit(1);
}

function readElectronPackage() {
  if (
    !fs.existsSync(electronPackagePath) ||
    !fs.existsSync(installScriptPath)
  ) {
    fail(
      'Electron npm package is missing. Run "yarn install", then retry ' +
        '"yarn electron:repair".'
    );
  }

  const electronPackage = JSON.parse(
    fs.readFileSync(electronPackagePath, 'utf8')
  );
  if (electronPackage.name !== 'electron' || !electronPackage.version) {
    fail('node_modules/electron is not a valid Electron package.');
  }
  return electronPackage;
}

function getExecutablePath() {
  if (!fs.existsSync(pathFilePath)) return null;
  const relativePath = fs.readFileSync(pathFilePath, 'utf8').trim();
  if (!relativePath) return null;

  const executablePath = path.resolve(distPath, relativePath);
  const relativeToDist = path.relative(distPath, executablePath);
  if (relativeToDist.startsWith('..') || path.isAbsolute(relativeToDist)) {
    fail('Electron path.txt points outside its dist directory.');
  }
  return executablePath;
}

function getInstalledVersion() {
  const versionPath = path.join(distPath, 'version');
  if (!fs.existsSync(versionPath)) return null;
  return fs.readFileSync(versionPath, 'utf8').trim().replace(/^v/, '');
}

function isInstallationValid(expectedVersion) {
  const executablePath = getExecutablePath();
  return (
    executablePath !== null &&
    fs.existsSync(executablePath) &&
    getInstalledVersion() === expectedVersion
  );
}

function runInstaller({ forceDownload = false } = {}) {
  log(
    forceDownload
      ? 'Downloading a fresh Electron runtime without the artifact cache...'
      : 'Installing the missing Electron runtime...'
  );
  const result = spawnSync(process.execPath, [installScriptPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      ...(forceDownload ? { force_no_cache: 'true' } : {}),
    },
    stdio: 'inherit',
  });
  return result.status === 0;
}

function removeIncompleteRuntime() {
  const expectedDirectory = path.resolve(
    projectRoot,
    'node_modules',
    'electron'
  );
  if (path.resolve(electronDirectory) !== expectedDirectory) {
    fail('Refusing to clean an Electron directory outside this project.');
  }

  log('Removing only the incomplete Electron runtime...');
  fs.rmSync(distPath, { force: true, recursive: true });
  fs.rmSync(pathFilePath, { force: true });
}

const electronPackage = readElectronPackage();
const expectedVersion = electronPackage.version;

if (isInstallationValid(expectedVersion)) {
  log(`Electron ${expectedVersion} is already installed.`);
  process.exit(0);
}

if (!runInstaller() || !isInstallationValid(expectedVersion)) {
  removeIncompleteRuntime();
  if (
    !runInstaller({ forceDownload: true }) ||
    !isInstallationValid(expectedVersion)
  ) {
    fail(
      'Repair failed. Check network/proxy access to the Electron download ' +
        'mirror, antivirus quarantine, and write permissions for node_modules.'
    );
  }
}

const executablePath = getExecutablePath();
log(`Electron ${expectedVersion} repaired successfully.`);
log(`Executable: ${executablePath}`);
