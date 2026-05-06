// ─────────────────────────────────────────────────────────────
// AgentLens – Config Scanner
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import os from 'os';

export interface ConfigScanResult {
  claudeMdFiles: { path: string; size: number; hasImports: boolean; importCount: number }[];
  configuredMcpServers: string[];
  configuredAgents: string[];
}

export function scanClaudeMdFiles(projectDirs: string[]): ConfigScanResult['claudeMdFiles'] {
  const results: ConfigScanResult['claudeMdFiles'] = [];
  
  for (const dir of projectDirs) {
    const claudeMdPath = path.join(dir, 'CLAUDE.md');
    if (existsSync(claudeMdPath)) {
      const content = readFileSync(claudeMdPath, 'utf8');
      const size = Buffer.byteLength(content);
      const importMatches = content.match(/@import/g) || [];
      
      results.push({
        path: claudeMdPath,
        size,
        hasImports: importMatches.length > 0,
        importCount: importMatches.length,
      });
    }
  }
  
  return results;
}

export function scanMcpServers(): string[] {
  const servers: string[] = [];
  const homeDir = os.homedir();
  
  const claudeConfigPath = path.join(homeDir, '.claude', 'CLAUDE.json');
  if (existsSync(claudeConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
      if (config.mcpServers && typeof config.mcpServers === 'object') {
        servers.push(...Object.keys(config.mcpServers));
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  const mcpJsonPath = path.join(process.cwd(), '.mcp.json');
  if (existsSync(mcpJsonPath)) {
    try {
      const config = JSON.parse(readFileSync(mcpJsonPath, 'utf8'));
      if (config.mcpServers && typeof config.mcpServers === 'object') {
        servers.push(...Object.keys(config.mcpServers));
      }
    } catch {
      // Ignore parse errors
    }
  }
  
  return [...new Set(servers)];
}

export function scanAgents(projectDirs: string[]): string[] {
  const agents: string[] = [];
  
  for (const dir of projectDirs) {
    const agentsDir = path.join(dir, '.claude', 'agents');
    if (existsSync(agentsDir)) {
      try {
        const files = readdirSync(agentsDir);
        agents.push(...files.filter(f => f.endsWith('.md') || f.endsWith('.json')).map(f => f.replace(/\.(md|json)$/, '')));
      } catch {
        // Ignore errors
      }
    }
  }
  
  return [...new Set(agents)];
}

export function scanConfig(projectDirs: string[]): ConfigScanResult {
  return {
    claudeMdFiles: scanClaudeMdFiles(projectDirs),
    configuredMcpServers: scanMcpServers(),
    configuredAgents: scanAgents(projectDirs),
  };
}
