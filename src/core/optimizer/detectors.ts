// ─────────────────────────────────────────────────────────────
// AgentLens – Enhanced Optimization Detectors
// ─────────────────────────────────────────────────────────────

import type { Session, WasteFinding } from '../../types/index.js';

const JUNK_PATHS = ['node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage', '.cache', 'vendor'];
const AVG_TOKENS_PER_READ = 3000;

export function detectJunkReads(sessions: Session[]): WasteFinding | null {
  const junkCounts: Record<string, number> = {};
  let totalJunkReads = 0;

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (!msg.tools) continue;
      for (const tool of msg.tools) {
        if (tool.name !== 'Read') continue;
        const path = typeof tool.input === 'object' && tool.input
          ? (tool.input as any).path || (tool.input as any).file_path || ''
          : typeof tool.input === 'string' ? tool.input : '';
        
        for (const junk of JUNK_PATHS) {
          if (path.includes(junk)) {
            junkCounts[junk] = (junkCounts[junk] || 0) + 1;
            totalJunkReads++;
          }
        }
      }
    }
  }

  if (totalJunkReads < 5) return null;

  const details = Object.entries(junkCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([dir, count]) => `${dir}/ (${count}x)`)
    .join(', ');

  const estimatedTokens = totalJunkReads * AVG_TOKENS_PER_READ;

  return {
    kind: 'junk-reads',
    severity: totalJunkReads > 30 ? 'High' : 'Medium',
    title: 'Agent is Reading Build/Dependency Folders',
    description: `Claude read into ${details}. These directories contain no actionable code for the agent.`,
    estimatedTokensWasted: estimatedTokens,
    estimatedCostWastedUSD: (estimatedTokens / 1_000_000) * 3.0,
    suggestedFix: `Append to your project CLAUDE.md:\n\nDo not read or search files under these directories:\n${JUNK_PATHS.filter(d => junkCounts[d]).map(d => `- ${d}/`).join('\n')}`,
    confidence: 0.95,
    triggerValue: totalJunkReads,
    expectedRange: '<= 5 junk directory reads',
    baselineWindow: 'current period',
  };
}

export function detectDuplicateReads(sessions: Session[]): WasteFinding | null {
  const fileReads = new Map<string, { count: number; sessionIds: Set<string> }>();

  for (const session of sessions) {
    for (const msg of session.messages) {
      if (!msg.tools) continue;
      for (const tool of msg.tools) {
        if (tool.name !== 'Read') continue;
        const path = typeof tool.input === 'object' && tool.input
          ? (tool.input as any).path || (tool.input as any).file_path || ''
          : typeof tool.input === 'string' ? tool.input : '';
        
        if (!path || JUNK_PATHS.some(j => path.includes(j))) continue;

        if (!fileReads.has(path)) {
          fileReads.set(path, { count: 0, sessionIds: new Set() });
        }
        const entry = fileReads.get(path)!;
        entry.count++;
        entry.sessionIds.add(session.id);
      }
    }
  }

  const duplicates = Array.from(fileReads.entries())
    .filter(([, data]) => data.count > 3 && data.sessionIds.size > 1)
    .sort((a, b) => b[1].count - a[1].count);

  if (duplicates.length === 0) return null;

  const totalDuplicateReads = duplicates.reduce((sum, [, data]) => sum + data.count, 0);
  const estimatedTokens = totalDuplicateReads * AVG_TOKENS_PER_READ * 0.7;
  const topFiles = duplicates.slice(0, 3).map(([path, data]) => `${path} (${data.count}x across ${data.sessionIds.size} sessions)`).join(', ');

  return {
    kind: 'duplicate-reads',
    severity: totalDuplicateReads > 20 ? 'High' : 'Medium',
    title: 'Duplicate File Reads Across Sessions',
    description: `Files re-read across multiple sessions: ${topFiles}. Agent is not retaining context between sessions.`,
    estimatedTokensWasted: Math.round(estimatedTokens),
    estimatedCostWastedUSD: (estimatedTokens / 1_000_000) * 3.0,
    suggestedFix: 'Use longer sessions or carry forward a context summary. Consider a project-level CLAUDE.md with key file summaries.',
    confidence: 0.82,
    triggerValue: totalDuplicateReads,
    expectedRange: '<= 3 duplicate reads per file',
    baselineWindow: 'current period',
  };
}

