// ─────────────────────────────────────────────────────────────
// AgentLens – Configuration & Environment
// ─────────────────────────────────────────────────────────────

import { homedir } from 'os';
import { join } from 'path';

export interface AppConfig {
  /** Directory for cached pricing, currency, and parsed session data */
  cacheDir: string;
  /** Default time window in days for reports */
  defaultPeriodDays: number;
  /** Target currency code (ISO 4217) for cost display */
  currency: string;
  /** Target tracking budget in USD. If 0, disabled. */
  budgetUSD: number;
  /** Max bash output length (chars) before flagging as waste */
  maxBashOutput: number;
  /** Max age of cached data in milliseconds (24h) */
  cacheMaxAgeMs: number;
  /** Claude projects directory */
  claudeProjectsDir: string;
  /** Codex directory */
  codexDir: string;
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? fallback : parsed;
}

function envFloat(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? fallback : parsed;
}

const home = homedir();

export const config: AppConfig = {
  cacheDir: env('AGENTLENS_CACHE_DIR', join(home, '.cache', 'agentlens')),
  defaultPeriodDays: envInt('AGENTLENS_PERIOD_DAYS', 7),
  currency: env('AGENTLENS_CURRENCY', 'USD'),
  maxBashOutput: envInt('AGENTLENS_MAX_BASH_OUTPUT', 5000),
  cacheMaxAgeMs: envInt('AGENTLENS_CACHE_MAX_AGE_MS', 24 * 60 * 60 * 1000),
  claudeProjectsDir: env('AGENTLENS_CLAUDE_DIR', join(home, '.claude', 'projects')),
  codexDir: env('AGENTLENS_CODEX_DIR', join(home, '.codex')),
  budgetUSD: envFloat('AGENTLENS_BUDGET_USD', 0),
};

export default config;
