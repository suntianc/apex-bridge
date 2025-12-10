/**
 * 计算器执行脚本
 * 执行基本的数学运算
 */

export interface CalculatorParams {
  expression: string;
  operation?: 'add' | 'subtract' | 'multiply' | 'divide' | 'auto';
}

export interface CalculatorResult {
  result: number;
  expression: string;
  operation: string;
  success: boolean;
  message?: string;
}

/**
 * 安全地解析和计算数学表达式
 */
function safeEvaluate(expression: string): number {
  // 移除所有空格
  const cleanExpression = expression.replace(/\s/g, '');

  // 只允许数字、小数点和基本运算符
  if (!/^[0-9+\-*/().]+$/.test(cleanExpression)) {
    throw new Error('表达式包含非法字符');
  }

  // 防止多个连续运算符
  if (/[+\-*/]{2,}/.test(cleanExpression)) {
    throw new Error('表达式格式错误');
  }

  try {
    // 使用 Function 构造器比 eval 更安全
    const result = new Function('return ' + cleanExpression)();

    // 检查结果是否为有效数字
    if (typeof result !== 'number' || isNaN(result) || !isFinite(result)) {
      throw new Error('计算结果无效');
    }

    return result;
  } catch (error) {
    throw new Error('表达式计算失败: ' + (error as Error).message);
  }
}

/**
 * 解析简单的数学运算
 */
function parseSimpleOperation(num1: number, num2: number, operation: string): number {
  switch (operation) {
    case 'add':
    case '+':
      return num1 + num2;
    case 'subtract':
    case '-':
      return num1 - num2;
    case 'multiply':
    case '*':
      return num1 * num2;
    case 'divide':
    case '/':
      if (num2 === 0) {
        throw new Error('除数不能为零');
      }
      return num1 / num2;
    default:
      throw new Error('不支持的操作: ' + operation);
  }
}

/**
 * 执行计算器功能
 */
export default async function execute(params: CalculatorParams): Promise<CalculatorResult> {
  try {
    const { expression, operation = 'auto' } = params;

    console.log(`[Calculator] 收到计算请求: expression="${expression}", operation="${operation}"`);

    let result: number;
    let actualOperation: string;

    if (operation === 'auto') {
      // 自动解析表达式
      result = safeEvaluate(expression);
      actualOperation = 'expression';
    } else {
      // 解析简单的操作
      // 从表达式中提取数字
      const numbers = expression.match(/[+-]?\d+(\.\d+)?/g);
      if (!numbers || numbers.length < 2) {
        throw new Error('需要至少两个数字进行运算');
      }

      const num1 = parseFloat(numbers[0]);
      const num2 = parseFloat(numbers[1]);

      result = parseSimpleOperation(num1, num2, operation);
      actualOperation = operation;
    }

    // 格式化结果
    const formattedResult = Number(result.toFixed(10)); // 限制小数位数

    console.log(`[Calculator] 计算成功: ${expression} = ${formattedResult}`);

    return {
      result: formattedResult,
      expression: expression,
      operation: actualOperation,
      success: true,
      message: `计算结果: ${expression} = ${formattedResult}`
    };

  } catch (error) {
    console.error(`[Calculator] 计算失败:`, error);

    return {
      result: 0,
      expression: params.expression,
      operation: params.operation || 'auto',
      success: false,
      message: '计算错误: ' + (error as Error).message
    };
  }
}

// 测试函数
if (require.main === module) {
  (async () => {
    // 测试加法
    console.log('测试加法:');
    console.log(await execute({ expression: '2+3' }));

    // 测试乘法
    console.log('\n测试乘法:');
    console.log(await execute({ expression: '5*4' }));

    // 测试除法
    console.log('\n测试除法:');
    console.log(await execute({ expression: '10/2' }));

    // 测试复杂表达式
    console.log('\n测试复杂表达式:');
    console.log(await execute({ expression: '(2+3)*4' }));

    // 测试错误情况
    console.log('\n测试错误情况:');
    console.log(await execute({ expression: 'abc+def' }));
  })();
}