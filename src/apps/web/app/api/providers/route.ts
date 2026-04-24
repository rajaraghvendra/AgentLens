import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolve as pathResolve } from 'path';

const AGENTLENS_ROOT = '/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens';
const CLI_PATH = pathResolve(AGENTLENS_ROOT, 'src/apps/cli/index.ts');
const TSX_PATH = pathResolve(AGENTLENS_ROOT, 'node_modules/.bin/tsx');

async function GET(): Promise<NextResponse> {
  return new Promise((resolve) => {
    const child = spawn(TSX_PATH, [CLI_PATH, 'providers'], {
      cwd: AGENTLENS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      if (code !== 0 || stderr) {
        resolve(NextResponse.json({ 
          providers: [
            { id: 'claude', name: 'Claude Code', available: true },
            { id: 'codex', name: 'Codex', available: true },
            { id: 'copilot', name: 'GitHub Copilot', available: true },
            { id: 'opencode', name: 'OpenCode', available: true },
          ]
        }));
      } else {
        try {
          resolve(NextResponse.json({ providers: JSON.parse(stdout) }));
        } catch {
          resolve(NextResponse.json({ 
            providers: [
              { id: 'claude', name: 'Claude Code', available: true },
              { id: 'codex', name: 'Codex', available: true },
              { id: 'copilot', name: 'GitHub Copilot', available: true },
              { id: 'opencode', name: 'OpenCode', available: true },
            ]
          }));
        }
      }
    });
  });
}

export { GET };
