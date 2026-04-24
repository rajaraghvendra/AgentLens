import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';

export function Loading() {
  return (
    <Box
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      height="100%"
      gap={1}
    >
      <Box alignItems="center" gap={1}>
        <Spinner type="clock" />
        <Text color="#6366f1">Loading AgentLens Dashboard...</Text>
      </Box>
      <Text color="#94a3b8">Analyzing your AI coding sessions</Text>
    </Box>
  );
}