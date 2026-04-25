import { NextResponse } from 'next/server';
import { runAgentLensCliJson, sanitizePeriod, sanitizeProvider } from '../../../lib/agentlens-cli';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), '7');
    const provider = sanitizeProvider(searchParams.get('provider'));
    const args = ['report', '-p', period, '--format', 'json', '--minimal'];
    if (provider) args.push('--provider', provider);

    const result = await runAgentLensCliJson<any>(args);
    const { metrics, findings, insights, providers, daily, projects } = result;

    return NextResponse.json({
      metrics,
      findings,
      insights,
      providers,
      daily: daily ?? [],
      projects: (projects ?? []).filter((p: any) => p.name != null),
      activities: Object.values(metrics?.byActivity || {}).map((a: any) => ({
        name: a.category,
        cost: a.costUSD,
        percentage: a.percentage,
        oneShotRate: a.oneShotRate
      })),
      models: Object.values(metrics?.byModel || {}).map((m: any) => ({
        id: m.model,
        name: m.model,
        costUSD: m.costUSD,
        totalTokens: m.totalTokens,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens
      }))
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };