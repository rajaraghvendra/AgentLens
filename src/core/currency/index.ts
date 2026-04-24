// ─────────────────────────────────────────────────────────────
// AgentLens – Currency Converter
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import config from '../../config/env.js';

export class CurrencyConverter {
  private static EXCHANGE_API = 'https://api.frankfurter.app/latest?from=USD';

  /**
   * Retrieves the exchange rate from USD to target currency.
   * Caches locally for 24h to avoid API rate limits.
   */
  static async getRate(targetCurrency: string): Promise<number> {
    const cur = targetCurrency.toUpperCase();
    if (cur === 'USD') return 1.0;

    const cachePath = join(config.cacheDir, 'currency.json');

    try {
      if (existsSync(cachePath)) {
        const stats = readFileSync(cachePath, 'utf8');
        const parsed = JSON.parse(stats);
        const age = Date.now() - parsed.timestamp;

        if (age < config.cacheMaxAgeMs && parsed.rates[cur]) {
          return parsed.rates[cur];
        }
      }
    } catch {
      // Ignore cache errors
    }

    try {
      const response = await fetch(this.EXCHANGE_API);
      if (!response.ok) throw new Error('API fetch failed');
      const data = await response.json();

      if (data.rates) {
        mkdirSync(dirname(cachePath), { recursive: true });
        writeFileSync(cachePath, JSON.stringify({
          timestamp: Date.now(),
          rates: data.rates
        }));
        
        if (data.rates[cur]) return data.rates[cur];
      }
    } catch {
      if (process.env.AGENTLENS_DEBUG) {
        console.warn(`[agentlens] Failed to fetch currency rates. Defaulting 1:1 for ${cur}`);
      }
    }

    return 1.0; // Fallback
  }

  static async convert(amountUSD: number, targetCurrency: string): Promise<number> {
    const rate = await this.getRate(targetCurrency);
    return amountUSD * rate;
  }
}
