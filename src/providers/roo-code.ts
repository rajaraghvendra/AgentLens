import { IProvider } from './base.js';
import type { DateRange, Session } from '../types/index.js';
import { discoverClineFamilySessions, hasClineFamilyData, normalizeClineFamilyToolName, parseClineFamilySession } from './cline-family.js';

const ROO_KEYWORDS = [/roo/i, /roo-code/i];

export class RooCodeProvider implements IProvider {
  readonly id = 'roo-code';
  readonly name = 'Roo Code';

  private getRoots(): string[] {
    const envRoot = process.env.AGENTLENS_ROO_CODE_DIR?.trim();
    return envRoot ? [envRoot] : [];
  }

  isAvailable(): boolean {
    return hasClineFamilyData(ROO_KEYWORDS, this.getRoots());
  }

  async discoverSessions(dateRange?: DateRange): Promise<string[]> {
    return discoverClineFamilySessions(ROO_KEYWORDS, dateRange, this.getRoots());
  }

  async parseSession(identifier: string): Promise<Session> {
    return parseClineFamilySession(identifier, this.id);
  }

  normalizeToolName(rawName: string): string {
    return normalizeClineFamilyToolName(rawName);
  }
}
