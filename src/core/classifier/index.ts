// ─────────────────────────────────────────────────────
// AgentLens – Deterministic Activity Classifier
// ─────────────────────────────────────────────────────

import type { ActivityCategory, ToolUsage } from '../../types/index.js';

// Tool pattern constants (CodeBurn approach)
const EDIT_TOOLS = new Set(['Edit', 'Write', 'FileEditTool', 'FileWriteTool', 'NotebookEdit', 'cursor:edit']);
const READ_TOOLS = new Set(['Read', 'Grep', 'Glob', 'FileReadTool', 'GrepTool', 'GlobTool']);
const BASH_TOOLS = new Set(['Bash', 'BashTool', 'PowerShellTool', 'exec_command']);
const TASK_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList', 'TaskOutput', 'TaskStop', 'TodoWrite']);
const SEARCH_TOOLS = new Set(['WebSearch', 'WebFetch', 'ToolSearch']);
const MCP_TOOLS_PREFIX = 'mcp__';
const SKILL_TOOL = 'Skill';
const PLANNING_TOOLS = new Set(['TaskCreate', 'TaskUpdate', 'TodoWrite', 'EnterPlanMode', 'ExitPlanMode']);

// Keyword patterns for refined classification
const TEST_PATTERNS = /\b(test|pytest|vitest|jest|mocha|spec|coverage|npm\s+test|npx\s+vitest|npx\s+jest)\b/i;
const GIT_PATTERNS = /\bgit\s+(?:push|pull|commit|merge|rebase|checkout|branch|stash|log|diff|status|add|reset|cherry-pick|tag)\b/i;
const BUILD_PATTERNS = /\b(?:npm\s+run\s+build|npm\s+publish|pip\s+install|docker|deploy|make\s+build|npm\s+run\s+dev|npm\s+start|pm2|systemctl|brew|cargo\s+build|\bbuild\b)\b/i;
const INSTALL_PATTERNS = /\b(?:npm\s+install|pip\s+install|brew\s+install|apt\s+install|cargo\s+add)\b/i;

const DEBUG_KEYWORDS = /\b(?:fix|bug|error|broken|failing|crash|issue|debug|traceback|exception|stack\s*trace|not\s+working|wrong|unexpected|status\s+code|404|500|401|403)\b/i;
const FEATURE_KEYWORDS = /\b(?:add|create|implement|new|build|feature|introduce|set\s*up|scaffold|generate|make\s+(?:a|me|the)|write\s+(?:a|me|the))\b/i;
const REFACTOR_KEYWORDS = /\b(?:refactor|clean\s*up|rename|reorganize|simplify|extract|restructure|move|migrate|split)\b/i;
const BRAINSTORM_KEYWORDS = /\b(?:brainstorm|ideas?|what\s+if|explore|think\s+about|approach|strategy|design|consider|how\s+should|what\s+would|opinion|suggest|recommend)\b/i;
const RESEARCH_KEYWORDS = /\b(?:research|investigate|look\s+into|find\s+out|check|search|analyze|review|understand|explain|how\s+does|what\s+is|show\s+me|list|compare)\b/i;

const FILE_PATTERNS = /\.(?:py|js|ts|tsx|jsx|json|yaml|yml|toml|sql|sh|go|rs|java|rb|php|css|html|md|csv|xml)\b/i;
const SCRIPT_PATTERNS = /\b(?:run\s+\S+\.\w+|execute|script?|curl|api\s+\S+|endpoint|request\s+url|fetch\s+\S+|query|database|db\s+\S+)\b/i;
const URL_PATTERN = /https?:\/\/\S+/i;

export interface ParsedTurn {
  userMessage: string;
  assistantCalls: { model: string; tools: string[]; hasPlanMode?: boolean; hasAgentSpawn?: boolean }[];
}

export interface ClassifiedTurn extends ParsedTurn {
  category: ActivityCategory;
  retries: number;
  hasEdits: boolean;
}

function hasEditTools(tools: string[]): boolean {
  return tools.some(t => EDIT_TOOLS.has(t));
}

function hasReadTools(tools: string[]): boolean {
  return tools.some(t => READ_TOOLS.has(t));
}

function hasBashTool(tools: string[]): boolean {
  return tools.some(t => BASH_TOOLS.has(t));
}

function hasTaskTools(tools: string[]): boolean {
  return tools.some(t => TASK_TOOLS.has(t));
}

