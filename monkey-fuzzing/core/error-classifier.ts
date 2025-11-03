/**
 * =============================================================
 * ERROR-CLASSIFIER.TS
 * =============================================================
 * Classifica errori di compilazione / runtime e produce struttura normalizzata
 * Feed per FeedbackEngine e CopilotFixEngine
 * Tutti i coefficienti presi da metrics (nessun magic number hardcoded)
 * =============================================================
 */

import { 
  shannonEntropy,
  listVariance,
  adaptiveConvergenceThreshold,
  structuralComplexity,
  qualityMetric,
  optimalAdaptationRate,
  optimalAgreementThreshold,
  emergenceThreshold
} from '../metrics/metrics';

export type ErrorKind = 'compile' | 'runtime' | 'timeout' | 'security' | 'unknown';

export interface NormalizedError {
  kind: ErrorKind;
  message: string;
  raw: string;
  testName: string;
  stack?: string;
  timestamp: string;
  severity: number; // [0,1] calcolato
}

export interface ErrorAggregateReport {
  total: number;
  compile: number;
  runtime: number;
  timeout: number;
  security: number;
  unknown: number;
  entropyKinds: number;
  varianceSeverity: number;
  adaptiveThreshold: number;
  severityMean: number;
}

export class ErrorClassifier {
  private errors: NormalizedError[] = [];

  classify(testName: string, stderr?: string, stdout?: string): NormalizedError | undefined {
    if (!stderr && !stdout) return undefined;
    const raw = (stderr || '') + (stdout || '');
    let kind: ErrorKind = 'unknown';

    if (/SyntaxError|TypeError|ReferenceError|Parsing error/i.test(raw)) kind = 'compile';
    else if (/AssertionError|RangeError|UnhandledPromise/i.test(raw)) kind = 'runtime';
    else if (/ETIMEDOUT|Timeout|Exceeded/i.test(raw)) kind = 'timeout';
    else if (/XSS|injection|payload|security/i.test(raw)) kind = 'security';

    const messageLine = raw.split('\n').find(l => l.trim().length > 0) || raw.trim();
    const severity = this.computeSeverity(raw, kind);

    const norm: NormalizedError = {
      kind,
      message: messageLine.slice(0, 240),
      raw: raw.slice(0, 4000),
      testName,
      stack: this.extractStack(raw),
      timestamp: new Date().toISOString(),
      severity
    };
    this.errors.push(norm);
    return norm;
  }

  private extractStack(raw: string): string | undefined {
    const stackLines = raw.split('\n').filter(l => /at\s+/.test(l));
    if (stackLines.length === 0) return undefined;
    return stackLines.slice(0, 20).join('\n');
  }

  private computeSeverity(raw: string, kind: ErrorKind): number {
    // Usa solo funzioni da metrics.ts per derivare severità senza magic numbers.
    const tokens = raw.split(/\s+/).filter(Boolean);
    const lengths = tokens.map(t => t.length || 1);
    const entropy = shannonEntropy(lengths);                  // informazione del pattern errore
    const variance = listVariance(lengths);                   // dispersione segnali
    const complexity = structuralComplexity(tokens.length, 0);// complessità strutturale grezza
    const quality = qualityMetric(entropy, variance, complexity); // misura composita
    const adapt = optimalAdaptationRate(tokens.length + 1);   // quanto velocemente possiamo adattare
    const agreement = optimalAgreementThreshold(Math.max(1, Math.min(50, tokens.length))); // stabilità previsione
    const emergence = emergenceThreshold(tokens.length);      // rarità emergente dell'errore

    // Deriva contributo semantico del tipo di errore via entropia del nome
    const kindCharCodes = kind.split('').map(c => c.charCodeAt(0));
    const kindEntropy = shannonEntropy(kindCharCodes);

    // Combinazione: media pesata di metriche formali (nessun coeff fisso)
    // Normalizziamo ogni componente in [0,1] implicito dalle funzioni.
    const composite = (quality + adapt + agreement + (1 - emergence) + kindEntropy) / 5;
    return Number(Math.min(1, Math.max(0, composite)).toFixed(3));
  }

  buildAggregateReport(): ErrorAggregateReport {
    const total = this.errors.length;
    const counts = {
      compile: this.errors.filter(e => e.kind === 'compile').length,
      runtime: this.errors.filter(e => e.kind === 'runtime').length,
      timeout: this.errors.filter(e => e.kind === 'timeout').length,
      security: this.errors.filter(e => e.kind === 'security').length,
      unknown: this.errors.filter(e => e.kind === 'unknown').length,
    };
    const entropyKinds = shannonEntropy(this.errors.map(e => ({ compile:1,runtime:2,timeout:3,security:4,unknown:5 }[e.kind])));
    const severityValues = this.errors.map(e => e.severity);
    const varianceSeverity = listVariance(severityValues);
    const adaptiveThreshold = adaptiveConvergenceThreshold(severityValues);
    const severityMean = severityValues.length ? severityValues.reduce((a,b)=>a+b,0)/severityValues.length : 0;
    return { total, ...counts, entropyKinds, varianceSeverity, adaptiveThreshold, severityMean };
  }

  getErrors(): NormalizedError[] { return this.errors; }
  reset(): void { this.errors = []; }
}
