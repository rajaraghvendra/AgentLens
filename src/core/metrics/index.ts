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

function isOneShotSuccess(tools: ToolUsage[], allSessionTools: ToolUsage[]): boolean {
  if (!tools || tools.length === 0) return false;
  
  const hasEdit = tools.some(t => isEditTool(t.name));
  if (!hasEdit) return false;
  
  const editIndex = allSessionTools.findIndex(t => isEditTool(t.name));
  if (editIndex < 0) return false;
  
  const subsequentTools = allSessionTools.slice(editIndex + 1, editIndex + 4);
  
  for (const tool of subsequentTools) {
    if (isBashTool(tool.name)) {
      const input = typeof tool.input === 'string' ? tool.input.toLowerCase() : '';
      if (input.includes('error') || input.includes('fail') || tool.isError) {
        return false;
      }
      const editAgain = subsequentTools.slice(subsequentTools.indexOf(tool) + 1).find(t => isEditTool(t.name));
      if (editAgain) return false;
    }
  }
  
  return true;
}

export async function computeMetrics(sessions: Session[]): Promise<Metrics> {
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
    byActivity: {},
  };

  if (sessions.length === 0) return metrics;

  let totalInput = 0;
  let totalCacheRead = 0;

  for (const session of sessions) {
    let lastUserMessage = '';
    const allTools = session.messages.flatMap(m => m.tools || []);
    let editTurnCount = 0;
    let oneShotCount = 0;

    for (const msg of session.messages) {
      if (msg.role === 'user') {
        lastUserMessage = msg.content;
      } else if (msg.role === 'assistant') {
        const tools = msg.tools || [];
        const category = classifyTurn(lastUserMessage, tools);
        msg.classification = category;

        const isEditTurn = tools.some(t => isEditTool(t.name));
        if (isEditTurn) {
          editTurnCount++;
          if (isOneShotSuccess(tools, allTools)) {
            oneShotCount++;
          }
        }

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
          if (isOneShotSuccess(tools, allTools)) {
            activity.oneShotTurns++;
          }
        }

        if (msg.tokens && msg.model) {
          const t = msg.tokens;
          const totalMsgTokens = t.input + t.output + t.cacheRead + t.cacheWrite;
          
          totalInput += t.input;
          totalCacheRead += t.cacheRead;

          const { cost, isEstimated } = PricingEngine.calculateMessageCost(msg.model, t);

          metrics.overview.totalTokens += totalMsgTokens;
          metrics.overview.totalCostUSD += cost;
          activity.totalTokens += totalMsgTokens;
          activity.costUSD += cost;

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
