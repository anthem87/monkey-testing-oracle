/**
 * ===================================================================
 * FORMAL METRICS MODULE (TypeScript Port)
 * ===================================================================
 * 
 * Deterministic, side-effect-free metrics derived from
 * information theory, statistical mechanics, and adaptive systems.
 * 
 * Based on the original mathematical model (Python reference),
 * this module replaces probabilistic heuristics with formal measures.
 * 
 * Sections I–IX only (no qualia or cognitive metrics).
 */


// ===============================================================
// I. UTILITY FUNCTIONS - PURE DETERMINISTIC
// ===============================================================

export function countOccurrences(x: number, xs: number[]): number {
    return xs.filter(y => y === x).length;
}

export function listMean(xs: number[]): number {
    return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function listVariance(xs: number[]): number {
    if (xs.length === 0) return 0;
    const m = listMean(xs);
    return listMean(xs.map(x => (x - m) ** 2));
}

export function listMax(xs: number[]): number {
    return xs.length === 0 ? 0 : Math.max(...xs);
}

export function log2(x: number): number {
    return x > 0 ? Math.log2(x) : 0;
}

// ===============================================================
// II. INFORMATION-THEORETIC MEASURES
// ===============================================================

export function shannonEntropy(xs: number[]): number {
    if (xs.length === 0) return 0;
    const counts = new Map<number, number>();
    xs.forEach(x => counts.set(x, (counts.get(x) ?? 0) + 1));
    const n = xs.length;
    let entropy = 0;
    for (const count of counts.values()) {
        const p = count / n;
        if (p > 0) entropy -= p * log2(p);
    }
    return entropy;
}

export function shannonEntropyNormalized(xs: number[]): number {
    if (xs.length === 0) return 0;
    const counts = new Map<number, number>();
    xs.forEach(x => counts.set(x, (counts.get(x) ?? 0) + 1));
    const n = xs.length;
    let entropy = 0;
    for (const count of counts.values()) {
        const p = count / n;
        if (p > 0) entropy -= p * log2(p);
    }
    const nSymbols = counts.size;
    if (nSymbols > 1) {
        const maxEntropy = Math.log2(nSymbols);
        return entropy / maxEntropy;
    }
    return 0;
}

export function mutualInformation(xs: number[], ys: number[]): number {
    if (xs.length === 0 || ys.length === 0 || xs.length !== ys.length) return 0;
    const hx = shannonEntropy(xs);
    const hy = shannonEntropy(ys);
    const pairs = xs.map((x, i) => `${x},${ys[i]}`);
    const hxy = shannonEntropy(pairs.map(x => hashCode(x))); // usare string→int hash
    const mi = hx + hy - hxy;
    if (Math.min(hx, hy) > 0) {
        const normalized = mi / Math.min(hx, hy);
        return Math.max(0, Math.min(1, normalized));
    }
    return 0;
}

// helper deterministico per hash string→float
function hashCode(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h % 1000000) / 1000000.0;
}

// ===============================================================
// III. ADAPTIVE THRESHOLDS
// ===============================================================

export function adaptiveConvergenceThreshold(targets: number[] | number, _epsilon?: number): number {
    if (typeof targets === 'number') {
        const n = targets;
        if (n <= 0) return 0.001;
        const ent = 1.0;
        const threshold = n > 1 ? ent / Math.log2(n) : ent;
        return clamp(threshold, 0.001, 0.1);
    } else {
        const xs = targets;
        if (xs.length === 0) return 0.001;
        const ent = shannonEntropy(xs);
        const n = xs.length;
        if (n === 1) return clamp(ent, 0.001, 0.1);
        const threshold = ent / Math.log2(n);
        return clamp(threshold, 0.001, 0.1);
    }
}

export function adaptiveStagnationThreshold(losses: number[]): [number, number] {
    const n = losses.length;
    const variance = listVariance(losses);
    const entropyThresh = n > 0 ? log2(n) * 0.1 : 0;
    const varThresh = Math.sqrt(variance);
    return [entropyThresh, varThresh];
}

export function adaptivePopulationSize(dim: number, sigma: number): number {
    const covering = Math.pow(1.0 / Math.max(1e-6, sigma), dim);
    const minSize = 4;
    const maxSize = Math.max(minSize, dim * 10);
    return Math.max(minSize, Math.min(maxSize, Math.floor(covering)));
}

export function adaptiveWindowSize(n: number): number {
    const optimal = Math.floor(Math.sqrt(n));
    const minSize = 30;
    return Math.max(minSize, Math.min(n, optimal));
}

// ===============================================================
// IV. FORMAL COEFFICIENTS
// ===============================================================

export function optimalAdaptationRate(dim: number): number {
    return 2.0 / Math.sqrt(dim + 1.0);
}

export function optimalExplorationFactors(temp: number): [number, number] {
    const safeTemp = Math.max(0.1, temp);
    const shrink0 = Math.exp(-1.0 / safeTemp);
    const expand0 = Math.exp(1.0 / safeTemp);
    const shrink = clamp(shrink0, 0.9, 0.99);
    const expand = clamp(expand0, 1.01, 1.1);
    return [shrink, expand];
}

export function optimalSigmaMultiplier(n: number): number {
    const nf = Math.max(1, n);
    const scott = Math.pow(nf, -1.0 / 5.0);
    const silverman = Math.pow(4.0 / (3.0 * nf), 1.0 / 5.0);
    return Math.sqrt(scott * silverman);
}

