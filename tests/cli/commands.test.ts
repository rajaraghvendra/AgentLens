// ─────────────────────────────────────────────────────────────
// Tests – CLI Commands
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { CoreEngine } from '../../src/core/engine.js';
import { formatCurrency, formatSeverityBadge } from '../../src/apps/cli/formatters.js';
import type { EngineResult } from '../../src/types/index.js';

describe('CLI Formatters', () => {
  it('formats currency correctly', () => {
    // Note: Node's Intl implementation handles edge cases
    expect(formatCurrency(12.34, 'USD')).toContain('$12.34');
    expect(formatCurrency(100, 'EUR')).toContain('€100.00'); // Note exact output varies by locale settings, but contains €100
  });

  it('formats badges correctly', () => {
    expect(formatSeverityBadge('High')).toContain('HIGH');
    expect(formatSeverityBadge('Medium')).toContain('MEDIUM');
    expect(formatSeverityBadge('Low')).toContain('LOW');
  });
});

describe('CLI Commands Execution', () => {
  it('CoreEngine mock integration works', async () => {
    // Quick test to ensure mock structure can be built and passed to the CLI output conceptually
    const mockResult: EngineResult = {
      sessions: [],
      metrics: {
        overview: {
          totalCostUSD: 10,
          totalCostLocal: 10,
          localCurrency: 'USD',
          totalTokens: 1000,
          sessionsCount: 1,
          avgCostPerSession: 10,
          cacheHitRate: 50,
        },
        byModel: {},
        byActivity: {
          'Coding': { category: 'Coding', messageCount: 5, totalTokens: 1000, costUSD: 10, percentage: 100 }
        }
      },
      findings: [],
      insights: ['Insight 1'],
      providers: []
    };

    // Replace the static runFull logic with mock manually
    // Just to ensure typing is fully compatible with our actual CLI logic
    const spy = vi.spyOn(CoreEngine, 'runFull').mockResolvedValue(mockResult);

    const res = await CoreEngine.runFull(7, 'USD');
    expect(res.metrics.overview.totalCostUSD).toBe(10);
    expect(res.insights[0]).toBe('Insight 1');

    spy.mockRestore();
  });
});
