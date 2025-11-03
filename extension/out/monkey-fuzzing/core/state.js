"use strict";
/**
 * =============================================================
 * STATE.TS
 * =============================================================
 * Formal State Tracker for the evolutionary testing system.
 * Implements mathematical model: S_t = < P_t, Θ_t, O_t, M_t >
 * - P_t : population at generation t
 * - Θ_t : oracle parameters
 * - O_t : operators (genetic + oracle update)
 * - M_t : meta-model metrics & configuration
 * Provides:
 *  - Dimension calculation dim(S_t)
 *  - Incremental growth rate d/dt dim(S_t)
 *  - Local Lipschitz estimates for F (evolution) and G (oracle update)
 *  - Coverage combination snapshot (semantic + structural)
 * =============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateTracker = void 0;
const metrics_1 = require("../metrics/metrics");
class StateTracker {
    constructor(oracle, operators) {
        this.oracle = oracle;
        this.operators = operators;
        this.history = [];
        this.previousFitness = [];
    }
    /** Computes dimension of an individual test suite representation */
    computeIndividualDimension(ind) {
        // Heuristic decomposition: |tests| + avg test metadata keys + 1 (fitness) + age
        const tests = ind.testSuite.tests.length;
        const metaKeys = ind.testSuite.tests.reduce((acc, t) => acc + (t.metadata ? Object.keys(t.metadata).length : 0), 0);
        const avgMeta = tests > 0 ? metaKeys / tests : 0;
        return tests + avgMeta + 2; // fitness + age counted as 2 scalars
    }
    computeOracleDimension(params) {
        // Number of scalar parameters + lengths of pattern/rule arrays
        return 2 // confidenceThreshold + maxInputLength
            + params.securityPatterns.length
            + params.validationRules.length;
    }
    computeOperatorsDimension(_desc) {
        // Each string descriptor contributes 1 unit for now (can refine later)
        return 5;
    }
    computeMetaModelDimension(meta) {
        let d = meta.fitnessHistory.length > 0 ? 1 : 0; // we treat history aggregate as 1 scalar
        if (meta.coverageSemantic !== undefined)
            d++;
        if (meta.coverageStructural !== undefined)
            d++;
        if (meta.coverageTotal !== undefined)
            d++;
        if (meta.lastMutationRate !== undefined)
            d++;
        if (meta.lastCrossoverRate !== undefined)
            d++;
        if (meta.lastElitism !== undefined)
            d++;
        return d;
    }
    /** Local Lipschitz estimate: max |f(x)-f(y)| / |x-y| over neighbors */
    // private estimateLipschitz(valuesPrev: number[], valuesNext: number[]): number | undefined { return undefined; }
    createSnapshot(generation, population, meta) {
        const timestamp = new Date().toISOString();
        const params = this.oracle.getParameters();
        const individualDims = population.map(p => this.computeIndividualDimension(p));
        const dimPopulation = individualDims.reduce((a, b) => a + b, 0);
        const individualDimensionAvg = population.length > 0 ? dimPopulation / population.length : 0;
        const dimOracle = this.computeOracleDimension(params);
        const dimOperators = this.computeOperatorsDimension(this.operators);
        const dimMetaModel = this.computeMetaModelDimension(meta);
        const dimTotal = dimPopulation + dimOracle + dimOperators + dimMetaModel;
        const fitnessValues = population.map(p => p.fitness);
        const entropyPopulation = (0, metrics_1.shannonEntropy)(fitnessValues);
        const varianceFitness = (0, metrics_1.listVariance)(fitnessValues);
        let growthRateApprox;
        let lipschitzF;
        let lipschitzG;
        if (this.previousSnapshot && this.previousFitness.length) {
            const dtDim = dimTotal - this.previousSnapshot.dimTotal;
            growthRateApprox = dtDim; // discrete step difference
            // Lipschitz F: variation of fitness distribution since last snapshot using formal estimate
            lipschitzF = (0, metrics_1.lipschitzEstimate)(this.previousFitness, fitnessValues);
            // Lipschitz G: oracle confidence threshold adaptation
            lipschitzG = (0, metrics_1.lipschitzEstimate)([
                this.previousSnapshot.oracleThreshold ?? params.confidenceThreshold
            ], [params.confidenceThreshold]);
        }
        const snapshot = {
            generation,
            timestamp,
            populationSize: population.length,
            individualDimensionAvg,
            dimPopulation,
            dimOracle,
            dimOperators,
            dimMetaModel,
            dimTotal,
            growthRateApprox,
            entropyPopulation,
            varianceFitness,
            lipschitzF,
            lipschitzG,
            coverageSemantic: meta.coverageSemantic,
            coverageStructural: meta.coverageStructural,
            coverageTotal: meta.coverageTotal,
            oracleThreshold: params.confidenceThreshold,
            operators: this.operators,
        };
        this.previousSnapshot = snapshot;
        this.previousFitness = fitnessValues.slice();
        this.history.push(snapshot);
        return snapshot;
    }
    getHistory() { return this.history; }
}
exports.StateTracker = StateTracker;
//# sourceMappingURL=state.js.map