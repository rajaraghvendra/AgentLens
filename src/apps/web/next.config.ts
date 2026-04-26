import type { NextConfig } from "next";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const configDir = dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  turbopack: {
    root: resolve(configDir, '../../..'),
    resolveAlias: {
      tailwindcss: resolve(configDir, 'node_modules/tailwindcss'),
    },
  },
};

export default nextConfig;
