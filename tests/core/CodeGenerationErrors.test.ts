import {
  CodeGenerationError,
  CompilationError,
  CodeExtractionError,
  DependencyResolutionError,
  SecurityValidationError,
  SandboxExecutionError,
  ResourceLimitError,
  ErrorWrapper
} from '../../src/core/skills/CodeGenerationErrors';
import { CompilationDiagnostic } from '../../src/types';

describe('CodeGenerationErrors', () => {
  describe('CompilationError', () => {
    it('creates error with diagnostics', () => {
      const diagnostics: CompilationDiagnostic[] = [
        {
          message: 'Type error',
          code: 2322,
          category: 'Error',
          file: 'test.ts',
          line: 10,
          column: 5
        }
      ];

      const error = new CompilationError('编译失败', diagnostics, { fileName: 'test.ts' });

      expect(error.message).toBe('编译失败');
      expect(error.code).toBe('COMPILATION_ERROR');
      expect(error.diagnostics).toEqual(diagnostics);
      expect(error.context?.diagnosticCount).toBe(1);
    });

    it('serializes to JSON correctly', () => {
      const diagnostics: CompilationDiagnostic[] = [];
      const error = new CompilationError('编译失败', diagnostics);

      const json = error.toJSON();

      expect(json.name).toBe('CompilationError');
      expect(json.message).toBe('编译失败');
      expect(json.code).toBe('COMPILATION_ERROR');
      expect(json.diagnostics).toEqual(diagnostics);
    });
  });

  describe('CodeExtractionError', () => {
    it('creates error with skill name', () => {
      const error = new CodeExtractionError(
        '未找到代码块',
        'test-skill',
        { skillPath: '/path/to/skill' }
      );

      expect(error.message).toBe('未找到代码块');
      expect(error.skillName).toBe('test-skill');
      expect(error.context?.skillName).toBe('test-skill');
    });
  });

  describe('DependencyResolutionError', () => {
    it('creates error with dependency info', () => {
      const error = new DependencyResolutionError(
        '依赖解析失败',
        'child_process',
        '模块被禁止',
        { forbidden: true }
      );

      expect(error.message).toBe('依赖解析失败');
      expect(error.dependency).toBe('child_process');
      expect(error.reason).toBe('模块被禁止');
    });
  });

  describe('SecurityValidationError', () => {
    it('creates error with risk level and issues', () => {
      const issues = ['检测到 eval', '检测到危险模块'];
      const error = new SecurityValidationError(
        '安全验证失败',
        'high',
        issues,
        { skillName: 'test' }
      );

      expect(error.message).toBe('安全验证失败');
      expect(error.riskLevel).toBe('high');
      expect(error.issues).toEqual(issues);
    });
  });

  describe('SandboxExecutionError', () => {
    it('creates error with original error', () => {
      const originalError = new Error('原始错误');
      const error = new SandboxExecutionError(
        '执行失败',
        originalError,
        500,
        { timeout: 1000 }
      );

      expect(error.message).toBe('执行失败');
      expect(error.originalError).toBe(originalError);
      expect(error.executionTime).toBe(500);
    });

    it('serializes original error in JSON', () => {
      const originalError = new Error('原始错误');
      const error = new SandboxExecutionError('执行失败', originalError);

      const json = error.toJSON();

      expect(json.originalError).toBeDefined();
      const serializedError = json.originalError as { name: string; message: string };
      expect(serializedError?.name).toBe('Error');
      expect(serializedError?.message).toBe('原始错误');
    });
  });

  describe('ResourceLimitError', () => {
    it('creates error with resource limits', () => {
      const error = new ResourceLimitError(
        '内存超限',
        'memory',
        128,
        256,
        { skillName: 'test' }
      );

      expect(error.message).toBe('内存超限');
      expect(error.resourceType).toBe('memory');
      expect(error.limit).toBe(128);
      expect(error.actual).toBe(256);
    });
  });

  describe('ErrorWrapper', () => {
    it('wraps Error as CodeGenerationError', () => {
      const originalError = new Error('测试错误');
      const wrapped = ErrorWrapper.wrap(originalError, { skillName: 'test' });

      expect(wrapped).toBeInstanceOf(CodeGenerationError);
      expect(wrapped.message).toBe('测试错误');
      expect(wrapped.context?.skillName).toBe('test');
    });

    it('wraps non-Error values', () => {
      const wrapped = ErrorWrapper.wrap('字符串错误', { context: 'test' });

      expect(wrapped).toBeInstanceOf(CodeGenerationError);
      expect(wrapped.message).toBe('字符串错误');
    });

    it('preserves existing CodeGenerationError', () => {
      const original = new CompilationError('编译失败', []);
      const wrapped = ErrorWrapper.wrap(original);

      expect(wrapped).toBe(original);
    });

    it('infers error type from message', () => {
      const compilationError = new Error('TypeScript compilation failed');
      const wrapped = ErrorWrapper.wrap(compilationError);

      expect(wrapped).toBeInstanceOf(CompilationError);
    });

    it('sanitizes sensitive data', () => {
      const error = new CompilationError('错误', [], {
        apiKey: 'secret-key',
        skillName: 'test',
        password: 'password123'
      });

      const sanitized = ErrorWrapper.sanitize(error);

      expect(sanitized.context?.apiKey).toBeUndefined();
      expect(sanitized.context?.password).toBeUndefined();
      expect(sanitized.context?.skillName).toBe('test');
    });

    it('formats user-friendly messages', () => {
      const error = new CompilationError('编译失败', []);
      const message = ErrorWrapper.formatUserMessage(error);

      expect(message).toContain('[COMPILATION_ERROR]');
      expect(message).toContain('TypeScript 编译失败');
    });
  });
});

