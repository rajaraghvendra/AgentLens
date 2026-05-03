import type { ProviderFilter } from '../../../providers/index.js';

const VALID_PROVIDERS = new Set<ProviderFilter>(['all', 'claude', 'codex', 'cursor', 'opencode', 'pi', 'copilot', 'kiro', 'kiro-vscode', 'gemini']);

export function sanitizePeriod(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['today', 'week', 'month', 'all', '30days'].includes(normalized)) {
    return normalized;
  }
  if (/^\d{1,3}$/.test(normalized)) {
    return normalized;
  }
  return fallback;
}

export function sanitizeProvider(value: string | null): ProviderFilter | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLowerCase() as ProviderFilter;
  if (!VALID_PROVIDERS.has(normalized) || normalized === 'all') {
    return undefined;
  }
  return normalized;
}

export function parsePeriod(period: string): number {
  switch (period) {
    case 'today':
      return 1;
    case 'week':
      return 7;
    case 'month':
    case '30days':
      return 30;
    case 'all':
      return 180;
    default: {
      const parsed = parseInt(period, 10);
      return Number.isNaN(parsed) ? 7 : parsed;
    }
  }
}
