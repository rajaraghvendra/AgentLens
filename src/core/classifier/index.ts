// ─────────────────────────────────────────────────────────────
// AgentLens – Deterministic Activity Classifier
// ─────────────────────────────────────────────────────────────

import type { ActivityCategory, ToolUsage } from '../../types/index.js';

/**
 * Deterministically classify a user message and its succeeding assistant tool usages
 * into one of 13 categories. Rule order matters (most specific to least specific).
 */
export function classifyTurn(userMessage: string, toolsUsed: ToolUsage[]): ActivityCategory {
  const text = userMessage.toLowerCase();
  const toolNames = toolsUsed.map(t => t.name);
  
  // Combine all bash command inputs for inspection
  const bashInputs = toolsUsed
    .filter(t => t.name.toLowerCase() === 'bash' || t.name === 'exec_command')
    .map(t => typeof t.input === 'string' ? t.input.toLowerCase() : JSON.stringify(t.input).toLowerCase())
    .join(' ');

  // 1. Git Ops
  if (bashInputs.includes('git push') || bashInputs.includes('git commit') || bashInputs.includes('git merge') || /commit|pull request|merge/i.test(text)) {
    return 'Git Ops';
  }

  // 2. Testing
  if (/(pytest|jest|vitest|npm test)/.test(bashInputs) || /\btest\b|\btests\b/i.test(text)) {
    return 'Testing';
  }

  // 3. Debugging
  if (/error|fix|bug|stacktrace|crash|exception/i.test(text) || toolNames.includes('ViewError')) {
    return 'Debugging';
  }

  // 4. Refactoring
  if (/refactor|rename|simplify|extract|cleanup|restructure/i.test(text)) {
    return 'Refactoring';
  }

  // 5. Build/Deploy
  if (/(docker|kubectl|build|deploy|vercel|aws|terraform)/.test(bashInputs) || /deploy|build/i.test(text)) {
    return 'Build/Deploy';
  }

  // 6. Feature Dev (Requires Edit tool + specific keywords)
  if ((toolNames.includes('Edit') || toolNames.includes('Write')) && /create|implement|add|build/i.test(text)) {
    return 'Feature Dev';
  }

  // 7. Coding
  if (toolNames.includes('Edit') || toolNames.includes('Write')) {
    return 'Coding';
  }

  // 8. Exploration
  if (toolNames.includes('Read') && !toolNames.includes('Edit')) {
    return 'Exploration';
  }

  // 9. Planning
  if (/plan|design|architecture|how should we/i.test(text)) {
    return 'Planning';
  }

  // 10. Brainstorming
  if (/ideas|suggest|what if|alternatives/i.test(text)) {
    return 'Brainstorming';
  }

  // 11. Delegation
  if (/do that|go ahead|proceed|execute/i.test(text)) {
    return 'Delegation';
  }

  // 12. Conversation
  if (text.length < 50 && !toolNames.length && /\b(hello|hi|ok|thanks)\b/i.test(text)) {
    return 'Conversation';
  }

  return 'General';
}
