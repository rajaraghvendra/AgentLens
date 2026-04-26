import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const webRoot = path.join(repoRoot, 'src', 'apps', 'web');
const nextRoot = path.join(webRoot, '.next');
const standaloneRoot = path.join(nextRoot, 'standalone');
const staticRoot = path.join(nextRoot, 'static');
const publicRoot = path.join(webRoot, 'public');
const outputRoot = path.join(repoRoot, 'dist', 'apps', 'dashboard');

if (!existsSync(standaloneRoot)) {
  throw new Error(`Standalone dashboard build not found at ${standaloneRoot}. Run the web build first.`);
}

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(outputRoot, { recursive: true });

cpSync(standaloneRoot, outputRoot, { recursive: true });

if (existsSync(staticRoot)) {
  const targetStatic = path.join(outputRoot, '.next', 'static');
  mkdirSync(path.dirname(targetStatic), { recursive: true });
  cpSync(staticRoot, targetStatic, { recursive: true });
}

if (existsSync(publicRoot)) {
  cpSync(publicRoot, path.join(outputRoot, 'public'), { recursive: true });
}

console.log(`Packaged dashboard standalone server into ${outputRoot}`);
