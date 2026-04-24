import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/apps/web/**'],
    },
  },
  resolve: {
    alias: {
      '@agentlens/core': path.resolve(__dirname, 'src/core'),
      '@agentlens/providers': path.resolve(__dirname, 'src/providers'),
      '@agentlens/types': path.resolve(__dirname, 'src/types/index.ts'),
      '@agentlens/config': path.resolve(__dirname, 'src/config/env.ts'),
      '@agentlens/utils': path.resolve(__dirname, 'src/utils'),
      '@agentlens/adapters': path.resolve(__dirname, 'src/adapters'),
    },
  },
});
