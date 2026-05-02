// ─────────────────────────────────────────────────────────────
// AgentLens – Copy static assets after TypeScript compilation
// ─────────────────────────────────────────────────────────────
// Replaces the fragile inline shell in the build:core npm script.
// Works correctly on Windows (no shell escaping issues).

import { cpSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const assets = [
  {
    src: path.join(root, 'src', 'core', 'pricing', 'default-pricing.json'),
    dst: path.join(root, 'dist', 'core', 'pricing', 'default-pricing.json'),
    name: 'default-pricing.json',
  },
];

let copied = 0;
for (const { src, dst, name } of assets) {
  if (!existsSync(src)) {
    console.warn(`[copy-assets] WARNING: source not found, skipping: ${src}`);
    continue;
  }
  mkdirSync(path.dirname(dst), { recursive: true });
  cpSync(src, dst);
  console.log(`[copy-assets] Copied ${name} → dist/`);
  copied++;
}

console.log(`[copy-assets] Done — ${copied}/${assets.length} asset(s) copied.`);
