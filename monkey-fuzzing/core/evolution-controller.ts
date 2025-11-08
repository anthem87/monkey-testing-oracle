/**
 * ===================================================================
 * EVOLUTION CONTROLLER - FORMAL DECISION ENGINE
 * ===================================================================
 * 
 * Implementa il control loop formale che:
 * 1. Analizza stato sistema usando metriche deterministiche
 * 2. Decide azioni basate su thresholds matematici
 * 3. Integra fitness E loss in modo coerente
 * 4. Guida evolution con decisioni formali (non euristiche)
 * 
 * Metriche chiave:
 * - Shannon Entropy → stagnazione detection
 * - Variance → oscillazione/instabilità
 * - System Maturity → convergenza/early stop
 * - Emergence Threshold → mutazioni drastiche
 */

import {
  shannonEntropyNormalized,
  listVariance,
  systemMaturity,
  emergenceThreshold,
  cauchyConvergence,
  structuralComplexity
} from '../metrics/metrics.js';
import { 
  RankedIndividual, 
  ObjectiveCalculator,
  fastNonDominatedSort,
  calculateCrowdingDistance,
  selectBest,
  aggregateToFitness,
  printParetoFronts
} from './multi-objective.js';

// ===============================================================
// INTERFACES
// ===============================================================

export interface MetricsSnapshot {
  fitness: number;
  loss: number;
  compilationRate: number;
  testPassRate: number;
  testsRun: number;
  testsPassed: number;
  generation: number;
}

export interface SystemState {
  // Classificazione stato
  isStagnant: boolean;      // Entropia bassa → poca diversità evolutiva
  isOscillating: boolean;   // Varianza alta → instabilità/regressione
  isConverged: boolean;     // Maturità alta + varianza bassa → convergenza
  needsEmergence: boolean;  // Sotto threshold emergence → serve cambiamento drastico
  
  // Metriche calcolate
  entropy: number;          // Shannon entropy normalizzata [0,1]
  variance: number;         // Varianza fitness
  maturity: number;         // Indice maturità [0,1]
  emergenceThresh: number;  // Soglia emergence calcolata
  
  // Decisione finale
  recommendedAction: EvolutionAction;
  reason: string;           // Spiegazione decisione
}

export type EvolutionAction = 
  | 'continue'              // Continua normalmente
  | 'mutate_drastic'        // Forza mutazione drastica (stagnazione)
  | 'reduce_exploration'    // Riduci exploration rate (oscillazione)
  | 'switch_strategy'       // Cambia strategia evolutiva (emergence)
  | 'early_stop';           // Ferma evoluzione (convergenza)

export interface CompositeLoss {
  compilationLoss: number;  // 1 - compilationRate
  testFailureLoss: number;  // 1 - testPassRate
  complexityLoss: number;   // Complessità strutturale normalizzata
  totalLoss: number;        // Loss composita pesata
  weights: {
    compilation: number;
    tests: number;
    complexity: number;
  };
}

// ===============================================================
// EVOLUTION CONTROLLER
// ===============================================================

export class EvolutionController {
  private readonly config: ControllerConfig;
  private readonly objectiveCalc: ObjectiveCalculator;
  
  constructor(config?: Partial<ControllerConfig>) {
    this.objectiveCalc = new ObjectiveCalculator();
    this.config = {
      // Thresholds per stagnazione
      stagnationEntropyThreshold: config?.stagnationEntropyThreshold ?? 0.3,
      
      // Thresholds per oscillazione
      oscillationVarianceThreshold: config?.oscillationVarianceThreshold ?? 0.1,
      
      // Thresholds per convergenza
      convergenceMaturityThreshold: config?.convergenceMaturityThreshold ?? 0.9,
      convergenceVarianceThreshold: config?.convergenceVarianceThreshold ?? 0.01,
      cauchyEpsilon: config?.cauchyEpsilon ?? 0.01,
      
      // Pesi loss composita
      lossWeights: config?.lossWeights ?? {
        compilation: 0.5,
        tests: 0.3,
        complexity: 0.2
      },
      
      // Finestra per analisi convergenza
      convergenceWindow: config?.convergenceWindow ?? 10,
      
      // Max complexity per normalizzazione
      maxComplexity: config?.maxComplexity ?? 1000,
      
      // 🆕 Hardening thresholds
      compilationRateThreshold: config?.compilationRateThreshold ?? 0.6,
      maxRepairAttempts: config?.maxRepairAttempts ?? 3
    };
  }

