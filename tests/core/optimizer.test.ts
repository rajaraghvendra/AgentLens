// ─────────────────────────────────────────────────────────────
// Tests – Optimizer
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { analyzeInefficiencies } from '../../src/core/optimizer/index.js';
import { analyzeAdvice } from '../../src/core/optimizer/advice.js';
import { computeMetrics } from '../../src/core/metrics/index.js';
import type { Session, ToolUsage } from '../../src/types/index.js';

describe('Optimizer', () => {
  it('detects high bash output waste', () => {
    const session: Session = {
      id: 's1', provider: 'claude', project: 'test', timestamp: 0,
      messages: []
    };
    
    // Inject 6 messages with >5000 output to trigger the rule
    for (let i = 0; i < 6; i++) {
        session.messages.push({
            id: `m${i}`, role: 'assistant', content: '', timestamp: i,
            tools: [{ name: 'Bash', input: 'cat massive.log', outputLength: 5500 }]
        });
    }

    const findings = analyzeInefficiencies([session]);
    const bashFinding = findings.find(f => f.title === 'Uncapped Bash Output');
    expect(bashFinding).toBeDefined();
    expect(bashFinding!.severity).toBe('Medium');
  });

  it('detects continuous file read blindness', () => {
    const session: Session = {
      id: 's2', provider: 'claude', project: 'test', timestamp: 0,
      messages: []
    };
    
    // Inject 11 reads without an edit
    for (let i = 0; i < 11; i++) {
        session.messages.push({
            id: `m${i}`, role: 'assistant', content: '', timestamp: i,
            tools: [{ name: 'Read', input: { path: `file${i}.ts` } }]
        });
    }

    const findings = analyzeInefficiencies([session]);
    const readFinding = findings.find(f => f.title.includes('Context Blindness'));
    expect(readFinding).toBeDefined();
  });

  it('detects edit retry loops', () => {
    const session: Session = {
      id: 's3', provider: 'claude', project: 'test', timestamp: 0,
      messages: []
    };
    
    // Inject 4 edits to the exact same file
    for (let i = 0; i < 4; i++) {
        session.messages.push({
            id: `m${i}`, role: 'assistant', content: '', timestamp: i,
            tools: [{ name: 'Edit', input: { path: 'src/main.ts' } }]
        });
    }

    const findings = analyzeInefficiencies([session]);
    const editFinding = findings.find(f => f.title === 'Edit Retry Loops Detected');
    expect(editFinding).toBeDefined();
    expect(editFinding!.severity).toBe('High');
  });

  it('detects unused/failing MCP servers', () => {
    const session: Session = {
      id: 's4', provider: 'claude', project: 'test', timestamp: 0,
      messages: []
    };
    
    // Inject 3 failing MCP calls
    for (let i = 0; i < 3; i++) {
        session.messages.push({
            id: `m${i}`, role: 'assistant', content: '', timestamp: i,
            tools: [{ name: 'mcp_fetch', input: { server_name: 'test' }, isError: true }]
        });
    }

    const findings = analyzeInefficiencies([session]);
    const mcpFinding = findings.find(f => f.title === 'Failing MCP Servers');
    expect(mcpFinding).toBeDefined();
    expect(mcpFinding!.severity).toBe('Low');
  });

  it('returns empty array when no issues are found', () => {
     const session: Session = {
      id: 's5', provider: 'claude', project: 'test', timestamp: 0,
      messages: [{
            id: `m1`, role: 'assistant', content: '', timestamp: 1,
            tools: [{ name: 'Edit', input: { path: 'src/main.ts' } }]
      }]
    };
    const findings = analyzeInefficiencies([session]);
    expect(findings.length).toBe(0);
  });

  it('generates MCP advice and events for repeated failures', async () => {
    const session: Session = {
      id: 's6', provider: 'claude', project: 'test', timestamp: 0,
      messages: Array.from({ length: 4 }).map((_, index) => ({
        id: `m${index}`,
        role: 'assistant' as const,
        content: '',
        timestamp: index + 1,
        model: 'claude-sonnet-4-20250514',
        tokens: { input: 50, output: 20, cacheRead: 0, cacheWrite: 0 },
        tools: [{ name: 'mcp_fetch', input: { server_name: 'broken-mcp' }, isError: true }],
      })),
    };

    const metrics = await computeMetrics([session]);
    const findings = analyzeInefficiencies([session], metrics);
    const advice = analyzeAdvice([session], metrics, findings, 7);

    expect(advice.events.some((event) => event.kind === 'mcp-failure-spike')).toBe(true);
    expect(advice.toolAdvice.some((item) => item.title.includes('broken-mcp'))).toBe(true);
  });
});
