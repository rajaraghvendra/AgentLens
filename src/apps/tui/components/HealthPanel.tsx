import React from 'react';
import { Box, Text } from 'ink';

interface HealthPanelProps {
  score: number;
  grade: string;
  issueCount: number;
  sessionsCount: number;
  totalCost: number;
  totalTokensWasted: number;
  totalCostWasted: number;
  totalTokens: number;
  width: number;
}

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#22c55e',
  C: '#eab308',
  D: '#f97316',
  F: '#ef4444',
};

export function HealthPanel({ score, grade, issueCount, sessionsCount, totalCost, totalTokensWasted, totalCostWasted, totalTokens, width }: HealthPanelProps) {
  const gradeColor = GRADE_COLORS[grade] || '#ef4444';
  const savingsPercent = totalTokens > 0 ? ((totalCostWasted / totalCost) * 100).toFixed(1) : '0';

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={gradeColor} width={width} paddingX={1}>
      <Box>
        <Text bold color={gradeColor}>{` ${grade} `}</Text>
        <Text> Health Score: {score}/100</Text>
        <Text dimColor> ({issueCount} issues)</Text>
      </Box>
      <Box marginTop={1} gap={1}>
        <Text>{sessionsCount} sessions</Text>
        <Text dimColor>·</Text>
        <Text>${totalCost.toFixed(2)}</Text>
      </Box>
      {totalTokensWasted > 0 && (
        <Box marginTop={1}>
          <Text color="#eab308">Potential savings: </Text>
          <Text>~{(totalTokensWasted / 1000).toFixed(1)}K tokens (~${totalCostWasted.toFixed(2)}, ~{savingsPercent}%)</Text>
        </Box>
      )}
    </Box>
  );
}
