/**
 * TransactionManager - 事务管理器
 * 
 * 用于管理多步骤操作的原子性，确保所有操作一起成功或一起失败
 */

import { logger } from './logger';

export interface TransactionOperation {
  execute: () => Promise<void>;
  rollback: () => Promise<void>;
  description?: string; // 操作描述，用于日志
}

export interface TransactionResult {
  success: boolean;
  executedCount: number;
  rollbackCount: number;
  errors?: Array<{ operation: string; error: Error }>;
}

/**
 * 事务管理器
 * 管理多个操作的原子执行和回滚
 */
export class TransactionManager {
  private operations: TransactionOperation[] = [];
  private executed: TransactionOperation[] = [];
  private isCommitting: boolean = false;

  /**
   * 添加操作到事务
   * @param operation 操作（包含执行和回滚函数）
   */
  public addOperation(operation: TransactionOperation): void {
    if (this.isCommitting) {
      throw new Error('Cannot add operations while transaction is committing');
    }

    this.operations.push(operation);
    logger.debug(`➕ Added operation to transaction: ${operation.description || 'unnamed'}`);
  }

  /**
   * 添加操作（简化接口）
   * @param execute 执行函数
   * @param rollback 回滚函数
   * @param description 操作描述
   */
  public add(
    execute: () => Promise<void>,
    rollback: () => Promise<void>,
    description?: string
  ): void {
    this.addOperation({ execute, rollback, description });
  }

  /**
   * 提交事务（原子执行所有操作）
   * @returns 事务结果
   */
  public async commit(): Promise<TransactionResult> {
    if (this.isCommitting) {
      throw new Error('Transaction is already committing');
    }

    if (this.operations.length === 0) {
      logger.warn('⚠️ Attempting to commit empty transaction');
      return {
        success: true,
        executedCount: 0,
        rollbackCount: 0
      };
    }

    this.isCommitting = true;
    this.executed = [];
    const errors: Array<{ operation: string; error: Error }> = [];

    try {
      // 按顺序执行所有操作
      for (let i = 0; i < this.operations.length; i++) {
        const operation = this.operations[i];
        const operationName = operation.description || `operation-${i + 1}`;

        try {
          logger.debug(`🔄 Executing transaction operation: ${operationName}`);
          await operation.execute();
          this.executed.push(operation);
          logger.debug(`✅ Transaction operation executed: ${operationName}`);
        } catch (error: any) {
          logger.error(`❌ Transaction operation failed: ${operationName}`, error);
          errors.push({ operation: operationName, error });
          throw error; // 抛出错误，触发回滚
        }
      }

      // 所有操作成功
      logger.info(`✅ Transaction committed successfully (${this.executed.length} operations)`);
      return {
        success: true,
        executedCount: this.executed.length,
        rollbackCount: 0
      };
    } catch (error: any) {
      // 执行失败，回滚已执行的操作
      logger.warn(`⚠️ Transaction failed, rolling back ${this.executed.length} operations`);
      const rollbackCount = await this.rollback();

      return {
        success: false,
        executedCount: this.executed.length,
        rollbackCount,
        errors
      };
    } finally {
      // 清理状态
      this.operations = [];
      this.executed = [];
      this.isCommitting = false;
    }
  }

  /**
   * 回滚已执行的操作
   * @returns 成功回滚的操作数量
   */
  private async rollback(): Promise<number> {
    let rollbackCount = 0;

    // 按相反顺序回滚已执行的操作
    for (let i = this.executed.length - 1; i >= 0; i--) {
      const operation = this.executed[i];
      const operationName = operation.description || `operation-${i + 1}`;

      try {
        logger.debug(`🔄 Rolling back transaction operation: ${operationName}`);
        await operation.rollback();
        rollbackCount++;
        logger.debug(`✅ Transaction operation rolled back: ${operationName}`);
      } catch (rollbackError: any) {
        // 回滚失败被记录，但不阻止其他操作的回滚
        logger.error(`❌ Failed to rollback transaction operation: ${operationName}`, rollbackError);
        // 继续回滚其他操作
      }
    }

    if (rollbackCount < this.executed.length) {
      logger.warn(`⚠️ Partial rollback: ${rollbackCount}/${this.executed.length} operations rolled back`);
    } else {
      logger.info(`✅ All operations rolled back successfully (${rollbackCount} operations)`);
    }

    return rollbackCount;
  }

  /**
   * 获取操作数量
   */
  public getOperationCount(): number {
    return this.operations.length;
  }

  /**
   * 检查是否为空事务
   */
  public isEmpty(): boolean {
    return this.operations.length === 0;
  }

  /**
   * 清空所有操作（不执行回滚）
   */
  public clear(): void {
    if (this.isCommitting) {
      throw new Error('Cannot clear operations while transaction is committing');
    }

    this.operations = [];
    this.executed = [];
  }
}

/**
 * 使用事务执行操作
 * @param operations 操作列表
 * @returns 事务结果
 */
export async function executeTransaction(
  operations: TransactionOperation[]
): Promise<TransactionResult> {
  const transaction = new TransactionManager();

  for (const operation of operations) {
    transaction.addOperation(operation);
  }

  return await transaction.commit();
}

/**
 * 使用事务执行操作（简化接口）
 * @param executor 执行函数，接收 TransactionManager 作为参数
 * @returns 事务结果
 */
export async function withTransaction(
  executor: (transaction: TransactionManager) => void
): Promise<TransactionResult> {
  const transaction = new TransactionManager();
  executor(transaction);
  return await transaction.commit();
}
