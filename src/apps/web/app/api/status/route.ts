import { NextResponse } from 'next/server';
import { runAgentLensCliJson, sanitizePeriod } from '../../../lib/agentlens-cli';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = sanitizePeriod(searchParams.get('period'), 'today');
    const result = await runAgentLensCliJson<any>(['status', '-p', period, '--format', 'json']);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };
