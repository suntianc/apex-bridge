/**
 * FileWriteTool - 文件写入内置工具
 * 提供安全、可靠的文件写入功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolResult, BuiltInTool, ToolType } from '../../../types/tool-system';

/**
 * FileWriteTool参数接口
 */
export interface FileWriteArgs {
  /** 文件路径 */
  path: string;
  /** 文件内容 */
  content: string;
  /** 文件编码 */
  encoding?: BufferEncoding;
  /** 是否创建备份 */
  backup?: boolean;
  /** 备份文件后缀 */
  backupSuffix?: string;
  /** 是否创建目录（如果不存在） */
  createDirectory?: boolean;
  /** 写入模式 */
  mode?: 'overwrite' | 'append' | 'create';
}

/**
 * 文件写入工具
 * 安全写入文件内容，支持备份和目录创建
 */
export class FileWriteTool {
  private static readonly DEFAULT_ENCODING: BufferEncoding = 'utf8';
  private static readonly DEFAULT_MODE = 'overwrite' as const;
  private static readonly DEFAULT_BACKUP_SUFFIX = '.backup';
  private static readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv',
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c',
    '.html', '.css', '.scss', '.less', '.sql', '.sh', '.bat',
    '.dockerfile', '.gitignore', '.env', '.conf', '.config',
    '.log', '.tmp'
  ];

  /**
   * 执行文件写入
   * @param args 写入参数
   * @returns 写入结果
   */
  static async execute(args: FileWriteArgs): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 参数验证
      this.validateArgs(args);

      // 安全路径检查
      const safePath = await this.getSafePath(args.path);

      // 检查文件大小（如果文件已存在）
      await this.checkExistingFileSize(safePath);

      // 检查文件扩展名
      this.checkFileExtension(safePath);

      // 创建目录（如果需要）
      if (args.createDirectory !== false) {
        await this.ensureDirectoryExists(path.dirname(safePath));
      }

      // 创建备份（如果需要）
      if (args.backup) {
        await this.createBackup(safePath, args.backupSuffix || this.DEFAULT_BACKUP_SUFFIX);
      }

      // 检查写入模式
      await this.checkWriteMode(safePath, args.mode || this.DEFAULT_MODE);

      // 写入文件
      await this.writeFileContent(
        safePath,
        args.content,
        args.encoding || this.DEFAULT_ENCODING,
        args.mode || this.DEFAULT_MODE
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        output: `File written successfully: ${safePath}`,
        duration,
        exitCode: 0
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: this.formatError(error),
        duration,
        errorCode: 'FILE_WRITE_ERROR',
        exitCode: 1
      };
    }
  }

  /**
   * 验证参数
   */
  private static validateArgs(args: FileWriteArgs): void {
    if (!args.path || typeof args.path !== 'string') {
      throw new Error('File path is required and must be a string');
    }

    if (args.content === undefined || args.content === null) {
      throw new Error('File content is required');
    }

    if (args.encoding && !Buffer.isEncoding(args.encoding)) {
      throw new Error(`Invalid encoding: ${args.encoding}`);
    }

    if (args.mode && !['overwrite', 'append', 'create'].includes(args.mode)) {
      throw new Error(`Invalid mode: ${args.mode}. Must be 'overwrite', 'append', or 'create'`);
    }

    // 检查内容大小
    const contentSize = Buffer.byteLength(args.content, args.encoding || this.DEFAULT_ENCODING);
    if (contentSize > this.MAX_FILE_SIZE) {
      throw new Error(`Content size ${contentSize} exceeds maximum allowed size ${this.MAX_FILE_SIZE}`);
    }
  }

  /**
   * 获取安全路径（防止目录遍历攻击）
   */
  private static async getSafePath(inputPath: string): Promise<string> {
    const normalizedPath = path.normalize(inputPath);

    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(process.cwd(), normalizedPath);

    if (normalizedPath.includes('..') || absolutePath.includes('..')) {
      throw new Error('Path traversal detected');
    }

    const workDir = process.cwd();
    if (!absolutePath.startsWith(workDir)) {
      throw new Error('File path must be within the working directory');
    }

    return absolutePath;
  }

  /**
   * 检查现有文件大小
   */
  private static async checkExistingFileSize(filePath: string): Promise<void> {
    try {
      const stats = await fs.stat(filePath);
      if (stats.size > this.MAX_FILE_SIZE) {
        throw new Error(`Existing file size ${stats.size} exceeds maximum allowed size ${this.MAX_FILE_SIZE}`);
      }
    } catch (error) {
      // 文件不存在是正常的，继续执行
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 检查文件扩展名
   */
  private static checkFileExtension(filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();

    if (!ext) {
      return; // 没有扩展名允许
    }

    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`File extension '${ext}' is not allowed for security reasons`);
    }
  }

  /**
   * 确保目录存在
   */
  private static async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw new Error(`Failed to create directory: ${dirPath}`);
      }
    }
  }

  /**
   * 创建备份
   */
  private static async createBackup(filePath: string, suffix: string): Promise<void> {
    try {
      await fs.access(filePath);
      const backupPath = `${filePath}${suffix}`;
      await fs.copyFile(filePath, backupPath);
    } catch (error) {
      // 文件不存在，不需要备份
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * 检查写入模式
   */
  private static async checkWriteMode(filePath: string, mode: string): Promise<void> {
    if (mode === 'create') {
      try {
        await fs.access(filePath);
        throw new Error(`File already exists and mode is 'create': ${filePath}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        // 文件不存在，可以创建
      }
    }
  }

  /**
   * 写入文件内容
   */
  private static async writeFileContent(
    filePath: string,
    content: string,
    encoding: BufferEncoding,
    mode: string
  ): Promise<void> {
    const writeOptions = { encoding, flag: this.getWriteFlag(mode) };
    await fs.writeFile(filePath, content, writeOptions);
  }

  /**
   * 获取写入标志
   */
  private static getWriteFlag(mode: string): string {
    switch (mode) {
      case 'overwrite':
        return 'w'; // 覆盖写入
      case 'append':
        return 'a'; // 追加写入
      case 'create':
        return 'wx'; // 创建新文件（如果存在则失败）
      default:
        return 'w';
    }
  }

  /**
   * 格式化错误信息
   */
  private static formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }

  /**
   * 获取工具元数据
   */
  static getMetadata() {
    return {
      name: 'file-write',
      description: '安全写入文件内容，支持备份、目录创建和多种写入模式',
      category: 'filesystem',
      level: 1,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要写入的文件路径'
          },
          content: {
            type: 'string',
            description: '要写入的文件内容'
          },
          encoding: {
            type: 'string',
            description: '文件编码，默认为utf8',
            default: 'utf8',
            enum: ['utf8', 'utf16le', 'latin1', 'base64', 'hex', 'ascii']
          },
          backup: {
            type: 'boolean',
            description: '是否创建备份文件',
            default: false
          },
          backupSuffix: {
            type: 'string',
            description: '备份文件后缀，默认为.backup',
            default: '.backup'
          },
          createDirectory: {
            type: 'boolean',
            description: '是否自动创建目录（如果不存在）',
            default: true
          },
          mode: {
            type: 'string',
            description: '写入模式',
            default: 'overwrite',
            enum: ['overwrite', 'append', 'create']
          }
        },
        required: ['path', 'content']
      }
    };
  }
}

/**
 * 创建FileWriteTool实例（用于注册表）
 */
export function createFileWriteTool() {
  return {
    ...FileWriteTool.getMetadata(),
    type: ToolType.BUILTIN,
    enabled: true,
    execute: async (args: Record<string, any>) => {
      return FileWriteTool.execute(args as FileWriteArgs);
    }
  } as BuiltInTool;
}