export function optimalAgreementThreshold(agents: number): number {
    if (agents === 1) return 1.0;
    const base = 2.0 / 3.0;
    const n = Math.max(1, agents);
    const wilson = 1.96 * Math.sqrt(base * (1.0 - base) / n);
    const adjusted = base - wilson;
    return clamp(adjusted, 0.5, 0.95);
}

// ===============================================================
// V. STATISTICAL PRINCIPLES
// ===============================================================

export function bayesianConfidence(obs: number[]): [number, number] {
    if (obs.length === 0) return [0, 0];
    const n = obs.length;
    const meanVal = listMean(obs);
    const varianceVal = listVariance(obs);
    const stdErr = Math.sqrt(varianceVal / n);
    const margin = 1.96 * stdErr;
    return [meanVal - margin, meanVal + margin];
}

export function cauchyConvergence(seq: number[], eps: number): boolean {
    const n = seq.length;
    if (n < 2) return false;
    const tail = seq.slice(Math.floor(n / 2));
    if (tail.length < 2) return false;
    let maxDiff = 0;
    for (const x of tail) for (const y of tail) maxDiff = Math.max(maxDiff, Math.abs(x - y));
    return maxDiff < eps;
}

// ===============================================================
// VI. STRUCTURAL MEASURES
// ===============================================================

export function structuralComplexity(nvops: number, ropType = 0): number {
    if (nvops === 0) return 0;
    const vopC = nvops;
    const ropC = ropType === 0 ? 1.0 : ropType === 1 ? 2.0 : 1.5;
    const interact = nvops * log2(nvops + 1.0);
    return vopC + ropC + interact;
}

export function emergenceThreshold(popSize: number): number {
    if (popSize <= 0) return 0.1;
    if (popSize === 1) return 0.5;
    const threshold = 1.0 / Math.sqrt(popSize);
    return clamp(threshold, 0.001, 0.5);
}

// ===============================================================
// VII. COMPOSITE METRICS
// ===============================================================

export function qualityMetric(entropy: number, variance: number, complexity: number): number {
    const normalizedEntropy = clamp(entropy, 0, 1);
    const stability = 1.0 / (1.0 + variance);
    const simplicity = 1.0 / (1.0 + complexity);
    return (normalizedEntropy + stability + simplicity) / 3.0;
}

export function systemMaturity(convergenceHistory: number[]): number {
    if (convergenceHistory.length === 0) return 0;
    const recent = convergenceHistory.slice(0, 10);
    const recentVariance = listVariance(recent);
    const stability = Math.exp(-recentVariance);

    let consistency = 0;
    if (convergenceHistory.length > 1) {
        let improvements = 0;
        let pairs = 0;
        for (let i = 0; i < convergenceHistory.length - 1; i++) {
            if (convergenceHistory[i + 1] < convergenceHistory[i]) improvements++;
            pairs++;
        }
        consistency = pairs > 0 ? improvements / pairs : 0;
    }

    return Math.min(1.0, (stability + consistency) / 2.0);
}

// ===============================================================
// VIII. OPTIMIZATION HELPERS
// ===============================================================

export interface GaussianParams {
    sigma: number;
    mu: number;
}

export function optimalFuzzyParams(datasetSize: number, targetVariance: number): GaussianParams {
    const sigmaMult = optimalSigmaMultiplier(datasetSize);
    const adaptiveSigma = Math.sqrt(targetVariance) * sigmaMult;
    const finalSigma = Math.max(1e-6, adaptiveSigma);
    return { sigma: finalSigma, mu: 0.0 };
}

export function optimalLearningRate(gradientNorm: number, iteration: number): number {
    const baseRate = optimalAdaptationRate(1);
    const decay = 1.0 / Math.sqrt(iteration + 1.0);
    const gradAdj = 1.0 / (1.0 + gradientNorm);
    return baseRate * decay * gradAdj;
}

// ===============================================================
// IX. VALIDATION UTILITIES
// ===============================================================

export function validateParams(entropy: number, variance: number, convergenceThresh: number): boolean {
    return entropy >= 0 && variance >= 0 && convergenceThresh > 0 && convergenceThresh < 1;
}

export interface SystemDiagnostics {
    entropy: number;
    variance: number;
    convergenceRate: number;
    maturityIndex: number;
    recommendedParams: GaussianParams;
}

export function systemDiagnostics(recentLosses: number[], datasetSize: number): SystemDiagnostics {
    const entropy = shannonEntropy(recentLosses);
    const variance = listVariance(recentLosses);
    const convergenceRate = adaptiveConvergenceThreshold(recentLosses);
    const maturityIndex = systemMaturity(recentLosses);
    const params = optimalFuzzyParams(datasetSize, variance);
    return { entropy, variance, convergenceRate, maturityIndex, recommendedParams: params };
}

// ===============================================================
// X. ADDITIONAL HELPERS (Lipschitz & Coverage Combination)
// ===============================================================

export function lipschitzEstimate(prev: number[], next: number[]): number {
    if (prev.length === 0 || next.length === 0) return 0;
    const n = Math.min(prev.length, next.length);
    let maxRatio = 0;
    for (let i = 0; i < n; i++) {
        const dx = Math.abs(next[i] - prev[i]);
        const denom = Math.abs(prev[i]) + 1e-6;
        const ratio = dx / denom;
        if (ratio > maxRatio) maxRatio = ratio;
    }
    return Number(maxRatio.toFixed(6));
}

export function coverageCombine(semantic: number, structural: number, beta = 0.5): number {
    const b = Math.min(1, Math.max(0, beta));
    return b * semantic + (1 - b) * structural;
}

// ===============================================================
// INTERNAL HELPERS
// ===============================================================

function clamp(x: number, a: number, b: number): number {
    return Math.max(a, Math.min(b, x));
}
