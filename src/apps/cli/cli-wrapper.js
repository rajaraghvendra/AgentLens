#!/usr/bin/env node
import('./src/apps/cli/index.js').catch(async () => {
  // Fallback to tsx if direct fails
  const { spawn } = await import('child_process');
  spawn('npx', ['tsx', './src/apps/cli/index.ts', ...process.argv.slice(2)], {
    cwd: '.',
    stdio: 'inherit'
  });
});