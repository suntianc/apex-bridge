import { DependencyManager } from '../../src/core/skills/DependencyManager';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  DependencyManagerOptions,
  SkillDependency
} from '../../src/types';
import { DependencyResolutionError } from '../../src/core/skills/CodeGenerationErrors';

describe('DependencyManager', () => {
  const createManager = (options?: DependencyManagerOptions) =>
    new DependencyManager(options);

  it('analyzes import and require statements', () => {
    const manager = createManager();
    const code = [
      "import path from 'path';",
      "const fetch = require('node-fetch');",
      "import('fs/promises');"
    ];

    expect(() => manager.analyzeCodeBlocks(code)).toThrow(DependencyResolutionError);

    const safeManager = createManager({ allowedBuiltins: ['path', 'fs', 'fs/promises'] });
    expect(() => safeManager.analyzeCodeBlocks(code)).not.toThrow();
    const deps = safeManager.analyzeCodeBlocks(code);

    const modules = deps.map((dep) => dep.module);
    expect(modules).toContain('path');
    expect(modules).toContain('node-fetch');
    expect(modules).toContain('fs/promises');
  });

  it('forbids remote dependencies', () => {
    const manager = createManager();
    const code = ["import data from 'https://example.com/module.js';"];

    expect(() => manager.analyzeCodeBlocks(code)).toThrow(DependencyResolutionError);
  });

  it('supports custom resolvers and cache', () => {
    const manager = createManager({
      allowedExternal: ['lodash'],
      customResolvers: {
        lodash: () => ({ random: () => 1 })
      }
    });

    const deps = manager.analyzeCodeBlocks(["const _ = require('lodash');"]);
    const summary = manager.resolveDependencies(deps);

    expect(summary.resolvedModules[0].module).toBe('lodash');
    expect(typeof summary.resolvedModules[0].exports).toBe('object');
    expect(summary.warnings.length).toBe(1);

    // cache hit
    const summarySecond = manager.resolveDependencies(deps);
    expect(summarySecond.resolvedModules[0]).toEqual(summary.resolvedModules[0]);
  });

  it('rejects relative dependencies when not allowed', () => {
    const manager = createManager();
    const code = ["import helper from './utils';"];

    expect(() => manager.analyzeCodeBlocks(code)).toThrow(DependencyResolutionError);
  });

  it('resolves relative dependencies when allowed', () => {
    const manager = createManager({ allowRelative: true });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dep-manager-'));
    const modulePath = path.join(tempDir, 'helper.js');
    fs.writeFileSync(modulePath, 'module.exports = { value: 42 };');

    const deps: SkillDependency[] = [
      { module: './helper', importType: 'import', category: 'relative' }
    ];

    const summary = manager.resolveDependencies(deps, tempDir);
    expect(summary.resolvedModules[0].exports).toMatchObject({ value: 42 });
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
