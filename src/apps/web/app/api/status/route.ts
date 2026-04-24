import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolve as pathResolve } from 'path';

const AGENTLENS_ROOT = '/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens';
const CLI_PATH = pathResolve(AGENTLENS_ROOT, 'src/apps/cli/index.ts');
const TSX_PATH = pathResolve(AGENTLENS_ROOT, 'node_modules/.bin/tsx');

async function GET(request: Request): Promise<NextResponse> {
  return new Promise((resolve) => {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today';
    
    const child = spawn(TSX_PATH, [CLI_PATH, 'status', '-p', period], {
      cwd: AGENTLENS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });

    child.on('close', () => {
      const lines = stdout.trim().split('\n');
      resolve(NextResponse.json({
        today: lines[0]?.replace('Today: ', '').replace('$', '') || '',
        period: lines[1]?.replace(`${period}: `, '') || ''
      }));
    });
  });
}

export { GET };
