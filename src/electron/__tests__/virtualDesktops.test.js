import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import {
  buildPinnerCommand,
  setWindowPinnedOnAllDesktops,
} from '../virtualDesktops.js';

const fakeSpawn = (behavior = {}) => {
  const calls = [];
  const spawnCommand = vi.fn((file, args, options) => {
    calls.push({ file, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    const finish = () => {
      if (behavior.stdout) child.stdout.emit('data', behavior.stdout);
      if (behavior.stderr) child.stderr.emit('data', behavior.stderr);
      child.emit('close', behavior.code ?? 0);
    };
    if (behavior.throwOnSpawn) {
      queueMicrotask(() => child.emit('error', new Error('spawn failed')));
    } else if (behavior.neverClose) {
      // leave the child hanging so the timeout path fires
    } else {
      queueMicrotask(finish);
    }
    return child;
  });
  return { spawnCommand, calls };
};

describe('virtual desktop pin helper', () => {
  it('builds a pin command carrying the hwnd', () => {
    expect(buildPinnerCommand({ hwnd: 1234, pinned: true })).toContain(
      'PinWindow([IntPtr]::new(1234))'
    );
    expect(buildPinnerCommand({ hwnd: 1234, pinned: false })).toContain(
      'UnpinWindow([IntPtr]::new(1234))'
    );
  });

  it('spawns hidden PowerShell with the COM script and resolves true on success', async () => {
    const { spawnCommand, calls } = fakeSpawn({ code: 0 });

    const result = await setWindowPinnedOnAllDesktops({
      hwnd: 1234,
      pinned: true,
      spawnCommand,
    });

    expect(result).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe('powershell.exe');
    expect(calls[0].options).toEqual({ windowsHide: true });
    const command = calls[0].args.at(-1);
    expect(command).toContain('PinWindow');
    expect(calls[0].args).toContain('-NonInteractive');
  });

  it('resolves false without spawning for an invalid hwnd', async () => {
    const { spawnCommand, calls } = fakeSpawn();

    await expect(
      setWindowPinnedOnAllDesktops({ hwnd: 0, pinned: true, spawnCommand })
    ).resolves.toBe(false);
    await expect(
      setWindowPinnedOnAllDesktops({
        hwnd: Number.NaN,
        pinned: true,
        spawnCommand,
      })
    ).resolves.toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('resolves false when PowerShell exits non-zero', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { spawnCommand } = fakeSpawn({ code: 1, stderr: 'COM error' });
      await expect(
        setWindowPinnedOnAllDesktops({
          hwnd: 1234,
          pinned: false,
          spawnCommand,
        })
      ).resolves.toBe(false);
      expect(warn).toHaveBeenCalledOnce();
    } finally {
      warn.mockRestore();
    }
  });

  it('resolves false when the spawn itself fails', async () => {
    const { spawnCommand } = fakeSpawn({ throwOnSpawn: true });
    await expect(
      setWindowPinnedOnAllDesktops({ hwnd: 1234, pinned: true, spawnCommand })
    ).resolves.toBe(false);
  });

  it('kills and resolves false when the helper times out', async () => {
    vi.useFakeTimers();
    try {
      const { spawnCommand, calls } = fakeSpawn({ neverClose: true });
      const pending = setWindowPinnedOnAllDesktops({
        hwnd: 1234,
        pinned: true,
        spawnCommand,
        timeoutMs: 100,
      });
      await vi.advanceTimersByTimeAsync(150);
      await expect(pending).resolves.toBe(false);
      expect(calls[0] && calls[0].options).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
