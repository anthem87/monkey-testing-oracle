"use strict";
/**
 * ===================================================================
 * EVOLUTION CLI - Command Line Interface for EvolutionRunner
 * ===================================================================
 *
 * Provides CLI commands for:
 * - Starting new evolution runs
 * - Resuming from checkpoints
 * - Listing available checkpoints
 * - Analyzing checkpoint states
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseArgs = parseArgs;
exports.runCommand = runCommand;
const checkpoint_manager_js_1 = require("./checkpoint-manager.js");
const path_1 = __importDefault(require("path"));
function parseArgs() {
    const args = process.argv.slice(2);
    const command = args[0] || 'run';
    const targetFile = args.includes('--target')
        ? args[args.indexOf('--target') + 1]
        : undefined;
    const generations = args.includes('--generations')
        ? parseInt(args[args.indexOf('--generations') + 1])
        : 10;
    const workspaceRoot = args.includes('--workspace')
        ? args[args.indexOf('--workspace') + 1]
        : process.cwd();
    const checkpoint = args.includes('--checkpoint')
        ? args[args.indexOf('--checkpoint') + 1]
        : undefined;
    return {
        command,
        targetFile,
        generations,
        workspaceRoot,
        checkpoint
    };
}
async function runCommand(args) {
    switch (args.command) {
        case 'run':
            await commandRun(args);
            break;
        case 'resume':
            await commandResume(args);
            break;
        case 'list':
            await commandList(args);
            break;
        case 'analyze':
            await commandAnalyze(args);
            break;
        default:
            printUsage();
    }
}
async function commandRun(args) {
    if (!args.targetFile) {
        console.error('❌ --target is required for run command');
        printUsage();
        return;
    }
    console.log(`\n🚀 Starting new evolution run...\n`);
    console.log(`📂 Target: ${args.targetFile}`);
    console.log(`🔄 Generations: ${args.generations}`);
    console.log(`📁 Workspace: ${args.workspaceRoot}\n`);
    // Note: This is a CLI stub - actual runner requires VS Code extension context
    console.log(`⚠️ EvolutionRunner requires VS Code Extension context.`);
    console.log(`   Please use the VS Code command: "Monkey-Fuzzing: Evolution Runner"`);
    console.log(`   Or run from within the extension.\n`);
}
async function commandResume(args) {
    if (!args.checkpoint && !args.workspaceRoot) {
        console.error('❌ --checkpoint or --workspace is required for resume command');
        printUsage();
        return;
    }
    console.log(`\n🔄 Resuming evolution from checkpoint...\n`);
    const manager = new checkpoint_manager_js_1.CheckpointManager(args.workspaceRoot || process.cwd());
    // Load checkpoint (latest if not specified)
    const checkpoint = await manager.loadCheckpoint(args.checkpoint);
    if (!checkpoint) {
        console.error('❌ No checkpoint found');
        return;
    }
    console.log(`✅ Checkpoint loaded:`);
    console.log(`   Generation: ${checkpoint.generation}`);
    console.log(`   Timestamp: ${checkpoint.timestamp}`);
    console.log(`   Best Fitness: ${checkpoint.metrics.bestFitness.toFixed(3)}`);
    console.log(`   Population: ${checkpoint.population.length} individuals`);
    console.log(`   Tests: ${checkpoint.population[0]?.tests.length || 0}`);
    console.log(`\n⚠️ Resume functionality requires VS Code Extension context.`);
    console.log(`   Please use the VS Code command: "Monkey-Fuzzing: Resume Evolution"`);
    console.log(`   Or provide checkpoint path via extension.\n`);
}
async function commandList(args) {
    const manager = new checkpoint_manager_js_1.CheckpointManager(args.workspaceRoot || process.cwd());
    const checkpoints = await manager.listCheckpoints();
    if (checkpoints.length === 0) {
        console.log('📂 No checkpoints found\n');
        return;
    }
    console.log(`\n📂 Available checkpoints (${checkpoints.length}):\n`);
    console.log('┌────┬──────────────────────┬─────────────────────────────────┐');
    console.log('│ Gen│ Timestamp            │ Path                            │');
    console.log('├────┼──────────────────────┼─────────────────────────────────┤');
    for (const cp of checkpoints) {
        const timestamp = new Date(cp.timestamp).toLocaleString();
        const shortPath = path_1.default.basename(cp.path);
        console.log(`│ ${String(cp.generation).padStart(3)} │ ${timestamp.padEnd(20)} │ ${shortPath.padEnd(30)} │`);
    }
    console.log('└────┴──────────────────────┴─────────────────────────────────┘\n');
}
async function commandAnalyze(args) {
    if (!args.checkpoint) {
        console.error('❌ --checkpoint is required for analyze command');
        printUsage();
        return;
    }
    const manager = new checkpoint_manager_js_1.CheckpointManager(args.workspaceRoot || process.cwd());
    const checkpoint = await manager.loadCheckpoint(args.checkpoint);
    if (!checkpoint) {
        console.error('❌ Checkpoint not found');
        return;
    }
    console.log(`\n📊 Checkpoint Analysis\n`);
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`Generation: ${checkpoint.generation}`);
    console.log(`Timestamp:  ${new Date(checkpoint.timestamp).toLocaleString()}`);
    console.log(`───────────────────────────────────────────────────────────`);
    console.log(`Population: ${checkpoint.population.length} individuals`);
    console.log(`Best Fitness: ${checkpoint.metrics.bestFitness.toFixed(3)}`);
    console.log(`Avg Fitness:  ${checkpoint.metrics.avgFitness.toFixed(3)}`);
    console.log(`Diversity:    ${checkpoint.metrics.diversity.toFixed(3)}`);
    console.log(`Entropy:      ${checkpoint.metrics.entropy.toFixed(3)}`);
    console.log(`Emergence:    ${checkpoint.metrics.emergenceDetected ? '⚡ YES' : '❌ NO'}`);
    console.log(`───────────────────────────────────────────────────────────`);
    if (checkpoint.population.length > 0) {
        const individual = checkpoint.population[0];
        console.log(`\nTop Individual:`);
        console.log(`  ID: ${individual.id}`);
        console.log(`  Fitness: ${individual.fitness.toFixed(3)}`);
        console.log(`  Age: ${individual.age}`);
        console.log(`  Tests: ${individual.tests.length}`);
        if (individual.tests.length > 0) {
            const test = individual.tests[0];
            console.log(`\n  First Test:`);
            console.log(`    Name: ${test.name}`);
            console.log(`    Language: ${test.language}`);
            console.log(`    Origin: ${test.metadata.origin}`);
            console.log(`    Confidence: ${test.confidence.toFixed(2)}`);
            console.log(`    Code lines: ${test.code.split('\n').length}`);
        }
    }
    if (checkpoint.metricsHistory && checkpoint.metricsHistory.length > 0) {
        console.log(`\n📈 Metrics History (${checkpoint.metricsHistory.length} generations):`);
        console.log(`┌─────┬─────────┬──────┬────────────┬──────────┐`);
        console.log(`│ Gen │ Fitness │ Loss │ Compile    │ Tests    │`);
        console.log(`├─────┼─────────┼──────┼────────────┼──────────┤`);
        for (const m of checkpoint.metricsHistory.slice(-5)) {
            console.log(`│ ${String(m.generation).padStart(3)} │ ${m.fitness.toFixed(3)} │ ${m.loss.toFixed(3)} │ ${(m.compilationRate * 100).toFixed(0).padStart(3)}%       │ ${m.testsPassed}/${m.testsRun}      │`);
        }
        console.log(`└─────┴─────────┴──────┴────────────┴──────────┘`);
    }
    console.log(`═══════════════════════════════════════════════════════════\n`);
}
function printUsage() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║        Monkey-Fuzzing Evolution CLI                        ║
╚════════════════════════════════════════════════════════════╝

USAGE:
  node evolution-cli.js <command> [options]

COMMANDS:
  run       Start a new evolution run
  resume    Resume from a checkpoint
  list      List all available checkpoints
  analyze   Analyze a specific checkpoint

OPTIONS:
  --target <path>        Path to target Java class (required for run)
  --generations <n>      Number of generations (default: 10)
  --workspace <path>     Workspace root directory (default: cwd)
  --checkpoint <path>    Checkpoint file path (for resume/analyze)

EXAMPLES:
  # List available checkpoints
  node evolution-cli.js list --workspace /path/to/project

  # Analyze a checkpoint
  node evolution-cli.js analyze --checkpoint ./checkpoints/checkpoint-gen-5.json

  # Resume from latest checkpoint
  node evolution-cli.js resume --workspace /path/to/project

  # Start new run (requires VS Code Extension)
  node evolution-cli.js run --target ./path/to/Class.java --generations 20

NOTE:
  The 'run' and 'resume' commands require VS Code Extension context.
  Use the VS Code command palette instead:
    - "Monkey-Fuzzing: Evolution Runner"
    - "Monkey-Fuzzing: Resume Evolution"
`);
}
// Main
if (require.main === module) {
    const args = parseArgs();
    runCommand(args).catch(err => {
        console.error('❌ Error:', err.message);
        process.exit(1);
    });
}
//# sourceMappingURL=evolution-cli.js.map