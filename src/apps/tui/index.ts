#!/usr/bin/env node

import React from 'react';
import { render } from 'ink';
import { spawn } from 'child_process';
import { App } from './components/App';

let dashboardProcess: any = null;

async function checkDashboardRunning(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:3000/api/report?period=1', {
      method: 'HEAD',
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startDashboardIfNeeded(): Promise<void> {
  const isRunning = await checkDashboardRunning();
  
  if (!isRunning) {
    console.log('Starting AgentLens dashboard...');
    
    dashboardProcess = spawn('npm', ['run', 'dashboard'], {
      cwd: process.cwd(),
      stdio: 'ignore',
      detached: true,
      shell: true
    });
    
    // Wait for dashboard to start
    let retries = 0;
    while (retries < 15) {
      await new Promise(r => setTimeout(r, 1000));
      if (await checkDashboardRunning()) {
        console.log('Dashboard running at http://localhost:3000');
        return;
      }
      retries++;
    }
    console.log('Warning: Dashboard may not have started');
  } else {
    console.log('Using existing dashboard at http://localhost:3000');
  }
}

export function main() {
  render(React.createElement(App));
}

async function run() {
  await startDashboardIfNeeded();
  
  if (typeof process !== 'undefined' && (process.stdin as any)?.isTTY) {
    main();
  }
}

run();