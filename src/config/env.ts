// ─────────────────────────────────────────────────────────────
// AgentLens – Configuration & Environment
// ─────────────────────────────────────────────────────────────

import {
  getCacheDir,
  getClaudeProjectsDir,
  getCodexDataDir,
  getGeminiDataDir,
  getKiroDataDir,
  getKiroVSCodeAgentDir,
} from '../utils/paths.js';

export interface AppConfig {
  cacheDir: string;
  defaultPeriodDays: number;
  currency: string;
  budgetUSD: number;
  maxBashOutput: number;
  cacheMaxAgeMs: number;
  claudeProjectsDir: string;
  codexDir: string;
  kiroDir: string;
  kiroVSCodeDir: string;
  geminiDir: string;
  pricingOverridePath?: string;
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function envInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function envFloat(key: string, fallback: number): number {
  const val = process.env[key];
  if (val === undefined) return fallback;
  const parsed = parseFloat(val);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const config: AppConfig = {
  cacheDir: env('AGENTLENS_CACHE_DIR', getCacheDir('agentlens')),
  defaultPeriodDays: envInt('AGENTLENS_PERIOD_DAYS', 7),
  currency: env('AGENTLENS_CURRENCY', 'USD'),
  maxBashOutput: envInt('AGENTLENS_MAX_BASH_OUTPUT', 5000),
  cacheMaxAgeMs: envInt('AGENTLENS_CACHE_MAX_AGE_MS', 24 * 60 * 60 * 1000),
  claudeProjectsDir: env('AGENTLENS_CLAUDE_DIR', getClaudeProjectsDir()),
  codexDir: env('AGENTLENS_CODEX_DIR', getCodexDataDir()),
  kiroDir: env('AGENTLENS_KIRO_DIR', getKiroDataDir()),
  kiroVSCodeDir: env('AGENTLENS_KIRO_VSCODE_DIR', getKiroVSCodeAgentDir()),
  geminiDir: env('AGENTLENS_GEMINI_DIR', getGeminiDataDir()),
  budgetUSD: envFloat('AGENTLENS_BUDGET_USD', 0),
  pricingOverridePath: env('AGENTLENS_PRICING_OVERRIDE', ''),
};

export default config;
