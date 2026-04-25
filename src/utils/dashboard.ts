import { spawn } from 'child_process';
import { get } from 'http';

export async function isDashboardRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = get('http://localhost:3000/api/status', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

export async function startDashboardIfNeeded(): Promise<boolean> {
  const running = await isDashboardRunning();
  
  if (running) {
    console.log('Dashboard already running at http://localhost:3000');
    return true;
  }
  
  console.log('Starting AgentLens dashboard at http://localhost:3000...');
  
  // Start dashboard in background
  const child = spawn('npm', ['run', 'dashboard'], {
    cwd: process.cwd(),
    stdio: 'inherit',
    detached: true,
    shell: true
  });
  
  child.unref();
  
  // Wait for it to start
  let retries = 0;
  while (retries < 15) {
    await new Promise(r => setTimeout(r, 1000));
    if (await isDashboardRunning()) {
      console.log('Dashboard started!');
      return true;
    }
    retries++;
  }
  
  console.log('Warning: Dashboard may not have started. Run "npm run dashboard" manually.');
  return false;
}