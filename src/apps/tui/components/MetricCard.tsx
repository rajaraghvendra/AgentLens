import React from 'react';
import { Box, Text } from 'ink';

interface MetricCardProps {
  title: string;
  value: string;
  subtitle: string;
  color: string;
}

export function MetricCard({ title, value, subtitle, color }: MetricCardProps) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor="#334155"
      width={25}
      height={6}
    >
      <Text color="#94a3b8" dimColor>
        {title}
      </Text>
      <Text color={color} bold>
        {value}
      </Text>
      <Text color="#94a3b8" dimColor>
        {subtitle}
      </Text>
    </Box>
  );
}