import React from 'react';
import { Box, Text } from 'ink';

interface ErrorDisplayProps {
  error: Error;
  onRetry: () => void;
}

export function ErrorDisplay({ error, onRetry }: ErrorDisplayProps) {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100%"
      gap={1}
    >
      <Text color="#ef4444" bold>
        ❌ Error Loading Dashboard
      </Text>
      <Text color="#94a3b8">{error.message}</Text>
      <Box gap={1} marginTop={1}>
        <Text color="#94a3b8">Press</Text>
        <Text bold color="white">
          r
        </Text>
        <Text color="#94a3b8">to retry or</Text>
        <Text bold color="white">
          q
        </Text>
        <Text color="#94a3b8">to quit</Text>
      </Box>
    </Box>
  );
}