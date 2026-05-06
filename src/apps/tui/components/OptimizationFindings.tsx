import React from 'react';
import { Box, Text } from 'ink';
import type { WasteFinding } from '../../../types/index.js';

interface OptimizationFindingsProps {
  findings: WasteFinding[];
  width: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  High: '#ef4444',
  Medium: '#eab308',
  Low: '#3b82f6',
};

function getTrendLabel(finding: WasteFinding): { label: string; color: string } | null {
  if ('trend' in finding) {
    const trend = (finding as any).trend;
    switch (trend) {
      case 'improving':
        return { label: '↓ improving', color: '#22c55e' };
      case 'resolved':
        return { label: '✓ resolved', color: '#94a3b8' };
      default:
        return { label: '● active', color: '#eab308' };
    }
  }
  return null;
}

export function OptimizationFindings({ findings, width }: OptimizationFindingsProps) {
  if (findings.length === 0) {
    return (
      <Box flexDirection="column" borderStyle="round" borderColor="#94a3b8" width={width} paddingX={1}>
        <Text bold color="#94a3b8">Findings & Insights</Text>
        <Box marginTop={1} alignItems="center" justifyContent="center" height={3}>
          <Text color="#10b981">✓ No inefficiencies detected</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="#ef4444" width={width} paddingX={1}>
      <Text bold color="#ef4444">Findings ({findings.length})</Text>
      <Box flexDirection="column" marginTop={1} gap={1}>
        {findings.slice(0, 5).map((finding, index) => {
          const color = SEVERITY_COLORS[finding.severity] || '#94a3b8';
          const trend = getTrendLabel(finding);
          return (
            <Box key={`${finding.title}-${index}`} flexDirection="column">
              <Box gap={1}>
                <Text color={color} bold>
                  {finding.severity.toUpperCase()}
                </Text>
                {trend && (
                  <Text color={trend.color} dimColor>
                    {trend.label}
                  </Text>
                )}
              </Box>
              <Text color="#cbd5e1" wrap="truncate-end">
                {finding.title}
              </Text>
              <Text dimColor wrap="truncate-end">
                {finding.description}
              </Text>
              {finding.estimatedCostWastedUSD > 0 && (
                <Text color="#eab308" dimColor>
                  ~${finding.estimatedCostWastedUSD.toFixed(2)} waste
                </Text>
              )}
            </Box>
          );
        })}
        {findings.length > 5 && (
          <Text color="#94a3b8" dimColor>
            +{findings.length - 5} more findings
          </Text>
        )}
      </Box>
    </Box>
  );
}
