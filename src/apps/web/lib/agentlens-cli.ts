import { existsSync, readFileSync } from 'fs';
import { spawn } from 'child_process';
import { dirname, join, resolve as pathResolve } from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_TIMEOUT_MS = 20_000;
const VALID_PROVIDERS = new Set(['all', 'claude', 'codex', 'cursor', 'opencode', 'pi', 'copilot']);

function isAgentLensPackageJson(path: string): boolean {
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name === '@rajaraghvendra/agentlens';
  } catch {
    return false;
  }
}

function findRepoRoot(startDir: string): string {
  let current = startDir;

  for (let i = 0; i < 8; i++) {
    const pkg = join(current, 'package.json');
    if (existsSync(pkg) && isAgentLensPackageJson(pkg)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return process.cwd();
}

export function getAgentLensRoot(): string {
  if (process.env.AGENTLENS_ROOT && existsSync(process.env.AGENTLENS_ROOT)) {
    return process.env.AGENTLENS_ROOT;
  }

  const currentFileDir = dirname(fileURLToPath(import.meta.url));
  return findRepoRoot(currentFileDir);
}

function getCliProgram(root: string): { cmd: string; args: string[] } {
  const distCli = pathResolve(root, 'dist/apps/cli/index.js');
  if (existsSync(distCli)) {
    return { cmd: 'node', args: [distCli] };
  }

  const srcCli = pathResolve(root, 'src/apps/cli/index.ts');
  return { cmd: 'node', args: ['--import', 'tsx', srcCli] };
}

export function sanitizePeriod(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['today', 'week', 'month', 'all', '30days'].includes(normalized)) {
    return normalized;
  }
  if (/^\d{1,3}$/.test(normalized)) {
    return normalized;
  }
  return fallback;
}

export function sanitizeProvider(value: string | null): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!VALID_PROVIDERS.has(normalized) || normalized === 'all') {
    return undefined;
  }
  return normalized;
}

export async function runAgentLensCli(args: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  const root = getAgentLensRoot();
  const program = getCliProgram(root);
  const cliArgs = [...program.args, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn(program.cmd, cliArgs, {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout?.on('data', (data) => {
      stdout += String(data);
    });
    child.stderr?.on('data', (data) => {
      stderr += String(data);
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new Error('AgentLens CLI timed out'));
        return;
      }
      if (code !== 0) {
        reject(new Error(stderr.trim() || `AgentLens CLI exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export async function runAgentLensCliJson<T>(args: string[], timeoutMs?: number): Promise<T> {
  const stdout = await runAgentLensCli(args, timeoutMs);
  return JSON.parse(stdout) as T;
}
