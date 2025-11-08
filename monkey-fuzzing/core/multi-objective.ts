/**
 * ===================================================================
 * MULTI-OBJECTIVE OPTIMIZATION - PARETO OPTIMIZATION
 * ===================================================================
 * 
 * Implementa ottimizzazione multi-obiettivo usando:
 * - Pareto Dominance per ranking
 * - Crowding Distance per diversità
 * - NSGA-II inspired selection
 * 
 * Obiettivi simultanei:
 * 1. Minimize LOSS (compilation + tests + complexity)
 * 2. Maximize DIVERSITY (entropy popolazione)
 * 3. Maximize NOVELTY (differenza da generazioni precedenti)
 * 4. Maximize COVERAGE (input space + code coverage)
 */

import { shannonEntropyNormalized } from '../metrics/metrics.js';

// ===============================================================
// INTERFACES
// ===============================================================

export interface Individual {
  id: string;
  testCode: string;
  testName: string;
  generation: number;
}

export interface Objectives {
  loss: number;           // [0,1] minimize - compilation + test + complexity
  diversity: number;      // [0,1] maximize - Shannon entropy of test signatures
  novelty: number;        // [0,1] maximize - distance from previous generations
  coverage: number;       // [0,1] maximize - input space + code coverage
}

export interface RankedIndividual extends Individual {
  objectives: Objectives;
  rank: number;           // Pareto rank (1 = best front, 2 = second front, ...)
  crowdingDistance: number; // Diversità locale nel fronte
  dominationCount: number;  // Quanti individui mi dominano
  dominatedSet: Set<string>; // Quali individui domino
}

// ===============================================================
// PARETO DOMINANCE
// ===============================================================

/**
 * A domina B se:
 * - A è migliore o uguale a B in TUTTI gli obiettivi
 * - A è strettamente migliore in ALMENO UN obiettivo
 */
export function dominates(a: Objectives, b: Objectives): boolean {
  let betterInAtLeastOne = false;
  
  // Loss: minimize (lower is better)
  if (a.loss > b.loss) return false;
  if (a.loss < b.loss) betterInAtLeastOne = true;
  
  // Diversity: maximize (higher is better)
  if (a.diversity < b.diversity) return false;
  if (a.diversity > b.diversity) betterInAtLeastOne = true;
  
  // Novelty: maximize
  if (a.novelty < b.novelty) return false;
  if (a.novelty > b.novelty) betterInAtLeastOne = true;
  
  // Coverage: maximize
  if (a.coverage < b.coverage) return false;
  if (a.coverage > b.coverage) betterInAtLeastOne = true;
  
  return betterInAtLeastOne;
}

/**
 * Fast Non-Dominated Sorting (NSGA-II)
 * Returns population partitioned into Pareto fronts
 */
export function fastNonDominatedSort(population: RankedIndividual[]): RankedIndividual[][] {
  // Initialize domination counts and dominated sets
  for (const p of population) {
    p.dominationCount = 0;
    p.dominatedSet = new Set();
  }
  
  // Calculate domination relationships
  for (let i = 0; i < population.length; i++) {
    for (let j = i + 1; j < population.length; j++) {
      const p = population[i];
      const q = population[j];
      
      if (dominates(p.objectives, q.objectives)) {
        p.dominatedSet.add(q.id);
        q.dominationCount++;
      } else if (dominates(q.objectives, p.objectives)) {
        q.dominatedSet.add(p.id);
        p.dominationCount++;
      }
    }
  }
  
  // Build fronts
  const fronts: RankedIndividual[][] = [];
  let currentFront: RankedIndividual[] = [];
  
  // First front: non-dominated individuals
  for (const p of population) {
    if (p.dominationCount === 0) {
      p.rank = 1;
      currentFront.push(p);
    }
  }
  
  fronts.push(currentFront);
  
  // Subsequent fronts
  let frontIndex = 0;
  while (fronts[frontIndex].length > 0) {
    const nextFront: RankedIndividual[] = [];
    
    for (const p of fronts[frontIndex]) {
      for (const qId of p.dominatedSet) {
        const q = population.find(ind => ind.id === qId);
        if (!q) continue;
        
        q.dominationCount--;
        if (q.dominationCount === 0) {
          q.rank = frontIndex + 2;
          nextFront.push(q);
        }
      }
    }
    
    frontIndex++;
    if (nextFront.length > 0) {
      fronts.push(nextFront);
    } else {
      break;
    }
  }
  
  return fronts;
}

