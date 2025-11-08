/**
 * =============================================================
 * PROJECT-EXPLORER.TS
 * =============================================================
 * Esplora il progetto target per raccogliere contesto:
 * - DTOs e classi correlate
 * - Dipendenze dal pom.xml
 * - Metodi della classe sotto test
 * - Strutture dati e annotazioni
 * =============================================================
 */

import { promises as fs } from 'fs';
import path from 'path';
import { CopilotAPI } from './types';

export interface ProjectContext {
  targetClass: {
    name: string;
    path: string;
    content: string;
    methods: string[];
    fields: string[];
    imports: string[];
  };
  relatedClasses: Array<{
    name: string;
    path: string;
    type: 'dto' | 'service' | 'repository' | 'util' | 'other';
    content?: string;
  }>;
  dependencies: Array<{
    groupId: string;
    artifactId: string;
    version: string;
    scope?: string;
  }>;
  testingFrameworks: string[];
}

export class ProjectExplorer {
  constructor(private copilotAPI?: CopilotAPI) {}

  /**
   * 🔍 Esplora il progetto e raccogli contesto completo
   */
  async exploreProject(targetClassPath: string, projectRoot: string): Promise<ProjectContext> {
    console.log(`\n🔍 Exploring project context...`);
    console.log(`   Target class: ${targetClassPath}`);
    console.log(`   Project root: ${projectRoot}`);

    // 1. Leggi la classe target
    const targetClass = await this.analyzeTargetClass(targetClassPath);
    
    // 2. Trova classi correlate (DTOs, services, etc.)
    const relatedClasses = await this.findRelatedClasses(targetClass, projectRoot);
    
    // 3. Analizza pom.xml per dipendenze
    const dependencies = await this.extractDependencies(projectRoot);
    
    // 4. Identifica framework di testing disponibili
    const testingFrameworks = this.detectTestingFrameworks(dependencies);
    
    console.log(`   Found ${relatedClasses.length} related classes`);
    console.log(`   Found ${dependencies.length} dependencies`);
    console.log(`   Testing frameworks: ${testingFrameworks.join(', ')}`);

    return {
      targetClass,
      relatedClasses,
      dependencies,
      testingFrameworks
    };
  }

