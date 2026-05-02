import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, accessSync, readdirSync, statSync, readFileSync } from 'fs';
import * as path from 'path';
import { CodexProvider } from '../../src/providers/codex.js';
import { PiProvider } from '../../src/providers/pi.js';

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  accessSync: vi.fn(),
  readdirSync: vi.fn(),
  statSync: vi.fn(),
  readFileSync: vi.fn(),
  constants: { R_OK: 4 },
}));

vi.mock('../../src/utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils/paths.js')>();
  return {
    ...actual,
    getCodexDataDir: () => '/mock/codex/dir',
    getPiDataDir: () => '/mock/pi/dir',
    getPiDataDirCandidates: () => [],
    getOmpDataDirCandidates: () => [],
  };
});

describe('Provider Discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('CodexProvider isAvailable returns true when directory exists', () => {
    vi.mocked(existsSync).mockImplementation((p: any) => p === '/mock/codex/dir');
    const provider = new CodexProvider();
    expect(provider.isAvailable()).toBe(true);
  });

  it('CodexProvider isAvailable returns false when directory missing', () => {
    vi.mocked(existsSync).mockImplementation(() => false);
    const provider = new CodexProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('PiProvider discovers sessions from filesystem', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => p === '/mock/pi/dir');
    vi.mocked(accessSync).mockImplementation((p: any) => {
      if (p !== '/mock/pi/dir') throw new Error('Not found');
    });
    vi.mocked(readdirSync).mockImplementation((p: any) => {
      if (p === '/mock/pi/dir') return ['projectA'] as any;
      if (p === path.join('/mock/pi/dir', 'projectA')) return ['session-123.jsonl', 'invalid.txt', 'session-456.jsonl'] as any;
      return [];
    });
    vi.mocked(statSync).mockImplementation((p: any) => ({
      isFile: () => p.toString().endsWith('.jsonl'),
      isDirectory: () => p.toString().endsWith('projectA'),
      mtimeMs: 1700000000000,
    } as any));
    vi.mocked(readFileSync).mockImplementation((p: any) => '{"type":"session"}');

    const provider = new PiProvider();
    const sessions = await provider.discoverSessions();
    expect(sessions.length).toBe(2);
    expect(sessions).toContain(path.join('/mock/pi/dir', 'projectA', 'session-123.jsonl'));
    expect(sessions).toContain(path.join('/mock/pi/dir', 'projectA', 'session-456.jsonl'));
  });

  it('PiProvider respects dateRange filtering', async () => {
    vi.mocked(existsSync).mockImplementation((p: any) => p === '/mock/pi/dir');
    vi.mocked(accessSync).mockImplementation((p: any) => {
      if (p !== '/mock/pi/dir') throw new Error('Not found');
    });
    vi.mocked(readdirSync).mockImplementation((p: any) => {
      if (p === '/mock/pi/dir') return ['projectB'] as any;
      if (p === path.join('/mock/pi/dir', 'projectB')) return ['session-old.jsonl', 'session-new.jsonl'] as any;
      return [];
    });
    vi.mocked(statSync).mockImplementation((p: any) => {
      const isNew = p.toString().includes('session-new');
      return {
        isFile: () => true,
        isDirectory: () => p.toString().endsWith('projectB'),
        mtimeMs: isNew ? 2000 : 500, // old = 500ms, new = 2000ms
      } as any;
    });
    vi.mocked(readFileSync).mockImplementation((p: any) => '{"type":"session"}');

    const provider = new PiProvider();
    const sessions = await provider.discoverSessions({ from: 1000, to: 3000 });
    expect(sessions.length).toBe(1);
    expect(sessions[0]).toContain('session-new.jsonl');
  });
});
