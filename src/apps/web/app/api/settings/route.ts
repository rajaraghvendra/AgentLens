import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { resolve as pathResolve } from 'path';

const AGENTLENS_ROOT = '/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens';
const CLI_PATH = pathResolve(AGENTLENS_ROOT, 'src/apps/cli/index.ts');
const TSX_PATH = pathResolve(AGENTLENS_ROOT, 'node_modules/.bin/tsx');

async function GET(): Promise<NextResponse> {
  return new Promise((resolve) => {
    const child = spawn(TSX_PATH, [CLI_PATH, 'budget:get'], {
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
      let budget = { daily: 0, monthly: 0, currency: 'USD', providers: {} };
      
      for (const line of lines) {
        if (line.includes('Daily:')) {
          const match = line.match(/Daily:\s*\$?([\d.]+)/);
          if (match) budget.daily = parseFloat(match[1]) || 0;
        }
        if (line.includes('Monthly:')) {
          const match = line.match(/Monthly:\s*\$?([\d.]+)/);
          if (match) budget.monthly = parseFloat(match[1]) || 0;
        }
        if (line.includes('Currency:')) {
          const match = line.match(/Currency:\s*(\w+)/);
          if (match) budget.currency = match[1];
        }
      }
      
      resolve(NextResponse.json(budget));
    });
  });
}

async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const { daily, monthly, currency, providers } = body;
  
  const args = ['budget:set'];
  if (daily !== undefined) args.push('--daily', daily.toString());
  if (monthly !== undefined) args.push('--monthly', monthly.toString());
  if (currency) args.push('--currency', currency);
  
  if (providers) {
    for (const [key, value] of Object.entries(providers)) {
      if (value && typeof value === 'number') {
        args.push(`--${key}`, value.toString());
      }
    }
  }

  return new Promise((resolve) => {
    const child = spawn(TSX_PATH, [CLI_PATH, ...args], {
      cwd: AGENTLENS_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' }
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });

    child.on('close', (code) => {
      resolve(NextResponse.json({ success: code === 0, message: stdout || stderr }));
    });
  });
}

export { GET, POST };