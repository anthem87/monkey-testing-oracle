/**
 * =============================================================
 * COPILOT-FIX.TS
 * =============================================================
 * Copilot-based test repair engine
 * - Reads compilation errors from Maven
 * - Generates fixes via Copilot LLM
 * - Applies fixes iteratively across generations
 * =============================================================
 */

// import type { NormalizedError } from './error-classifier'; // Unused
import { CopilotAPI } from './types';

export interface FixProposal {
  testName: string;
  originalError: string;
  fixedCode: string;
  confidence: number;
}

export class CopilotFixEngine {
  constructor(private copilotAPI?: CopilotAPI) {}

  /**
   * 🎯 Main fix method: takes broken test code + errors, returns fixed code
   */
  async fixTest(testCode: string, errors: string[], generation: number): Promise<FixProposal> {
    if (!this.copilotAPI) {
      return {
        testName: 'unknown',
        originalError: errors.join('; '),
        fixedCode: testCode, // No fix
        confidence: 0
      };
    }

    const prompt = `Fix this Java JUnit test class. It has compilation errors.

**ERRORS**:
${errors.slice(0, 5).join('\n')}

**BROKEN CODE**:
\`\`\`java
${testCode}
\`\`\`

**INSTRUCTIONS**:
1. Fix all compilation errors
2. Keep test logic intact
3. Return ONLY fixed Java code (no markdown, no explanations)

Fixed code:`;

    try {
      const response = await this.copilotAPI.generate(prompt);
      
      // 🤖 Ask Copilot to extract code if wrapped in markdown
      let fixedCode = response.trim();
      if (fixedCode.includes('```')) {
        const extractPrompt = `Extract ONLY the Java code from this response (remove markdown):

${response}

Return ONLY Java code:`;
        fixedCode = (await this.copilotAPI.generate(extractPrompt)).trim();
      }
      
      // Extract test class name via Copilot
      const namePrompt = `What is the class name in this Java code? Return ONLY the class name:

${testCode.substring(0, 200)}`;
      
      const testName = (await this.copilotAPI.generate(namePrompt)).trim();
      
      return {
        testName,
        originalError: errors[0] || 'unknown',
        fixedCode,
        confidence: 0.8 - (generation * 0.05)
      };
    } catch (err) {
      console.error('❌ Copilot fix failed:', (err as Error).message);
      return {
        testName: 'unknown',
        originalError: errors.join('; '),
        fixedCode: testCode,
        confidence: 0
      };
    }
  }

  /**
   * Batch fix multiple tests
   */
  async fixTests(tests: Array<{ code: string; name: string }>, errors: string[], generation: number): Promise<Array<{ name: string; code: string }>> {
    const fixed: Array<{ name: string; code: string }> = [];
    
    for (const test of tests) {
      const relevantErrors = errors.filter(e => e.includes(test.name));
      if (relevantErrors.length === 0) {
        fixed.push(test); // No errors, keep as-is
        continue;
      }
      
      console.log(`🔧 Fixing ${test.name}...`);
      const proposal = await this.fixTest(test.code, relevantErrors, generation);
      
      if (proposal.confidence > 0.5) {
        fixed.push({ name: test.name, code: proposal.fixedCode });
        console.log(`✅ Fixed ${test.name} (confidence: ${proposal.confidence.toFixed(2)})`);
      } else {
        fixed.push(test); // Keep original if fix confidence too low
        console.log(`⚠️ Low confidence fix for ${test.name}, keeping original`);
      }
    }
    
    return fixed;
  }
}
