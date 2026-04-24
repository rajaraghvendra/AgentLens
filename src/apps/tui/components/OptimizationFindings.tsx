import React from 'react';
import { Box, Text } from 'ink';
import type { WasteFinding } from '../../../types/index.js';

interface OptimizationFindingsProps {
  findings: WasteFinding[];
}

export function OptimizationFindings({ findings }: OptimizationFindingsProps) {
  const getColor = (severity: string) => {
    switch (severity) {
      case 'High': return '#ef4444';
      case 'Medium': return '#eab308';
      case 'Low': return '#3b82f6';
      default: return '#94a3b8';
    }
  };

  const getEmoji = (severity: string) => {
    switch (severity) {
      case 'High': return '🔴';
      case 'Medium': return '🟡';
      case 'Low': return '🔵';
      default: return '⚪';
    }
  };

  if (findings.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={0}>
        <Text bold color="#94a3b8">
          Optimizer Findings
        </Text>
        <Box marginTop={1} alignItems="center" justifyContent="center" height={5}>
          <Text color="#10b981">✅ No inefficiencies detected</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>
      <Text bold color="#94a3b8">
        Optimizer Findings
      </Text>
      <Box flexDirection="column" gap={0} marginTop={1}>
        {findings.slice(0, 3).map((finding, index) => (
          <Box key={index} gap={1}>
            <Text color={getColor(finding.severity)}>
              {getEmoji(finding.severity)}
            </Text>
            <Text color="#cbd5e1" wrap="truncate">
              {finding.title}
            </Text>
          </Box>
        ))}
        {findings.length > 3 && (
          <Text color="#94a3b8" dimColor>
            +{findings.length - 3} more findings
          </Text>
        )}
      </Box>
    </Box>
  );
}