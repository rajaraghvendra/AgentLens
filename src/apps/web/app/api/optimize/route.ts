import { NextResponse } from 'next/server';
import { CoreEngine, computeHealthScore } from '../../../lib/server-core';
import { sanitizePeriod, sanitizeProvider, parsePeriod } from '../../../lib/query-params';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '30');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const filters = provider ? { provider } : undefined;
    const { findings, insights, metrics } = await CoreEngine.runFull(parsePeriod(period), 'USD', filters);
    const { score, grade } = computeHealthScore(findings);

    return NextResponse.json({
      findings,
      insights,
      healthScore: score,
      healthGrade: grade,
      totalCost: metrics?.overview?.totalCostUSD,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
