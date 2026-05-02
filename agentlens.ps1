# AgentLens for Windows PowerShell
# Usage: .\agentlens.ps1 [command] [options]
# Or add the repo root to PATH and call: agentlens [command]

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$cliEntry = Join-Path $scriptDir "dist\apps\cli\index.js"

if (-not (Test-Path $cliEntry)) {
  Write-Error "AgentLens CLI not built. Run 'npm run build' first."
  exit 1
}

& node $cliEntry @args
