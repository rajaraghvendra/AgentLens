// ─────────────────────────────────────────────────────────────
// AgentLens – Formatters
// ─────────────────────────────────────────────────────────────

import chalk from 'chalk';

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount);
}

export function formatSeverityBadge(severity: string): string {
  switch (severity) {
    case 'High': return chalk.bgRed.white.bold(' HIGH ');
    case 'Medium': return chalk.bgYellow.black.bold(' MEDIUM ');
    case 'Low': return chalk.bgCyan.black.bold(' LOW ');
    default: return chalk.bgGray.white.bold(` ${severity.toUpperCase()} `);
  }
}

export function colorize(text: string, color: 'green' | 'red' | 'yellow' | 'blue' | 'cyan' | 'gray'): string {
  return chalk[color](text);
}
