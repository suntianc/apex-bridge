import * as fs from 'fs/promises';
import * as path from 'path';
import * as yaml from 'yaml';
import logger from '../utils/logger';

/**
 * 插件迁移结果
 */
export interface MigrationResult {
  success: boolean;
  pluginName: string;
  sourcePath: string;
  targetPath: string;
  metadataPath?: string;
  skillPath?: string;
  errors: string[];
  warnings: string[];
  migratedFiles: string[];
}

/**
 * 迁移选项
 */
export interface MigrationOptions {
  sourceDir: string;
  targetDir: string;
  dryRun?: boolean;
  overwrite?: boolean;
  preserveOriginal?: boolean;
  generateMetadata?: boolean;
  generateSkillDoc?: boolean;
  preserveResources?: boolean;
}

/**
 * 插件迁移工具
 * 
 * 将传统插件格式迁移到Skills格式
 */
export class PluginMigrationTool {
  private readonly options: Required<MigrationOptions>;

  constructor(options: MigrationOptions) {
    this.options = {
      dryRun: false,
      overwrite: false,
      preserveOriginal: true,
      generateMetadata: true,
      generateSkillDoc: true,
      preserveResources: true,
      ...options
    };
  }

  /**
   * 迁移单个插件
   */
  async migratePlugin(pluginPath: string): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      pluginName: path.basename(pluginPath),
      sourcePath: pluginPath,
      targetPath: '',
      errors: [],
      warnings: [],
      migratedFiles: []
    };

    try {
      // 读取manifest
      const manifestPath = path.join(pluginPath, 'plugin-manifest.json');
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      // 确定目标路径
      const pluginName = manifest.name || path.basename(pluginPath);
      const pluginType = this.mapPluginType(manifest.pluginType || manifest.type);
      result.targetPath = path.join(this.options.targetDir, pluginName);

      if (this.options.dryRun) {
        logger.info(`[Migration] [DRY RUN] 将迁移插件: ${pluginName}`);
        result.success = true;
        return result;
      }

      // 创建目标目录
      await fs.mkdir(result.targetPath, { recursive: true });

      // 生成METADATA.yml
      if (this.options.generateMetadata) {
        const metadataPath = path.join(result.targetPath, 'METADATA.yml');
        const metadata = this.generateMetadata(manifest, pluginPath);
        await fs.writeFile(metadataPath, yaml.stringify(metadata), 'utf-8');
        result.metadataPath = metadataPath;
        result.migratedFiles.push('METADATA.yml');
      }

      // 生成SKILL.md
      if (this.options.generateSkillDoc) {
        const skillPath = path.join(result.targetPath, 'SKILL.md');
        const skillDoc = await this.generateSkillDoc(manifest, pluginPath);
        await fs.writeFile(skillPath, skillDoc, 'utf-8');
        result.skillPath = skillPath;
        result.migratedFiles.push('SKILL.md');
      }

      // 迁移资源文件
      if (this.options.preserveResources) {
        await this.migrateResources(pluginPath, result.targetPath, result);
      }

      result.success = true;
      logger.info(`[Migration] ✅ 成功迁移插件: ${pluginName} -> ${result.targetPath}`);
    } catch (error) {
      result.errors.push((error as Error).message);
      logger.error(`[Migration] ❌ 迁移失败: ${result.pluginName}`, error);
    }

    return result;
  }

  /**
   * 批量迁移插件
   */
  async migrateAll(): Promise<MigrationResult[]> {
    const results: MigrationResult[] = [];

    try {
      const entries = await fs.readdir(this.options.sourceDir, { withFileTypes: true });
      const pluginDirs: string[] = [];

      // 支持分类目录结构
      const typeDirs = ['direct', 'static', 'service', 'hybrid', 'distributed', 'preprocessor'];
      const hasTypedStructure = entries.some(e => e.isDirectory() && typeDirs.includes(e.name));

      if (hasTypedStructure) {
        // 分类目录结构
        for (const entry of entries) {
          if (entry.isDirectory() && typeDirs.includes(entry.name)) {
            const typeDir = path.join(this.options.sourceDir, entry.name);
            const typeEntries = await fs.readdir(typeDir, { withFileTypes: true });
            for (const pluginEntry of typeEntries) {
              if (pluginEntry.isDirectory()) {
                pluginDirs.push(path.join(typeDir, pluginEntry.name));
              }
            }
          }
        }
      } else {
        // 平面结构
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const pluginPath = path.join(this.options.sourceDir, entry.name);
            const manifestPath = path.join(pluginPath, 'plugin-manifest.json');
            try {
              await fs.access(manifestPath);
              pluginDirs.push(pluginPath);
            } catch {
              // 不是插件目录，跳过
            }
          }
        }
      }

      logger.info(`[Migration] 找到 ${pluginDirs.length} 个插件`);

      for (const pluginDir of pluginDirs) {
        const result = await this.migratePlugin(pluginDir);
        results.push(result);
      }
    } catch (error) {
      logger.error(`[Migration] 批量迁移失败:`, error);
    }

    return results;
  }

  /**
   * 生成METADATA.yml
   */
  private generateMetadata(manifest: any, pluginPath: string): any {
    const metadata: any = {
      name: manifest.name || path.basename(pluginPath),
      displayName: manifest.displayName || manifest.name,
      description: manifest.description || '',
      version: manifest.version || '1.0.0',
      type: this.mapPluginType(manifest.pluginType || manifest.type),
      domain: this.inferDomain(manifest),
      keywords: this.extractKeywords(manifest),
      permissions: this.extractPermissions(manifest),
      cacheable: true,
      ttl: 3600
    };

    if (manifest.author) {
      metadata.author = manifest.author;
    }

    if (manifest.capabilities?.invocationCommands) {
      const command = manifest.capabilities.invocationCommands[0];
      if (command?.parameters) {
        metadata.parameters = command.parameters;
      }
    }

    return metadata;
  }

  /**
   * 生成SKILL.md
   */
  private async generateSkillDoc(manifest: any, pluginPath: string): Promise<string> {
    const lines: string[] = [];

    // 标题
    lines.push(`# ${manifest.displayName || manifest.name}`);
    lines.push('');

    // 描述
    if (manifest.description) {
      lines.push('## 描述');
      lines.push('');
      lines.push(manifest.description);
      lines.push('');
    }

    // 参数
    const command = manifest.capabilities?.invocationCommands?.[0];
    if (command?.parameters) {
      lines.push('## 参数');
      lines.push('');
      for (const [name, param] of Object.entries(command.parameters as Record<string, any>)) {
        lines.push(`- \`${name}\` (${param.type || 'any'}): ${param.description || ''}`);
      }
      lines.push('');
    }

    // 示例
    if (command?.example) {
      lines.push('## 示例');
      lines.push('');
      lines.push('```');
      lines.push(command.example);
      lines.push('```');
      lines.push('');
    }

    // 代码
    lines.push('## 代码');
    lines.push('');
    lines.push('```typescript');

    // 读取并转换代码文件
    const entryPoint = manifest.entryPoint;
    if (entryPoint?.command) {
      const codeFile = entryPoint.command.replace(/^node\s+/, '');
      const codePath = path.join(pluginPath, codeFile);
      try {
        const code = await fs.readFile(codePath, 'utf-8');
        const convertedCode = this.convertCodeToTypeScript(code, manifest);
        lines.push(convertedCode);
      } catch (error) {
        lines.push(`// 无法读取代码文件: ${codeFile}`);
        lines.push(`// 错误: ${(error as Error).message}`);
      }
    } else {
      lines.push(`// 插件: ${manifest.name}`);
      lines.push(`// 类型: ${manifest.pluginType || manifest.type}`);
      lines.push('');
      lines.push('export function execute(params: Record<string, unknown>): unknown {');
      lines.push('  // TODO: 实现插件逻辑');
      lines.push('  return {};');
      lines.push('}');
    }

    lines.push('```');
    lines.push('');

    return lines.join('\n');
  }

  /**
   * 转换代码为TypeScript
   */
  private convertCodeToTypeScript(code: string, manifest: any): string {
    // 移除调试代码
    let converted = code
      .replace(/const DEBUG_MODE.*?;/g, '')
      .replace(/function debugLog.*?\{[\s\S]*?\}/g, '')
      .replace(/debugLog\([^)]*\);?/g, '');

    // 提取主要逻辑函数
    const functionMatches = converted.match(/function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g);
    
    // 提取main函数
    const mainMatch = converted.match(/async function main\(\)\s*\{([\s\S]*?)\}/);
    if (mainMatch) {
      const mainBody = mainMatch[1];
      // 提取核心函数（如rollDice）
      const coreFunctions = this.extractHelperFunctions(converted);
      // 简化stdin处理，提取核心逻辑
      converted = this.buildExecuteFunction(mainBody, manifest, coreFunctions);
    } else {
      // 检查是否有直接执行的函数（如static插件）
      const directExecMatch = converted.match(/(?:function\s+get\w+|const\s+\w+\s*=\s*\(\)\s*=>)/);
      if (directExecMatch) {
        // 提取所有函数
        const allFunctions = this.extractAllFunctions(converted);
        converted = this.buildStaticExecuteFunction(allFunctions, manifest);
      } else {
        // 如果没有main函数，尝试提取其他函数
        converted = `export function execute(params: Record<string, unknown>): unknown {
  // 原始代码已转换
${this.indentCode(this.cleanCode(converted), 2)}
}`;
      }
    }

    return converted;
  }

  /**
   * 提取辅助函数
   */
  private extractHelperFunctions(code: string): string {
    const functions: string[] = [];
    const functionRegex = /function\s+(\w+)\s*\([^)]*\)\s*\{([\s\S]*?)\}/g;
    let match;
    
    while ((match = functionRegex.exec(code)) !== null) {
      const funcName = match[1];
      if (funcName !== 'main' && funcName !== 'debugLog') {
        functions.push(match[0]);
      }
    }
    
    return functions.join('\n\n');
  }

  /**
   * 提取所有函数
   */
  private extractAllFunctions(code: string): string[] {
    const functions: string[] = [];
    const functionRegex = /(?:function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|function))/g;
    const lines = code.split('\n');
    let inFunction = false;
    let functionLines: string[] = [];
    let braceCount = 0;

    for (const line of lines) {
      if (functionRegex.test(line) || inFunction) {
        inFunction = true;
        functionLines.push(line);
        braceCount += (line.match(/\{/g) || []).length;
        braceCount -= (line.match(/\}/g) || []).length;
        
        if (braceCount === 0 && functionLines.length > 0) {
          functions.push(functionLines.join('\n'));
          functionLines = [];
          inFunction = false;
        }
      }
    }

    return functions;
  }

  /**
   * 构建execute函数（direct类型）
   */
  private buildExecuteFunction(mainBody: string, manifest: any, helperFunctions: string): string {
    // 提取核心逻辑 - 找到实际执行的部分
    let logic = mainBody;
    
    // 移除stdin相关代码
    logic = logic.replace(/let inputData\s*=\s*'';?/g, '');
    logic = logic.replace(/process\.stdin\.on\([^)]+\).*?\{[\s\S]*?\}\s*\);/g, '');
    logic = logic.replace(/clearTimeout\(timeout\);?/g, '');
    
    // 移除timeout包装，提取内部逻辑
    const timeoutMatch = logic.match(/const timeout = setTimeout\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\d+\);?/);
    if (timeoutMatch) {
      // 使用timeout内的逻辑作为默认逻辑
      logic = timeoutMatch[1];
    }
    
    // 移除stdin end处理，提取核心逻辑
    const stdinEndMatch = logic.match(/process\.stdin\.on\('end',\s*\(\)\s*=>\s*\{([\s\S]*?)\}\);?/);
    if (stdinEndMatch) {
      logic = stdinEndMatch[1];
    }
    
    // 清理参数解析代码，替换为直接使用params
    logic = logic.replace(/let\s+(\w+)\s*=\s*\d+;?/g, '');
    logic = logic.replace(/const\s+(\w+)\s*=\s*\d+;?/g, '');
    logic = logic.replace(/(\w+)Match\s*=\s*inputData\.match\([^)]+\);?/g, '');
    logic = logic.replace(/if\s*\((\w+)Match\)\s*(\w+)\s*=\s*parseInt\([^)]+\);?/g, '');
    logic = logic.replace(/debugLog\([^)]*\);?/g, '');
    
    // 替换输出为return
    logic = logic.replace(/console\.log\(JSON\.stringify\(output\)\);?/g, 'return output;');
    logic = logic.replace(/process\.exit\([^)]+\);?/g, '');
    
    // 添加参数提取
    const command = manifest.capabilities?.invocationCommands?.[0];
    let paramExtraction = '';
    if (command?.parameters) {
      const paramNames = Object.keys(command.parameters);
      paramExtraction = paramNames.map(name => {
        const param = command.parameters[name];
        const type = param.type === 'integer' ? 'number' : (param.type || 'any');
        const defaultValue = param.default !== undefined ? ` ?? ${JSON.stringify(param.default)}` : '';
        return `  const ${name} = (params.${name} as ${type})${defaultValue};`;
      }).join('\n') + '\n\n';
    }

    // 清理逻辑代码
    logic = this.cleanCode(logic);
    
    // 确保有return语句
    if (!logic.includes('return')) {
      // 查找output对象构建
      const outputMatch = logic.match(/const output\s*=\s*\{([\s\S]*?)\};?/);
      if (outputMatch) {
        logic = logic.replace(/const output\s*=\s*\{([\s\S]*?)\};?/g, 'return {\n$1\n};');
      } else {
        // 如果没有output，尝试提取结果
        const resultsMatch = logic.match(/const results\s*=\s*(\w+)\([^)]+\);?/);
        if (resultsMatch) {
          logic += '\n  return { success: true, results };';
        }
      }
    }

    // 构建完整函数
    let result = '';
    if (helperFunctions) {
      result += helperFunctions + '\n\n';
    }
    result += `export async function execute(params: Record<string, unknown>): Promise<unknown> {
${paramExtraction}${this.indentCode(logic, 2)}
}`;

    return result;
  }

  /**
   * 构建静态execute函数
   */
  private buildStaticExecuteFunction(functions: string[], manifest: any): string {
    let result = functions.join('\n\n') + '\n\n';
    result += `export function execute(params: Record<string, unknown>): unknown {
  // 执行主要逻辑
  ${this.getMainFunctionCall(functions)}
}`;
    return result;
  }

  /**
   * 获取主函数调用
   */
  private getMainFunctionCall(functions: string[]): string {
    // 查找get开头的函数或第一个函数
    for (const func of functions) {
      const getMatch = func.match(/function\s+(get\w+)/);
      if (getMatch) {
        return `return ${getMatch[1]}();`;
      }
    }
    // 如果没有找到，返回第一个函数
    const firstMatch = functions[0]?.match(/function\s+(\w+)/);
    if (firstMatch) {
      return `return ${firstMatch[1]}();`;
    }
    return 'return {};';
  }

  /**
   * 清理代码
   */
  private cleanCode(code: string): string {
    return code
      .split('\n')
      .filter(line => {
        // 移除空行和注释（保留有意义的注释）
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('// 读取stdin') && !trimmed.startsWith('// 设置超时');
      })
      .map(line => {
        // 修复类型错误
        return line.replace(/as integer/g, 'as number');
      })
      .join('\n');
  }

  /**
   * 缩进代码
   */
  private indentCode(code: string, indent: number): string {
    const spaces = ' '.repeat(indent);
    return code
      .split('\n')
      .map(line => line.trim() ? spaces + line : '')
      .join('\n');
  }

  /**
   * 迁移资源文件
   */
  private async migrateResources(
    sourcePath: string,
    targetPath: string,
    result: MigrationResult
  ): Promise<void> {
    try {
      const entries = await fs.readdir(sourcePath, { withFileTypes: true });
      const resourceDirs = ['assets', 'resources', 'templates', 'scripts'];

      for (const entry of entries) {
        if (entry.isDirectory() && resourceDirs.includes(entry.name)) {
          const sourceDir = path.join(sourcePath, entry.name);
          const targetDir = path.join(targetPath, entry.name);
          await this.copyDirectory(sourceDir, targetDir);
          result.migratedFiles.push(entry.name);
        } else if (entry.isFile() && !entry.name.includes('plugin-manifest') && !entry.name.endsWith('.js')) {
          // 复制其他非代码文件
          const sourceFile = path.join(sourcePath, entry.name);
          const targetFile = path.join(targetPath, entry.name);
          await fs.copyFile(sourceFile, targetFile);
          result.migratedFiles.push(entry.name);
        }
      }
    } catch (error) {
      result.warnings.push(`资源迁移警告: ${(error as Error).message}`);
    }
  }

  /**
   * 复制目录
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(source, entry.name);
      const targetPath = path.join(target, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }

  /**
   * 映射插件类型
   */
  private mapPluginType(pluginType: string): string {
    const typeMap: Record<string, string> = {
      'direct-execution': 'direct',
      'static-info': 'static',
      'service': 'service',
      'hybrid': 'direct', // hybrid可以映射为direct
      'distributed-tool': 'distributed',
      'preprocessor': 'preprocessor',
      'internal': 'internal'
    };
    return typeMap[pluginType] || pluginType || 'direct';
  }

  /**
   * 推断领域
   */
  private inferDomain(manifest: any): string {
    const name = (manifest.name || '').toLowerCase();
    if (name.includes('dice') || name.includes('game')) return 'games';
    if (name.includes('time') || name.includes('date')) return 'utilities';
    if (name.includes('system') || name.includes('info')) return 'system';
    if (name.includes('health') || name.includes('check')) return 'monitoring';
    return 'general';
  }

  /**
   * 提取关键词
   */
  private extractKeywords(manifest: any): string[] {
    const keywords: string[] = [];
    const name = manifest.name || '';
    const description = manifest.description || '';

    // 从名称提取
    keywords.push(name);

    // 从描述提取（简单分词）
    const words = description.split(/[\s,，。、]+/).filter(w => w.length > 1);
    keywords.push(...words.slice(0, 5));

    return [...new Set(keywords)];
  }

  /**
   * 提取权限
   */
  private extractPermissions(manifest: any): any {
    const permissions: any = {
      network: false,
      filesystem: 'none',
      externalApis: []
    };

    // 从manifest推断权限
    if (manifest.pluginType === 'service') {
      permissions.network = true;
    }

    // 如果有明确的权限声明
    if (manifest.permissions) {
      if (manifest.permissions.includes('network') || manifest.permissions.includes('http')) {
        permissions.network = true;
      }
      if (manifest.permissions.includes('filesystem.read')) {
        permissions.filesystem = 'read';
      }
      if (manifest.permissions.includes('filesystem.write')) {
        permissions.filesystem = 'read-write';
      }
    }

    return permissions;
  }
}

