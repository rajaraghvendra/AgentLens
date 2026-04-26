import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '../../..');

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  distDir: process.env.AGENTLENS_WEB_DIST_DIR || '.agentlens-next',
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
