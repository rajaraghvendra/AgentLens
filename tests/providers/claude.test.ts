// ─────────────────────────────────────────────────────────────
// Tests – Claude Provider & Registry
// ─────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { ClaudeProvider, inferClaudeProjectName } from '../../src/providers/claude.js';
import { getAvailableProviders } from '../../src/providers/index.js';
import { deduplicateSessions } from '../../src/core/parser/dedup.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../fixtures/mock-session.jsonl');

describe('ClaudeProvider', () => {
  it('should instantiate and have correct metadata', () => {
    const provider = new ClaudeProvider();
    expect(provider.id).toBe('claude');
    expect(provider.name).toBe('Claude Code');
  });

  it('should normalize tool names', () => {
    const provider = new ClaudeProvider();
    expect(provider.normalizeToolName('exec_command')).toBe('Bash');
    expect(provider.normalizeToolName('file_edit')).toBe('Edit');
    expect(provider.normalizeToolName('Random')).toBe('Random');
  });

  it('should parse mock session fixture correctly', async () => {
    const provider = new ClaudeProvider();
    const session = await provider.parseSession(FIXTURE_PATH);

    expect(session.provider).toBe('claude');
    // Project comes from the parent dir of the mock object which is 'fixtures'
    expect(session.project).toBe('fixtures');
    
    // There are 11 valid lines in the mock file
    expect(session.messages.length).toBe(11);
    
    // Check first message mapped correctly
    const firstMsg = session.messages[0];
    expect(firstMsg.id).toBe('msg_01_user_001');
    expect(firstMsg.role).toBe('user');
    expect(firstMsg.content).toContain('Fix the login bug');
    
    // Check assistant message mapped correctly with tokens and tools
    const assistantMsg = session.messages.find(m => m.id === 'msg_02_assistant_001')!;
    expect(assistantMsg).toBeDefined();
    expect(assistantMsg.role).toBe('assistant');
    expect(assistantMsg.model).toBe('claude-sonnet-4-20250514');
    
    expect(assistantMsg.tokens).toEqual({
      input: 150,
      output: 45,
      cacheRead: 80,
      cacheWrite: 20
    });
    
    expect(assistantMsg.tools).toBeDefined();
    expect(assistantMsg.tools!.length).toBe(1);
    expect(assistantMsg.tools![0].name).toBe('Read');
    
    // Check tool name normalization works correctly 
    const execToolMsg = session.messages.find(m => m.id === 'msg_05_assistant_003')!;
    const bashTool = execToolMsg.tools!.find(t => t.name === 'Bash');
    expect(bashTool).toBeDefined();
    expect(bashTool!.outputLength).toBe(45);
  });

  it('infers project name for nested Windows subagent session paths', () => {
    const path = 'C:\\Users\\alice\\.claude\\projects\\my-project\\session-123\\subagents\\abc.jsonl';
    expect(inferClaudeProjectName(path)).toBe('my-project');
  });

  it('infers project name for nested POSIX subagent session paths', () => {
    const path = '/Users/alice/.claude/projects/my-project/session-123/subagents/abc.jsonl';
    expect(inferClaudeProjectName(path)).toBe('my-project');
  });
});

describe('Deduplication', () => {
  it('deduplicateSessions removes duplicate IDs and merges messages', () => {
    const s1 = { 
      id: 'session-1', provider: 'claude', project: 'test', timestamp: 100, 
      messages: [{ id: 'm1', role: 'user' as const, content: 'a', timestamp: 100 }]
    };
    
    const s2 = { 
      id: 'session-1', provider: 'claude', project: 'test', timestamp: 100,
      messages: [{ id: 'm2', role: 'assistant' as const, content: 'b', timestamp: 101 }]
    };
    
    const s3 = { 
      id: 'session-2', provider: 'claude', project: 'test', timestamp: 200,
      messages: [{ id: 'm3', role: 'user' as const, content: 'c', timestamp: 200 }]
    };

    const duplicateMessage = { id: 'm3', role: 'user' as const, content: 'c', timestamp: 200 };
    s3.messages.push(duplicateMessage); // Inject explicit message duplication

    const merged = deduplicateSessions([s1, s2, s3]);
    
    expect(merged.length).toBe(2);
    
    const sess1 = merged.find(s => s.id === 'session-1')!;
    expect(sess1.messages.length).toBe(2);
    expect(sess1.messages.map(m => m.id)).toEqual(['m1', 'm2']);
    
    const sess2 = merged.find(s => s.id === 'session-2')!;
    expect(sess2.messages.length).toBe(1); // M3 duplication removed
  });
});

describe('Provider Registry', () => {
  it('getAvailableProviders returns only available providers', () => {
    const providers = getAvailableProviders();
    expect(Array.isArray(providers)).toBe(true);
    // Might be 0 if paths don't exist on this test machine, but it shouldn't crash
  });
});
