// ─────────────────────────────────────────────────────────────
// AgentLens – Pricing Engine
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import config from '../../config/env.js';
import type { ModelPrice, TokenUsage } from '../../types/index.js';

export class PricingEngine {
  private static prices = new Map<string, ModelPrice>();
  private static userOverrides = new Map<string, ModelPrice>();
  private static LITELLM_URL = 'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
  private static bundledPricingLoaded = false;

  static getFallbackRates(modelName: string): ModelPrice {
    return {
      model: modelName,
      inputCostPerM: 3.0,
      outputCostPerM: 15.0,
      cacheReadCostPerM: 0.3,
      cacheWriteCostPerM: 3.75,
    };
  }

  static async loadPrices(): Promise<void> {
    const cachePath = join(config.cacheDir, 'pricing.json');

    // Step 1: Try to load bundled pricing first (always available offline)
    await this.loadBundledPrices();

    // Step 2: Try to load user overrides if configured
    if (config.pricingOverridePath) {
      await this.loadUserOverride(config.pricingOverridePath);
    }

    // Step 3: Try to load or fetch cached prices
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

    // Step 4: Fetch fresh prices from LiteLLM (only if online)
    await this.fetchLiteLLMPrices();
  }

  private static async loadBundledPrices(): Promise<void> {
    if (this.bundledPricingLoaded) return;

    let data = null;

    // Try to load from built distribution first
    const distPath = join(process.cwd(), 'dist/core/pricing/default-pricing.json');
    if (existsSync(distPath)) {
      try {
        data = JSON.parse(readFileSync(distPath, 'utf8'));
      } catch {
        // Ignore - try next path
      }
    }

    // Try source path if not found in dist
    if (!data) {
      const srcPath = join(process.cwd(), 'src/core/pricing/default-pricing.json');
      if (existsSync(srcPath)) {
        try {
          data = JSON.parse(readFileSync(srcPath, 'utf8'));
        } catch {
          // Ignore
        }
      }
    }

    if (data) {
      this.populateMap(data);
      this.bundledPricingLoaded = true;
      if (process.env.AGENTLENS_DEBUG) {
        console.log('[agentlens] Loaded bundled pricing from dist/core/pricing/default-pricing.json');
      }
    } else {
      // If bundled loading fails, use hardcoded fallbacks - prices will resolve at query time
      this.bundledPricingLoaded = true;
    }
  }

  private static async fetchLiteLLMPrices(): Promise<void> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(this.LITELLM_URL, { signal: controller.signal });
      clearTimeout(timeout);
      
      if (!response.ok) throw new Error('Network error');

      const data = await response.json();
      this.populateMap(data);

      // Save to cache
      const cachePath = join(config.cacheDir, 'pricing.json');
      try {
        mkdirSync(config.cacheDir, { recursive: true });
        writeFileSync(cachePath, JSON.stringify({ timestamp: Date.now(), data }));
      } catch {
        // Ignore cache write failures
      }
    } catch (err) {
      if (process.env.AGENTLENS_DEBUG) {
        console.warn('[agentlens] Failed to fetch LiteLLM prices, using bundled fallbacks');
      }
      // Continue with bundled prices - calculateMessageCost will use fallbacks for unknown models
    }
  }

  static async loadUserOverride(overridePath: string): Promise<void> {
    try {
      if (!existsSync(overridePath)) {
        if (process.env.AGENTLENS_DEBUG) {
          console.warn('[agentlens] Pricing override file not found:', overridePath);
        }
        return;
      }

      const data = JSON.parse(readFileSync(overridePath, 'utf8'));

      for (const [key, value] of Object.entries(data)) {
        if (value && typeof value === 'object') {
          const v = value as Record<string, unknown>;
          const inputCost = (v.inputCostPerM ?? v.input_cost_per_m ?? v.input_cost_per_token_m ?? 3.0) as number;
          const outputCost = (v.outputCostPerM ?? v.output_cost_per_m ?? v.output_cost_per_token_m ?? 15.0) as number;
          const cacheRead = (v.cacheReadCostPerM ?? v.cache_read_cost_per_m ?? 0.3) as number;
          const cacheWrite = (v.cacheWriteCostPerM ?? v.cache_write_cost_per_m ?? 3.75) as number;
          
          const price: ModelPrice = {
            model: key,
            inputCostPerM: inputCost,
            outputCostPerM: outputCost,
            cacheReadCostPerM: cacheRead,
            cacheWriteCostPerM: cacheWrite,
          };
          this.userOverrides.set(key.toLowerCase(), price);
        }
      }

      if (process.env.AGENTLENS_DEBUG) {
        console.log('[agentlens] Loaded pricing overrides from:', overridePath);
      }
    } catch (err) {
      if (process.env.AGENTLENS_DEBUG) {
        console.warn('[agentlens] Failed to load pricing override:', err);
      }
    }
  }

  private static populateMap(rawData: Record<string, unknown>): void {
    this.prices.clear();
    for (const [key, value] of Object.entries(rawData)) {
      if (value && typeof value === 'object') {
        const v = value as Record<string, unknown>;
        const inputCost = (v.input_cost_per_token ?? v.input_cost_per_token_m ?? 0) as number;
        const outputCost = (v.output_cost_per_token ?? v.output_cost_per_token_m ?? 0) as number;
        const cacheRead = (v.cache_read_input_token_cost ?? v.cache_read_cost_per_m ?? inputCost * 0.1) as number;
        const cacheWrite = (v.cache_creation_input_token_cost ?? v.cache_write_cost_per_m ?? inputCost * 1.25) as number;

        if (inputCost > 0 || outputCost > 0) {
          this.prices.set(key.toLowerCase(), {
            model: key,
            inputCostPerM: inputCost * 1_000_000,
            outputCostPerM: outputCost * 1_000_000,
            cacheReadCostPerM: (typeof cacheRead === 'number' ? cacheRead : 0.3) * 1_000_000,
            cacheWriteCostPerM: (typeof cacheWrite === 'number' ? cacheWrite : 3.75) * 1_000_000,
          });
        }
      }
    }
  }

  static calculateMessageCost(model: string, tokens: TokenUsage): { cost: number; isEstimated: boolean } {
    let rates: ModelPrice | undefined;
    let isEstimated = false;

    // Priority 1: User overrides (highest priority)
    const modelLower = model.toLowerCase();
    if (this.userOverrides.has(modelLower)) {
      rates = this.userOverrides.get(modelLower);
    } else {
      // Try exact match first
      rates = this.prices.get(modelLower);

      // Priority 2: LiteLLM prices (includes cache)
      if (!rates) {
        const modelBase = model.split(/[:@#\s]/)[0].toLowerCase();
        const baseParts = modelBase.split(/[^a-z0-9]+/).filter(Boolean);
        const candidate = Array.from(this.prices.keys())
          .filter(k => baseParts.every(p => k.toLowerCase().includes(p)))
          .sort((a, b) => b.length - a.length)[0];

        if (candidate) {
          rates = this.prices.get(candidate);
        }
      }

      // Priority 3: Fallback to hardcoded rates
      if (!rates) {
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