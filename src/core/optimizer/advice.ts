import { PricingEngine } from '../pricing/calculator.js';
import type {
  CommandPatternMetrics,
  McpServerMetrics,
  Metrics,
  NotificationDigest,
  OptimizationEvent,
  Session,
  ToolAdvice,
  ToolMetrics,
  ToolUsage,
  WasteFinding,
} from '../../types/index.js';

type ToolAccumulator = {
  name: string;
  invocations: number;
  errors: number;
  repeatedLoops: number;
  sessions: Set<string>;
  successfulSessions: Set<string>;
  estimatedTokenCost: number;
  estimatedCostUSD: number;
};

type McpAccumulator = {
  name: string;
  invocations: number;
  errors: number;
  repeatedLoops: number;
  sessions: Set<string>;
  estimatedTokenCost: number;
  estimatedCostUSD: number;
};

type CommandAccumulator = {
  pattern: string;
  count: number;
  errors: number;
  sessions: Set<string>;
  estimatedCostUSD: number;
};

function getToolServerName(tool: ToolUsage): string | null {
  if (typeof tool.input === 'object' && tool.input) {
    const serverName = (tool.input as Record<string, unknown>).server_name;
    if (typeof serverName === 'string' && serverName.trim()) {
      return serverName;
    }
  }

  const lowered = tool.name.toLowerCase();
  if (lowered.includes('mcp')) {
    return lowered;
  }

  return null;
}

function getCommandPattern(tool: ToolUsage): string | null {
  if (tool.name !== 'Bash' && tool.name !== 'exec_command') return null;

  if (typeof tool.input === 'string') {
    return tool.input.trim().split(/\s+/)[0] || null;
  }

  if (typeof tool.input === 'object' && tool.input) {
    const command = (tool.input as Record<string, unknown>).command;
    if (typeof command === 'string' && command.trim()) {
      return command.trim().split(/\s+/)[0];
    }
  }

  return null;
}

function getToolCost(tokens: { input: number; output: number; cacheRead: number; cacheWrite: number } | undefined, model?: string): { cost: number; tokenEstimate: number } {
  if (!tokens) return { cost: 0, tokenEstimate: 0 };
  const tokenEstimate = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;
  if (!model) return { cost: 0, tokenEstimate };
  const pricing = PricingEngine.calculateMessageCost(model, tokens);
  return { cost: pricing.cost, tokenEstimate };
}