function hasSearchTools(tools: string[]): boolean {
  return tools.some(t => SEARCH_TOOLS.has(t));
}

function hasMcpTools(tools: string[]): boolean {
  return tools.some(t => t.startsWith(MCP_TOOLS_PREFIX));
}

function hasSkillTool(tools: string[]): boolean {
  return tools.some(t => t === SKILL_TOOL);
}

function hasPlanningTools(tools: string[]): boolean {
  return tools.some(t => PLANNING_TOOLS.has(t));
}

function getAllTools(turn: ParsedTurn): string[] {
  return turn.assistantCalls.flatMap(c => c.tools || []);
}

/**
 * Classify based on tool usage patterns (CodeBurn approach)
 */
function classifyByToolPattern(turn: ParsedTurn): ActivityCategory | null {
  const tools = getAllTools(turn);
  if (tools.length === 0) return null;

  // Check for plan mode
  if (turn.assistantCalls.some(c => c.hasPlanMode)) return 'Planning';
  if (turn.assistantCalls.some(c => c.hasAgentSpawn)) return 'Delegation';

  const hasEdits = hasEditTools(tools);
  const hasReads = hasReadTools(tools);
  const hasBash = hasBashTool(tools);
  const hasTasks = hasTaskTools(tools);
  const hasSearch = hasSearchTools(tools);
  const hasMcp = hasMcpTools(tools);
  const hasSkill = hasSkillTool(tools);

  // Bash-only operations
  if (hasBash && !hasEdits) {
    const userMsg = turn.userMessage;
    if (TEST_PATTERNS.test(userMsg)) return 'Testing';
    if (GIT_PATTERNS.test(userMsg)) return 'Git Ops';
    if (BUILD_PATTERNS.test(userMsg)) return 'Build/Deploy';
    if (INSTALL_PATTERNS.test(userMsg)) return 'Build/Deploy';
  }

  if (hasEdits) return 'Coding';

  if (hasBash && hasReads) return 'Exploration';
  if (hasBash) return 'Coding';

  if (hasSearch || hasMcp) return 'Exploration';
  if (hasReads && !hasEdits) return 'Exploration';
  if (hasTasks && !hasEdits) return 'Planning';
  if (hasSkill) return 'General';

  return null;
}

/**
 * Refine classification with keyword analysis
 */
function refineByKeywords(category: ActivityCategory, userMessage: string): ActivityCategory {
  if (category === 'Coding') {
    if (DEBUG_KEYWORDS.test(userMessage)) return 'Debugging';
    if (REFACTOR_KEYWORDS.test(userMessage)) return 'Refactoring';
    if (FEATURE_KEYWORDS.test(userMessage)) return 'Feature Dev';
    return 'Coding';
  }

  if (category === 'Exploration') {
    if (RESEARCH_KEYWORDS.test(userMessage)) return 'Exploration';
    if (DEBUG_KEYWORDS.test(userMessage)) return 'Debugging';
    return 'Exploration';
  }

  return category;
}

/**
 * Classify conversation-only turns (no tools)
 */
function classifyConversation(userMessage: string): ActivityCategory {
  if (BRAINSTORM_KEYWORDS.test(userMessage)) return 'Brainstorming';
  if (RESEARCH_KEYWORDS.test(userMessage)) return 'Exploration';
  if (DEBUG_KEYWORDS.test(userMessage)) return 'Debugging';
  if (FEATURE_KEYWORDS.test(userMessage)) return 'Feature Dev';
  if (FILE_PATTERNS.test(userMessage)) return 'Coding';
  if (SCRIPT_PATTERNS.test(userMessage)) return 'Coding';
  if (URL_PATTERN.test(userMessage)) return 'Exploration';
  return 'Conversation';
}

/**
 * Count retries within a turn (CodeBurn approach)
 */
function countRetries(turn: ParsedTurn): number {
  let sawEditBeforeBash = false;
  let sawBashAfterEdit = false;
  let retries = 0;

  for (const call of turn.assistantCalls) {
    const tools = call.tools || [];
    const hasEdit = tools.some(t => EDIT_TOOLS.has(t));
    const hasBash = tools.some(t => BASH_TOOLS.has(t));

    if (hasEdit) {
      if (sawBashAfterEdit) retries++;
      sawEditBeforeBash = true;
      sawBashAfterEdit = false;
    }
    if (hasBash && sawEditBeforeBash) {
      sawBashAfterEdit = true;
    }
  }

  return retries;
}

