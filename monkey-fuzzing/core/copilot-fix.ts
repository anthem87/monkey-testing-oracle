/**
 * =============================================================
 * COPILOT-FIX.TS
 * =============================================================
 * Motore di proposta patch (LLM / Copilot) per errori classificati.
 * - Riceve NormalizedError
 * - Genera suggerimenti di correzione test / input / mutation strategy
 * - Output strutturato per EvolutionEngine / MutationRegistry
 * =============================================================
 */

import type { NormalizedError } from './error-classifier';
import { optimalLearningRate, shannonEntropy, bayesianConfidence } from '../metrics/metrics';
import ts from 'typescript';

export interface PatchProposal {
  testName: string;
  originalMessage: string;
  patchType: 'syntax' | 'logic' | 'mutation-weight' | 'input-sanitization';
  patchContent: string;
  confidence: number; // [0,1]
  derivedFrom: string[]; // error tokens / patterns
}

export interface CopilotAdapterLike {
  generateMutation(prompt: string): Promise<string>;
}

export class CopilotFixEngine {
  constructor(private adapter?: CopilotAdapterLike) {}

  /** Generate multiple candidate fixes for an error */
  async generateFixes(err: NormalizedError, generation: number, maxCandidates: number = 3): Promise<PatchProposal[]> {
    if (!this.adapter) return [];
    const tokens = this.tokenize(err.raw).slice(0, 60);
    const entropy = shannonEntropy(tokens.map(t => t.length));
    const lrBase = optimalLearningRate(entropy, generation + 1);
    const patchType: PatchProposal['patchType'] = err.kind === 'compile' ? 'syntax'
      : err.kind === 'runtime' ? 'logic'
      : err.kind === 'security' ? 'input-sanitization'
      : 'mutation-weight';

    const proposals: PatchProposal[] = [];
    for (let i = 0; i < maxCandidates; i++) {
      const focus = i === 0 ? 'minimal' : i === 1 ? 'robust' : 'edge_case';
      const prompt = `You are an autonomous test repair engine.\nError kind: ${err.kind}\nMessage: ${err.message}\nSeverity: ${err.severity}\nEntropyTokens: ${entropy.toFixed(3)}\nMode: ${focus}\nProvide ONE ${focus} patch. If compile error: syntax fix. If runtime: logic adjust. If security: sanitize input. Return ONLY patch code or mutated input.`;
      try {
        const suggestion = await this.adapter.generateMutation(prompt);
        // Use bayesianConfidence for formal confidence bounds
        const [lower, upper] = bayesianConfidence([lrBase]);
        const baseConf = (lower + upper) / 2;
        const decayFactor = optimalLearningRate(i + 1, generation + 1);
        const confidence = Math.min(1, baseConf + lrBase * (1 - decayFactor));
        proposals.push({
          testName: err.testName,
          originalMessage: err.message,
          patchType,
          patchContent: suggestion.trim().slice(0, 2000),
          confidence: Number(confidence.toFixed(3)),
          derivedFrom: tokens.slice(0, 8)
        });
      } catch {
        /* skip failed candidate */
      }
    }
    return proposals;
  }

  /** Single best fix (compat API) */
  async proposeFix(err: NormalizedError, generation: number): Promise<PatchProposal | undefined> {
    const fixes = await this.generateFixes(err, generation, 1);
    return fixes[0];
  }

  selectBestFix(fixes: PatchProposal[]): PatchProposal | undefined {
    if (!fixes.length) return undefined;
    // naive selection: highest confidence, tie-break by shortest patch (minimal change principle)
    return fixes.slice().sort((a,b)=> b.confidence - a.confidence || a.patchContent.length - b.patchContent.length)[0];
  }

  /** Apply patch to a test object (simple heuristic: if syntax/logic replace code, if input-sanitization mutate input) */
  applyFix(test: any, fix: PatchProposal): any {
    if (!fix) return test;
    if (fix.patchType === 'input-sanitization') {
      return { ...test, input: fix.patchContent };
    }
    if (fix.patchType === 'mutation-weight') {
      // Could adjust mutation metadata weights; placeholder attaches hint
      return { ...test, metadata: { ...(test.metadata||{}), mutationHint: fix.patchContent } };
    }
    // syntax or logic -> treat as code replacement if feasible
    if (typeof test.code === 'string') {
      if (this.isValidTypeScript(fix.patchContent)) {
        return { ...test, code: fix.patchContent };
      } else {
        return { ...test, metadata: { ...(test.metadata||{}), skippedInvalidPatch: true } };
      }
    }
    return { ...test, metadata: { ...(test.metadata||{}), fixPatch: fix.patchContent } };
  }

  private tokenize(raw: string): string[] {
    return raw.split(/[^A-Za-z0-9_]+/).filter(Boolean);
  }

  private isValidTypeScript(code: string): boolean {
    try {
      const transpiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext } });
      return transpiled.outputText.length > 0;
    } catch {
      return false;
    }
  }
}
