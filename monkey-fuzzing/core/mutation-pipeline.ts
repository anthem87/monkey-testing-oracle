/**
 * MUTATION-PIPELINE.TS
 * Integrates CopilotFixEngine into post-error repair stage.
 */
import { CopilotFixEngine } from './copilot-fix';
import { NormalizedError } from './error-classifier';
import { GeneratedTest } from './mutation';

export interface CompilationError {
  testName: string;
  raw: string;
  kind: 'compile' | 'runtime' | 'security' | 'other';
  severity: number;
}

export class MutationPipeline {
  constructor(private copilotFixEngine: CopilotFixEngine) {}

  async applyIntelligentFixes(test: GeneratedTest & { code?: string }, error: NormalizedError, generation: number): Promise<GeneratedTest & { code?: string }> {
    const fixes = await this.copilotFixEngine.generateFixes(error, generation, 3);
    const best = this.copilotFixEngine.selectBestFix(fixes);
    if (!best) return test;
    return this.copilotFixEngine.applyFix(test, best);
  }

  async processErrors(tests: (GeneratedTest & { code?: string })[], errors: NormalizedError[], generation: number): Promise<(GeneratedTest & { code?: string })[]> {
    const byName = new Map(errors.map(e => [e.testName, e]));
    const repaired: (GeneratedTest & { code?: string })[] = [];
    for (const t of tests) {
      const err = byName.get(t.name);
      if (err) {
        const fixed = await this.applyIntelligentFixes(t, err, generation);
        repaired.push(fixed);
      } else {
        repaired.push(t);
      }
    }
    return repaired;
  }
}