function turnHasEdits(turn: ParsedTurn): boolean {
  return turn.assistantCalls.some(c => 
    c.tools && c.tools.some(t => EDIT_TOOLS.has(t))
  );
}

/**
 * Main classification function (CodeBurn-enhanced)
 * Deterministic classification without LLM calls.
 */
export function classifyTurn(userMessage: string, toolsUsed: ToolUsage[]): ActivityCategory;
export function classifyTurn(turn: ParsedTurn): ClassifiedTurn;
export function classifyTurn(arg1: string | ParsedTurn, arg2?: ToolUsage[]): ActivityCategory | ClassifiedTurn {
  // Handle legacy signature: classifyTurn(userMessage, toolsUsed)
  if (typeof arg1 === 'string') {
    const userMessage = arg1;
    const toolsUsed = arg2 || [];
    const tools = toolsUsed.map(t => t.name);
    
    // Combine all bash command inputs for inspection
    const bashInputs = toolsUsed
      .filter(t => t.name.toLowerCase() === 'bash' || t.name === 'exec_command')
      .map(t => typeof t.input === 'string' ? t.input.toLowerCase() : JSON.stringify(t.input).toLowerCase())
      .join(' ');
    
    // Original classification logic
    if (bashInputs.includes('git push') || bashInputs.includes('git commit') || bashInputs.includes('git merge') || /commit|pull request|merge/i.test(userMessage)) {
      return 'Git Ops';
    }
    if (/(pytest|jest|vitest|npm test)/.test(bashInputs) || /\btest\b|\btests\b/i.test(userMessage)) {
      return 'Testing';
    }
    if (/error|fix|bug|stacktrace|crash|exception/i.test(userMessage) || tools.includes('ViewError')) {
      return 'Debugging';
    }
    if (/refactor|rename|simplify|extract|cleanup|restructure/i.test(userMessage)) {
      return 'Refactoring';
    }
    if (/(docker|kubectl|build|deploy|vercel|aws|terraform)/.test(bashInputs) || /deploy|build/i.test(userMessage)) {
      return 'Build/Deploy';
    }
    if ((tools.includes('Edit') || tools.includes('Write')) && /create|implement|add|build/i.test(userMessage)) {
      return 'Feature Dev';
    }
    if (tools.includes('Edit') || tools.includes('Write')) {
      return 'Coding';
    }
    if (tools.includes('Read') && !tools.includes('Edit')) {
      return 'Exploration';
    }
    if (/plan|design|architecture|how should we/i.test(userMessage)) {
      return 'Planning';
    }
    if (/ideas|suggest|what if|alternatives/i.test(userMessage)) {
      return 'Brainstorming';
    }
    if (/do that|go ahead|proceed|execute/i.test(userMessage)) {
      return 'Delegation';
    }
    if (userMessage.length < 50 && !tools.length && /\b(hello|hi|ok|thanks)\b/i.test(userMessage)) {
      return 'Conversation';
    }
    return 'General';
  }

  // New signature: classifyTurn(turn: ParsedTurn)
  const turn = arg1 as ParsedTurn;
  
  // Check for plan mode or agent spawn first (regardless of tools)
  if (turn.assistantCalls.some(c => c.hasPlanMode)) {
    return {
      ...turn,
      category: 'Planning',
      retries: countRetries(turn),
      hasEdits: turnHasEdits(turn),
    };
  }
  if (turn.assistantCalls.some(c => c.hasAgentSpawn)) {
    return {
      ...turn,
      category: 'Delegation',
      retries: countRetries(turn),
      hasEdits: turnHasEdits(turn),
    };
  }
  
  const tools = getAllTools(turn);

  let category: ActivityCategory;

  if (tools.length === 0) {
    // No tools - classify based on conversation
    category = classifyConversation(turn.userMessage);
  } else {
    // Tools present - use tool pattern classification
    const toolCategory = classifyByToolPattern(turn);
    if (toolCategory) {
      category = refineByKeywords(toolCategory, turn.userMessage);
    } else {
      category = classifyConversation(turn.userMessage);
    }
  }

  return {
    ...turn,
    category,
    retries: countRetries(turn),
    hasEdits: turnHasEdits(turn),
  };
}
