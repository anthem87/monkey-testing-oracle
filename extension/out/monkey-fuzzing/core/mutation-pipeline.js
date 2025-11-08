"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutationPipeline = void 0;
class MutationPipeline {
    constructor(copilotFixEngine) {
        this.copilotFixEngine = copilotFixEngine;
    }
    async applyIntelligentFixes(test, error, generation) {
        // Use new CopilotFixEngine.fixTest() method
        const fixProposal = await this.copilotFixEngine.fixTest(test.code, [error.message], generation);
        if (fixProposal.confidence > 0.5) {
            return {
                ...test,
                code: fixProposal.fixedCode,
                name: fixProposal.testName
            };
        }
        return test; // Return unchanged if confidence too low
    }
    async processErrors(tests, errors, generation) {
        const byName = new Map(errors.map(e => [e.testName, e]));
        const repaired = [];
        for (const t of tests) {
            const err = byName.get(t.name);
            if (err) {
                const fixed = await this.applyIntelligentFixes(t, err, generation);
                repaired.push(fixed);
            }
            else {
                repaired.push(t);
            }
        }
        return repaired;
    }
}
exports.MutationPipeline = MutationPipeline;
//# sourceMappingURL=mutation-pipeline.js.map