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

import fs from 'fs/promises';
import path from 'path';
import type { EvolutionIndividual } from './evolution';
import type { OracleManager } from './oracle';
import type { StateSnapshot } from './state';
import { shannonEntropy, listVariance, adaptiveConvergenceThreshold } from '../metrics/metrics';

export interface CheckpointData {
  generation: number;
  timestamp: string;
  population: {
    id: string;
    fitness: number;
    age: number;
    testCount: number;
    tests: { name: string; input: any; confidence?: number; metadata?: Record<string,any> }[];
  }[];
  oracle: any; // exported oracle state
  stateSnapshot: StateSnapshot;
  entropyFitness: number;
  varianceFitness: number;
  convergenceThreshold: number;
}

export class PersistenceManager {
  constructor(private dir: string = './checkpoints') {}

  async saveCheckpoint(generation: number, population: EvolutionIndividual[], oracle: OracleManager, snapshot: StateSnapshot): Promise<string> {
    await fs.mkdir(this.dir, { recursive: true });
    const fitnessValues = population.map(p => p.fitness);
    const entropyFitness = shannonEntropy(fitnessValues);
    const varianceFitness = listVariance(fitnessValues);
    const convergenceThreshold = adaptiveConvergenceThreshold(fitnessValues);

    const data: CheckpointData = {
      generation,
      timestamp: new Date().toISOString(),
  population: population.map(p => ({ id: p.id, fitness: p.fitness, age: p.age, testCount: p.testSuite.tests.length, tests: p.testSuite.tests })),
      oracle: oracle.exportState(),
      stateSnapshot: snapshot,
      entropyFitness,
      varianceFitness,
      convergenceThreshold,
    };
    const file = path.join(this.dir, `checkpoint-gen-${generation}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2));
    return file;
  }

  async loadLatest(): Promise<CheckpointData | undefined> {
    try {
      const files = await fs.readdir(this.dir);
      const checkpointFiles = files.filter(f => f.startsWith('checkpoint-gen-')).sort((a,b)=>{
        const ga = parseInt(a.replace(/\D+/g,''));
        const gb = parseInt(b.replace(/\D+/g,''));
        return gb - ga;
      });
      if (checkpointFiles.length === 0) return undefined;
      const latest = path.join(this.dir, checkpointFiles[0]);
      const json = await fs.readFile(latest, 'utf-8');
      return JSON.parse(json) as CheckpointData;
    } catch {
      return undefined;
    }
  }
}
