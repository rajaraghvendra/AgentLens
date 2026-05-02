import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as paths from '../../src/utils/paths.js';

const normalize = (p: string) => p.replace(/\\/g, '/');

describe('paths – Cross-platform resolution', () => {
  const originalPlatform = process.platform;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform
    });
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('getCacheDir uses LOCALAPPDATA on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    
    const dir = normalize(paths.getCacheDir('agentlens'));
    expect(dir).toContain('AppData/Local');
    expect(dir).toContain('agentlens');
    expect(dir).toContain('cache');
  });

  it('getCacheDir uses Library/Caches on macOS', () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    
    const dir = normalize(paths.getCacheDir('agentlens'));
    expect(dir).toContain('Library/Caches');
    expect(dir).toContain('agentlens');
  });

  it('getCacheDir respects XDG_CACHE_HOME on Linux', () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_CACHE_HOME = '/custom/cache/dir';
    
    const dir = normalize(paths.getCacheDir('agentlens'));
    expect(dir).toBe('/custom/cache/dir/agentlens');
  });

  it('getCursorDataDir uses APPDATA on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.APPDATA = 'C:\\Users\\test\\AppData\\Roaming';
    
    const dir = normalize(paths.getCursorDataDir());
    expect(dir).toContain('AppData/Roaming');
    expect(dir).toContain('Cursor');
  });

  it('getOpencodeDataDir respects LOCALAPPDATA on Windows', () => {
    Object.defineProperty(process, 'platform', { value: 'win32' });
    process.env.LOCALAPPDATA = 'C:\\Users\\test\\AppData\\Local';
    
    const dir = normalize(paths.getOpencodeDataDir());
    expect(dir).toContain('AppData/Local');
    expect(dir).toContain('opencode');
  });
});
