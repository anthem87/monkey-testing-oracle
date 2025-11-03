"use strict";
/**
 * =============================================================
 * PERSISTENCE.TS
 * =============================================================
 * Checkpoint & Restore Manager
 * - Salva stato evolutivo (population, oracle params, metrics snapshot)
 * - Ripristina ultimo checkpoint
 * - Usa solo metriche e trasformazioni formali (nessun magic number)
 * =============================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PersistenceManager = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const metrics_1 = require("../metrics/metrics");
class PersistenceManager {
    constructor(dir = './checkpoints') {
        this.dir = dir;
    }
    async saveCheckpoint(generation, population, oracle, snapshot) {
        await promises_1.default.mkdir(this.dir, { recursive: true });
        const fitnessValues = population.map(p => p.fitness);
        const entropyFitness = (0, metrics_1.shannonEntropy)(fitnessValues);
        const varianceFitness = (0, metrics_1.listVariance)(fitnessValues);
        const convergenceThreshold = (0, metrics_1.adaptiveConvergenceThreshold)(fitnessValues);
        const data = {
            generation,
            timestamp: new Date().toISOString(),
            population: population.map(p => ({ id: p.id, fitness: p.fitness, age: p.age, testCount: p.testSuite.tests.length, tests: p.testSuite.tests })),
            oracle: oracle.exportState(),
            stateSnapshot: snapshot,
            entropyFitness,
            varianceFitness,
            convergenceThreshold,
        };
        const file = path_1.default.join(this.dir, `checkpoint-gen-${generation}.json`);
        await promises_1.default.writeFile(file, JSON.stringify(data, null, 2));
        return file;
    }
    async loadLatest() {
        try {
            const files = await promises_1.default.readdir(this.dir);
            const checkpointFiles = files.filter(f => f.startsWith('checkpoint-gen-')).sort((a, b) => {
                const ga = parseInt(a.replace(/\D+/g, ''));
                const gb = parseInt(b.replace(/\D+/g, ''));
                return gb - ga;
            });
            if (checkpointFiles.length === 0)
                return undefined;
            const latest = path_1.default.join(this.dir, checkpointFiles[0]);
            const json = await promises_1.default.readFile(latest, 'utf-8');
            return JSON.parse(json);
        }
        catch {
            return undefined;
        }
    }
}
exports.PersistenceManager = PersistenceManager;
//# sourceMappingURL=persistence.js.map