// ─────────────────────────────────────────────────────────────
// AgentLens – Core Engine
// ─────────────────────────────────────────────────────────────

import { getAllSessions, type ProviderFilter } from '../providers/index.js';
import { getDateRange } from '../utils/dates.js';
import { computeMetrics } from './metrics/index.js';
import { PricingEngine } from './pricing/calculator.js';
import { CurrencyConverter } from './currency/index.js';
import type { Metrics, Session, EngineResult, ExportData, DailyMetrics } from '../types/index.js';

export interface FilterOptions {
  provider?: ProviderFilter;
  projects?: string[];
  exclude?: string[];
}

function filterSessionsByProject(sessions: Session[], projects: string[], exclude: string[]): Session[] {
  let filtered = sessions;
  
  if (projects && projects.length > 0) {
    filtered = filtered.filter(s => 
      projects.some(p => s.project.toLowerCase().includes(p.toLowerCase()))
    );
  }
  
  if (exclude && exclude.length > 0) {
    filtered = filtered.filter(s => 
      !exclude.some(e => s.project.toLowerCase().includes(e.toLowerCase()))
    );
  }
  
  return filtered;
}

export class CoreEngine {
  /**
   * Run purely the parsing and metrics calculation phase.
   */
  static async run(
    periodDays: number, 
    currencyCode: string = 'USD',
    filters?: FilterOptions
  ): Promise<{ sessions: Session[]; metrics: Metrics }> {
    // 1. Load Prices
    await PricingEngine.loadPrices();

    // 2. Discover and Parse overlapping sessions across providers
    const dateRange = getDateRange(periodDays);
    const sessions = await getAllSessions(dateRange, filters?.provider);

    // 3. Apply project filters
    const filteredSessions = filterSessionsByProject(
      sessions, 
      filters?.projects || [], 
      filters?.exclude || []
    );

    // 4. Compute Metrics
    const metrics = await computeMetrics(filteredSessions);

    // 5. Convert Currency if necessary
    const rate = await CurrencyConverter.getRate(currencyCode);
    metrics.overview.totalCostLocal = metrics.overview.totalCostUSD * rate;
    metrics.overview.localCurrency = currencyCode.toUpperCase();

    return { sessions: filteredSessions, metrics };
  }

  /**
   * Fast status check for rapid UI interactions
   */
  static async getQuickStats(periodDays: number = 7, filters?: FilterOptions): Promise<Metrics['overview']> {
    const { metrics } = await this.run(periodDays, 'USD', filters);
    return metrics.overview;
  }

  /**
   * Run the entire pipeline including waste analysis.
   */
  static async runFull(
    periodDays: number, 
    currencyCode: string = 'USD',
    filters?: FilterOptions
  ): Promise<EngineResult> {
    const { sessions, metrics } = await this.run(periodDays, currencyCode, filters);
    
    // Lazy load the optimizer
    const { analyzeInefficiencies } = await import('./optimizer/index.js');
    const { generateInsights } = await import('./optimizer/insights.js');
    
    const findings = analyzeInefficiencies(sessions);
    const insights = generateInsights(metrics, findings);

    // Get available providers status
    const { getAllProviders } = await import('../providers/index.js');
    const allProviders = getAllProviders();
    const providersList = allProviders.map(p => ({
      id: p.id,
      name: p.name,
      available: p.isAvailable(),
      sessionCount: sessions.filter(s => s.provider === p.id).length
    }));

    return { sessions, metrics, findings, insights, providers: providersList };
  }

  /**
   * Generate export data with daily breakdown
   */
  static async getExportData(
    periodDays: number,
    filters?: FilterOptions
  ): Promise<ExportData> {
    const { sessions, metrics } = await this.run(periodDays, 'USD', filters);

    const dailyMap = new Map<string, { costUSD: number; sessions: number; tokens: number }>();
    const projectMap = new Map<string, { cost: number; sessions: number }>();

    for (const session of sessions) {
      const day = new Date(session.timestamp).toISOString().split('T')[0];
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { costUSD: 0, sessions: 0, tokens: 0 });
      }
      const dayData = dailyMap.get(day)!;
      dayData.sessions++;

      const proj = projectMap.get(session.project) || { cost: 0, sessions: 0 };
      proj.sessions++;

      for (const msg of session.messages) {
        if (msg.tokens && msg.model) {
          const { cost } = PricingEngine.calculateMessageCost(msg.model, msg.tokens);
          const msgTokens = msg.tokens.input + msg.tokens.output;
          dayData.costUSD += cost;
          dayData.tokens += msgTokens;
          proj.cost += cost;
        }
      }
      projectMap.set(session.project, proj);
    }

    const byDay = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, costUSD: data.costUSD, sessions: data.sessions, tokens: data.tokens }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const byProject = Array.from(projectMap.entries())
      .map(([name, data]) => ({ name, cost: data.cost, sessions: data.sessions }))
      .sort((a, b) => b.cost - a.cost);

    const activityData = Object.values(metrics.byActivity).map(a => ({
      name: a.category,
      cost: a.costUSD,
      percentage: a.percentage,
      oneShotRate: a.oneShotRate || 0,
    }));

    return {
      period: `${periodDays} days`,
      totalCost: metrics.overview.totalCostUSD,
      totalSessions: metrics.overview.sessionsCount,
      totalTokens: metrics.overview.totalTokens,
      byDay,
      byProject,
      byModel: [],
      byActivity: activityData,
    };
  }
}
