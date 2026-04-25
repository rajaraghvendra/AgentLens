// ─────────────────────────────────────────────────────────────
// AgentLens – Cross-Platform Path Utilities
// ─────────────────────────────────────────────────────────────

import { homedir, platform } from 'os';
import { join } from 'path';

export function getHomeDir(): string {
  return homedir();
}

export function getPlatform(): string {
  return platform();
}

export function isWindows(): boolean {
  return platform() === 'win32';
}

export function isMac(): boolean {
  return platform() === 'darwin';
}

export function isLinux(): boolean {
  return platform() === 'linux';
}

export function getDataDir(appName: string): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), appName);
  }
  
  if (isMac()) {
    return join(home, 'Library', 'Application Support', appName);
  }
  
  // Linux
  return join(home, '.config', appName);
}

export function getCacheDir(appName: string): string {
  const home = homedir();
  
  // All platforms: use .cache for POSIX compatibility
  return join(home, '.cache', appName);
}

export function getClaudeProjectsDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'projects');
  }
  
  if (isMac()) {
    return join(home, '.claude', 'projects');
  }
  
  return join(home, '.claude', 'projects');
}

export function getCursorDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Cursor');
  }
  
  if (isMac()) {
    // macOS: .cursor in home is the main data location
    return join(home, '.cursor');
  }
  
  return join(home, '.cursor');
}

export function getOpencodeDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'opencode');
  }
  
  if (isMac()) {
    return join(home, '.local', 'share', 'opencode');
  }
  
  return join(home, '.local', 'share', 'opencode');
}

export function getCopilotDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'copilot', 'session-state');
  }
  
  if (isMac()) {
    return join(home, '.copilot', 'session-state');
  }
  
  return join(home, '.copilot', 'session-state');
}

export function getPiDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'pi', 'agent', 'sessions');
  }
  
  if (isMac()) {
    return join(home, '.pi', 'agent', 'sessions');
  }
  
  return join(home, '.pi', 'agent', 'sessions');
}

export function getCodexDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'codex', 'sessions');
  }
  
  if (isMac()) {
    return join(home, '.codex', 'sessions');
  }
  
  return join(home, '.codex', 'sessions');
}