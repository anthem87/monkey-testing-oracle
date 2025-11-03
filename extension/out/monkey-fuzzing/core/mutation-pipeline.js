"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutationPipeline = void 0;
class MutationPipeline {
    constructor(copilotFixEngine) {
        this.copilotFixEngine = copilotFixEngine;
    }
    async applyIntelligentFixes(test, error, generation) {
        const fixes = await this.copilotFixEngine.generateFixes(error, generation, 3);
        const best = this.copilotFixEngine.selectBestFix(fixes);
        if (!best)
            return test;
        return this.copilotFixEngine.applyFix(test, best);
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