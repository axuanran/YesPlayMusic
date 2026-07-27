import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_RESOLVER_PORT = 27232;

function getPortFilePath(projectRoot = process.cwd()) {
  return path.join(
    projectRoot,
    'node_modules',
    '.cache',
    'yesplaymusic',
    'resolver-port.json'
  );
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

export function writeDevResolverPort(
  port,
  { projectRoot = process.cwd(), pid = process.pid } = {}
) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError(`Invalid resolver port: ${port}`);
  }

  const portFilePath = getPortFilePath(projectRoot);
  fs.mkdirSync(path.dirname(portFilePath), { recursive: true });
  fs.writeFileSync(
    portFilePath,
    JSON.stringify({ pid, port, updatedAt: Date.now() }),
    'utf8'
  );
  return portFilePath;
}

export function readDevResolverPort({
  projectRoot = process.cwd(),
  processRunning = isProcessRunning,
} = {}) {
  try {
    const portFilePath = getPortFilePath(projectRoot);
    const data = JSON.parse(fs.readFileSync(portFilePath, 'utf8'));
    if (
      !Number.isInteger(data.port) ||
      data.port < 1 ||
      data.port > 65535 ||
      !Number.isInteger(data.pid) ||
      !processRunning(data.pid)
    ) {
      return null;
    }
    return data.port;
  } catch {
    return null;
  }
}

export function clearDevResolverPort({
  projectRoot = process.cwd(),
  pid = process.pid,
} = {}) {
  const portFilePath = getPortFilePath(projectRoot);
  try {
    const data = JSON.parse(fs.readFileSync(portFilePath, 'utf8'));
    if (data.pid !== pid) return false;
    fs.rmSync(portFilePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function getDevResolverTarget(projectRoot = process.cwd()) {
  const port = readDevResolverPort({ projectRoot }) ?? DEFAULT_RESOLVER_PORT;
  return `http://127.0.0.1:${port}`;
}

export function configureDevResolverProxy(
  proxy,
  { projectRoot = process.cwd(), getTarget = getDevResolverTarget } = {}
) {
  const proxyWeb = proxy.web;
  proxy.web = function proxyToCurrentResolver(req, res, options = {}) {
    return proxyWeb.call(this, req, res, {
      ...options,
      target: getTarget(projectRoot),
    });
  };
}
