// ─────────────────────────────────────────────────────────────
// Tests – Classifier
// ─────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { classifyTurn } from '../../src/core/classifier/index.js';

describe('Activity Classifier', () => {
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
});
