import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const webRoot = path.join(repoRoot, 'src', 'apps', 'web');
const distDir = sanitizeRelativeDistDir(process.env.AGENTLENS_WEB_DIST_DIR);
const buildRoot = path.join(webRoot, distDir);
const runtimeRoot = path.join(repoRoot, 'dist', 'apps', 'dashboard-runtime');
const runtimeBuildRoot = path.join(runtimeRoot, distDir);

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

function ensureBuildExists() {
  if (!existsSync(path.join(buildRoot, 'BUILD_ID'))) {
    throw new Error(`Dashboard build output not found at ${buildRoot}. Run "npm --prefix src/apps/web run build" first.`);
  }
}

function copyIfPresent(sourcePath, targetPath) {
  if (existsSync(sourcePath)) {
    cpSync(sourcePath, targetPath, { recursive: true });
  }
}

function writeRuntimeMetadata() {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  writeFileSync(
    path.join(runtimeRoot, 'agentlens-dashboard-runtime.json'),
    JSON.stringify(
      {
        version: packageJson.version,
        builtAt: new Date().toISOString(),
        distDir,
      },
      null,
      2,
    ),
    'utf8',
  );
}

ensureBuildExists();

rmSync(runtimeRoot, { recursive: true, force: true });
mkdirSync(runtimeBuildRoot, { recursive: true });

copyIfPresent(path.join(buildRoot, 'server'), path.join(runtimeBuildRoot, 'server'));
copyIfPresent(path.join(buildRoot, 'static'), path.join(runtimeBuildRoot, 'static'));
copyIfPresent(path.join(buildRoot, 'public'), path.join(runtimeBuildRoot, 'public'));

for (const fileName of [
  'BUILD_ID',
  'app-build-manifest.json',
  'app-path-routes-manifest.json',
  'build-manifest.json',
  'export-marker.json',
  'images-manifest.json',
  'next-minimal-server.js.nft.json',
  'next-server.js.nft.json',
  'package.json',
  'prerender-manifest.json',
  'react-loadable-manifest.json',
  'required-server-files.json',
  'routes-manifest.json',
]) {
  copyIfPresent(path.join(buildRoot, fileName), path.join(runtimeBuildRoot, fileName));
}

copyIfPresent(path.join(webRoot, 'public'), path.join(runtimeRoot, 'public'));
copyIfPresent(path.join(webRoot, 'package.json'), path.join(runtimeRoot, 'package.json'));
copyIfPresent(path.join(webRoot, 'next.config.mjs'), path.join(runtimeRoot, 'next.config.mjs'));

writeRuntimeMetadata();

console.log(`Packaged dashboard runtime at ${runtimeRoot}`);
