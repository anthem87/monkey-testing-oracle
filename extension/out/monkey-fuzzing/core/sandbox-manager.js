"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class SandboxManager {
    constructor(root = '.sandboxes') {
        this.root = root;
    }
    async setup(projectPath, targetFile) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const base = path_1.default.join(projectPath, this.root, timestamp);
        const testsPath = path_1.default.join(base, 'tests');
        await fs_1.promises.mkdir(testsPath, { recursive: true });
        const absSource = path_1.default.isAbsolute(targetFile) ? targetFile : path_1.default.join(projectPath, targetFile);
        const sourceMirrorPath = path_1.default.join(base, path_1.default.basename(targetFile));
        // Copy file (avoid symlink on Windows + cross-filesystems to reduce failure modes)
        await fs_1.promises.copyFile(absSource, sourceMirrorPath);
        return {
            sandboxPath: base,
            testsPath,
            sourceMirrorPath,
            createdAt: new Date().toISOString()
        };
    }
}
exports.SandboxManager = SandboxManager;
//# sourceMappingURL=sandbox-manager.js.map