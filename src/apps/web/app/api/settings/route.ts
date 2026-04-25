import { NextResponse } from 'next/server';
import { runAgentLensCli, runAgentLensCliJson } from '../../../lib/agentlens-cli';

async function GET(): Promise<NextResponse> {
  try {
    const budget = await runAgentLensCliJson(['budget:get']);
    return NextResponse.json(budget);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

async function POST(request: Request): Promise<NextResponse> {
  const body = await request.json();
  const { daily, monthly, currency, providers } = body;
  
  const args = ['budget:set'];
  if (daily !== undefined) args.push('--daily', daily.toString());
  if (monthly !== undefined) args.push('--monthly', monthly.toString());
  if (currency) args.push('--currency', currency);
  
  // Add per-provider budgets
  if (providers && typeof providers === 'object') {
    for (const [key, value] of Object.entries(providers)) {
      if (typeof value === 'number' && value > 0) {
        args.push(`--${key}`, value.toString());
      }
    }
  }
  
  try {
    const message = await runAgentLensCli(args);
    return NextResponse.json({ success: true, message });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}

export { GET, POST };