  /**
   * Calcola loss composita da metriche raw
   */
  calculateCompositeLoss(
    compilationRate: number,
    testPassRate: number,
    testCode: string
  ): CompositeLoss {
    // 1. Compilation loss (inverso del tasso compilazione)
    const compilationLoss = 1 - Math.max(0, Math.min(1, compilationRate));
    
    // 2. Test failure loss (inverso del tasso successo)
    const testFailureLoss = 1 - Math.max(0, Math.min(1, testPassRate));
    
    // 3. Complexity loss (complessità strutturale normalizzata)
    const testLines = testCode.split('\n').length;
    const testMethods = (testCode.match(/@Test/g) || []).length;
    const rawComplexity = structuralComplexity(testMethods + testLines, 1);
    const complexityLoss = Math.min(1, rawComplexity / this.config.maxComplexity);
    
    // 4. Loss composita pesata
    const w = this.config.lossWeights;
    const totalLoss = 
      w.compilation * compilationLoss +
      w.tests * testFailureLoss +
      w.complexity * complexityLoss;
    
    return {
      compilationLoss,
      testFailureLoss,
      complexityLoss,
      totalLoss,
      weights: w
    };
  }

  /**
   * Calcola fitness da metriche raw (per compatibilità)
   * Fitness = 1 - loss (interpretazione coerente)
   */
  calculateFitness(compositeLoss: CompositeLoss): number {
    return 1 - compositeLoss.totalLoss;
  }

  /**
   * Analizza stato sistema e decide azione
   * CORE del control loop formale
   */
  analyzeAndDecide(history: MetricsSnapshot[]): SystemState {
    if (history.length === 0) {
      return this.emptyState();
    }

    // Estrai serie temporali
    const fitnessValues = history.map(h => h.fitness);
    const lossValues = history.map(h => h.loss);
    
    // 1. ENTROPIA NORMALIZZATA (stagnazione)
    // Dividi fitness in buckets [0.0-0.1, 0.1-0.2, ..., 0.9-1.0]
    const fitnessBuckets = fitnessValues.map(f => Math.floor(f * 10));
    const entropy = shannonEntropyNormalized(fitnessBuckets);
    
    // 2. VARIANZA (oscillazione/instabilità)
    const variance = listVariance(fitnessValues);
    
    // 3. MATURITÀ (convergenza)
    const maturity = systemMaturity(lossValues); // usa loss per convergenza
    
    // 4. EMERGENCE THRESHOLD
    const emergenceThresh = emergenceThreshold(history.length);
    
    // 5. CAUCHY CONVERGENCE (convergenza formale su loss)
    const recentWindow = Math.min(this.config.convergenceWindow, history.length);
    const recentLosses = lossValues.slice(-recentWindow);
    const cauchyConverged = cauchyConvergence(recentLosses, this.config.cauchyEpsilon);
    
    // ═══════════════════════════════════════════════════════════
    // DECISIONI DETERMINISTICHE
    // ═══════════════════════════════════════════════════════════
    
    // A. STAGNAZIONE: entropia bassa → poca diversità
    const isStagnant = entropy < this.config.stagnationEntropyThreshold;
    
    // B. OSCILLAZIONE: varianza alta → instabilità
    const isOscillating = variance > this.config.oscillationVarianceThreshold;
    
    // C. CONVERGENZA: maturità alta + varianza bassa + Cauchy
    const isConverged = 
      maturity > this.config.convergenceMaturityThreshold &&
      variance < this.config.convergenceVarianceThreshold &&
      cauchyConverged;
    
    // D. EMERGENCE: entropia sotto threshold → serve cambiamento
    const needsEmergence = entropy < emergenceThresh;
    
    // ═══════════════════════════════════════════════════════════
    // SELEZIONE AZIONE (priorità decrescente)
    // ═══════════════════════════════════════════════════════════
    
    let action: EvolutionAction = 'continue';
    let reason = 'Sistema in stato normale, continua evoluzione';
    
    if (isConverged) {
      action = 'early_stop';
      reason = `Convergenza rilevata: maturity=${maturity.toFixed(3)}, variance=${variance.toFixed(4)}, Cauchy=true`;
    } else if (needsEmergence) {
      action = 'switch_strategy';
      reason = `Emergence richiesta: entropy=${entropy.toFixed(3)} < threshold=${emergenceThresh.toFixed(3)}`;
    } else if (isStagnant) {
      action = 'mutate_drastic';
      reason = `Stagnazione: entropy=${entropy.toFixed(3)} < ${this.config.stagnationEntropyThreshold}`;
    } else if (isOscillating) {
      action = 'reduce_exploration';
      reason = `Oscillazione: variance=${variance.toFixed(4)} > ${this.config.oscillationVarianceThreshold}`;
    }
    
    return {
      isStagnant,
      isOscillating,
      isConverged,
      needsEmergence,
      entropy,
      variance,
      maturity,
      emergenceThresh,
      recommendedAction: action,
      reason
    };
  }

  /**
   * Stato vuoto (primo avvio)
   */
  private emptyState(): SystemState {
    return {
      isStagnant: false,
      isOscillating: false,
      isConverged: false,
      needsEmergence: false,
      entropy: 1.0,
      variance: 0,
      maturity: 0,
      emergenceThresh: 0.1,
      recommendedAction: 'continue',
      reason: 'Prima generazione, nessuna decisione disponibile'
    };
  }

