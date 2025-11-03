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

import type { EvolutionIndividual } from './evolution';
import type { OracleParameters, OracleManager } from './oracle';
import { shannonEntropy as H, listVariance, lipschitzEstimate } from '../metrics/metrics';

/** Components included in meta-model M_t */
export interface MetaModelState {
  fitnessHistory: number[];
  coverageSemantic?: number; // f_cov
  coverageStructural?: number; // f_cov^str
  coverageTotal?: number; // f_cov^total
  lastMutationRate?: number;
  lastCrossoverRate?: number;
  lastElitism?: number;
}

export interface OperatorDescriptor {
  selection: string; // e.g. 'tournament(4)'
  crossover: string; // e.g. 'uniform'
  mutation: string;  // e.g. 'weighted-adaptive'
  elitism: string;   // e.g. 'top-k'
  oracleUpdate: string; // e.g. 'gradient + entropy scaling'
}

export interface StateSnapshot {
  generation: number;
  timestamp: string;
  populationSize: number;
  individualDimensionAvg: number; // \bar{d}_I
  dimPopulation: number; // N_t * \bar{d}_I
  dimOracle: number; // dim(Θ_t)
  dimOperators: number; // constant small descriptor length
  dimMetaModel: number; // dynamic metrics tracked
  dimTotal: number; // dim(S_t)
  growthRateApprox?: number; // finite difference of dimTotal
  entropyPopulation: number; // H(P_t) over fitness distribution
  varianceFitness: number; // Var(F_t)
  lipschitzF?: number; // local estimate for evolution operator
  lipschitzG?: number; // local estimate for oracle update
  coverageSemantic?: number;
  coverageStructural?: number;
  coverageTotal?: number;
  oracleThreshold?: number;
  operators: OperatorDescriptor;
}

export class StateTracker {
  private previousSnapshot?: StateSnapshot;
  private history: StateSnapshot[] = [];
  private previousFitness: number[] = [];

  constructor(private oracle: OracleManager, private operators: OperatorDescriptor) {}

  /** Computes dimension of an individual test suite representation */
  private computeIndividualDimension(ind: EvolutionIndividual): number {
    // Heuristic decomposition: |tests| + avg test metadata keys + 1 (fitness) + age
    const tests = ind.testSuite.tests.length;
    const metaKeys = ind.testSuite.tests.reduce((acc, t) => acc + (t.metadata ? Object.keys(t.metadata).length : 0), 0);
    const avgMeta = tests > 0 ? metaKeys / tests : 0;
    return tests + avgMeta + 2; // fitness + age counted as 2 scalars
  }

  private computeOracleDimension(params: OracleParameters): number {
    // Number of scalar parameters + lengths of pattern/rule arrays
    return 2 // confidenceThreshold + maxInputLength
      + params.securityPatterns.length
      + params.validationRules.length;
  }

  private computeOperatorsDimension(_desc: OperatorDescriptor): number {
    // Each string descriptor contributes 1 unit for now (can refine later)
    return 5;
  }

  private computeMetaModelDimension(meta: MetaModelState): number {
    let d = meta.fitnessHistory.length > 0 ? 1 : 0; // we treat history aggregate as 1 scalar
    if (meta.coverageSemantic !== undefined) d++;
    if (meta.coverageStructural !== undefined) d++;
    if (meta.coverageTotal !== undefined) d++;
    if (meta.lastMutationRate !== undefined) d++;
    if (meta.lastCrossoverRate !== undefined) d++;
    if (meta.lastElitism !== undefined) d++;
    return d;
  }

  /** Local Lipschitz estimate: max |f(x)-f(y)| / |x-y| over neighbors */
  // private estimateLipschitz(valuesPrev: number[], valuesNext: number[]): number | undefined { return undefined; }

  createSnapshot(generation: number, population: EvolutionIndividual[], meta: MetaModelState): StateSnapshot {
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
    const entropyPopulation = H(fitnessValues);
    const varianceFitness = listVariance(fitnessValues);

    let growthRateApprox: number | undefined;
    let lipschitzF: number | undefined;
    let lipschitzG: number | undefined;
    if (this.previousSnapshot && this.previousFitness.length) {
      const dtDim = dimTotal - this.previousSnapshot.dimTotal;
      growthRateApprox = dtDim; // discrete step difference
      // Lipschitz F: variation of fitness distribution since last snapshot using formal estimate
      lipschitzF = lipschitzEstimate(this.previousFitness, fitnessValues);
      // Lipschitz G: oracle confidence threshold adaptation
      lipschitzG = lipschitzEstimate([
        this.previousSnapshot.oracleThreshold ?? params.confidenceThreshold
      ], [params.confidenceThreshold]);
    }

    const snapshot: StateSnapshot = {
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

  getHistory(): StateSnapshot[] { return this.history; }
}
