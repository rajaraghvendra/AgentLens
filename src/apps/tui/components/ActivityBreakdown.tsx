import React from 'react';
import { Box, Text } from 'ink';
import type { Metrics } from '../../../types/index.js';

interface ActivityBreakdownProps {
  metrics: Metrics;
}

export function ActivityBreakdown({ metrics }: ActivityBreakdownProps) {
  const activities = Object.values(metrics.byActivity)
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 5);

  const maxValue = Math.max(...activities.map(a => a.totalTokens), 1);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Text bold color="#94a3b8">
        Activity Breakdown
      </Text>
      <Box flexDirection="column" gap={0} marginTop={1}>
        {activities.map(activity => {
          const percentage = (activity.totalTokens / maxValue) * 20;
          const bar = '█'.repeat(Math.max(1, Math.floor(percentage)));

          return (
            <Box key={activity.category} justifyContent="space-between">
              <Text color="#cbd5e1" dimColor>
                {activity.category.padEnd(12).substring(0, 12)}
              </Text>
              <Text color="#6366f1">{bar}</Text>
              <Text color="#94a3b8">
                {activity.percentage.toFixed(0).padStart(3)}%
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}