// ─────────────────────────────────────────────────────────────
// AgentLens – Configuration & Environment
// ─────────────────────────────────────────────────────────────

import { homedir } from 'os';
import { join } from 'path';
import { 
  getCacheDir, 
  getClaudeProjectsDir, 
  getCodexDataDir, 
  getDataDir,
  isWindows 
} from '../utils/paths.js';

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
  /** Path to custom pricing override JSON file */
  pricingOverridePath?: string;
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

export const config: AppConfig = {
  cacheDir: env('AGENTLENS_CACHE_DIR', getCacheDir('agentlens')),
  defaultPeriodDays: envInt('AGENTLENS_PERIOD_DAYS', 7),
  currency: env('AGENTLENS_CURRENCY', 'USD'),
  maxBashOutput: envInt('AGENTLENS_MAX_BASH_OUTPUT', 5000),
  cacheMaxAgeMs: envInt('AGENTLENS_CACHE_MAX_AGE_MS', 24 * 60 * 60 * 1000),
  claudeProjectsDir: env('AGENTLENS_CLAUDE_DIR', getClaudeProjectsDir()),
  codexDir: env('AGENTLENS_CODEX_DIR', getCodexDataDir()),
  budgetUSD: envFloat('AGENTLENS_BUDGET_USD', 0),
  pricingOverridePath: env('AGENTLENS_PRICING_OVERRIDE', ''),
};

export default config;
