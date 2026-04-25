import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { runAgentLensCli, sanitizePeriod, sanitizeProvider } from '../../src/apps/web/lib/agentlens-cli.js';

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => path.includes('dist/apps/cli/index.js')),
  readFileSync: vi.fn(() => JSON.stringify({ name: '@rajaraghvendra/agentlens' })),
}));

class MockStream extends EventEmitter {}

function createMockChild() {
  return {
    stdout: new MockStream(),
    stderr: new MockStream(),
    on: vi.fn(function (event: string, cb: (...args: any[]) => void) {
      (this as any)[`_${event}`] = cb;
      return this;
    }),
    kill: vi.fn(),
    emitClose(code: number) {
      (this as any)._close?.(code);
    },
  };
}

const spawnMock = vi.fn();
vi.mock('child_process', () => ({
  spawn: (...args: any[]) => spawnMock(...args),
}));

describe('agentlens-cli helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.AGENTLENS_ROOT;
  });

  it('returns stdout for successful runs', async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const promise = runAgentLensCli(['status', '--format', 'json']);
    child.stdout.emit('data', '{"ok":true}');
    child.emitClose(0);

    await expect(promise).resolves.toBe('{"ok":true}');
  });

  it('rejects for non-zero exit code', async () => {
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const promise = runAgentLensCli(['report', '--format', 'json']);
    child.stderr.emit('data', 'bad things happened');
    child.emitClose(1);

    await expect(promise).rejects.toThrow('bad things happened');
  });

  it('kills process and rejects on timeout', async () => {
    vi.useFakeTimers();
    const child = createMockChild();
    spawnMock.mockReturnValue(child);

    const promise = runAgentLensCli(['report'], 10);
    vi.advanceTimersByTime(11);
    child.emitClose(0);

    await expect(promise).rejects.toThrow('timed out');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    vi.useRealTimers();
  });

  it('sanitizes period and provider parameters', () => {
    expect(sanitizePeriod('week', '7')).toBe('week');
    expect(sanitizePeriod('9999', '7')).toBe('7');
    expect(sanitizePeriod('abc', 'today')).toBe('today');

    expect(sanitizeProvider('cursor')).toBe('cursor');
    expect(sanitizeProvider('all')).toBeUndefined();
    expect(sanitizeProvider('rm -rf /')).toBeUndefined();
  });
});
