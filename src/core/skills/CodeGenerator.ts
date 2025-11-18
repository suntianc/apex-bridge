import ts from 'typescript';
import {
  CompilationDiagnostic,
  GeneratedSkillCode,
  SkillCodeExtraction,
  SkillContent,
  SkillDependency,
  SkillCodeMetadata,
  SkillMetadata
} from '../../types';
import {
  CodeExtractionError,
  CompilationError
} from './CodeGenerationErrors';
import { DependencyManager } from './DependencyManager';
import { ABPSkillsAdapter } from './ABPSkillsAdapter';

export interface CodeGeneratorOptions {
  includeSourceMap?: boolean;
  fileName?: string;
}

export interface CodeGeneratorGenerateOptions {
  profiler?: any; // CodeGenerationProfiler 已移除，保留接口兼容性
  metadata?: Record<string, unknown>;
  skillMetadata?: SkillMetadata; // 可选：Skill元数据，用于ABP协议支持
}

const DEFAULT_OPTIONS: Required<CodeGeneratorOptions> = {
  includeSourceMap: true,
  fileName: 'skill.ts'
};

export class CodeGenerator {
  private readonly options: Required<CodeGeneratorOptions>;
  private readonly dependencyManager: DependencyManager;
  private readonly abpAdapter: ABPSkillsAdapter;

  constructor(
    options: CodeGeneratorOptions = {},
    dependencyManager?: DependencyManager
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.dependencyManager = dependencyManager ?? new DependencyManager();
    this.abpAdapter = new ABPSkillsAdapter();
  }

  async generate(
    skillContent: SkillContent,
    options: CodeGeneratorGenerateOptions = {}
  ): Promise<GeneratedSkillCode> {
    const profiler = options.profiler;
    if (profiler) {
      profiler.setMetadata({ skillName: skillContent.name, ...(options.metadata ?? {}) });
      profiler.startPhase('total');
    }

    try {
      const extraction = profiler
        ? await profiler.measure('extraction', () => this.extractTypeScript(skillContent, profiler, options.skillMetadata))
        : await this.extractTypeScript(skillContent, undefined, options.skillMetadata);

      const fullSource = this.composeSource(extraction, options.skillMetadata);

      const compilation = profiler
        ? await profiler.measure('compilation', () => this.compile(fullSource))
        : this.compile(fullSource);

      return {
        javascript: compilation.javascript,
        sourceMap: compilation.sourceMap,
        diagnostics: compilation.diagnostics.length > 0 ? compilation.diagnostics : undefined,
        metadata: extraction.metadata,
        dependencies: extraction.dependencies
      };
    } finally {
      profiler?.endPhase('total');
    }
  }

  private async extractTypeScript(
    skillContent: SkillContent,
    profiler?: any, // CodeGenerationProfiler 已移除，保留接口兼容性
    skillMetadata?: SkillMetadata
  ): Promise<SkillCodeExtraction> {
    const tsBlocks = skillContent.codeBlocks.filter((block) => {
      const lang = block.language?.toLowerCase() ?? '';
      return lang === 'ts' || lang === 'typescript';
    });

    if (tsBlocks.length === 0) {
      throw new CodeExtractionError(
        `技能 "${skillContent.name}" 中未找到 TypeScript 代码块`,
        skillContent.name,
        { skillName: skillContent.name }
      );
    }

    const entryCode = tsBlocks[0].code;
    const auxiliaryCode = tsBlocks.slice(1).map((block) => block.code);

    const dependencies = profiler
      ? profiler.measure('dependency', () =>
          this.dependencyManager.analyzeCodeBlocks(
            [entryCode, ...auxiliaryCode],
            { skillName: skillContent.name, skillPath: skillContent.path }
          )
        )
      : Promise.resolve(
          this.dependencyManager.analyzeCodeBlocks(
            [entryCode, ...auxiliaryCode],
            { skillName: skillContent.name, skillPath: skillContent.path }
          )
        );
    const resolvedDependencies = await dependencies;
    const metadata = this.buildMetadata(entryCode, resolvedDependencies);

    return {
      entryCode,
      auxiliaryCode,
      dependencies: resolvedDependencies,
      metadata
    };
  }


