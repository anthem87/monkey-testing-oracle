import { promises as fs } from 'fs';
import path from 'path';
import { SandboxInfo } from './types.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SandboxManager {
  constructor(private root: string = '.sandboxes') {}

  async setup(projectPath: string, targetFile: string): Promise<SandboxInfo> {
    console.log(`🔍 Raw projectPath: ${projectPath}`);
    console.log(`🔍 Raw targetFile: ${targetFile}`);
    
    // DON'T normalize - keep original paths (UNC or Unix)
    // The extension runs in WSL context so paths work as-is
    
    const timestamp = Date.now().toString(36);
    const base = path.join(projectPath, this.root, timestamp);
    const testsPath = path.join(base, 'tests');
    
    console.log(`🔧 Creating sandbox at: ${base}`);
    await fs.mkdir(testsPath, { recursive: true });

    const absSource = path.isAbsolute(targetFile) 
      ? targetFile 
      : path.join(projectPath, targetFile);
      
    const sourceMirrorPath = path.join(base, path.basename(targetFile));

    console.log(`📄 Copying source: ${absSource} -> ${sourceMirrorPath}`);
    await fs.copyFile(absSource, sourceMirrorPath);

    return {
      sandboxPath: base,
      testsPath,
      sourceMirrorPath,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Link generated tests to target project's test directory
   * For Java Maven projects: src/test/java/package/path/
   */
  async linkTestsToProject(
    sandboxInfo: SandboxInfo,
    targetProjectRoot: string,
    packagePath: string
  ): Promise<{ linkedTests: string[]; targetTestDir: string }> {
    // Detect project type and test directory
    const testDir = await this.detectTestDirectory(targetProjectRoot, packagePath);
    
    console.log(`🔗 Linking tests to: ${testDir}`);
    await fs.mkdir(testDir, { recursive: true });

    // Get all test files from sandbox
    const testFiles = await fs.readdir(sandboxInfo.testsPath);
    const javaTests = testFiles.filter(f => f.endsWith('.java') && !f.startsWith('.'));
    
    const linkedTests: string[] = [];
    
    for (const testFile of javaTests) {
      const sourcePath = path.join(sandboxInfo.testsPath, testFile);
      const targetPath = path.join(testDir, testFile);
      
      try {
        // Remove existing file/symlink if present
        await fs.unlink(targetPath).catch(() => {});
        
        // Create symlink
        await fs.symlink(sourcePath, targetPath);
        linkedTests.push(targetPath);
        console.log(`✅ Linked: ${testFile}`);
      } catch (error) {
        console.error(`❌ Failed to link ${testFile}:`, error);
      }
    }

    // Save project root metadata for later auto-detection
    const metadataPath = path.join(sandboxInfo.testsPath, '.metadata', 'project-root.txt');
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, targetProjectRoot, 'utf-8');
    console.log(`📝 Saved project root metadata: ${targetProjectRoot}`);

    return { linkedTests, targetTestDir: testDir };
  }

  /**
   * Detect test directory based on project type
   */
  private async detectTestDirectory(projectRoot: string, packagePath: string): Promise<string> {
    // Check for Maven project
    const pomPath = path.join(projectRoot, 'pom.xml');
    try {
      await fs.access(pomPath);
      // Maven: src/test/java/package/path
      return path.join(projectRoot, 'src', 'test', 'java', ...packagePath.split('.'));
    } catch {
      // Not Maven
    }

    // Check for Gradle
    const gradlePath = path.join(projectRoot, 'build.gradle');
    try {
      await fs.access(gradlePath);
      return path.join(projectRoot, 'src', 'test', 'java', ...packagePath.split('.'));
    } catch {
      // Not Gradle
    }

    // Fallback: create tests folder in project root
    return path.join(projectRoot, 'tests', ...packagePath.split('.'));
  }

  /**
   * Auto-detect project root by reading saved metadata or following symlinks in sandbox
   * Returns the root directory containing pom.xml, build.gradle, or package.json
   */
  async detectProjectRoot(sandboxPath: string): Promise<string | null> {
    const testsPath = path.join(sandboxPath, 'tests');
    
    // First, try to read saved metadata
    const metadataPath = path.join(testsPath, '.metadata', 'project-root.txt');
    try {
      const savedRoot = await fs.readFile(metadataPath, 'utf-8');
      const trimmedRoot = savedRoot.trim();
      console.log(`📖 Read project root from metadata: ${trimmedRoot}`);
      
      // Verify it still exists
      try {
        await fs.access(trimmedRoot);
        return trimmedRoot;
      } catch {
        console.log(`⚠️ Saved project root no longer exists: ${trimmedRoot}`);
      }
    } catch {
      // No metadata, continue to symlink detection
      console.log(`📝 No metadata found, trying symlink detection...`);
    }
    
    try {
      const testFiles = await fs.readdir(testsPath);
      
      // Find first symlinked file
      for (const file of testFiles) {
        const filePath = path.join(testsPath, file);
        
        try {
          const stats = await fs.lstat(filePath);
          if (stats.isSymbolicLink()) {
            // Read the symlink target
            const targetPath = await fs.readlink(filePath);
            const absoluteTarget = path.isAbsolute(targetPath) 
              ? targetPath 
              : path.resolve(path.dirname(filePath), targetPath);
            
            console.log(`🔍 Following symlink: ${file} -> ${absoluteTarget}`);
            
            // Walk up the directory tree to find build file
            let currentDir = path.dirname(absoluteTarget);
            let depth = 0;
            
            while (depth < 10) {
              // Check for Maven
              try {
                await fs.access(path.join(currentDir, 'pom.xml'));
                console.log(`✅ Found Maven project at: ${currentDir}`);
                return currentDir;
              } catch {}
              
              // Check for Gradle
              try {
                await fs.access(path.join(currentDir, 'build.gradle'));
                console.log(`✅ Found Gradle project at: ${currentDir}`);
                return currentDir;
              } catch {}
              
              // Check for npm
              try {
                await fs.access(path.join(currentDir, 'package.json'));
                console.log(`✅ Found npm project at: ${currentDir}`);
                return currentDir;
              } catch {}
              
              // Check for Cargo (Rust)
              try {
                await fs.access(path.join(currentDir, 'Cargo.toml'));
                console.log(`✅ Found Cargo project at: ${currentDir}`);
                return currentDir;
              } catch {}
              
              // Go up one directory
              const parentDir = path.dirname(currentDir);
              if (parentDir === currentDir) break; // Reached root
              currentDir = parentDir;
              depth++;
            }
          }
        } catch (err) {
          // Not a symlink or error reading, skip
          continue;
        }
      }
    } catch (error) {
      console.error(`❌ Error detecting project root:`, error);
    }
    
    return null;
  }

  /**
   * Execute Maven test command on linked tests
   */
  async runMavenTests(projectRoot: string, testClassName?: string): Promise<{ stdout: string; stderr: string }> {
    const testArg = testClassName ? `-Dtest=${testClassName}` : '';
    const command = `cd ${projectRoot} && mvn test ${testArg}`;
    
    console.log(`🧪 Running: ${command}`);
    
    try {
      const { stdout, stderr } = await execAsync(command);
      return { stdout, stderr };
    } catch (error: any) {
      return { stdout: error.stdout || '', stderr: error.stderr || error.message };
    }
  }
}
