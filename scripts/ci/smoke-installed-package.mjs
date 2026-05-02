import { mkdtemp, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { spawn, spawnSync } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

function normalizeCommand(command, args) {
  if (process.platform === 'win32' && command.toLowerCase().endsWith('.cmd')) {
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
    };
  }

  return { command, args };
}

function killProcessTree(child) {
  if (!child || child.killed) return;

  if (process.platform === 'win32') {
    if (child.pid) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    }
    return;
  }

  child.kill('SIGTERM');
}

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const { timeoutMs = 0, stream = false, ...spawnOptions } = options;
    const normalized = normalizeCommand(command, args);
    const child = spawn(normalized.command, normalized.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...spawnOptions,
    });

    let stdout = '';
    let stderr = '';
    let timeoutId = null;

    if (timeoutMs > 0) {
      timeoutId = setTimeout(() => {
        killProcessTree(child);
        rejectRun(
          new Error(
            `${normalized.command} ${normalized.args.join(' ')} timed out after ${timeoutMs}ms\n${stdout}\n${stderr}`,
          ),
        );
      }, timeoutMs);
      timeoutId.unref?.();
    }

    child.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      if (stream) process.stdout.write(text);
    });

    child.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      if (stream) process.stderr.write(text);
    });

    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      rejectRun(error);
    });
    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (code === 0) {
        resolveRun({ stdout, stderr });
        return;
      }

      rejectRun(new Error(`${normalized.command} ${normalized.args.join(' ')} failed with code ${code}\n${stdout}\n${stderr}`));
    });
  });
}

async function waitForHttp(url, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Server not ready yet.
    }

    if (index === 0 || (index + 1) % 5 === 0) {
      console.log(`[smoke] waiting for ${url} (${index + 1}/${attempts})`);
    }
    await delay(1000);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function removeDirWithRetry(targetPath, attempts = 5) {
  let lastError = null;

  for (let index = 0; index < attempts; index += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      return;
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }

  if (lastError) {
    throw lastError;
  }
}

function getNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function getInstalledCliCommand(prefixDir) {
  if (process.platform === 'win32') {
    return {
      command: resolve(prefixDir, 'agentlens.cmd'),
      args: [],
    };
  }

  return {
    command: resolve(prefixDir, 'bin', 'agentlens'),
    args: [],
  };
}

async function main() {
  const tarballPath = process.argv[2];
  if (!tarballPath) {
    throw new Error('Usage: node scripts/ci/smoke-installed-package.mjs <tarball>');
  }

  const packagePath = resolve(tarballPath);
  const tempRoot = await mkdtemp(join(tmpdir(), 'agentlens-smoke-'));
  const prefixDir = join(tempRoot, 'prefix');
  const npmCommand = getNpmCommand();

  try {
    console.log(`[smoke] installing ${packagePath}`);
    await run(npmCommand, ['install', '-g', packagePath, '--prefix', prefixDir, '--no-fund', '--no-audit'], {
      timeoutMs: 8 * 60 * 1000,
      stream: true,
    });

    const cli = getInstalledCliCommand(prefixDir);

    console.log('[smoke] running report');
    await run(cli.command, [...cli.args, 'report'], { timeoutMs: 60_000 });
    console.log('[smoke] running tui --help');
    await run(cli.command, [...cli.args, 'tui', '--help'], { timeoutMs: 60_000 });
    console.log('[smoke] running version');
    await run(cli.command, [...cli.args, '--version'], { timeoutMs: 60_000 });
    console.log('[smoke] running providers');
    await run(cli.command, [...cli.args, 'providers'], { timeoutMs: 60_000 });

    const port = process.env['AGENTLENS_SMOKE_PORT'] || '3123';
    console.log(`[smoke] starting dashboard on port ${port}`);
    const dashboardCommand = normalizeCommand(cli.command, [...cli.args, 'dashboard', '--port', port, '--no-open']);
    const dashboard = spawn(dashboardCommand.command, dashboardCommand.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });

    let dashboardOutput = '';
    let dashboardError = null;
    dashboard.stdout?.on('data', (chunk) => {
      const text = chunk.toString();
      dashboardOutput += text;
      process.stdout.write(text);
    });
    dashboard.stderr?.on('data', (chunk) => {
      const text = chunk.toString();
      dashboardOutput += text;
      process.stderr.write(text);
    });
    dashboard.on('error', (error) => {
      dashboardError = error;
    });

    try {
      await waitForHttp(`http://127.0.0.1:${port}/api/status`);
    } finally {
      if (dashboardError) {
        throw dashboardError;
      }

      console.log('[smoke] stopping dashboard');
      killProcessTree(dashboard);
      await new Promise((resolveClose) => {
        dashboard.once('close', () => resolveClose(undefined));
        setTimeout(() => {
          killProcessTree(dashboard);
          resolveClose(undefined);
        }, 5000).unref();
      });
    }

    if (!dashboardOutput) {
      console.log('Dashboard smoke test passed without diagnostic output.');
    }
  } finally {
    console.log('[smoke] cleaning up');
    await removeDirWithRetry(tempRoot);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
