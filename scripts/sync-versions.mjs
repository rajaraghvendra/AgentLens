import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

const versionPath = path.join(repoRoot, 'VERSION');
const targetFiles = [
  path.join(repoRoot, 'package.json'),
  path.join(repoRoot, 'package-lock.json'),
  path.join(repoRoot, 'src', 'apps', 'web', 'package.json'),
  path.join(repoRoot, 'src', 'apps', 'web', 'package-lock.json'),
  path.join(repoRoot, 'src', 'apps', 'vscode', 'package.json'),
  path.join(repoRoot, 'src', 'apps', 'vscode', 'package-lock.json'),
];

function updateLockfile(lockfile, version) {
  lockfile.version = version;
  if (lockfile.packages && lockfile.packages['']) {
    lockfile.packages[''].version = version;
  }
  return lockfile;
}

async function syncFile(filePath, version) {
  const raw = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);

  if (filePath.endsWith('package-lock.json')) {
    updateLockfile(parsed, version);
  } else {
    parsed.version = version;
  }

  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
}

async function main() {
  const version = (await readFile(versionPath, 'utf8')).trim();
  if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
    throw new Error(`Invalid VERSION value: ${version}`);
  }

  await Promise.all(targetFiles.map((filePath) => syncFile(filePath, version)));
  console.log(`Synchronized package versions to ${version}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
