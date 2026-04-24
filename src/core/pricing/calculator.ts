// ─────────────────────────────────────────────────────────────
// AgentLens – Pricing Engine
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import config from '../../config/env.js';
import type { ModelPrice, TokenUsage } from '../../types/index.js';

export class PricingEngine {
  private static prices = new Map<string, ModelPrice>();
  private static LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

  static getFallbackRates(modelName: string): ModelPrice {
    // Default to approximate generic Claude 3.5 Sonnet / V2 rates if unknown
    return {
      model: modelName,
      inputCostPerM: 3.0,
      outputCostPerM: 15.0,
      cacheReadCostPerM: 0.3,
      cacheWriteCostPerM: 3.75, // Typically 1.25x base input cost
    };
  }

  static async loadPrices(): Promise<void> {
    const cachePath = join(config.cacheDir, 'pricing.json');

    try {
      if (existsSync(cachePath)) {
        const stats = readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(stats);
        const age = Date.now() - parsed.timestamp;

        if (age < config.cacheMaxAgeMs) {
          this.populateMap(parsed.data);
          return;
        }
      }
    } catch {
      // Proceed to fetch if cache read fails
    }

    // Fetch fresh prices from LiteLLM
    try {
      const response = await fetch(this.LITELLM_URL);
      if (!response.ok) throw new Error('Network error');
      
      const data = await response.json();
      this.populateMap(data);

      // Save to cache
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), data }));
    } catch {
      if (process.env.AGENTLENS_DEBUG) {
        console.warn('[agentlens] Failed to fetch LiteLLM prices, using built-in fallbacks.');
      }
      // If fetching fails, we just leave the map empty; calculateMessageCost will use fallbacks
    }
  }

  private static populateMap(rawData: Record<string, any>) {
    this.prices.clear();
    for (const [key, value] of Object.entries(rawData)) {
      if (value.input_cost_per_token !== undefined) {
        this.prices.set(key, {
          model: key,
          inputCostPerM: value.input_cost_per_token * 1_000_000,
          outputCostPerM: value.output_cost_per_token * 1_000_000,
          cacheReadCostPerM: (value.cache_read_input_token_cost || (value.input_cost_per_token * 0.1)) * 1_000_000,
          cacheWriteCostPerM: (value.cache_creation_input_token_cost || (value.input_cost_per_token * 1.25)) * 1_000_000,
        });
      }
    }
  }

  static calculateMessageCost(model: string, tokens: TokenUsage): { cost: number; isEstimated: boolean } {
    let rates = this.prices.get(model);
    let isEstimated = false;

    if (!rates) {
      const modelBase = model.split(/[:@#\s]/)[0].toLowerCase();
      const baseParts = modelBase.split(/[^a-z0-9]+/).filter(Boolean);
      const candidate = Array.from(this.prices.keys())
        .filter(k => baseParts.every(p => k.toLowerCase().includes(p)))
        .sort((a, b) => b.length - a.length)[0];

      if (candidate) {
        rates = this.prices.get(candidate);
      } else {
        rates = this.getFallbackRates(model);
        isEstimated = true;
      }
    }

    let cost = 0;
    cost += (tokens.input / 1_000_000) * rates!.inputCostPerM;
    cost += (tokens.output / 1_000_000) * rates!.outputCostPerM;
    cost += (tokens.cacheRead / 1_000_000) * rates!.cacheReadCostPerM;
    cost += (tokens.cacheWrite / 1_000_000) * rates!.cacheWriteCostPerM;

    return { cost, isEstimated };
  }
}