// ===============================================================
// CROWDING DISTANCE
// ===============================================================

/**
 * Calcola crowding distance per preservare diversità nel fronte
 * Higher distance = più isolato = più preservato
 */
export function calculateCrowdingDistance(front: RankedIndividual[]): void {
  const n = front.length;
  
  if (n === 0) return;
  
  // Initialize distances
  for (const ind of front) {
    ind.crowdingDistance = 0;
  }
  
  // For each objective
  const objectives: (keyof Objectives)[] = ['loss', 'diversity', 'novelty', 'coverage'];
  
  for (const obj of objectives) {
    // Sort by objective
    const sorted = [...front].sort((a, b) => a.objectives[obj] - b.objectives[obj]);
    
    // Boundary points have infinite distance
    sorted[0].crowdingDistance = Infinity;
    sorted[n - 1].crowdingDistance = Infinity;
    
    // Calculate range
    const minVal = sorted[0].objectives[obj];
    const maxVal = sorted[n - 1].objectives[obj];
    const range = maxVal - minVal;
    
    if (range === 0) continue; // All same value
    
    // Calculate distance for interior points
    for (let i = 1; i < n - 1; i++) {
      const distance = (sorted[i + 1].objectives[obj] - sorted[i - 1].objectives[obj]) / range;
      sorted[i].crowdingDistance += distance;
    }
  }
}

// ===============================================================
// OBJECTIVE CALCULATION
// ===============================================================

export class ObjectiveCalculator {
  private previousGenerations: Map<number, Individual[]> = new Map();
  
  /**
   * Calcola gli obiettivi per un individuo
   */
  calculateObjectives(
    individual: Individual,
    loss: number,
    population: Individual[],
    coverageData?: { inputCoverage: number; codeCoverage: number }
  ): Objectives {
    // 1. LOSS (già calcolato dal controller)
    const lossObjective = Math.max(0, Math.min(1, loss));
    
    // 2. DIVERSITY (Shannon entropy dei test nella popolazione)
    const diversity = this.calculateDiversity(population);
    
    // 3. NOVELTY (distanza da generazioni precedenti)
    const novelty = this.calculateNovelty(individual, this.previousGenerations);
    
    // 4. COVERAGE (input space + code coverage)
    const coverage = coverageData 
      ? (coverageData.inputCoverage + coverageData.codeCoverage) / 2
      : 0;
    
    return {
      loss: lossObjective,
      diversity,
      novelty,
      coverage
    };
  }
  
  /**
   * Diversità: Shannon entropy normalizzata delle signature dei test
   */
  private calculateDiversity(population: Individual[]): number {
    if (population.length <= 1) return 0;
    
    // Crea signature basate su hash del codice test
    const signatures = population.map(ind => this.hashTestCode(ind.testCode));
    
    // Shannon entropy normalizzata
    return shannonEntropyNormalized(signatures);
  }
  
  /**
   * Novità: quanto è diverso dalle generazioni precedenti
   */
  private calculateNovelty(individual: Individual, history: Map<number, Individual[]>): number {
    if (history.size === 0) return 1.0; // Prima generazione = massima novità
    
    const currentHash = this.hashTestCode(individual.testCode);
    
    // Calcola distanza media da tutte le generazioni precedenti
    let totalDistance = 0;
    let count = 0;
    
    for (const [gen, individuals] of history) {
      if (gen >= individual.generation) continue; // Solo generazioni precedenti
      
      for (const prev of individuals) {
        const prevHash = this.hashTestCode(prev.testCode);
        const distance = Math.abs(currentHash - prevHash) / 1000000; // Normalizza
        totalDistance += Math.min(1, distance);
        count++;
      }
    }
    
    return count > 0 ? totalDistance / count : 1.0;
  }
  
