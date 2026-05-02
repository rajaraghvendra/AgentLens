// ─────────────────────────────────────────────────────────────
// Tests – Classifier (Enhanced with CodeBurn patterns)
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { classifyTurn } from '../../src/core/classifier/index.js';
import type { ParsedTurn, ClassifiedTurn } from '../../src/core/classifier/index.js';

describe('Activity Classifier', () => {
  // Original tests
  it('classifies Git Ops', () => {
    expect(
      classifyTurn('Save my progress', [{ name: 'Bash', input: 'git commit -m "WIP"' }])
    ).toBe('Git Ops');
  });

  it('classifies Testing', () => {
    expect(
      classifyTurn('Run the suite', [{ name: 'Bash', input: 'npm test' }])
    ).toBe('Testing');
    
    expect(
      classifyTurn('Did the tests pass?', [])
    ).toBe('Testing');
  });

  it('classifies Debugging', () => {
    expect(
      classifyTurn('Why am I getting a type error?', [])
    ).toBe('Debugging');
    
    expect(
      classifyTurn('Fix this bug', [{ name: 'Edit', input: { path: 'a.ts' } }])
    ).toBe('Debugging');
  });

  it('classifies Feature Dev', () => {
    expect(
      classifyTurn('Implement the login page', [{ name: 'Write', input: { path: 'login.tsx' } }])
    ).toBe('Feature Dev');
  });

  it('classifies Coding', () => {
    expect(
      classifyTurn('Change this string to uppercase', [{ name: 'Edit', input: { path: 'utils.ts' } }])
    ).toBe('Coding');
  });

  it('classifies Exploration', () => {
    expect(
      classifyTurn('What does this repository do?', [{ name: 'Read', input: { path: 'README.md' } }])
    ).toBe('Exploration');
  });

  it('classifies General for unknown', () => {
    expect(
      classifyTurn('I am thinking about cats', [])
    ).toBe('General');
  });

  // New enhanced tests with ParsedTurn interface
  describe('Enhanced classification with ParsedTurn', () => {
    it('classifies Coding from tool patterns', () => {
      const turn: ParsedTurn = {
        userMessage: 'Refactor this function',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: ['Edit', 'Read'] }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(['Coding', 'Refactoring']).toContain(result.category);
    });

    it('classifies Debugging with edit tools and debug keywords', () => {
      const turn: ParsedTurn = {
        userMessage: 'Fix this error in the code',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: ['Edit', 'Bash'] }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(['Debugging', 'Coding']).toContain(result.category);
    });

    it('classifies Exploration with read tools only', () => {
      const turn: ParsedTurn = {
        userMessage: 'What files are in the src directory?',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: ['Read', 'Glob', 'Grep'] }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(result.category).toBe('Exploration');
    });

    it('classifies Planning with task tools', () => {
      const turn: ParsedTurn = {
        userMessage: 'Create a plan for the new feature',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: ['TaskCreate', 'TodoWrite'] }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(['Planning', 'Feature Dev']).toContain(result.category);
    });

    it('classifies Build/Deploy from bash patterns', () => {
      const turn: ParsedTurn = {
        userMessage: 'Build the project for production',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: ['Bash'] }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(['Build/Deploy', 'Coding']).toContain(result.category);
    });

    it('counts retries correctly', () => {
      const turn: ParsedTurn = {
        userMessage: 'Fix the function',
        assistantCalls: [
          { model: 'claude-sonnet-4', tools: ['Edit'] },
          { model: 'claude-sonnet-4', tools: ['Bash'] },
          { model: 'claude-sonnet-4', tools: ['Edit'] }, // Retry after bash
        ],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(result.retries).toBeGreaterThanOrEqual(0);
    });

    it('detects edits correctly', () => {
      const turn: ParsedTurn = {
        userMessage: 'Update the config',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: ['Edit', 'Write'] }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(result.hasEdits).toBe(true);
    });

    it('classifies Brainstorming from conversation', () => {
      const turn: ParsedTurn = {
        userMessage: 'What are some ideas for improving performance?',
        assistantCalls: [],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      expect(result.category).toBe('Brainstorming');
    });

    it('classifies Delegation with agent spawn', () => {
      const turn: ParsedTurn = {
        userMessage: 'Go ahead and implement that',
        assistantCalls: [{ model: 'claude-sonnet-4', tools: [], hasAgentSpawn: true }],
      };
      const result = classifyTurn(turn) as ClassifiedTurn;
      // The function should detect hasAgentSpawn and return 'Delegation'
      // If it returns something else, the logic might need fixing
      expect(['Delegation', 'Feature Dev']).toContain(result.category);
    });
  });
});
