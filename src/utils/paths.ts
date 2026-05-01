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

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

function splitPathSegments(targetPath: string): string[] {
  return targetPath.split(/[\\/]+/).filter(Boolean);
}

export function getPathLeaf(targetPath: string): string {
  const segments = splitPathSegments(targetPath);
  return segments[segments.length - 1] || '';
}

export function getClaudeProjectsDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(home, '.claude', 'projects');
  }
  
  if (isMac()) {
    return join(home, '.claude', 'projects');
  }
  
  return join(home, '.claude', 'projects');
}

export function getClaudeProjectsDirCandidates(): string[] {
  const home = homedir();
  const candidates = [join(home, '.claude', 'projects')];

  if (isWindows()) {
    candidates.push(join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'projects'));
  }

  return Array.from(new Set(candidates));
}

export function getCursorDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage');
  }
  
  if (isMac()) {
    return join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage');
  }
  
  return join(home, '.config', 'Cursor', 'User', 'globalStorage');
}

export function getCursorDataDirCandidates(): string[] {
  const home = homedir();
  return uniquePaths([
    join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Cursor', 'User', 'globalStorage'),
    join(home, '.config', 'Cursor', 'User', 'globalStorage'),
    // Legacy fallback paths
    join(home, '.cursor'),
    join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'Cursor'),
  ]);
}

export function getOpencodeDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'opencode');
  }
  
  // Respect XDG_DATA_HOME on Linux/macOS (matches opencode's own data dir resolution)
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    return join(xdgData, 'opencode');
  }
  
  return join(home, '.local', 'share', 'opencode');
}

export function getOpencodeDataDirCandidates(): string[] {
  const home = homedir();
  const candidates = [
    join(process.env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'opencode'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'opencode'),
    join(home, '.local', 'share', 'opencode'),
    join(home, '.opencode'),
  ];
  // Respect XDG_DATA_HOME (standard on Linux, sometimes used on macOS)
  const xdgData = process.env.XDG_DATA_HOME;
  if (xdgData) {
    candidates.unshift(join(xdgData, 'opencode'));
  }
  return uniquePaths(candidates);
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

export function getCopilotDataDirCandidates(): string[] {
  const home = homedir();
  return uniquePaths([
    join(home, '.copilot', 'session-state'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'copilot', 'session-state'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'GitHub Copilot', 'session-state'),
  ]);
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

export function getPiDataDirCandidates(): string[] {
  const home = homedir();
  return uniquePaths([
    join(home, '.pi', 'agent', 'sessions'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'pi', 'agent', 'sessions'),
  ]);
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

export function getCodexDataDirCandidates(): string[] {
  const home = homedir();
  return uniquePaths([
    join(home, '.codex', 'sessions'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'codex', 'sessions'),
  ]);
}

export function getOmpDataDir(): string {
  const home = homedir();
  
  if (isWindows()) {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'omp', 'agent', 'sessions');
  }
  
  if (isMac()) {
    return join(home, '.omp', 'agent', 'sessions');
  }
  
  return join(home, '.omp', 'agent', 'sessions');
}

export function getOmpDataDirCandidates(): string[] {
  const home = homedir();
  return uniquePaths([
    join(home, '.omp', 'agent', 'sessions'),
    join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'omp', 'agent', 'sessions'),
  ]);
}
