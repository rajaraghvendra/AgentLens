import { mkdtemp, rm } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { spawn } from 'child_process';
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

function run(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const normalized = normalizeCommand(command, args);
    const child = spawn(normalized.command, normalized.args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', rejectRun);
    child.on('close', (code) => {
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
    await run(npmCommand, ['install', '-g', packagePath, '--prefix', prefixDir]);

    const cli = getInstalledCliCommand(prefixDir);

    await run(cli.command, [...cli.args, 'report']);
    await run(cli.command, [...cli.args, 'tui', '--help']);

    const port = process.env['AGENTLENS_SMOKE_PORT'] || '3123';
    const dashboardCommand = normalizeCommand(cli.command, [...cli.args, 'dashboard', '--port', port]);
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
      dashboardOutput += chunk.toString();
    });
    dashboard.stderr?.on('data', (chunk) => {
      dashboardOutput += chunk.toString();
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

      dashboard.kill('SIGTERM');
      await new Promise((resolveClose) => {
        dashboard.once('close', () => resolveClose(undefined));
        setTimeout(() => {
          dashboard.kill('SIGKILL');
          resolveClose(undefined);
        }, 5000).unref();
      });
    }

    if (!dashboardOutput) {
      console.log('Dashboard smoke test passed without diagnostic output.');
    }
  } finally {
    await removeDirWithRetry(tempRoot);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
