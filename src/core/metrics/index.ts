// ─────────────────────────────────────────────────────────────
// AgentLens – Metrics Aggregation Engine
// ─────────────────────────────────────────────────────────────

import type { Session, Metrics, ModelMetrics, ActivityMetrics, ActivityCategory, ToolUsage } from '../../types/index.js';
import { classifyTurn } from '../classifier/index.js';
import { PricingEngine } from '../pricing/calculator.js';

function isEditTool(name: string): boolean {
  return name === 'Edit' || name === 'Write' || name === 'edit' || name === 'write';
}

function isBashTool(name: string): boolean {
  return name === 'Bash' || name === 'bash' || name === 'exec_command';
}

function isToolFailureSignal(tool: ToolUsage): boolean {
  if (tool.isError) return true;
  const inputText = typeof tool.input === 'string' ? tool.input : '';
  const outputText = typeof tool.output === 'string' ? tool.output : '';
  const haystack = `${inputText}\n${outputText}`.toLowerCase();
  return haystack.includes('error') || haystack.includes('fail');
}

function isOneShotSuccess(messages: Session['messages'], assistantIndex: number): boolean {
  const current = messages[assistantIndex];
  if (!current || current.role !== 'assistant') return false;

  const currentTools = current.tools || [];
  if (!currentTools.some(t => isEditTool(t.name))) return false;

  // Only inspect the next few assistant turns to avoid session-wide cross-talk.
  let checkedAssistantTurns = 0;
  for (let i = assistantIndex + 1; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    checkedAssistantTurns++;
    const tools = msg.tools || [];

    if (tools.some(t => isEditTool(t.name))) {
      return false;
    }

    const hasFailingBash = tools.some(t => isBashTool(t.name) && isToolFailureSignal(t));
    if (hasFailingBash) {
      return false;
    }

    if (checkedAssistantTurns >= 3) break;
  }

  return true;
}

export async function computeMetrics(sessions: Session[]): Promise<Metrics> {
  // Initialize hourly buckets (0-23)
  const hourly: Record<string, { messages: number; tokens: number; costUSD: number }> = {};
  for (let h = 0; h < 24; h++) {
    hourly[h.toString()] = { messages: 0, tokens: 0, costUSD: 0 };
  }

  const metrics: Metrics = {
    overview: {
      totalCostUSD: 0,
      totalCostLocal: 0,
      localCurrency: 'USD',
      totalTokens: 0,
      sessionsCount: sessions.length,
      avgCostPerSession: 0,
      cacheHitRate: 0,
    },
    byModel: {},
    byProvider: {},
    byActivity: {},
    hourly,
  };

  if (sessions.length === 0) return metrics;

  let totalInput = 0;
  let totalCacheRead = 0;

  for (const session of sessions) {
    let lastUserMessage = '';

    for (let idx = 0; idx < session.messages.length; idx++) {
      const msg = session.messages[idx];
      if (msg.role === 'user') {
        lastUserMessage = msg.content;
      }

      if (msg.role === 'assistant') {
        const tools = msg.tools || [];
        const category = classifyTurn(lastUserMessage, tools);
        msg.classification = category;

        const isEditTurn = tools.some(t => isEditTool(t.name));
        const isOneShotTurn = isEditTurn && isOneShotSuccess(session.messages, idx);

        if (!metrics.byActivity[category]) {
          metrics.byActivity[category] = { 
            category, 
            messageCount: 0, 
            totalTokens: 0, 
            costUSD: 0, 
            percentage: 0,
            editTurns: 0,
            oneShotTurns: 0,
            oneShotRate: 0,
          };
        }

        const activity = metrics.byActivity[category]!;
        activity.messageCount++;
        
        if (isEditTurn) {
          activity.editTurns++;
          if (isOneShotTurn) {
            activity.oneShotTurns++;
          }
        }

      }

      if (!msg.tokens) continue;

      const t = msg.tokens;
      const totalMsgTokens = t.input + t.output + t.cacheRead + t.cacheWrite;
      totalInput += t.input;
      totalCacheRead += t.cacheRead;
      metrics.overview.totalTokens += totalMsgTokens;

      let cost = 0;
      let isEstimated = false;
      if (msg.model) {
        const pricing = PricingEngine.calculateMessageCost(msg.model, t);
        cost = pricing.cost;
        isEstimated = pricing.isEstimated;
        metrics.overview.totalCostUSD += cost;
      }

      if (!metrics.byProvider[session.provider]) {
        metrics.byProvider[session.provider] = {
          provider: session.provider,
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          costUSD: 0,
          messageCount: 0,
        };
      }

      const providerMetrics = metrics.byProvider[session.provider];
      providerMetrics.totalTokens += totalMsgTokens;
      providerMetrics.inputTokens += t.input;
      providerMetrics.outputTokens += t.output;
      providerMetrics.cacheReadTokens += t.cacheRead;
      providerMetrics.cacheWriteTokens += t.cacheWrite;
      providerMetrics.costUSD += cost;
      providerMetrics.messageCount++;

      if (msg.role === 'assistant' && msg.classification) {
        const activity = metrics.byActivity[msg.classification]!;
        activity.totalTokens += totalMsgTokens;
        activity.costUSD += cost;
      }

      if (msg.model) {
        if (!metrics.byModel[msg.model]) {
          metrics.byModel[msg.model] = {
            model: msg.model,
            totalTokens: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
            costUSD: 0,
            messageCount: 0,
            isEstimated,
          };
        }

        const mod = metrics.byModel[msg.model];
        mod.totalTokens += totalMsgTokens;
        mod.inputTokens += t.input;
        mod.outputTokens += t.output;
        mod.cacheReadTokens += t.cacheRead;
        mod.cacheWriteTokens += t.cacheWrite;
        mod.costUSD += cost;
        mod.messageCount++;
        if (isEstimated) mod.isEstimated = true;
      }

      const hour = new Date(msg.timestamp).getHours().toString();
      if (metrics.hourly[hour]) {
        metrics.hourly[hour].messages++;
        metrics.hourly[hour].tokens += totalMsgTokens;
        metrics.hourly[hour].costUSD += cost;
      }
    }
  }

  const totalAssistantMessages = Object.values(metrics.byActivity).reduce((acc, cat) => acc + cat.messageCount, 0);
  metrics.overview.avgCostPerSession = sessions.length > 0 ? metrics.overview.totalCostUSD / sessions.length : 0;
  
  if (totalInput + totalCacheRead > 0) {
    metrics.overview.cacheHitRate = (totalCacheRead / (totalInput + totalCacheRead)) * 100;
  }

  for (const cat of Object.values(metrics.byActivity)) {
    cat.percentage = totalAssistantMessages > 0 ? (cat.messageCount / totalAssistantMessages) * 100 : 0;
    cat.oneShotRate = cat.editTurns > 0 ? (cat.oneShotTurns / cat.editTurns) * 100 : 0;
  }

  return metrics;
}