export function detectReadEditRatio(sessions: Session[]): WasteFinding | null {
  let totalReads = 0;
  let totalEdits = 0;
  let blindEdits = 0;

  for (const session of sessions) {
    const readFiles = new Set<string>();
    for (const msg of session.messages) {
      if (!msg.tools) continue;
      for (const tool of msg.tools) {
        if (tool.name === 'Read') {
          const path = typeof tool.input === 'object' && tool.input
            ? (tool.input as any).path || (tool.input as any).file_path || ''
            : typeof tool.input === 'string' ? tool.input : '';
          if (path) readFiles.add(path);
          totalReads++;
        }
        if (tool.name === 'Edit' || tool.name === 'Write') {
          const path = typeof tool.input === 'object' && tool.input
            ? (tool.input as any).path || (tool.input as any).file_path || ''
            : typeof tool.input === 'string' ? tool.input : '';
          if (path && !readFiles.has(path)) {
            blindEdits++;
          }
          totalEdits++;
        }
      }
    }
  }

  if (totalEdits === 0 || (totalReads / totalEdits) >= 1.5) return null;
  if (blindEdits < 5) return null;

  return {
    kind: 'low-read-edit-ratio',
    severity: blindEdits > 15 ? 'High' : 'Medium',
    title: 'Editing Without Reading (Low Read/Edit Ratio)',
    description: `Agent made ${totalEdits} edits but only ${totalReads} reads (ratio: ${(totalReads / totalEdits).toFixed(2)}). ${blindEdits} edits were made to files never read in the session.`,
    estimatedTokensWasted: blindEdits * 500,
    estimatedCostWastedUSD: (blindEdits * 500 / 1_000_000) * 3.0,
    suggestedFix: 'Configure the agent to read files before editing. Add "always read before edit" to your project CLAUDE.md.',
    confidence: 0.78,
    triggerValue: blindEdits,
    expectedRange: 'Read/Edit ratio >= 1.5',
    baselineWindow: 'current period',
  };
}

export function detectCacheBloat(sessions: Session[]): WasteFinding | null {
  const sessionsWithCache: number[] = [];

  for (const session of sessions) {
    let sessionCacheWrite = 0;
    for (const msg of session.messages) {
      if (msg.tokens?.cacheWrite) {
        sessionCacheWrite += msg.tokens.cacheWrite;
      }
    }
    if (sessionCacheWrite > 0) {
      sessionsWithCache.push(sessionCacheWrite);
    }
  }

  if (sessionsWithCache.length < 3) return null;

  const avg = sessionsWithCache.reduce((a, b) => a + b, 0) / sessionsWithCache.length;
  const bloated = sessionsWithCache.filter(v => v > avg * 2);

  if (bloated.length === 0 || bloated.length < 2) return null;

  const totalBloat = bloated.reduce((sum, v) => sum + (v - avg), 0);
  const estimatedCost = (totalBloat / 1_000_000) * 3.75;

  return {
    kind: 'cache-bloat',
    severity: bloated.length > 5 ? 'High' : 'Low',
    title: 'Cache Bloat in Long Sessions',
    description: `${bloated.length} sessions have cache writes >2x the average (${Math.round(avg)} tokens). These sessions are accumulating excessive context.`,
    estimatedTokensWasted: Math.round(totalBloat),
    estimatedCostWastedUSD: Number(estimatedCost.toFixed(2)),
    suggestedFix: 'Reset long sessions earlier and carry forward a shorter working summary. Use context compaction.',
    confidence: 0.71,
    triggerValue: bloated.length,
    expectedRange: 'Cache writes within 2x average',
    baselineWindow: 'current period',
  };
}

export function detectUnusedMcpServers(sessions: Session[], configuredServers?: string[]): WasteFinding | null {
  if (!configuredServers || configuredServers.length === 0) return null;

  const usedServers = new Set<string>();
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (!msg.tools) continue;
      for (const tool of msg.tools) {
        const serverName = (tool as any).serverName || '';
        if (serverName) usedServers.add(serverName);
      }
    }
  }

  const unused = configuredServers.filter(s => !usedServers.has(s));
  if (unused.length === 0) return null;

  return {
    kind: 'unused-mcp-servers',
    severity: unused.length > 3 ? 'Medium' : 'Low',
    title: 'Unused MCP Servers Configured',
    description: `${unused.length} MCP server(s) configured but never invoked: ${unused.join(', ')}.`,
    estimatedTokensWasted: unused.length * 200,
    estimatedCostWastedUSD: 0,
    suggestedFix: `Remove unused MCP servers from config:\n${unused.map(s => `- ${s}`).join('\n')}`,
    confidence: 0.88,
    triggerValue: unused.length,
    expectedRange: '0 unused MCP servers',
    baselineWindow: 'current period',
  };
}

export function detectGhostAgents(sessions: Session[], configuredAgents?: string[]): WasteFinding | null {
  if (!configuredAgents || configuredAgents.length === 0) return null;

  const usedAgents = new Set<string>();
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (!msg.tools) continue;
      for (const tool of msg.tools) {
        const agentName = (tool as any).agentName || '';
        if (agentName) usedAgents.add(agentName);
      }
    }
  }

  const unused = configuredAgents.filter(a => !usedAgents.has(a));
  if (unused.length === 0) return null;

  return {
    kind: 'ghost-agents',
    severity: unused.length > 2 ? 'Medium' : 'Low',
    title: 'Ghost Agents Configured',
    description: `${unused.length} agent(s) configured but never invoked: ${unused.join(', ')}.`,
    estimatedTokensWasted: 0,
    estimatedCostWastedUSD: 0,
    suggestedFix: `Remove ghost agents from config:\n${unused.map(a => `- ${a}`).join('\n')}`,
    confidence: 0.85,
    triggerValue: unused.length,
    expectedRange: '0 unused agents',
    baselineWindow: 'current period',
  };
}
