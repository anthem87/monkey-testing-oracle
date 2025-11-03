/**
 * REAL COVERAGE ENGINE (TypeScript)
 * Provides approximate real coverage metrics by parsing project sources.
 * Focus: statement count, branch-like indicators (if/for/while), and function count vs touched.
 * Execution mapping is heuristic: we correlate test names to source identifiers by substring matching.
 */
import ts from 'typescript';
import fs from 'fs/promises';
import path from 'path';
import { coverageCombine } from '../metrics/metrics';

export interface CoverageData {
  statementsTotal: number;
  statementsCovered: number;
  branchesTotal: number;
  branchesCovered: number;
  functionsTotal: number;
  functionsCovered: number;
  semanticCoverage: number; // derived
  structuralCoverage: number; // derived
  totalCoverage: number; // combined
}

export class RealCoverageEngine {
  constructor(private projectRoot: string = process.cwd()) {}

  async instrumentCode(testNames: string[]): Promise<CoverageData> {
    const srcDir = path.join(this.projectRoot, 'src');
    let files: string[] = [];
    try {
      files = await this.collectTsFiles(srcDir);
    } catch {
      return this.empty();
    }

    let statementsTotal = 0;
    let branchesTotal = 0;
    let functionsTotal = 0;
    const identifiers: string[] = [];

    for (const file of files) {
      const sourceText = await fs.readFile(file, 'utf-8');
      const sf = ts.createSourceFile(file, sourceText, ts.ScriptTarget.ES2020, true);
      this.walk(sf, node => {
        switch (node.kind) {
          case ts.SyntaxKind.ExpressionStatement:
          case ts.SyntaxKind.ReturnStatement:
          case ts.SyntaxKind.VariableStatement:
          case ts.SyntaxKind.IfStatement:
          case ts.SyntaxKind.ForStatement:
          case ts.SyntaxKind.ForOfStatement:
          case ts.SyntaxKind.WhileStatement:
          case ts.SyntaxKind.DoStatement:
            statementsTotal++;
            break;
        }
        if (node.kind === ts.SyntaxKind.IfStatement || node.kind === ts.SyntaxKind.ForStatement || node.kind === ts.SyntaxKind.WhileStatement) {
          branchesTotal++;
        }
        if (ts.isFunctionDeclaration(node) && node.name) {
          functionsTotal++;
          identifiers.push(node.name.text);
        }
        if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
          functionsTotal++;
          identifiers.push(node.name.text);
        }
      });
    }

    if (statementsTotal === 0) return this.empty();

    // Heuristic coverage: test names referencing identifiers
    const coveredIds = new Set<string>();
    for (const name of testNames) {
      for (const id of identifiers) {
        if (name.includes(id)) coveredIds.add(id);
      }
    }
    const functionsCovered = coveredIds.size;
    // Approximate statement/branch coverage scale by functions touched
    const coverageRatio = functionsTotal > 0 ? functionsCovered / functionsTotal : 0;
    const statementsCovered = Math.round(statementsTotal * coverageRatio);
    const branchesCovered = Math.round(branchesTotal * coverageRatio);

    const semanticCoverage = coverageRatio; // using touched identifiers as semantic signal
    const structuralCoverage = (statementsCovered + branchesCovered) / Math.max(1, statementsTotal + branchesTotal);
    // Use coverageCombine with default beta=0.5
    const totalCoverage = coverageCombine(semanticCoverage, structuralCoverage);

    return {
      statementsTotal,
      statementsCovered,
      branchesTotal,
      branchesCovered,
      functionsTotal,
      functionsCovered,
      semanticCoverage,
      structuralCoverage,
      totalCoverage
    };
  }

  private async collectTsFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        files.push(...await this.collectTsFiles(full));
      } else if (e.isFile() && full.endsWith('.ts')) {
        files.push(full);
      }
    }
    return files;
  }

  private walk(node: ts.Node, visit: (n: ts.Node) => void) {
    visit(node);
    node.forEachChild(child => this.walk(child, visit));
  }

  private empty(): CoverageData {
    return { statementsTotal: 0, statementsCovered: 0, branchesTotal: 0, branchesCovered: 0, functionsTotal: 0, functionsCovered: 0, semanticCoverage: 0, structuralCoverage: 0, totalCoverage: 0 };
  }
}
