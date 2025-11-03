/**
 * MUTATION-PIPELINE.TS
 * Integrates CopilotFixEngine into post-error repair stage.
 */
import { CopilotFixEngine } from './copilot-fix';
import { NormalizedError } from './error-classifier';
import { GeneratedTest } from './types.js';

export interface CompilationError {
  testName: string;
  raw: string;
  kind: 'compile' | 'runtime' | 'security' | 'other';
  severity: number;
}

export class MutationPipeline {
  constructor(private copilotFixEngine: CopilotFixEngine) {}

  async applyIntelligentFixes(test: GeneratedTest, error: NormalizedError, generation: number): Promise<GeneratedTest> {
    const fixes = await this.copilotFixEngine.generateFixes(error, generation, 3);
    const best = this.copilotFixEngine.selectBestFix(fixes);
    if (!best) return test;
    return this.copilotFixEngine.applyFix(test, best);
  }

  async processErrors(tests: GeneratedTest[], errors: NormalizedError[], generation: number): Promise<GeneratedTest[]> {
    const byName = new Map(errors.map(e => [e.testName, e]));
    const repaired: GeneratedTest[] = [];
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
