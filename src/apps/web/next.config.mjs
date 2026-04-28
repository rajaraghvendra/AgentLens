import path from 'path';
import { fileURLToPath } from 'url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, '../../..');

function sanitizeRelativeDistDir(rawValue) {
  const fallback = '.agentlens-next';
  if (!rawValue) return fallback;

  const normalized = String(rawValue).trim().replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)) {
    return fallback;
  }

  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0 || segments.includes('..')) {
    return fallback;
  }

  return segments.join('/');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  distDir: sanitizeRelativeDistDir(process.env.AGENTLENS_WEB_DIST_DIR),
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
