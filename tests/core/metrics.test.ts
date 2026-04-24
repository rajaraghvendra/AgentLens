// ─────────────────────────────────────────────────────────────
// Tests – Metrics Engine
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, beforeAll } from 'vitest';
import { computeMetrics } from '../../src/core/metrics/index.js';
import { PricingEngine } from '../../src/core/pricing/calculator.js';
import { allMockSessions, mockSessionEmpty } from '../fixtures/mock-sessions.js';

describe('Metrics Aggregator', () => {
  beforeAll(async () => {
    // We mock load prices to prevent network requests during tests
    await PricingEngine.loadPrices();
  });

  it('computes metrics from full mock session correctly', async () => {
    const metrics = await computeMetrics(allMockSessions);

    expect(metrics.overview.sessionsCount).toBe(allMockSessions.length);
    expect(metrics.overview.totalTokens).toBeGreaterThan(0);
    expect(metrics.overview.totalCostUSD).toBeGreaterThan(0);
    
    // Check Cache logic logic check: cache hit rate should be > 0 
    // In mock data: Total Input = 320+400+200+100+10 = 1030 
    // Total Cache = 200+300+150+50+0 = 700 
    // rate = 700 / (1030 + 700) = 40.4%
    expect(metrics.overview.cacheHitRate).toBeGreaterThan(0);
    expect(metrics.overview.cacheHitRate).toBeCloseTo(40.46, 1);

    // Verify model split
    const modelMet = metrics.byModel['claude-sonnet-4-20250514'];
    expect(modelMet).toBeDefined();
    expect(modelMet.messageCount).toBe(5);
    
    // Check Activities
    expect(metrics.byActivity['Debugging']).toBeDefined();
    expect(metrics.byActivity['Testing']).toBeDefined();
    
    // Empty session checking
    const emptyMetrics = await computeMetrics([mockSessionEmpty]);
    expect(emptyMetrics.overview.totalTokens).toBe(0);
    expect(emptyMetrics.overview.totalCostUSD).toBe(0);
  });
});
