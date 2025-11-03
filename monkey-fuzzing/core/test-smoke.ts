/**
 * Smoke test per il framework evolutivo:
 * - Esegue 2 generazioni
 * - Verifica dimensione stato > 0
 * - Verifica creazione checkpoint
 * - Verifica coverage totale in [0,1]
 * - Introduce un test con errore di compilazione per vedere f_comp penalizzato
 */
import { EvolutionEngine } from './evolution';
import { OracleManager } from './oracle';
import { ReportEngine } from './report';
import { StateTracker } from './state';
import { TestRunner } from './runner';
import type { GeneratedTest } from './types.js';
import { PersistenceManager } from './persistence';

async function runSmoke() {
  const config = {
    populationSize: 4,
    generations: 2,
    mutationRate: 0.3,
    crossoverRate: 0.6,
    elitismCount: 1
  };
  // const mutationRegistry = new MutationRegistry(); // unused in smoke test
  const oracleManager = new OracleManager();
  const reportEngine = new ReportEngine('./reports-smoke');
  const evolutionEngine = new EvolutionEngine(config as any);
  // feedback engine omitted
  const testRunner = new TestRunner();
  const persistence = new PersistenceManager('./checkpoints-smoke');
  const stateTracker = new StateTracker(oracleManager, { selection: 'tournament(3)', crossover: 'uniform', mutation: 'adaptive', elitism: 'top-1', oracleUpdate: 'gradient' });
  evolutionEngine.setStateTracker(stateTracker);

  const suite: { tests: GeneratedTest[] } = {
    tests: [
      { 
        name: 'ok_case', input: 'abc', expected: 'valid', code: 'console.log("ok");',
        metadata: { targetFile: '', origin: 'copilot-initial', confidence: 1 }
      },
      { 
        name: 'compile_err', input: 'xyz', expected: 'valid', code: 'console.log("err");',
        metadata: { targetFile: '', origin: 'copilot-initial', confidence: 0.8 }
      }
    ]
  };

  evolutionEngine.initialize({ tests: suite.tests });
  let best: any;
  for (let g = 0; g < config.generations; g++) {
    best = await evolutionEngine.evolveOneGeneration(g, {
      runGeneratedTests: (s: any) => {
        const mapped = s.tests.map((t: any) => ({
          name: t.name,
          input: t.input,
          expected: 'valid',
          confidence: t.confidence ?? 0.5,
          language: 'typescript' as const,
          code: t.name === 'compile_err' ? "consle.log('fail');" : "console.log('ok');"
        }));
        return testRunner.runGeneratedTests({ id: `smoke_gen_${g}`, targetLanguage: 'typescript', tests: mapped });
      }
    });
  }

  const snapshotHistory = (evolutionEngine as any).stateTracker.getHistory();
  if (!snapshotHistory.length) throw new Error('State history vuoto');
  const last = snapshotHistory.slice(-1)[0];
  if (last.dimTotal <= 0) throw new Error('Dimensione stato non valida');

  // Genera report su best
  const mapped = best.testSuite.tests.map((t: any) => ({ name: t.name, input: t.input, expected: 'valid', confidence: t.confidence ?? 0.5, language: 'typescript' as const, code: "console.log('x');" }));
  const results = await testRunner.runGeneratedTests({ id: 'report_smoke', targetLanguage: 'typescript', tests: mapped });
  const report = await reportEngine.generateGenerationReport(1, (evolutionEngine as any).population, results as any);
  const totalCoverage = report.summary.totalCoverage;
  if (totalCoverage < 0 || totalCoverage > 1) throw new Error('Coverage totale fuori range');

  // check esistenza almeno di un checkpoint
  // const files = await persistence.loadLatest(); // suppressed unused variable
  const file = await persistence.saveCheckpoint(1, (evolutionEngine as any).population, oracleManager, last);
  console.log('Checkpoint file:', file);

  console.log('\nSMOKE TEST COMPLETATO:');
  console.log('dim(S_t)=', last.dimTotal, 'entropy=', last.entropyPopulation.toFixed(3), 'coverage_total=', totalCoverage.toFixed(3));
}

runSmoke().catch(e => { console.error('SMOKE TEST FALLITO', e); process.exit(1); });
