import { NextResponse } from 'next/server';
import { CoreEngine } from '../../../lib/server-core';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const periodStr = searchParams.get('period') || '7';
    const period = parseInt(periodStr, 10) || 7;

    // Get the full report data
    const result = await CoreEngine.runFull(period, 'USD');

    // Process data for charts
    const chartData = {
      activities: Object.values(result.metrics.byActivity)
        .sort((a: any, b: any) => b.totalTokens - a.totalTokens)
        .map((activity: any) => ({
          name: activity.category,
          percentage: activity.percentage,
          tokens: activity.totalTokens,
          cost: activity.costUSD,
          oneShotRate: activity.oneShotRate || 0,
        })),

      models: Object.values(result.metrics.byModel)
        .sort((a: any, b: any) => b.costUSD - a.costUSD)
        .map((model: any) => ({
          name: model.model,
          tokens: model.totalTokens,
          cost: model.costUSD,
          messages: model.messageCount,
          cacheRead: model.cacheReadTokens || 0,
          cacheWrite: model.cacheWriteTokens || 0,
          input: model.inputTokens || 0,
          output: model.outputTokens || 0,
        })),

      // For daily trends, we need to enhance the data
      daily: result.sessions.reduce((acc: any[], session: any) => {
        const date = new Date(session.timestamp).toISOString().split('T')[0];
        const existing = acc.find(item => item.date === date);

        if (existing) {
          existing.sessions += 1;
          session.messages.forEach((msg: any) => {
            if (msg.tokens) {
              existing.tokens += (msg.tokens.input + msg.tokens.output +
                               msg.tokens.cacheRead + msg.tokens.cacheWrite);
            }
          });
        } else {
          let tokens = 0;
          session.messages.forEach((msg: any) => {
            if (msg.tokens) {
              tokens += (msg.tokens.input + msg.tokens.output +
                        msg.tokens.cacheRead + msg.tokens.cacheWrite);
            }
          });

          acc.push({
            date,
            sessions: 1,
            tokens,
            costUSD: 0 // This would need to be calculated properly
          });
        }

        return acc;
      }, []).sort((a: any, b: any) => a.date.localeCompare(b.date)),

      // Cache efficiency data
      cache: result.sessions.reduce((acc: any[], session: any) => {
        const date = new Date(session.timestamp).toISOString().split('T')[0];
        const existing = acc.find(item => item.date === date);

        let cacheRead = 0;
        let input = 0;

        session.messages.forEach((msg: any) => {
          if (msg.tokens) {
            cacheRead += msg.tokens.cacheRead || 0;
            input += msg.tokens.input || 0;
          }
        });

        if (existing) {
          existing.cacheRead += cacheRead;
          existing.input += input;
        } else {
          acc.push({
            date,
            cacheRead,
            input,
          });
        }

        return acc;
      }, []).sort((a: any, b: any) => a.date.localeCompare(b.date)),
    };

    return NextResponse.json(chartData);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
