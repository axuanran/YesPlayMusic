#!/usr/bin/env node
// Frees the fixed dev-server port before `electron-vite dev` starts.
//
// The renderer origin (http://127.0.0.1:<port>) decides which origin-scoped
// localStorage holds the login state and settings, so the port must never
// change silently. When the port is still occupied here it is almost always
// a leftover dev process; killing it keeps the origin stable. Anything that
// is not clearly a node/electron dev process is left alone and the dev
// server will fail loudly via strictPort instead.
import { execFileSync } from 'node:child_process';

const PORT = Number(process.env.DEV_SERVER_PORT || 20201);

const isWindows = process.platform === 'win32';

function pidsListeningOn(port) {
  try {
    if (isWindows) {
      const out = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
        encoding: 'utf8',
      });
      return [
        ...new Set(
          out
            .split(/\r?\n/)
            .filter(
              line =>
                (line.includes(`127.0.0.1:${port}`) ||
                  line.includes(`0.0.0.0:${port}`) ||
                  line.includes(`[::1]:${port}`)) &&
                /\b(LISTENING|LISTEN)\b/.test(line)
            )
            .map(line => Number(line.trim().split(/\s+/).pop()))
            .filter(pid => Number.isInteger(pid) && pid > 0)
        ),
      ];
    }
    const out = execFileSync('sh', [
      '-c',
      `command -v lsof >/dev/null && lsof -ti tcp:${port} || true`,
    ]).toString();
    return out
      .split(/\s+/)
      .filter(Boolean)
      .map(Number)
      .filter(pid => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function processLooksLikeDevServer(pid) {
  try {
    if (isWindows) {
      const out = execFileSync('wmic', [
        'process',
        'where',
        `ProcessId=${pid}`,
        'get',
        'Name,CommandLine',
        '/format:list',
      ]).toString();
      return /node|electron|vite/i.test(out);
    }
    const out = execFileSync('sh', ['-c', `ps -p ${pid} -o args=`]).toString();
    return /node|electron|vite/i.test(out);
  } catch {
    return false;
  }
}

function kill(pid) {
  try {
    if (isWindows) {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F']);
    } else {
      process.kill(pid, 'SIGTERM');
    }
    return true;
  } catch {
    return false;
  }
}

const pids = pidsListeningOn(PORT);
if (pids.length === 0) process.exit(0);

for (const pid of pids) {
  if (!processLooksLikeDevServer(pid)) {
    console.warn(
      `[free-dev-port] port ${PORT} is held by non-dev pid ${pid}; leaving it alone (dev server will fail via strictPort)`
    );
    continue;
  }
  console.log(
    `[free-dev-port] killing leftover dev process ${pid} on port ${PORT}`
  );
  kill(pid);
}
