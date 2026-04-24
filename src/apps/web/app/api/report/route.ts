import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const AGENTLENS_ROOT = '/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens';
const CLI_BIN = AGENTLENS_ROOT + '/dist/apps/cli/index.js';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '7';
    const provider = searchParams.get('provider');
    
    const cmd = `node "${CLI_BIN}" report -p ${period} --format json --minimal` + 
      (provider && provider !== 'all' ? ` --provider ${provider}` : '');
    
    const stdout = execSync(cmd, {
      cwd: AGENTLENS_ROOT,
      encoding: 'utf-8',
    });

    const result = JSON.parse(stdout.trim());
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