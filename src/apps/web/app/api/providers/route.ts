import { NextResponse } from 'next/server';
import { runAgentLensCliJson } from '../../../lib/agentlens-cli';

async function GET(): Promise<NextResponse> {
  try {
    const report = await runAgentLensCliJson<any>(['report', '-p', 'today', '--format', 'json', '--minimal']);
    return NextResponse.json({ providers: report.providers ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, providers: [] }, { status: 500 });
  }
}

export { GET };
