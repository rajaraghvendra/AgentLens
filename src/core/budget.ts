import { promises as fs } from 'fs';
import { join } from 'path';
import config from '../config/env.js';

export interface Budget {
  daily?: number;
  monthly?: number;
  currency?: string;
  providers?: Record<string, number>;
}

const BUDGET_FILE = join(config.cacheDir, 'budget.json');

async function ensureDir() {
  await fs.mkdir(config.cacheDir, { recursive: true });
}

export async function getBudget(): Promise<Budget> {
  try {
    const txt = await fs.readFile(BUDGET_FILE, 'utf8');
    return JSON.parse(txt) as Budget;
  } catch (err) {
    // return defaults when not present or on error
    return { daily: 0, monthly: 0, currency: config.currency || 'USD', providers: {} };
  }
}

export async function setBudget(b: Budget): Promise<void> {
  await ensureDir();
  const existing = await getBudget();
  const merged = { 
    ...existing, 
    ...b,
    providers: { ...existing.providers, ...b.providers }
  };
  await fs.writeFile(BUDGET_FILE, JSON.stringify(merged, null, 2), 'utf8');
}

export async function resetBudget(): Promise<void> {
  await ensureDir();
  const defaultBudget = { daily: 0, monthly: 0, currency: config.currency || 'USD', providers: {} };
  await fs.writeFile(BUDGET_FILE, JSON.stringify(defaultBudget, null, 2), 'utf8');
}
