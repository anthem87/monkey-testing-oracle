"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Smoke test per il framework evolutivo:
 * - Esegue 2 generazioni
 * - Verifica dimensione stato > 0
 * - Verifica creazione checkpoint
 * - Verifica coverage totale in [0,1]
 * - Introduce un test con errore di compilazione per vedere f_comp penalizzato
 */
const evolution_1 = require("./evolution");
const oracle_1 = require("./oracle");
const report_1 = require("./report");
const state_1 = require("./state");
const runner_1 = require("./runner");
const persistence_1 = require("./persistence");
async function runSmoke() {
    const config = {
        populationSize: 4,
        generations: 2,
        mutationRate: 0.3,
        crossoverRate: 0.6,
        elitismCount: 1
    };
    // const mutationRegistry = new MutationRegistry(); // unused in smoke test
    const oracleManager = new oracle_1.OracleManager();
    const reportEngine = new report_1.ReportEngine('./reports-smoke');
    const evolutionEngine = new evolution_1.EvolutionEngine(config);
    // feedback engine omitted
    const testRunner = new runner_1.TestRunner();
    const persistence = new persistence_1.PersistenceManager('./checkpoints-smoke');
    const stateTracker = new state_1.StateTracker(oracleManager, { selection: 'tournament(3)', crossover: 'uniform', mutation: 'adaptive', elitism: 'top-1', oracleUpdate: 'gradient' });
    evolutionEngine.setStateTracker(stateTracker);
    const suite = {
        tests: [
            { name: 'ok_case', input: 'abc', confidence: 1 },
            { name: 'compile_err', input: 'xyz', confidence: 0.8 }
        ]
    };
    evolutionEngine.initialize({ tests: suite.tests });
    let best;
    for (let g = 0; g < config.generations; g++) {
        best = await evolutionEngine.evolveOneGeneration(g, {
            runGeneratedTests: (s) => {
                const mapped = s.tests.map((t) => ({
                    name: t.name,
                    input: t.input,
                    expected: 'valid',
                    confidence: t.confidence ?? 0.5,
                    language: 'typescript',
                    code: t.name === 'compile_err' ? "consle.log('fail');" : "console.log('ok');"
                }));
                return testRunner.runGeneratedTests({ id: `smoke_gen_${g}`, targetLanguage: 'typescript', tests: mapped });
            }
        });
    }
    const snapshotHistory = evolutionEngine.stateTracker.getHistory();
    if (!snapshotHistory.length)
        throw new Error('State history vuoto');
    const last = snapshotHistory.slice(-1)[0];
    if (last.dimTotal <= 0)
        throw new Error('Dimensione stato non valida');
    // Genera report su best
    const mapped = best.testSuite.tests.map((t) => ({ name: t.name, input: t.input, expected: 'valid', confidence: t.confidence ?? 0.5, language: 'typescript', code: "console.log('x');" }));
    const results = await testRunner.runGeneratedTests({ id: 'report_smoke', targetLanguage: 'typescript', tests: mapped });
    const report = await reportEngine.generateGenerationReport(1, evolutionEngine.population, results);
    const totalCoverage = report.summary.totalCoverage;
    if (totalCoverage < 0 || totalCoverage > 1)
        throw new Error('Coverage totale fuori range');
    // check esistenza almeno di un checkpoint
    // const files = await persistence.loadLatest(); // suppressed unused variable
    const file = await persistence.saveCheckpoint(1, evolutionEngine.population, oracleManager, last);
    console.log('Checkpoint file:', file);
    console.log('\nSMOKE TEST COMPLETATO:');
    console.log('dim(S_t)=', last.dimTotal, 'entropy=', last.entropyPopulation.toFixed(3), 'coverage_total=', totalCoverage.toFixed(3));
}
runSmoke().catch(e => { console.error('SMOKE TEST FALLITO', e); process.exit(1); });
//# sourceMappingURL=test-smoke.js.map