const MODEL_DISPLAY_NAMES: Record<string, string> = {
  'cursor-auto': 'Auto (Sonnet est.)',
  'kiro-auto': 'Kiro Auto (Sonnet est.)',
};

export function getModelDisplayName(model?: string): string {
  if (!model) return 'Unknown';
  return MODEL_DISPLAY_NAMES[model] ?? model;
}
