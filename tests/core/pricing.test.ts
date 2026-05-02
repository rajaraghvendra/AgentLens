import { describe, it, expect, beforeAll } from 'vitest';
import { PricingEngine } from '../../src/core/pricing/calculator.js';

describe('PricingEngine', () => {
  beforeAll(async () => {
    await PricingEngine.loadPrices();
  });

  it('resolves claude-3-5-sonnet-20241022 to correct rates', () => {
    const result = PricingEngine.calculateMessageCost('claude-3-5-sonnet-20241022', {
      input: 1_000_000, 
      output: 1_000_000, 
      cacheRead: 0, 
      cacheWrite: 0
    });
    // Expected: $3/M in + $15/M out = $18
    expect(result.isEstimated).toBe(false);
    expect(result.cost).toBeCloseTo(18.0, 0); 
  });

  it('resolves gpt-4o to correct rates', () => {
    const result = PricingEngine.calculateMessageCost('gpt-4o', {
      input: 1_000_000, 
      output: 1_000_000, 
      cacheRead: 0, 
      cacheWrite: 0
    });
    // Expected: $2.5/M in + $10/M out = $12.5
    expect(result.isEstimated).toBe(false);
    expect(result.cost).toBeCloseTo(12.5, 0); 
  });

  it('falls back to estimated costs for unknown models', () => {
    const result = PricingEngine.calculateMessageCost('unknown-future-model-x', {
      input: 1_000_000, 
      output: 1_000_000, 
      cacheRead: 0, 
      cacheWrite: 0
    });
    expect(result.isEstimated).toBe(true);
    expect(result.cost).toBeGreaterThan(0);
  });
});
