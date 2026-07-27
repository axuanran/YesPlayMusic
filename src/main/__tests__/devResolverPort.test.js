import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearDevResolverPort,
  configureDevResolverProxy,
  getDevResolverTarget,
  readDevResolverPort,
  writeDevResolverPort,
} from '@/main/devResolverPort';

describe('Electron development resolver port discovery', () => {
  let projectRoot;

  beforeEach(() => {
    projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'yesplaymusic-resolver-port-')
    );
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { force: true, recursive: true });
  });

  it('shares a live resolver port with the Vite process', () => {
    writeDevResolverPort(27237, { projectRoot, pid: 1234 });

    expect(
      readDevResolverPort({
        projectRoot,
        processRunning: pid => pid === 1234,
      })
    ).toBe(27237);
  });

  it('ignores a stale resolver process', () => {
    writeDevResolverPort(27237, { projectRoot, pid: 1234 });

    expect(
      readDevResolverPort({
        projectRoot,
        processRunning: () => false,
      })
    ).toBeNull();
  });

  it('only lets the owning process clear the port file', () => {
    writeDevResolverPort(27237, { projectRoot, pid: 1234 });

    expect(clearDevResolverPort({ projectRoot, pid: 9999 })).toBe(false);
    expect(clearDevResolverPort({ projectRoot, pid: 1234 })).toBe(true);
  });

  it('uses the default resolver target without a live port file', () => {
    expect(getDevResolverTarget(projectRoot)).toBe('http://127.0.0.1:27232');
  });

  it('routes each Vite request to the current resolver without rewriting it', () => {
    const originalWeb = vi.fn();
    const proxy = { web: originalWeb };
    const request = { url: '/resolver-api/api/admin/cookie' };
    const response = {};

    configureDevResolverProxy(proxy, {
      projectRoot,
      getTarget: () => 'http://127.0.0.1:27237',
    });
    proxy.web(request, response, { changeOrigin: true });

    expect(originalWeb).toHaveBeenCalledWith(request, response, {
      changeOrigin: true,
      target: 'http://127.0.0.1:27237',
    });
    expect(request.url).toBe('/resolver-api/api/admin/cookie');
  });
});
