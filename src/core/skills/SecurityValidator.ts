import {
  GeneratedSkillCode,
  SecurityLevel,
  SecurityReport,
  SecurityValidatorOptions,
  SecurityIssue
} from '../../types';

const DEFAULT_FORBIDDEN_PATTERNS: Array<{ code: string; regex: RegExp; level: SecurityLevel; message: string }> = [
  {
    code: 'FORBIDDEN_EVAL',
    regex: /eval\s*\(/g,
    level: 'high',
    message: '检测到 eval 调用，存在代码注入风险'
  },
  {
    code: 'FORBIDDEN_FUNCTION',
    regex: /new\s+Function\s*\(/g,
    level: 'high',
    message: '检测到 Function 构造函数，存在代码注入风险'
  },
  {
    code: 'FORBIDDEN_SET_TIMEOUT',
    regex: /setTimeout\s*\(\s*["'`][^"'`]*["'`]/g,
    level: 'medium',
    message: '检测到字符串 setTimeout，可能存在注入风险'
  },
  {
    code: 'FORBIDDEN_SET_INTERVAL',
    regex: /setInterval\s*\(\s*["'`][^"'`]*["'`]/g,
    level: 'medium',
    message: '检测到字符串 setInterval，可能存在注入风险'
  },
  {
    code: 'FORBIDDEN_CHILD_PROCESS',
    regex: /require\s*\(\s*['"]child_process['"]\s*\)/g,
    level: 'high',
    message: '检测到 child_process 模块，禁止执行系统命令'
  },
  {
    code: 'FORBIDDEN_FS',
    regex: /require\s*\(\s*['"]fs['"]\s*\)/g,
    level: 'medium',
    message: '检测到 fs 模块，禁止直接访问文件系统'
  },
  {
    code: 'FORBIDDEN_PROCESS_EXIT',
    regex: /process\.exit\s*\(/g,
    level: 'low',
    message: '检测到 process.exit 调用，可能导致进程异常退出'
  },
  {
    code: 'POTENTIAL_INFINITE_LOOP_WHILE',
    regex: /while\s*\(\s*true\s*\)/g,
    level: 'medium',
    message: '检测到 while(true) 语句，可能导致 CPU 占用'
  },
  {
    code: 'POTENTIAL_INFINITE_LOOP_FOR',
    regex: /for\s*\(\s*;;\s*\)/g,
    level: 'medium',
    message: '检测到无限 for 循环，可能导致 CPU 占用'
  }
];

const SECURITY_LEVEL_ORDER: SecurityLevel[] = ['safe', 'low', 'medium', 'high'];

export class SecurityValidator {
  private readonly forbiddenPatterns: typeof DEFAULT_FORBIDDEN_PATTERNS;
  private readonly options: SecurityValidatorOptions;

  constructor(options: SecurityValidatorOptions = {}) {
    this.options = options;
    const additional = options.additionalForbiddenPatterns?.map((regex, index) => ({
      code: `CUSTOM_PATTERN_${index + 1}`,
      regex,
      level: 'medium' as SecurityLevel,
      message: '触发自定义安全规则'
    })) ?? [];
    this.forbiddenPatterns = [...DEFAULT_FORBIDDEN_PATTERNS, ...additional];
  }

  audit(code: GeneratedSkillCode): SecurityReport {
    const start = Date.now();
    const issues: SecurityIssue[] = [];

    this.detectForbiddenPatterns(code.javascript, issues);
    this.detectReDoSPatterns(code.javascript, issues);
    this.checkDependencyRisks(code, issues);
    this.checkComplexity(code, issues);

    const riskLevel = this.calculateRiskLevel(issues);

    const recommendations = this.generateRecommendations(issues);

    return {
      passed: riskLevel === 'safe' || riskLevel === 'low',
      riskLevel,
      issues,
      recommendations,
      durationMs: Date.now() - start
    };
  }

  private detectForbiddenPatterns(source: string, issues: SecurityIssue[]): void {
    for (const pattern of this.forbiddenPatterns) {
      pattern.regex.lastIndex = 0;
      const match = pattern.regex.exec(source);
      if (match) {
        issues.push({
          level: pattern.level,
          code: pattern.code,
          message: pattern.message,
          snippet: this.extractSnippet(source, match.index)
        });
      }
    }
  }

  private detectReDoSPatterns(source: string, issues: SecurityIssue[]): void {
    const suspectRegex = /(\\|\[|\(|\{){4,}/g;
    const match = suspectRegex.exec(source);
    if (match) {
      issues.push({
        level: 'medium',
        code: 'POTENTIAL_REDOS',
        message: '检测到复杂正则表达式，可能存在 ReDoS 风险',
        snippet: this.extractSnippet(source, match.index)
      });
    }
  }

  private checkDependencyRisks(code: GeneratedSkillCode, issues: SecurityIssue[]): void {
    for (const dep of code.dependencies) {
      if (dep.module.startsWith('.')) {
        issues.push({
          level: 'low',
          code: 'RELATIVE_DEPENDENCY',
          message: `检测到相对路径依赖 ${dep.module}，需要确认安全性`
        });
      }
      if (dep.module.startsWith('http://') || dep.module.startsWith('https://')) {
        issues.push({
          level: 'medium',
          code: 'REMOTE_DEPENDENCY',
          message: `检测到远程依赖 ${dep.module}，可能存在供应链风险`
        });
      }
    }
  }

  private checkComplexity(code: GeneratedSkillCode, issues: SecurityIssue[]): void {
    const maxComplexity = this.options.maxComplexityScore ?? 200;
    if (code.metadata.complexityScore > maxComplexity) {
      issues.push({
        level: 'medium',
        code: 'HIGH_COMPLEXITY',
        message: `代码复杂度 ${code.metadata.complexityScore} 超过限制 ${maxComplexity}`
      });
    }
  }

  private calculateRiskLevel(issues: SecurityIssue[]): SecurityLevel {
    let level: SecurityLevel = 'safe';
    for (const issue of issues) {
      if (SECURITY_LEVEL_ORDER.indexOf(issue.level) > SECURITY_LEVEL_ORDER.indexOf(level)) {
        level = issue.level;
      }
    }
    return level;
  }

  private generateRecommendations(issues: SecurityIssue[]): string[] {
    if (issues.length === 0) {
      return ['未发现安全风险'];
    }

    const recommendations = new Set<string>();
    for (const issue of issues) {
      switch (issue.code) {
        case 'FORBIDDEN_EVAL':
        case 'FORBIDDEN_FUNCTION':
          recommendations.add('移除 eval/Function 调用，使用安全 API 或白名单执行');
          break;
        case 'FORBIDDEN_CHILD_PROCESS':
          recommendations.add('移除 child_process 调用，避免执行系统命令');
          break;
        case 'FORBIDDEN_FS':
          recommendations.add('避免直接访问 fs，如有需要需通过受控接口');
          break;
        case 'POTENTIAL_INFINITE_LOOP_WHILE':
        case 'POTENTIAL_INFINITE_LOOP_FOR':
          recommendations.add('避免无限循环或添加超时控制');
          break;
        case 'POTENTIAL_REDOS':
          recommendations.add('优化正则表达式，避免潜在 ReDoS');
          break;
        default:
          recommendations.add('审查代码逻辑，确保符合安全最佳实践');
      }
    }

    return Array.from(recommendations);
  }

  private extractSnippet(source: string, index: number): string {
    const start = Math.max(index - 40, 0);
    const end = Math.min(index + 60, source.length);
    return source.slice(start, end).replace(/\s+/g, ' ').trim();
  }
}