  /**
   * Hash deterministico del codice test
   */
  private hashTestCode(code: string): number {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = Math.imul(31, hash) + code.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 1000000);
  }
  
  /**
   * Aggiorna storia generazioni
   */
  updateHistory(generation: number, population: Individual[]): void {
    this.previousGenerations.set(generation, [...population]);
    
    // Mantieni solo ultime 10 generazioni
    if (this.previousGenerations.size > 10) {
      const oldestGen = Math.min(...this.previousGenerations.keys());
      this.previousGenerations.delete(oldestGen);
    }
  }
}

// ===============================================================
// SELECTION
// ===============================================================

/**
 * Seleziona i migliori N individui usando Pareto ranking + crowding distance
 */
export function selectBest(population: RankedIndividual[], n: number): RankedIndividual[] {
  if (population.length <= n) return population;
  
  // Sort by rank (lower is better), then by crowding distance (higher is better)
  const sorted = [...population].sort((a, b) => {
    if (a.rank !== b.rank) {
      return a.rank - b.rank;
    }
    return b.crowdingDistance - a.crowdingDistance; // Descending
  });
  
  return sorted.slice(0, n);
}

// ===============================================================
// AGGREGATION (for backward compatibility)
// ===============================================================

/**
 * Aggrega obiettivi multipli in una singola fitness (per compatibilità)
 * Usa weighted sum con pesi adattivi basati su Pareto rank
 */
export function aggregateToFitness(objectives: Objectives, rank: number = 1): number {
  // Peso base inversamente proporzionale al rank
  const rankPenalty = 1 / rank;
  
  // Weighted sum (normalizzato [0,1])
  const weights = {
    loss: 0.4,      // Loss è più importante
    diversity: 0.2,
    novelty: 0.2,
    coverage: 0.2
  };
  
  const fitness = 
    weights.loss * (1 - objectives.loss) +      // Inverti loss (maximize)
    weights.diversity * objectives.diversity +
    weights.novelty * objectives.novelty +
    weights.coverage * objectives.coverage;
  
  return fitness * rankPenalty; // Penalizza fronti peggiori
}

// ===============================================================
// DIAGNOSTICS
// ===============================================================

export function printParetoFronts(fronts: RankedIndividual[][]): string {
  let output = '\n╔════════════════════════════════════════════════════════════╗\n';
  output += '║             PARETO FRONTS ANALYSIS                         ║\n';
  output += '╠════════════════════════════════════════════════════════════╣\n';
  
  for (let i = 0; i < fronts.length; i++) {
    const front = fronts[i];
    output += `║ Front ${i + 1}: ${front.length} individuals${' '.repeat(38 - front.length.toString().length)} ║\n`;
    
    if (front.length > 0) {
      // Average objectives in this front
      const avgLoss = front.reduce((sum, ind) => sum + ind.objectives.loss, 0) / front.length;
      const avgDiv = front.reduce((sum, ind) => sum + ind.objectives.diversity, 0) / front.length;
      const avgNov = front.reduce((sum, ind) => sum + ind.objectives.novelty, 0) / front.length;
      const avgCov = front.reduce((sum, ind) => sum + ind.objectives.coverage, 0) / front.length;
      
      output += `║   • Avg Loss:      ${avgLoss.toFixed(3).padStart(5)}                               ║\n`;
      output += `║   • Avg Diversity: ${avgDiv.toFixed(3).padStart(5)}                               ║\n`;
      output += `║   • Avg Novelty:   ${avgNov.toFixed(3).padStart(5)}                               ║\n`;
      output += `║   • Avg Coverage:  ${avgCov.toFixed(3).padStart(5)}                               ║\n`;
      output += '║                                                            ║\n';
    }
  }
  
  output += '╚════════════════════════════════════════════════════════════╝\n';
  return output;
}
