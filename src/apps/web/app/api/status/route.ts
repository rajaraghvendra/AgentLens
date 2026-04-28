import { NextResponse } from 'next/server';
import { getBudget } from '../../../lib/server-core';
import { getDashboardOverview } from '../../../lib/dashboard-data';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), 'today');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const periodDays = parsePeriod(period);
    const fullReparse = searchParams.get('fullReparse') === '1';
    const forceRefresh = searchParams.get('forceRefresh') === '1';

    const [budget, overview] = await Promise.all([
      getBudget(),
      getDashboardOverview(periodDays, provider, fullReparse, forceRefresh),
    ]);

    const today = overview.metrics.overview ?? {};
    const dailyBudget = budget?.daily || 0;
    const totalCostUSD = today.totalCostLocal ?? 0;
    const isBudgetExceeded = dailyBudget > 0 && totalCostUSD >= dailyBudget;
    const budgetUtilization = dailyBudget > 0 ? (totalCostUSD / dailyBudget) * 100 : 0;

    return NextResponse.json({
      period,
      totalCostLocal: totalCostUSD,
      totalCostUSD,
      currencySymbol: '$',
      totalTokens: today.totalTokens ?? 0,
      budgetCapLocal: budget?.daily || null,
      budgetCapUSD: budget?.daily || null,
      isBudgetExceeded,
      budgetUtilizationPercentage: budgetUtilization,
      activeProviders: overview.providers.filter((providerItem) => providerItem.available).map((providerItem) => providerItem.id),
      costsByProvider: overview.providerCosts,
      activeIssuesCount: overview.topEvent ? 1 : 0,
      topAlert: overview.topEvent,
      recommendations: overview.topRecommendation ? [overview.topRecommendation.title] : [],
      processing: overview.processing ?? null,
      freshness: overview.freshness ?? null,
      sessionsToday: periodDays === 1 ? (today.sessionsCount ?? 0) : null,
      sessionsInPeriod: today.sessionsCount ?? 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
