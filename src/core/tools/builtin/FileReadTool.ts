/**
 * FileReadTool - 文件读取内置工具
 * 提供安全、高效的文件读取功能
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ToolResult, BuiltInTool, ToolType } from '../../../types/tool-system';

/**
 * FileReadTool参数接口
 */
export interface FileReadArgs {
  /** 文件路径 */
  path: string;
  /** 文件编码 */
  encoding?: BufferEncoding;
  /** 最大文件大小（字节），默认10MB */
  maxSize?: number;
  /** 是否解析JSON */
  parseJson?: boolean;
}

/**
 * 文件读取工具
 * 安全读取文件内容，支持多种格式和大小限制
 */
export class FileReadTool {
  private static readonly DEFAULT_ENCODING: BufferEncoding = 'utf8';
  private static readonly DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly ALLOWED_EXTENSIONS = [
    '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv',
    '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cpp', '.c',
    '.html', '.css', '.scss', '.less', '.sql', '.sh', '.bat',
    '.dockerfile', '.gitignore', '.env', '.conf', '.config'
  ];

  /**
   * 执行文件读取
   * @param args 读取参数
   * @returns 读取结果
   */
  static async execute(args: FileReadArgs): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // 参数验证
      this.validateArgs(args);

      // 安全路径检查
      const safePath = await this.getSafePath(args.path);

      // 检查文件存在性和可读性
      await this.checkFileAccess(safePath);

      // 检查文件大小
      await this.checkFileSize(safePath, args.maxSize || this.DEFAULT_MAX_SIZE);

      // 检查文件扩展名
      this.checkFileExtension(safePath);

      // 读取文件内容
      const content = await this.readFileContent(safePath, args.encoding || this.DEFAULT_ENCODING);

      // 可选的JSON解析
      const output = args.parseJson ? this.parseJsonContent(content) : content;

      const duration = Date.now() - startTime;

      return {
        success: true,
        output: typeof output === 'string' ? output : JSON.stringify(output, null, 2),
        duration,
        exitCode: 0
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        success: false,
        error: this.formatError(error),
        duration,
        errorCode: 'FILE_READ_ERROR',
        exitCode: 1
      };
    }
  }

  /**
   * 验证参数
   */
  private static validateArgs(args: FileReadArgs): void {
    if (!args.path || typeof args.path !== 'string') {
      throw new Error('File path is required and must be a string');
    }

    if (args.encoding && !Buffer.isEncoding(args.encoding)) {
      throw new Error(`Invalid encoding: ${args.encoding}`);
    }

    if (args.maxSize && (typeof args.maxSize !== 'number' || args.maxSize <= 0)) {
      throw new Error('Max size must be a positive number');
    }
  }

  /**
   * 获取安全路径（防止目录遍历攻击）
   */
  private static async getSafePath(inputPath: string): Promise<string> {
    // 标准化路径
    const normalizedPath = path.normalize(inputPath);

    // 解析为绝对路径
    const absolutePath = path.isAbsolute(normalizedPath)
      ? normalizedPath
      : path.resolve(process.cwd(), normalizedPath);

    // 检查是否包含路径遍历字符
    if (normalizedPath.includes('..') || absolutePath.includes('..')) {
      throw new Error('Path traversal detected');
    }

    // 确保路径在工作目录内（防止访问系统文件）
    const workDir = process.cwd();
    if (!absolutePath.startsWith(workDir)) {
      throw new Error('File path must be within the working directory');
    }

    return absolutePath;
  }

  /**
   * 检查文件访问权限
   */
  private static async checkFileAccess(filePath: string): Promise<void> {
    try {
      await fs.access(filePath, fs.constants.R_OK);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`File not found: ${filePath}`);
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        throw new Error(`Permission denied: ${filePath}`);
      } else {
        throw new Error(`Cannot access file: ${filePath}`);
      }
    }
  }

  /**
   * 检查文件大小
   */
  private static async checkFileSize(filePath: string, maxSize: number): Promise<void> {
    const stats = await fs.stat(filePath);

    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${filePath}`);
    }

    if (stats.size > maxSize) {
      throw new Error(`File size ${stats.size} exceeds maximum allowed size ${maxSize}`);
    }
  }

  /**
   * 检查文件扩展名
   */
  private static checkFileExtension(filePath: string): void {
    const ext = path.extname(filePath).toLowerCase();

    // 如果没有扩展名，允许读取
    if (!ext) {
      return;
    }

    // 检查是否在允许的扩展名列表中
    if (!this.ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`File extension '${ext}' is not allowed for security reasons`);
    }
  }

  /**
   * 读取文件内容
   */
  private static async readFileContent(filePath: string, encoding: BufferEncoding): Promise<string> {
    return await fs.readFile(filePath, encoding);
  }

  /**
   * 解析JSON内容
   */
  private static parseJsonContent(content: string): any {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new Error(`Invalid JSON content: ${error}`);
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
      name: 'file-read',
      description: '安全读取文件内容，支持文本、JSON等多种格式',
      category: 'filesystem',
      level: 1,
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '要读取的文件路径，支持相对路径和绝对路径'
          },
          encoding: {
            type: 'string',
            description: '文件编码，默认为utf8',
            default: 'utf8',
            enum: ['utf8', 'utf16le', 'latin1', 'base64', 'hex', 'ascii']
          },
          maxSize: {
            type: 'number',
            description: '最大文件大小（字节），默认10MB',
            default: 10485760,
            minimum: 1024,
            maximum: 104857600
          },
          parseJson: {
            type: 'boolean',
            description: '是否自动解析JSON内容',
            default: false
          }
        },
        required: ['path']
      }
    };
  }
}

/**
 * 创建FileReadTool实例（用于注册表）
 */
export function createFileReadTool() {
  return {
    ...FileReadTool.getMetadata(),
    type: ToolType.BUILTIN,
    enabled: true,
    execute: async (args: Record<string, any>) => {
      return FileReadTool.execute(args as FileReadArgs);
    }
  } as BuiltInTool;
}