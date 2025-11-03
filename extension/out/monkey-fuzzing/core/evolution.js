"use strict";
/**
 * ===========================================================
 * EVOLUTION.TS
 * ===========================================================
 * Evolutionary Testing Engine
 * - Population-based mutation and selection
 * - Oracle-guided fitness evaluation
 * - Integrated with MutationRegistry (dynamic + Copilot)
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvolutionEngine = void 0;
// Import mutation framework (ensure 'core' folder included in tsconfig)
const mutation_1 = require("./mutation");
const metrics_1 = require("../metrics/metrics");
class EvolutionEngine {
    constructor(config, domain = "backend") {
        this.config = config;
        this.domain = domain;
        this.population = [];
        this.fitnessHistory = [];
        this.stateMeta = { fitnessHistory: [] };
        this.mutationRegistry = new mutation_1.MutationRegistry(domain);
    }
    setConfig(cfg) {
        this.config = cfg;
    }
    /** Resize population adaptively keeping best individuals */
    applyPopulationResize(newSize) {
        if (newSize === this.population.length)
            return;
        if (newSize > this.population.length) {
            // clone best to grow
            const best = [...this.population].sort((a, b) => b.fitness - a.fitness)[0];
            while (this.population.length < newSize) {
                this.population.push({
                    id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    testSuite: structuredClone(best.testSuite),
                    fitness: best.fitness,
                    age: best.age
                });
            }
        }
        else {
            this.population = [...this.population].sort((a, b) => b.fitness - a.fitness).slice(0, newSize);
        }
        console.log(`📦 Population resized to ${newSize}`);
    }
    setStateTracker(tracker) {
        this.stateTracker = tracker;
    }
    /** Resume from a previously saved population (checkpoint) */
    resumeFromState(populationData, configOverride) {
        this.population = populationData.map(p => ({ id: p.id, fitness: p.fitness, age: p.age, testSuite: { tests: p.tests } }));
        if (configOverride) {
            this.config = { ...this.config, ...configOverride };
        }
        // rebuild fitness history baseline
        const avg = this.population.reduce((s, i) => s + i.fitness, 0) / Math.max(1, this.population.length);
        this.fitnessHistory = [avg];
        console.log(`↩️ Resume: population=${this.population.length} avgFitness=${avg.toFixed(3)}`);
    }
    /** Initialize once */
    initialize(baseSuite) {
        if (this.population.length === 0) {
            this.initializePopulation(baseSuite);
        }
    }
    async evolveOneGeneration(generation, testRunner, copilotAdapter) {
        // generation index handled externally; no internal field retained
        console.log(`🧬 Generation ${generation + 1}`);
        await this.evaluatePopulation(testRunner);
        const parents = this.selectParents();
        this.population = await this.createNextGeneration(parents, copilotAdapter);
        this.recordStats();
        this.stateMeta.fitnessHistory = [...this.fitnessHistory];
        this.stateMeta.lastMutationRate = this.config.mutationRate;
        this.stateMeta.lastCrossoverRate = this.config.crossoverRate;
        this.stateMeta.lastElitism = this.config.elitismCount;
        if (this.stateTracker) {
            const snapshot = this.stateTracker.createSnapshot(generation, this.population, this.stateMeta);
            console.log(`📊 State Snapshot dim(S_t)=${snapshot.dimTotal} H(P_t)=${snapshot.entropyPopulation.toFixed(3)}`);
        }
        return this.getBestIndividual();
    }
    initializePopulation(base) {
        this.population = [];
        for (let i = 0; i < this.config.populationSize; i++) {
            this.population.push({
                id: `ind_${i}_${Date.now()}`,
                testSuite: base,
                fitness: 0,
                age: 0,
            });
        }
    }
    async evaluatePopulation(testRunner) {
        await Promise.all(this.population.map(async (ind) => {
            try {
                const runnerSuite = { id: ind.id, targetLanguage: 'typescript', tests: ind.testSuite.tests };
                const results = await testRunner.runGeneratedTests(runnerSuite);
                ind.fitness = this.calculateFitness(results);
                ind.age++;
            }
            catch {
                ind.fitness = (0, metrics_1.emergenceThreshold)(this.config.populationSize);
            }
        }));
    }
    calculateFitness(results) {
        if (results.length === 0)
            return 0;
        const passRate = results.filter((r) => r.passed).length / results.length;
        const perf = 1 - Math.min(1, results.map((r) => r.executionTime).reduce((a, b) => a + b, 0) / 10000);
        const sec = results.filter((r) => r.securityAlert).length / results.length;
        const compileErrors = results.filter(r => r.error || (r.stderr && /SyntaxError|TypeError|ReferenceError|Parsing error/i.test(r.stderr || ''))).length;
        const fComp = 1 - compileErrors / results.length; // f_comp(I) = 1 - #err_comp / |T|
        // Use qualityMetric to derive weights: higher quality means more emphasis on pass rate
        const entropy = passRate;
        const variance = Math.abs(perf - passRate);
        const complexity = sec + (1 - fComp);
        const q = (0, metrics_1.qualityMetric)(entropy, variance, complexity);
        // Formal weights derived from quality metric
        const w_pass = 0.3 + 0.2 * q; // 0.3-0.5 based on quality
        const w_perf = 0.2 + 0.1 * (1 - q); // 0.2-0.3 inversely
        const w_sec = 0.1 + 0.1 * q; // 0.1-0.2 based on quality
        const w_comp = 0.4 - 0.2 * q; // 0.2-0.4 inversely
        return Math.max(0, Math.min(1, w_pass * passRate + w_perf * perf + w_sec * sec + w_comp * fComp));
    }
    selectParents() {
        const parents = [];
        while (parents.length < this.config.populationSize / 2) {
            const t = [...this.population].sort(() => Math.random() - 0.5).slice(0, 4);
            parents.push(t.reduce((a, b) => (b.fitness > a.fitness ? b : a)));
        }
        return parents;
    }
    async createNextGeneration(parents, copilotAdapter) {
        const newPop = [];
        // Elitism
        newPop.push(...[...this.population]
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, this.config.elitismCount));
        while (newPop.length < this.config.populationSize) {
            const p1 = parents[Math.floor(Math.random() * parents.length)];
            const p2 = parents[Math.floor(Math.random() * parents.length)];
            const child = Math.random() < this.config.crossoverRate
                ? this.crossover(p1, p2)
                : structuredClone(p1);
            if (Math.random() < this.config.mutationRate) {
                const ctx = {
                    domain: this.domain,
                    language: this.domain === "backend" ? "java" : "typescript",
                    copilotAdapter,
                };
                child.testSuite = await this.mutateTestSuite(child.testSuite, ctx);
            }
            newPop.push(child);
        }
        return newPop;
    }
    crossover(p1, p2) {
        const tests = [];
        const max = Math.max(p1.testSuite.tests.length, p2.testSuite.tests.length);
        for (let i = 0; i < max; i++) {
            const t1 = p1.testSuite.tests[i];
            const t2 = p2.testSuite.tests[i];
            tests.push(Math.random() < 0.5 ? t1 || t2 : t2 || t1);
        }
        return {
            id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            testSuite: { tests },
            fitness: 0,
            age: 0,
        };
    }
    async mutateTestSuite(suite, ctx) {
        // Use optimalAdaptationRate based on test suite dimension
        const dim = suite.tests.length;
        const mutationProb = (0, metrics_1.optimalAdaptationRate)(dim);
        const mutated = await Promise.all(suite.tests.map(async (t) => Math.random() < mutationProb ? this.mutationRegistry.applyRandomMutation(t, ctx) : t));
        return { tests: mutated };
    }
    /** Propagate repaired tests into all individuals (shallow replace by name) */
    applyRepairs(repaired) {
        const map = new Map(repaired.map(t => [t.name, t]));
        for (const ind of this.population) {
            ind.testSuite.tests = ind.testSuite.tests.map(t => map.get(t.name) ? { ...map.get(t.name) } : t);
        }
        console.log(`🔁 Repair propagation applied to population (${this.population.length} individuals)`);
    }
    recordStats() {
        const avg = this.population.reduce((s, i) => s + i.fitness, 0) / this.population.length;
        this.fitnessHistory.push(avg);
        console.log(`📈 Avg fitness: ${avg.toFixed(3)}`);
    }
    getBestIndividual() {
        return this.population.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    }
}
exports.EvolutionEngine = EvolutionEngine;
//# sourceMappingURL=evolution.js.map