import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const AGENTLENS_ROOT = '/Users/raghvendrasingh/Documents/Study/Python/LLM/AgentLens';
const CLI_BIN = AGENTLENS_ROOT + '/dist/apps/cli/index.js';

async function GET(request: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30';
    const provider = searchParams.get('provider');

    const cmd = `node "${CLI_BIN}" compare -p ${period} --format json` +
      (provider && provider !== 'all' ? ` --provider ${provider}` : '');

    const stdout = execSync(cmd, {
      cwd: AGENTLENS_ROOT,
      encoding: 'utf-8',
    });

    return NextResponse.json(JSON.parse(stdout.trim()));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export { GET };