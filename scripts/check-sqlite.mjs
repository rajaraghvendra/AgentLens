// ─────────────────────────────────────────────────────────────
// AgentLens – Post-install SQLite availability check
// ─────────────────────────────────────────────────────────────
// Runs after npm install. better-sqlite3 is an optional native
// addon (C++ compilation required). If it's missing, we print a
// friendly diagnostic instead of letting the CLI crash silently.

let sqliteAvailable = false;
try {
  await import('better-sqlite3');
  sqliteAvailable = true;
} catch {
  // Not compiled — this is expected on Windows without Build Tools
}

if (!sqliteAvailable) {
  const isWindows = process.platform === 'win32';
  console.warn('');
  console.warn('⚠️  AgentLens: better-sqlite3 is not available on this system.');
  console.warn('   Cursor and OpenCode session data will not be parsed.');

  if (isWindows) {
    console.warn('');
    console.warn('   To enable full functionality on Windows:');
    console.warn('   1. Install Visual Studio Build Tools (free):');
    console.warn('      https://aka.ms/vs/17/release/vs_BuildTools.exe');
    console.warn('      (Select: Desktop development with C++)');
    console.warn('   2. Restart your terminal, then run:');
    console.warn('      npm install better-sqlite3');
  } else {
    console.warn('   To enable: npm install better-sqlite3');
  }
  console.warn('');
}
