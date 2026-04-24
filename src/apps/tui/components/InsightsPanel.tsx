import React from 'react';
import { Box, Text } from 'ink';

interface InsightsPanelProps {
  insights: string[];
}

export function InsightsPanel({ insights }: InsightsPanelProps) {
  if (insights.length === 0) {
    return null;
  }

  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor="#334155"
      marginTop={1}
    >
      <Text bold color="#94a3b8">
        AI Insights
      </Text>
      <Box flexDirection="column" gap={1} marginTop={1}>
        {insights.map((insight, index) => (
          <Box key={index} gap={1}>
            <Text color="#6366f1">💡</Text>
            <Text color="#cbd5e1">{insight.replace(/\*\*/g, '')}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}