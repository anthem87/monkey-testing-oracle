"use strict";
/**
 * ===================================================================
 * CHECKPOINT MANAGER - PERSISTENCE & RESUME
 * ===================================================================
 *
 * Gestisce:
 * 1. Salvataggio checkpoint incrementali
 * 2. Caricamento checkpoint per resume evolution
 * 3. Validazione integrità checkpoint
 * 4. Merge metriche storiche
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.CheckpointManager = void 0;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
// ===============================================================
// CHECKPOINT MANAGER
// ===============================================================
class CheckpointManager {
    constructor(workspaceRoot) {
        this.checkpointDir = path.join(workspaceRoot, 'checkpoints');
    }
    /**
     * Salva checkpoint con metriche complete
     */
    async saveCheckpoint(generation, population, metricsHistory, aggregatedMetrics) {
        await fs.mkdir(this.checkpointDir, { recursive: true });
        const checkpoint = {
            generation,
            timestamp: new Date().toISOString(),
            population,
            metrics: aggregatedMetrics,
            metricsHistory // Salva TUTTA la storia per resume
        };
        const filename = `checkpoint-gen-${generation}.json`;
        const filepath = path.join(this.checkpointDir, filename);
        await fs.writeFile(filepath, JSON.stringify(checkpoint, null, 2), 'utf-8');
        return filepath;
    }
    /**
     * Carica checkpoint più recente o specifico
     */
    async loadCheckpoint(generationOrPath) {
        try {
            let filepath;
            if (typeof generationOrPath === 'string') {
                // Path esplicito fornito
                filepath = generationOrPath;
            }
            else if (typeof generationOrPath === 'number') {
                // Generation number
                filepath = path.join(this.checkpointDir, `checkpoint-gen-${generationOrPath}.json`);
            }
            else {
                // Trova l'ultimo checkpoint
                const latestPath = await this.findLatestCheckpoint();
                if (!latestPath)
                    return null;
                filepath = latestPath;
            }
            const content = await fs.readFile(filepath, 'utf-8');
            const checkpoint = JSON.parse(content);
            // Validazione base
            if (!this.validateCheckpoint(checkpoint)) {
                console.error(`❌ Checkpoint invalido: ${filepath}`);
                return null;
            }
            return checkpoint;
        }
        catch (error) {
            console.error(`❌ Errore caricamento checkpoint:`, error);
            return null;
        }
    }
    /**
     * Estrai dati per resume evolution
     */
    extractResumeData(checkpoint, checkpointPath) {
        // Prendi il primo individuo (per ora supportiamo single-individual)
        const individual = checkpoint.population[0];
        if (!individual || individual.tests.length === 0) {
            throw new Error('Checkpoint vuoto o corrotto');
        }
        const currentTest = individual.tests[0];
        // Metriche history (se presente nel checkpoint, altrimenti ricostruisci)
        let metricsHistory = checkpoint.metricsHistory || [];
        // Se non c'è history salvata, ricostruiscila da checkpoints precedenti
        if (metricsHistory.length === 0) {
            console.warn('⚠️  Metriche history non trovata, ricostruendo...');
            metricsHistory = this.reconstructMetricsHistory(checkpoint);
        }
        return {
            startGeneration: checkpoint.generation + 1, // Riprendi dalla prossima
            currentTest: {
                name: currentTest.name,
                code: currentTest.code,
                metadata: currentTest.metadata
            },
            metricsHistory,
            checkpointPath
        };
    }
    /**
     * Trova l'ultimo checkpoint salvato
     */
    async findLatestCheckpoint() {
        try {
            const files = await fs.readdir(this.checkpointDir);
            const checkpointFiles = files
                .filter(f => f.startsWith('checkpoint-gen-') && f.endsWith('.json'))
                .sort((a, b) => {
                const genA = parseInt(a.match(/checkpoint-gen-(\d+)\.json/)?.[1] || '0');
                const genB = parseInt(b.match(/checkpoint-gen-(\d+)\.json/)?.[1] || '0');
                return genB - genA; // Ordine decrescente
            });
            if (checkpointFiles.length === 0)
                return null;
            return path.join(this.checkpointDir, checkpointFiles[0]);
        }
        catch {
            return null;
        }
    }
    /**
     * Validazione checkpoint
     */
    validateCheckpoint(checkpoint) {
        return (typeof checkpoint.generation === 'number' &&
            Array.isArray(checkpoint.population) &&
            checkpoint.population.length > 0 &&
            checkpoint.population[0].tests.length > 0);
    }
    /**
     * Ricostruisce history caricando checkpoints precedenti
     */
    reconstructMetricsHistory(currentCheckpoint) {
        // Fallback: crea un singolo snapshot dal checkpoint corrente
        const individual = currentCheckpoint.population[0];
        return [{
                fitness: individual.fitness,
                loss: 1 - individual.fitness,
                compilationRate: individual.fitness > 0 ? 1 : 0, // Approssimazione
                testPassRate: individual.fitness > 0 ? 1 : 0,
                testsRun: individual.testCount,
                testsPassed: Math.floor(individual.fitness * individual.testCount),
                generation: currentCheckpoint.generation
            }];
    }
    /**
     * Lista tutti i checkpoint disponibili
     */
    async listCheckpoints() {
        try {
            const files = await fs.readdir(this.checkpointDir);
            const checkpoints = [];
            for (const file of files) {
                if (!file.startsWith('checkpoint-gen-') || !file.endsWith('.json'))
                    continue;
                const filepath = path.join(this.checkpointDir, file);
                const content = await fs.readFile(filepath, 'utf-8');
                const checkpoint = JSON.parse(content);
                checkpoints.push({
                    generation: checkpoint.generation,
                    path: filepath,
                    timestamp: checkpoint.timestamp
                });
            }
            return checkpoints.sort((a, b) => a.generation - b.generation);
        }
        catch {
            return [];
        }
    }
    /**
     * Pulizia checkpoint vecchi (mantieni solo ultimi N)
     */
    async cleanOldCheckpoints(keepLast = 10) {
        const checkpoints = await this.listCheckpoints();
        if (checkpoints.length <= keepLast)
            return;
        const toDelete = checkpoints.slice(0, -keepLast);
        for (const cp of toDelete) {
            try {
                await fs.unlink(cp.path);
                console.log(`🗑️  Rimosso checkpoint vecchio: gen ${cp.generation}`);
            }
            catch (error) {
                console.error(`Errore rimozione checkpoint ${cp.path}:`, error);
            }
        }
    }
}
exports.CheckpointManager = CheckpointManager;
//# sourceMappingURL=checkpoint-manager.js.map