  /**
   * 📖 Analizza la classe Java target
   */
  private async analyzeTargetClass(classPath: string): Promise<ProjectContext['targetClass']> {
    const content = await fs.readFile(classPath, 'utf8');
    const className = path.basename(classPath, '.java');

    // Extract methods, fields, imports usando Copilot se disponibile
    if (this.copilotAPI) {
      const prompt = `Analyze this Java class and extract:
1. All public method signatures
2. All field declarations
3. All import statements

Return JSON format:
{
  "methods": ["method1()", "method2(String param)"],
  "fields": ["private String field1", "private int field2"],
  "imports": ["import java.util.List", "import com.example.Dto"]
}

Java class:
\`\`\`java
${content.substring(0, 3000)}
\`\`\``;

      try {
        const response = await this.copilotAPI.generate(prompt);
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            name: className,
            path: classPath,
            content,
            methods: parsed.methods || [],
            fields: parsed.fields || [],
            imports: parsed.imports || []
          };
        }
      } catch (err) {
        console.warn('⚠️ Copilot analysis failed, using regex fallback');
      }
    }

    // Fallback: regex-based extraction
    const methods = this.extractMethodsRegex(content);
    const fields = this.extractFieldsRegex(content);
    const imports = this.extractImportsRegex(content);

    return {
      name: className,
      path: classPath,
      content,
      methods,
      fields,
      imports
    };
  }

  /**
   * 🔗 Trova classi correlate (DTOs, services, repositories)
   */
  private async findRelatedClasses(
    targetClass: ProjectContext['targetClass'],
    projectRoot: string
  ): Promise<ProjectContext['relatedClasses']> {
    const related: ProjectContext['relatedClasses'] = [];

    // Estrai classi dagli import
    const importedClasses = targetClass.imports
      .filter(imp => imp.includes('import') && !imp.includes('java.'))
      .map(imp => {
        const match = imp.match(/import\s+([a-zA-Z0-9_.]+);?/);
        return match ? match[1] : null;
      })
      .filter(Boolean) as string[];

    console.log(`   Analyzing ${importedClasses.length} imported classes...`);

    for (const fullClassName of importedClasses) {
      const className = fullClassName.split('.').pop()!;
      const possiblePath = await this.findClassInProject(className, projectRoot);
      
      if (possiblePath) {
        const type = this.classifyType(className);
        const content = await fs.readFile(possiblePath, 'utf8').catch(() => undefined);
        
        related.push({
          name: className,
          path: possiblePath,
          type,
          content: content?.substring(0, 2000) // Prime 2000 chars per contesto
        });
        
        console.log(`      ✅ Found ${type}: ${className}`);
      }
    }

    return related;
  }

  /**
   * 🔎 Cerca una classe nel progetto
   */
  private async findClassInProject(className: string, projectRoot: string): Promise<string | null> {
    const searchDirs = [
      path.join(projectRoot, 'src', 'main', 'java'),
      path.join(projectRoot, 'src', 'test', 'java'),
      path.join(projectRoot, '..', '..', 'src', 'main', 'java'), // Moduli Maven
    ];

    for (const dir of searchDirs) {
      try {
        const result = await this.findFileRecursive(dir, `${className}.java`);
        if (result) return result;
      } catch {
        // Directory non esiste, continua
      }
    }

    return null;
  }

  /**
   * 📂 Cerca file ricorsivamente
   */
  private async findFileRecursive(dir: string, filename: string): Promise<string | null> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const result = await this.findFileRecursive(fullPath, filename);
          if (result) return result;
        } else if (entry.name === filename) {
          return fullPath;
        }
      }
    } catch {
      // Ignora errori di permessi
    }

    return null;
  }

  /**
   * 🏷️ Classifica il tipo di classe
   */
  private classifyType(className: string): 'dto' | 'service' | 'repository' | 'util' | 'other' {
    const lower = className.toLowerCase();
    
    if (lower.includes('dto') || lower.includes('request') || lower.includes('response')) {
      return 'dto';
    }
    if (lower.includes('service')) {
      return 'service';
    }
    if (lower.includes('repository') || lower.includes('dao')) {
      return 'repository';
    }
    if (lower.includes('util') || lower.includes('helper')) {
      return 'util';
    }
    
    return 'other';
  }

  /**
   * 📦 Estrai dipendenze dal pom.xml
   */
  private async extractDependencies(projectRoot: string): Promise<ProjectContext['dependencies']> {
    const pomPath = path.join(projectRoot, 'pom.xml');
    
    try {
      const pomContent = await fs.readFile(pomPath, 'utf8');
      const dependencies: ProjectContext['dependencies'] = [];
      
      // Regex per estrarre dipendenze
      const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
      let match;
      
      while ((match = depRegex.exec(pomContent)) !== null) {
        dependencies.push({
          groupId: match[1].trim(),
          artifactId: match[2].trim(),
          version: match[3].trim()
        });
      }
      
      return dependencies;
    } catch (err) {
      console.warn(`⚠️ Could not read pom.xml: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * 🧪 Rileva framework di testing disponibili
   */
  private detectTestingFrameworks(dependencies: ProjectContext['dependencies']): string[] {
    const frameworks = new Set<string>();
    
    for (const dep of dependencies) {
      const artifact = dep.artifactId.toLowerCase();
      
      if (artifact.includes('junit')) frameworks.add('JUnit');
      if (artifact.includes('mockito')) frameworks.add('Mockito');
      if (artifact.includes('spring-boot-test')) frameworks.add('SpringBootTest');
      if (artifact.includes('testcontainers')) frameworks.add('Testcontainers');
      if (artifact.includes('rest-assured')) frameworks.add('RestAssured');
    }
    
    return Array.from(frameworks);
  }

  // === REGEX FALLBACKS ===

  private extractMethodsRegex(content: string): string[] {
    const methodRegex = /(?:public|protected|private)\s+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)/g;
    const methods: string[] = [];
    let match;
    
    while ((match = methodRegex.exec(content)) !== null) {
      methods.push(match[0]);
    }
    
    return methods;
  }

  private extractFieldsRegex(content: string): string[] {
    const fieldRegex = /(?:private|protected|public)\s+[\w<>\[\]]+\s+\w+\s*[;=]/g;
    const fields: string[] = [];
    let match;
    
    while ((match = fieldRegex.exec(content)) !== null) {
      fields.push(match[0].replace(/[;=].*/, '').trim());
    }
    
    return fields;
  }

  private extractImportsRegex(content: string): string[] {
    const importRegex = /import\s+[a-zA-Z0-9_.]+;?/g;
    return content.match(importRegex) || [];
  }
}
