import { IProvider } from './base.js';
import type { DateRange, Session } from '../types/index.js';
import { discoverClineFamilySessions, hasClineFamilyData, normalizeClineFamilyToolName, parseClineFamilySession } from './cline-family.js';

const KILOCODE_KEYWORDS = [/kilocode/i, /kilo-code/i, /kilo/i];

export class KiloCodeProvider implements IProvider {
  readonly id = 'kilocode';
  readonly name = 'KiloCode';

  private getRoots(): string[] {
    const envRoot = process.env.AGENTLENS_KILOCODE_DIR?.trim();
    return envRoot ? [envRoot] : [];
  }

  isAvailable(): boolean {
    return hasClineFamilyData(KILOCODE_KEYWORDS, this.getRoots());
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    return discoverClineFamilySessions(KILOCODE_KEYWORDS, dateRange, this.getRoots());
  }

  async parseSession(identifier: string): Promise<Session> {
    return parseClineFamilySession(identifier, this.id);
  }

  normalizeToolName(rawName: string): string {
    return normalizeClineFamilyToolName(rawName);
  }
}
