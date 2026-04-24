import { spawn } from 'child_process';
import { resolve as pathResolve } from 'path';

const AGENTLENS_ROOT = '/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens';
const CLI_PATH = pathResolve(AGENTLENS_ROOT, 'src/apps/cli/index.ts');

const args = process.argv.slice(2);
const child = spawn('node', ['--import', 'tsx', CLI_PATH, ...args], {
  cwd: AGENTLENS_ROOT,
  stdio: 'inherit',
  env: { ...process.env, FORCE_COLOR: '0' }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});