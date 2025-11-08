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

import * as fs from 'fs/promises';
import * as path from 'path';
import { MetricsSnapshot } from './evolution-controller.js';
import { Objectives } from './multi-objective.js';

// ===============================================================
// CHECKPOINT STRUCTURE
// ===============================================================

export interface Individual {
  id: string;
  fitness: number;
  age: number;
  testCount: number;
  tests: GeneratedTest[];
  
  // Multi-objective data
  objectives?: Objectives;
  paretoRank?: number;
  crowdingDistance?: number;
}

export interface GeneratedTest {
  name: string;
  code: string;
  input: string;
  expected: string;
  confidence: number;
  language: string;
  metadata: {
    targetFile: string;
    language: string;
    origin: string;
    generation: number;
  };
}

export interface Checkpoint {
  generation: number;
  timestamp: string;
  population: Individual[];
  metrics: {
    avgFitness: number;
    bestFitness: number;
    diversity: number;
    entropy: number;
    emergenceDetected: boolean;
    
    // Multi-objective aggregates
    avgLoss?: number;
    avgDiversity?: number;
    avgNovelty?: number;
    avgCoverage?: number;
    paretoFrontSizes?: number[]; // Size of each front
  };
  metricsHistory?: MetricsSnapshot[];  // NEW: storia completa per controller
}

export interface ResumeData {
  startGeneration: number;
  currentTest: {
    name: string;
    code: string;
    metadata: any;
  };
  metricsHistory: MetricsSnapshot[];
  checkpointPath: string;
}

// ===============================================================
// CHECKPOINT MANAGER
// ===============================================================

export class CheckpointManager {
  private readonly checkpointDir: string;

  constructor(workspaceRoot: string) {
    this.checkpointDir = path.join(workspaceRoot, 'checkpoints');
  }

  /**
   * Salva checkpoint con metriche complete
   */
  async saveCheckpoint(
    generation: number,
    population: Individual[],
    metricsHistory: MetricsSnapshot[],
    aggregatedMetrics: {
      avgFitness: number;
      bestFitness: number;
      diversity: number;
      entropy: number;
      emergenceDetected: boolean;
    }
  ): Promise<string> {
    await fs.mkdir(this.checkpointDir, { recursive: true });

    const checkpoint: Checkpoint = {
      generation,
      timestamp: new Date().toISOString(),
      population,
      metrics: aggregatedMetrics,
      metricsHistory  // Salva TUTTA la storia per resume
    };

    const filename = `checkpoint-gen-${generation}.json`;
    const filepath = path.join(this.checkpointDir, filename);

    await fs.writeFile(filepath, JSON.stringify(checkpoint, null, 2), 'utf-8');
    
    return filepath;
  }

  /**
   * Carica checkpoint più recente o specifico
   */
  async loadCheckpoint(generationOrPath?: number | string): Promise<Checkpoint | null> {
    try {
      let filepath: string;

      if (typeof generationOrPath === 'string') {
        // Path esplicito fornito
        filepath = generationOrPath;
      } else if (typeof generationOrPath === 'number') {
        // Generation number
        filepath = path.join(this.checkpointDir, `checkpoint-gen-${generationOrPath}.json`);
      } else {
        // Trova l'ultimo checkpoint
        const latestPath = await this.findLatestCheckpoint();
        if (!latestPath) return null;
        filepath = latestPath;
      }

      const content = await fs.readFile(filepath, 'utf-8');
      const checkpoint: Checkpoint = JSON.parse(content);

      // Validazione base
      if (!this.validateCheckpoint(checkpoint)) {
        console.error(`❌ Checkpoint invalido: ${filepath}`);
        return null;
      }

      return checkpoint;
    } catch (error) {
      console.error(`❌ Errore caricamento checkpoint:`, error);
      return null;
    }
  }

  /**
   * Estrai dati per resume evolution
   */
  extractResumeData(checkpoint: Checkpoint, checkpointPath: string): ResumeData {
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
      startGeneration: checkpoint.generation + 1,  // Riprendi dalla prossima
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
  private async findLatestCheckpoint(): Promise<string | null> {
    try {
      const files = await fs.readdir(this.checkpointDir);
      const checkpointFiles = files
        .filter(f => f.startsWith('checkpoint-gen-') && f.endsWith('.json'))
        .sort((a, b) => {
          const genA = parseInt(a.match(/checkpoint-gen-(\d+)\.json/)?.[1] || '0');
          const genB = parseInt(b.match(/checkpoint-gen-(\d+)\.json/)?.[1] || '0');
          return genB - genA;  // Ordine decrescente
        });

      if (checkpointFiles.length === 0) return null;

      return path.join(this.checkpointDir, checkpointFiles[0]);
    } catch {
      return null;
    }
  }

  /**
   * Validazione checkpoint
   */
  private validateCheckpoint(checkpoint: Checkpoint): boolean {
    return (
      typeof checkpoint.generation === 'number' &&
      Array.isArray(checkpoint.population) &&
      checkpoint.population.length > 0 &&
      checkpoint.population[0].tests.length > 0
    );
  }

  /**
   * Ricostruisce history caricando checkpoints precedenti
   */
  private reconstructMetricsHistory(currentCheckpoint: Checkpoint): MetricsSnapshot[] {
    // Fallback: crea un singolo snapshot dal checkpoint corrente
    const individual = currentCheckpoint.population[0];
    
    return [{
      fitness: individual.fitness,
      loss: 1 - individual.fitness,
      compilationRate: individual.fitness > 0 ? 1 : 0,  // Approssimazione
      testPassRate: individual.fitness > 0 ? 1 : 0,
      testsRun: individual.testCount,
      testsPassed: Math.floor(individual.fitness * individual.testCount),
      generation: currentCheckpoint.generation
    }];
  }

  /**
   * Lista tutti i checkpoint disponibili
   */
  async listCheckpoints(): Promise<{ generation: number; path: string; timestamp: string }[]> {
    try {
      const files = await fs.readdir(this.checkpointDir);
      const checkpoints = [];

      for (const file of files) {
        if (!file.startsWith('checkpoint-gen-') || !file.endsWith('.json')) continue;

        const filepath = path.join(this.checkpointDir, file);
        const content = await fs.readFile(filepath, 'utf-8');
        const checkpoint: Checkpoint = JSON.parse(content);

        checkpoints.push({
          generation: checkpoint.generation,
          path: filepath,
          timestamp: checkpoint.timestamp
        });
      }

      return checkpoints.sort((a, b) => a.generation - b.generation);
    } catch {
      return [];
    }
  }

  /**
   * Pulizia checkpoint vecchi (mantieni solo ultimi N)
   */
  async cleanOldCheckpoints(keepLast: number = 10): Promise<void> {
    const checkpoints = await this.listCheckpoints();
    
    if (checkpoints.length <= keepLast) return;

    const toDelete = checkpoints.slice(0, -keepLast);
    
    for (const cp of toDelete) {
      try {
        await fs.unlink(cp.path);
        console.log(`🗑️  Rimosso checkpoint vecchio: gen ${cp.generation}`);
      } catch (error) {
        console.error(`Errore rimozione checkpoint ${cp.path}:`, error);
      }
    }
  }
}
