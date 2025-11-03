import { promises as fs } from 'fs';
import path from 'path';
import { SandboxInfo } from './types.js';

/**
 * Convert WSL Windows path to Unix path if needed
 * Example: \\wsl.localhost\Ubuntu\home\user\... -> /home/user/...
 */
function normalizeWSLPath(windowsPath: string): string {
  if (windowsPath.startsWith('\\\\wsl.localhost\\')) {
    // Remove \\wsl.localhost\Ubuntu (or other distro)
    const parts = windowsPath.split(path.sep);
    // parts = ['', '', 'wsl.localhost', 'Ubuntu', 'home', 'user', ...]
    if (parts.length >= 4) {
      return '/' + parts.slice(4).join('/');
    }
  }
  return windowsPath;
}

export class SandboxManager {
  constructor(private root: string = '.sandboxes') {}

  async setup(projectPath: string, targetFile: string): Promise<SandboxInfo> {
    // Normalize paths for WSL compatibility
    const normalizedProjectPath = normalizeWSLPath(projectPath);
    const normalizedTargetFile = normalizeWSLPath(targetFile);
    
    const timestamp = Date.now().toString(36); // Shorter timestamp
    const base = path.join(normalizedProjectPath, this.root, timestamp);
    const testsPath = path.join(base, 'tests');
    
    console.log(`🔧 Creating sandbox at: ${base}`);
    await fs.mkdir(testsPath, { recursive: true });

    const absSource = path.isAbsolute(normalizedTargetFile) 
      ? normalizedTargetFile 
      : path.join(normalizedProjectPath, normalizedTargetFile);
      
    const sourceMirrorPath = path.join(base, path.basename(normalizedTargetFile));

    // Copy file (avoid symlink on Windows + cross-filesystems to reduce failure modes)
    console.log(`📄 Copying source: ${absSource} -> ${sourceMirrorPath}`);
    await fs.copyFile(absSource, sourceMirrorPath);

    return {
      sandboxPath: base,
      testsPath,
      sourceMirrorPath,
      createdAt: new Date().toISOString()
    };
  }
}