function hasEditInSession(session: Session): boolean {
  return session.messages.some((message) =>
    (message.tools || []).some((tool) => tool.name === 'Edit' || tool.name === 'Write'),
  );
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function buildToolMetrics(sessions: Session[]): {
  byTool: Record<string, ToolMetrics>;
  byMcpServer: Record<string, McpServerMetrics>;
  byCommandPattern: Record<string, CommandPatternMetrics>;
} {
  const tools = new Map<string, ToolAccumulator>();
  const mcps = new Map<string, McpAccumulator>();
  const commands = new Map<string, CommandAccumulator>();

  for (const session of sessions) {
    const sessionHasEdit = hasEditInSession(session);
    let previousToolName = '';
    let previousServerName = '';

    for (const message of session.messages) {
      const messageTools = message.tools || [];
      if (messageTools.length === 0) {
        previousToolName = '';
        previousServerName = '';
        continue;
      }

      const { cost, tokenEstimate } = getToolCost(message.tokens, message.model);
      const costShare = messageTools.length > 0 ? cost / messageTools.length : 0;
      const tokenShare = messageTools.length > 0 ? tokenEstimate / messageTools.length : 0;

      for (const tool of messageTools) {
        const toolKey = tool.name || 'unknown';
        const toolAcc = tools.get(toolKey) || {
          name: toolKey,
          invocations: 0,
          errors: 0,
          repeatedLoops: 0,
          sessions: new Set<string>(),
          successfulSessions: new Set<string>(),
          estimatedTokenCost: 0,
          estimatedCostUSD: 0,
        };

        toolAcc.invocations += 1;
        toolAcc.sessions.add(session.id);
        if (sessionHasEdit) toolAcc.successfulSessions.add(session.id);
        if (tool.isError) toolAcc.errors += 1;
        if (previousToolName === toolKey) toolAcc.repeatedLoops += 1;
        toolAcc.estimatedCostUSD += costShare;
        toolAcc.estimatedTokenCost += tokenShare;
        tools.set(toolKey, toolAcc);
        previousToolName = toolKey;

        const serverName = getToolServerName(tool);
        if (serverName) {
          const mcpAcc = mcps.get(serverName) || {
            name: serverName,
            invocations: 0,
            errors: 0,
            repeatedLoops: 0,
            sessions: new Set<string>(),
            estimatedTokenCost: 0,
            estimatedCostUSD: 0,
          };
          mcpAcc.invocations += 1;
          mcpAcc.sessions.add(session.id);
          if (tool.isError) mcpAcc.errors += 1;
          if (previousServerName === serverName) mcpAcc.repeatedLoops += 1;
          mcpAcc.estimatedCostUSD += costShare;
          mcpAcc.estimatedTokenCost += tokenShare;
          mcps.set(serverName, mcpAcc);
          previousServerName = serverName;
        }

        const commandPattern = getCommandPattern(tool);
        if (commandPattern) {
          const commandAcc = commands.get(commandPattern) || {
            pattern: commandPattern,
            count: 0,
            errors: 0,
            sessions: new Set<string>(),
            estimatedCostUSD: 0,
          };
          commandAcc.count += 1;
          commandAcc.sessions.add(session.id);
          if (tool.isError) commandAcc.errors += 1;
          commandAcc.estimatedCostUSD += costShare;
          commands.set(commandPattern, commandAcc);
        }
      }
    }
  }

  return {
    byTool: Object.fromEntries(
      Array.from(tools.entries()).map(([name, acc]) => [
        name,
        {
          name,
          invocationCount: acc.invocations,
          errorRate: acc.invocations > 0 ? acc.errors / acc.invocations : 0,
          repeatedLoopRate: acc.invocations > 0 ? acc.repeatedLoops / acc.invocations : 0,
          estimatedTokenCost: Math.round(acc.estimatedTokenCost),
          estimatedCostUSD: acc.estimatedCostUSD,
          sessionsTouched: acc.sessions.size,
          successCorrelation: acc.sessions.size > 0 ? acc.successfulSessions.size / acc.sessions.size : 0,
        },
      ]),
    ),
    byMcpServer: Object.fromEntries(
      Array.from(mcps.entries()).map(([name, acc]) => [
        name,
        {
          name,
          invocationCount: acc.invocations,
          errorRate: acc.invocations > 0 ? acc.errors / acc.invocations : 0,
          repeatedLoopRate: acc.invocations > 0 ? acc.repeatedLoops / acc.invocations : 0,
          estimatedTokenCost: Math.round(acc.estimatedTokenCost),
          estimatedCostUSD: acc.estimatedCostUSD,
          sessionsTouched: acc.sessions.size,
        },
      ]),
    ),
    byCommandPattern: Object.fromEntries(
      Array.from(commands.entries()).map(([pattern, acc]) => [
        pattern,
        {
          pattern,
          count: acc.count,
          errorRate: acc.count > 0 ? acc.errors / acc.count : 0,
          sessionsTouched: acc.sessions.size,
          estimatedCostUSD: acc.estimatedCostUSD,
        },
      ]),
    ),
  };
}

function createEvent(input: Omit<OptimizationEvent, 'id'>): OptimizationEvent {
  return {
    id: `${input.kind}:${input.entity || 'global'}:${input.title}`.toLowerCase().replace(/[^a-z0-9:_-]+/g, '-'),
    ...input,
  };
}

function buildEvents(
  sessions: Session[],
  metrics: Metrics,
  findings: WasteFinding[],
  toolMetrics: Record<string, ToolMetrics>,
  mcpMetrics: Record<string, McpServerMetrics>,
  periodDays: number,
): OptimizationEvent[] {
  const events: OptimizationEvent[] = [];
  const sessionCosts = sessions.map((session) => {
    let costUSD = 0;
    let editTurns = 0;
    for (const msg of session.messages) {
      if (msg.tokens && msg.model) {
        costUSD += PricingEngine.calculateMessageCost(msg.model, msg.tokens).cost;
      }
      if ((msg.tools || []).some((tool) => tool.name === 'Edit' || tool.name === 'Write')) {
        editTurns += 1;
      }
    }
    return { session, costUSD, editTurns };
  });

  const expensiveSessions = sessionCosts.filter(({ costUSD, editTurns }) => costUSD >= 2.5 && editTurns === 0);
  for (const costly of expensiveSessions.slice(0, 3)) {
    events.push(createEvent({
      kind: 'low-yield-high-cost-session',
      severity: costly.costUSD >= 5 ? 'High' : 'Medium',
      title: 'High-cost low-yield session',
      description: `${costly.session.project} spent $${costly.costUSD.toFixed(2)} without producing edit activity.`,
      confidence: 0.78,
      triggerValue: Number(costly.costUSD.toFixed(2)),
      expectedRange: '< $2.50 without edits',
      baselineWindow: `${periodDays}d`,
      recommendedAction: 'Reset the session with a shorter summary or switch to a cheaper model before continuing.',
      entity: costly.session.project,
      impactArea: 'cost',
    }));
  }

  const topProvider = Object.values(metrics.byProvider || {}).sort((a, b) => b.costUSD - a.costUSD)[0];
  if (topProvider && metrics.overview.totalCostUSD > 5 && topProvider.costUSD / metrics.overview.totalCostUSD > 0.8) {
    events.push(createEvent({
      kind: 'provider-concentration',
      severity: 'Medium',
      title: 'Provider concentration is unusually high',
      description: `${topProvider.provider} accounts for ${(topProvider.costUSD / metrics.overview.totalCostUSD * 100).toFixed(0)}% of spend in this window.`,
      confidence: 0.67,
      triggerValue: Number((topProvider.costUSD / metrics.overview.totalCostUSD * 100).toFixed(1)),
      expectedRange: '< 80% of spend',
      baselineWindow: `${periodDays}d`,
      recommendedAction: 'Compare a cheaper provider or right-size the workflow before this pattern becomes habitual.',
      entity: topProvider.provider,
      impactArea: 'provider',
    }));
  }

  if (metrics.overview.cacheHitRate < 20 && metrics.overview.totalCostUSD > 2) {
    events.push(createEvent({
      kind: 'cache-efficiency-regression',
      severity: metrics.overview.cacheHitRate < 10 ? 'High' : 'Medium',
      title: 'Cache efficiency is low',
      description: `Cache hit rate is ${metrics.overview.cacheHitRate.toFixed(1)}%, which is likely increasing repeated input-token spend.`,
      confidence: 0.82,
      triggerValue: Number(metrics.overview.cacheHitRate.toFixed(1)),
      expectedRange: '20%+ cache hit rate',
      baselineWindow: `${periodDays}d`,
      recommendedAction: 'Split long sessions sooner and reuse smaller summaries to increase cache hits.',
      impactArea: 'cache',
    }));
  }

  for (const finding of findings.filter((item) => item.severity === 'High').slice(0, 2)) {
    events.push(createEvent({
      kind: finding.kind || 'optimizer-finding',
      severity: finding.severity,
      title: finding.title,
      description: finding.description,
      confidence: finding.confidence ?? 0.85,
      triggerValue: finding.triggerValue,
      expectedRange: finding.expectedRange,
      baselineWindow: finding.baselineWindow ?? `${periodDays}d`,
      recommendedAction: finding.suggestedFix,
      impactArea: 'cost',
    }));
  }

  for (const [name, metric] of Object.entries(mcpMetrics)) {
    if (metric.invocationCount >= 3 && metric.errorRate >= 0.5) {
      events.push(createEvent({
        kind: 'mcp-failure-spike',
        severity: metric.errorRate >= 0.8 ? 'High' : 'Medium',
        title: 'MCP server failures are spiking',
        description: `${name} failed on ${(metric.errorRate * 100).toFixed(0)}% of calls across ${metric.sessionsTouched} sessions.`,
        confidence: 0.8,
        triggerValue: Number((metric.errorRate * 100).toFixed(1)),
        expectedRange: '< 50% tool failure rate',
        baselineWindow: `${periodDays}d`,
        recommendedAction: 'Disable or repair the failing MCP server before it burns more context on retries.',
        entity: name,
        impactArea: 'tools',
      }));
    }
  }

  for (const [name, metric] of Object.entries(toolMetrics)) {
    if (metric.invocationCount >= 6 && metric.repeatedLoopRate >= 0.35) {
      events.push(createEvent({
        kind: 'tool-loop',
        severity: metric.repeatedLoopRate >= 0.5 ? 'High' : 'Medium',
        title: 'Tool loop detected',
        description: `${name} is repeating in a loop-like pattern (${(metric.repeatedLoopRate * 100).toFixed(0)}% repeat rate).`,
        confidence: 0.76,
        triggerValue: Number((metric.repeatedLoopRate * 100).toFixed(1)),
        expectedRange: '< 35% repeated loop rate',
        baselineWindow: `${periodDays}d`,
        recommendedAction: 'Stop and reset the workflow before another loop compounds wasted tokens.',
        entity: name,
        impactArea: 'tools',
      }));
    }
  }

  return events;
}

function buildToolAdvice(
  metrics: Metrics,
  toolMetrics: Record<string, ToolMetrics>,
  mcpMetrics: Record<string, McpServerMetrics>,
  commandMetrics: Record<string, CommandPatternMetrics>,
  events: OptimizationEvent[],
): ToolAdvice[] {
  const advice: ToolAdvice[] = [];
  const topActivity = Object.values(metrics.byActivity || {}).sort((a, b) => (b?.costUSD || 0) - (a?.costUSD || 0))[0];
  const topModel = Object.values(metrics.byModel || {}).sort((a, b) => b.costUSD - a.costUSD)[0];

  for (const [name, metric] of Object.entries(mcpMetrics)) {
    if (metric.invocationCount >= 3 && metric.errorRate >= 0.5) {
      advice.push({
        title: `Stabilize or remove ${name}`,
        description: `${name} is failing often enough to waste context and retries.`,
        priority: metric.errorRate >= 0.8 ? 'High' : 'Medium',
        suggestedAction: 'Remove the server from the active tool set until the failure rate drops.',
        relatedTool: name,
      });
    }
  }

  for (const [name, metric] of Object.entries(toolMetrics)) {
    if (metric.invocationCount >= 6 && metric.successCorrelation < 0.4) {
      advice.push({
        title: `Reduce low-yield ${name} usage`,
        description: `${name} appears in many sessions but correlates weakly with edit-producing outcomes.`,
        priority: metric.repeatedLoopRate > 0.4 ? 'High' : 'Medium',
        suggestedAction: 'Use the tool more selectively or insert a summary/reset before repeating it.',
        relatedTool: name,
      });
    }
  }

  for (const [pattern, metric] of Object.entries(commandMetrics)) {
    if (metric.count >= 4 && metric.errorRate >= 0.4) {
      advice.push({
        title: `Watch the ${pattern} command pattern`,
        description: `${pattern} is contributing repeated failing command executions.`,
        priority: metric.errorRate >= 0.7 ? 'High' : 'Medium',
        suggestedAction: 'Tighten the command scope or switch strategies before retrying the same shell pattern.',
        relatedTool: pattern,
      });
    }
  }

  if (topActivity && topModel && ['Planning', 'Conversation', 'Brainstorming', 'Exploration'].includes(topActivity.category) && topModel.costUSD > 3) {
    advice.push({
      title: 'Right-size the model for lighter workflows',
      description: `${topActivity.category} is currently the dominant activity while ${topModel.model} is carrying most of the spend.`,
      priority: 'Medium',
      suggestedAction: 'Try a smaller model for planning, docs, or exploratory loops and reserve the expensive model for hard edits/debugging.',
      relatedProvider: topModel.model,
    });
  }

  if (events.some((event) => event.kind === 'cache-efficiency-regression')) {
    advice.push({
      title: 'Increase cache-friendly session boundaries',
      description: 'Long-running sessions are likely resending too much context.',
      priority: 'Medium',
      suggestedAction: 'End sessions earlier, carry forward a smaller summary, and avoid repeatedly reloading the same large context blocks.',
    });
  }

  return advice.slice(0, 8);
}

function buildDigests(events: OptimizationEvent[]): NotificationDigest[] {
  const sortedEvents = [...events].sort((left, right) => {
    const weights = { High: 3, Medium: 2, Low: 1 };
    return weights[right.severity] - weights[left.severity];
  });

  const topDaily = sortedEvents.slice(0, 3);
  const topWeekly = sortedEvents.slice(0, 5);

  return [
    {
      period: 'daily',
      generatedAt: Date.now(),
      headline: topDaily.length > 0 ? `${topDaily.length} active issue${topDaily.length === 1 ? '' : 's'} need attention` : 'No urgent issues detected today',
      summary: topDaily.map((event) => `${event.title}: ${event.description}`),
      eventIds: topDaily.map((event) => event.id),
    },
    {
      period: 'weekly',
      generatedAt: Date.now(),
      headline: topWeekly.length > 0 ? `${topWeekly.length} optimization signals across the week` : 'No optimization regressions detected this week',
      summary: topWeekly.map((event) => `${event.title}: ${event.recommendedAction}`),
      eventIds: topWeekly.map((event) => event.id),
    },
  ];
}

export function analyzeAdvice(
  sessions: Session[],
  metrics: Metrics,
  findings: WasteFinding[],
  periodDays: number,
): {
  events: OptimizationEvent[];
  digests: NotificationDigest[];
  toolAdvice: ToolAdvice[];
  byTool: Record<string, ToolMetrics>;
  byMcpServer: Record<string, McpServerMetrics>;
  byCommandPattern: Record<string, CommandPatternMetrics>;
} {
  const { byTool, byMcpServer, byCommandPattern } = buildToolMetrics(sessions);
  const events = buildEvents(sessions, metrics, findings, byTool, byMcpServer, periodDays);
  const digests = buildDigests(events);
  const toolAdvice = buildToolAdvice(metrics, byTool, byMcpServer, byCommandPattern, events);

  return {
    events,
    digests,
    toolAdvice,
    byTool,
    byMcpServer,
    byCommandPattern,
  };
}