  /**
   * Diagnostica completa (per logging/debug)
   */
  getDiagnostics(history: MetricsSnapshot[]): string {
    const state = this.analyzeAndDecide(history);
    
    return `
╔════════════════════════════════════════════════════════════╗
║           EVOLUTION CONTROLLER - DIAGNOSTICS               ║
╠════════════════════════════════════════════════════════════╣
║ 📊 METRICHE FORMALI                                        ║
║   • Entropy (normalized):  ${state.entropy.toFixed(4).padStart(6)} ${state.isStagnant ? '⚠️  STAGNANT' : '✓'}    ║
║   • Variance (fitness):    ${state.variance.toFixed(4).padStart(6)} ${state.isOscillating ? '⚠️  OSCILLATING' : '✓'} ║
║   • Maturity (system):     ${state.maturity.toFixed(4).padStart(6)} ${state.isConverged ? '✓ CONVERGED' : ''}    ║
║   • Emergence threshold:   ${state.emergenceThresh.toFixed(4).padStart(6)} ${state.needsEmergence ? '⚠️  NEEDED' : ''}       ║
║                                                            ║
║ 🎯 DECISIONE CONTROLLER                                    ║
║   • Action: ${state.recommendedAction.toUpperCase().padEnd(20)}                     ║
║   • Reason: ${state.reason.substring(0, 52).padEnd(52)} ║
╚════════════════════════════════════════════════════════════╝
`.trim();
  }

  /**
   * Multi-Objective Ranking usando Pareto Fronts
   * Returns ranked population con Pareto rank e crowding distance
   */
  rankPopulationMultiObjective(
    population: Array<{
      id: string;
      testCode: string;
      testName: string;
      generation: number;
      loss: number;
      coverageData?: { inputCoverage: number; codeCoverage: number };
    }>
  ): RankedIndividual[] {
    // Calculate objectives for each individual
    const ranked: RankedIndividual[] = population.map(ind => ({
      id: ind.id,
      testCode: ind.testCode,
      testName: ind.testName,
      generation: ind.generation,
      objectives: this.objectiveCalc.calculateObjectives(
        { id: ind.id, testCode: ind.testCode, testName: ind.testName, generation: ind.generation },
        ind.loss,
        population.map(p => ({ id: p.id, testCode: p.testCode, testName: p.testName, generation: p.generation })),
        ind.coverageData
      ),
      rank: 0,
      crowdingDistance: 0,
      dominationCount: 0,
      dominatedSet: new Set()
    }));

    // Fast non-dominated sorting
    const fronts = fastNonDominatedSort(ranked);

    // Calculate crowding distance for each front
    for (const front of fronts) {
      calculateCrowdingDistance(front);
    }

    // Update history for next generation
    if (population.length > 0) {
      const gen = population[0].generation;
      this.objectiveCalc.updateHistory(
        gen,
        population.map(p => ({ id: p.id, testCode: p.testCode, testName: p.testName, generation: p.generation }))
      );
    }

    return ranked;
  }

  /**
   * Select best N individuals usando Pareto ranking
   */
  selectBestMultiObjective(ranked: RankedIndividual[], n: number): RankedIndividual[] {
    return selectBest(ranked, n);
  }

  /**
   * Get aggregated fitness from multi-objective (for backward compatibility)
   */
  getAggregatedFitness(individual: RankedIndividual): number {
    return aggregateToFitness(individual.objectives, individual.rank);
  }

  /**
   * Print Pareto fronts diagnostics
   */
  printParetoFronts(ranked: RankedIndividual[]): string {
    // Group by rank to recreate fronts
    const fronts: RankedIndividual[][] = [];
    const maxRank = Math.max(...ranked.map(ind => ind.rank));

    for (let r = 1; r <= maxRank; r++) {
      const front = ranked.filter(ind => ind.rank === r);
      if (front.length > 0) {
        fronts.push(front);
      }
    }

    return printParetoFronts(fronts);
  }
}

// ===============================================================
// CONFIGURATION
// ===============================================================

interface ControllerConfig {
  stagnationEntropyThreshold: number;
  oscillationVarianceThreshold: number;
  convergenceMaturityThreshold: number;
  convergenceVarianceThreshold: number;
  cauchyEpsilon: number;
  lossWeights: {
    compilation: number;
    tests: number;
    complexity: number;
  };
  convergenceWindow: number;
  maxComplexity: number;
  
  // 🆕 Hardening config
  compilationRateThreshold: number;  // Soglia per attivare hardening (es: 0.6)
  maxRepairAttempts: number;         // Max tentativi repair per test
}

// ===============================================================
// HARDENING INTEGRATION
// ===============================================================

/**
 * Decisione hardening basata su compilationRate
 */
export function shouldHarden(compilationRate: number, threshold: number = 0.6): boolean {
  return compilationRate < threshold;
}