  private buildMetadata(
    entryCode: string,
    dependencies: SkillDependency[]
  ): SkillCodeMetadata {
    const exportRegex = /export\s+(?:const|let|var|class|function|default)\s+([A-Za-z0-9_]+)/g;
    const exports: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = exportRegex.exec(entryCode)) !== null) {
      exports.push(match[1]);
    }

    const complexityScore = this.calculateComplexity(entryCode);

    return {
      exports,
      imports: dependencies,
      complexityScore
    };
  }

  private calculateComplexity(code: string): number {
    const lines = code.split('\n').length;
    const branches = (code.match(/\b(if|for|while|switch|case|catch)\b/g) || []).length;
    const functions = (code.match(/\bfunction\b|=>/g) || []).length;

    return lines + branches * 2 + functions;
  }

  private composeSource(extraction: SkillCodeExtraction, skillMetadata?: SkillMetadata): string {
    const segments: string[] = [];
    segments.push('// Auto-generated from Skill TypeScript blocks');
    
    // 如果Skill使用ABP协议，注入ABP协议辅助代码
    if (skillMetadata) {
      const protocol = this.abpAdapter.detectProtocol(skillMetadata);
      if (protocol === 'abp') {
        segments.push('// ABP Protocol Support');
        segments.push(this.generateABPHelperCode(skillMetadata));
      }
    }
    
    extraction.auxiliaryCode.forEach((code, index) => {
      segments.push(`// Auxiliary block ${index + 1}`);
      segments.push(code);
    });
    segments.push('// Entry block');
    segments.push(extraction.entryCode);
    return segments.join('\n\n');
  }

  /**
   * 生成ABP协议辅助代码
   * 
   * 为ABP协议的Skill生成必要的辅助代码和类型定义
   * 
   * @param skillMetadata - Skill元数据
   * @returns ABP协议辅助代码
   */
  private generateABPHelperCode(skillMetadata: SkillMetadata): string {
    const abpTools = this.abpAdapter.getABPToolDefinitions(skillMetadata);
    
    // 生成ABP工具定义类型（如果需要）
    const toolDefinitions = abpTools.map((tool) => {
      const interfaceName = `${this.sanitizeIdentifier(tool.name)}Params`;
      const params = tool.parameters ? Object.entries(tool.parameters)
        .map(([key, param]) => {
          const type = param.type || 'any';
          const required = param.required !== false ? '' : '?';
          return `  ${key}${required}: ${type};`;
        })
        .join('\n') : '';
      
      return `// ABP Tool: ${tool.name}\ninterface ${interfaceName} {\n${params}\n}`;
    }).join('\n\n');

    // 生成ABP协议辅助代码
    return `
// ABP Protocol Helper Code
${toolDefinitions}

// ABP Protocol Type Definitions
interface ABPToolCall {
  id: string;
  tool: string;
  parameters: Record<string, any>;
  timestamp?: number;
}

interface ABPToolResult {
  id: string;
  result: any;
  error?: string;
  duration?: number;
  timestamp?: number;
}

// ABP Protocol Helper Functions
function formatABPToolResult(callId: string, result: any, error?: string): ABPToolResult {
  return {
    id: callId,
    result,
    error,
    timestamp: Date.now()
  };
}
`;
  }

  private compile(source: string): {
    javascript: string;
    sourceMap?: string;
    diagnostics: CompilationDiagnostic[];
  } {
    const transpileResult = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
        sourceMap: this.options.includeSourceMap,
        inlineSources: this.options.includeSourceMap,
        removeComments: false,
        strict: true
      },
      fileName: this.options.fileName,
      reportDiagnostics: true
    });

    const diagnostics = (transpileResult.diagnostics ?? []).map((diag) =>
      this.formatDiagnostic(diag)
    );

    if (!transpileResult.outputText) {
      throw new CompilationError(
        'TypeScript 编译失败：未生成输出代码',
        diagnostics,
        { fileName: this.options.fileName }
      );
    }

    const errorDiagnostics = diagnostics.filter((diag) => diag.category === 'Error');
    if (errorDiagnostics.length > 0) {
      throw new CompilationError(
        `TypeScript 编译出现 ${errorDiagnostics.length} 个错误`,
        errorDiagnostics,
        { fileName: this.options.fileName, totalDiagnostics: diagnostics.length }
      );
    }

    return {
      javascript: transpileResult.outputText,
      sourceMap: transpileResult.sourceMapText ?? undefined,
      diagnostics
    };
  }

  private formatDiagnostic(diag: ts.Diagnostic): CompilationDiagnostic {
    const category = ts.DiagnosticCategory[diag.category];
    let line: number | undefined;
    let column: number | undefined;

    if (diag.file && typeof diag.start === 'number') {
      const position = diag.file.getLineAndCharacterOfPosition(diag.start);
      line = position.line + 1;
      column = position.character + 1;
    }

    return {
      message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
      code: diag.code,
      category,
      file: diag.file?.fileName,
      line,
      column
    };
  }

  private sanitizeIdentifier(name: string): string {
    const sanitized = name.replace(/[^A-Za-z0-9_]/g, '_');
    if (!sanitized) {
      return 'Tool';
    }
    if (/^[0-9]/.test(sanitized)) {
      return `_${sanitized}`;
    }
    return sanitized;
  }
}

