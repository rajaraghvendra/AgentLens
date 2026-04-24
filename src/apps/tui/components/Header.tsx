import React from 'react';
import { Box, Text } from 'ink';
import { useState } from 'react';

interface HeaderProps {
  period: number;
  onPeriodChange: (days: number) => void;
  lastUpdated: Date;
}

export function Header({ period, onPeriodChange, lastUpdated }: HeaderProps) {
  const periodLabels: Record<number, string> = {
    1: 'Today',
    7: '7 Days',
    30: '30 Days',
    90: '90 Days',
    180: '6 Months',
  };

  const formatDate = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box justifyContent="space-between">
        <Box>
          <Text backgroundColor="#6366f1" color="white" bold>
            {' AgentLens '}
          </Text>
          <Text color="#94a3b8"> Local-first AI Developer Analytics</Text>
        </Box>
        <Text color="#94a3b8">Updated: {formatDate(lastUpdated)}</Text>
      </Box>

      <Box marginTop={1} gap={2}>
        <Text bold>Period:</Text>
        {Object.entries(periodLabels).map(([days, label]) => {
          const isActive = period === parseInt(days, 10);
          return (
            <Box key={days}>
              <Text
                color={isActive ? "#6366f1" : "#94a3b8"}
                bold={isActive}
                underline={isActive}
                dimColor={!isActive}
                onPress={() => onPeriodChange(parseInt(days, 10))}
              >
                {label}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color="#94a3b8">
          Press{' '}
          <Text bold color="white">
            1
          </Text>
          ,{' '}
          <Text bold color="white">
            7
          </Text>
          , or{' '}
          <Text bold color="white">
            3
          </Text>{' '}
          to switch periods • Press{' '}
          <Text bold color="white">
            q
          </Text>{' '}
          or{' '}
          <Text bold color="white">
            Ctrl+C
          </Text>{' '}
          to quit
        </Text>
      </Box>
    </Box>
  );
}