/**
 * 计算器技能单元测试
 */

const execute = require('../scripts/execute.ts');

describe('Calculator Skill', () => {
  test('should perform basic addition', async () => {
    const result = await execute({ expression: '2+3' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(5);
    expect(result.operation).toBe('expression');
  });

  test('should perform basic subtraction', async () => {
    const result = await execute({ expression: '10-3' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(7);
  });

  test('should perform basic multiplication', async () => {
    const result = await execute({ expression: '4*5' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(20);
  });

  test('should perform basic division', async () => {
    const result = await execute({ expression: '20/4' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(5);
  });

  test('should handle decimal numbers', async () => {
    const result = await execute({ expression: '3.5+2.5' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(6);
  });

  test('should handle complex expressions', async () => {
    const result = await execute({ expression: '(2+3)*4' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(20);
  });

  test('should handle division by zero', async () => {
    const result = await execute({ expression: '10/0' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('除数不能为零');
  });

  test('should handle invalid expressions', async () => {
    const result = await execute({ expression: 'abc+def' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('非法字符');
  });

  test('should handle multiple consecutive operators', async () => {
    const result = await execute({ expression: '2++3' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('格式错误');
  });

  test('should handle specific operation parameter', async () => {
    const result = await execute({ expression: '10 and 5', operation: 'add' });
    expect(result.success).toBe(true);
    expect(result.result).toBe(15);
    expect(result.operation).toBe('add');
  });
});