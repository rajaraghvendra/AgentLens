import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    turbo: {
      resolveAlias: {
        // Handle TypeScript imports in lib directory
        '../../../lib/agentlens-cli': './src/apps/web/lib/agentlens-cli.ts',
      },
    },
  },
};

export default nextConfig;
