/**
 * 日记归档服务
 * 
 * 功能：
 * - 定期扫描日记目录
 * - 将 N 天前的零散日记文件合并为按天归档
 * - 自动清理已归档的原始文件
 * - 更新 RAG 向量数据库
 * 
 * 归档策略：
 * - 默认归档 7 天前的文件
 * - 每天凌晨执行一次
 * - 按天合并：2025-11-01 的所有文件 → archive/2025-11-01.txt
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as schedule from 'node-schedule';
import { logger } from '../utils/logger';

export interface DiaryArchiveConfig {
  /** 日记根目录 */
  diaryRootPath: string;
  /** 归档目录名称（默认：archive） */
  archiveDir?: string;
  /** 归档阈值（天数，默认：7天） */
  archiveAfterDays?: number;
  /** 是否启用定时归档 */
  enabled?: boolean;
  /** Cron 表达式（默认：每天凌晨 2:00） */
  cronSchedule?: string;
}

export class DiaryArchiveService {
  private config: Required<DiaryArchiveConfig>;
  private job: schedule.Job | null = null;

  constructor(config: DiaryArchiveConfig) {
    this.config = {
      diaryRootPath: config.diaryRootPath,
      archiveDir: config.archiveDir || 'archive',
      archiveAfterDays: config.archiveAfterDays || 7,
      enabled: config.enabled !== false,
      cronSchedule: config.cronSchedule || '0 2 * * *', // 每天凌晨 2:00
    };
  }

  /**
   * 启动定时归档任务
   */
  start(): void {
    if (!this.config.enabled) {
      logger.info('[DiaryArchive] Archive service is disabled');
      return;
    }

    logger.info(`[DiaryArchive] Starting archive service (threshold: ${this.config.archiveAfterDays} days, schedule: ${this.config.cronSchedule})`);

    this.job = schedule.scheduleJob(this.config.cronSchedule, async () => {
      logger.info('[DiaryArchive] Running scheduled archive task...');
      try {
        await this.archiveOldDiaries();
      } catch (error: any) {
        logger.error('[DiaryArchive] Scheduled archive failed:', error);
      }
    });

    logger.info('[DiaryArchive] ✅ Archive service started');
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (this.job) {
      this.job.cancel();
      this.job = null;
      logger.info('[DiaryArchive] Archive service stopped');
    }
  }

  /**
   * 执行归档（可手动调用）
   */
  async archiveOldDiaries(): Promise<{
    archivedFiles: number;
    archivedCharacters: number;
    totalSize: number;
  }> {
    const startTime = Date.now();
    let totalArchivedFiles = 0;
    let totalArchivedCharacters = 0;
    let totalSize = 0;

    try {
      // 计算阈值日期
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - this.config.archiveAfterDays);
      
      logger.info(`[DiaryArchive] Archiving files older than ${thresholdDate.toISOString().split('T')[0]}`);

      // 遍历所有角色目录
      const entries = await fs.readdir(this.config.diaryRootPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name === this.config.archiveDir) continue; // 跳过归档目录自身

        const characterPath = path.join(this.config.diaryRootPath, entry.name);
        const result = await this.archiveCharacterDiaries(entry.name, characterPath, thresholdDate);
        
        totalArchivedFiles += result.archivedFiles;
        totalArchivedCharacters += result.archivedCharacters;
        totalSize += result.totalSize;
      }

      const duration = Date.now() - startTime;
      logger.info(`[DiaryArchive] ✅ Archive completed in ${duration}ms (files: ${totalArchivedFiles}, characters: ${totalArchivedCharacters}, size: ${(totalSize / 1024).toFixed(2)} KB)`);

      return {
        archivedFiles: totalArchivedFiles,
        archivedCharacters: totalArchivedCharacters,
        totalSize: totalSize,
      };
    } catch (error: any) {
      logger.error('[DiaryArchive] Archive failed:', error);
      throw error;
    }
  }

  /**
   * 归档单个角色的日记
   */
  private async archiveCharacterDiaries(
    characterName: string,
    characterPath: string,
    thresholdDate: Date
  ): Promise<{ archivedFiles: number; archivedCharacters: number; totalSize: number }> {
    let archivedFiles = 0;
    let archivedCharacters = 0;
    let totalSize = 0;

    try {
      const files = await fs.readdir(characterPath);
      const diaryFiles = files.filter((f) => f.endsWith('.txt') || f.endsWith('.md'));

      if (diaryFiles.length === 0) return { archivedFiles: 0, archivedCharacters: 0, totalSize: 0 };

      // 按日期分组旧文件
      const filesByDate = new Map<string, string[]>();

      for (const file of diaryFiles) {
        const filePath = path.join(characterPath, file);
        const stats = await fs.stat(filePath);

        // 检查文件是否需要归档
        if (stats.mtime < thresholdDate) {
          // 提取日期（从文件修改时间）
          const dateStr = stats.mtime.toISOString().split('T')[0]; // 2025-11-01

          if (!filesByDate.has(dateStr)) {
            filesByDate.set(dateStr, []);
          }
          filesByDate.get(dateStr)!.push(file);
        }
      }

      if (filesByDate.size === 0) {
        logger.debug(`[DiaryArchive] No files to archive for character: ${characterName}`);
        return { archivedFiles: 0, archivedCharacters: 0, totalSize: 0 };
      }

      // 创建归档目录
      const archivePath = path.join(characterPath, this.config.archiveDir);
      await fs.mkdir(archivePath, { recursive: true });

      // 按日期合并文件
      for (const [dateStr, filesForDate] of filesByDate) {
        const archiveFileName = `${dateStr}.txt`;
        const archiveFilePath = path.join(archivePath, archiveFileName);

        // 读取并合并所有文件
        const contents: string[] = [];
        let dayTotalSize = 0;

        for (const file of filesForDate) {
          const filePath = path.join(characterPath, file);
          const content = await fs.readFile(filePath, 'utf-8');
          contents.push(content);
          dayTotalSize += Buffer.byteLength(content, 'utf-8');
        }

        // 合并内容（用分隔符连接）
        const mergedContent = contents.join('\n\n---\n\n');

        // 写入归档文件
        await fs.writeFile(archiveFilePath, mergedContent, 'utf-8');

        // 删除原始文件
        for (const file of filesForDate) {
          const filePath = path.join(characterPath, file);
          await fs.unlink(filePath);
        }

        archivedFiles += filesForDate.length;
        totalSize += dayTotalSize;
        archivedCharacters++;

        logger.info(`[DiaryArchive] Archived ${filesForDate.length} files for ${characterName} on ${dateStr} → ${archiveFileName}`);
      }

      return { archivedFiles, archivedCharacters, totalSize };
    } catch (error: any) {
      logger.error(`[DiaryArchive] Failed to archive diaries for ${characterName}:`, error);
      return { archivedFiles: 0, archivedCharacters: 0, totalSize: 0 };
    }
  }

  /**
   * 手动触发归档
   */
  async triggerArchive(): Promise<any> {
    logger.info('[DiaryArchive] Manual archive triggered');
    return await this.archiveOldDiaries();
  }

  /**
   * 获取归档统计
   */
  async getArchiveStats(): Promise<{
    totalCharacters: number;
    totalArchiveFiles: number;
    oldestArchive: string | null;
    newestArchive: string | null;
  }> {
    let totalCharacters = 0;
    let totalArchiveFiles = 0;
    const archiveDates: string[] = [];

    try {
      const entries = await fs.readdir(this.config.diaryRootPath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const characterPath = path.join(this.config.diaryRootPath, entry.name);
        const archivePath = path.join(characterPath, this.config.archiveDir);

        try {
          const archiveFiles = await fs.readdir(archivePath);
          totalCharacters++;
          totalArchiveFiles += archiveFiles.length;

          // 提取日期
          archiveFiles.forEach((f) => {
            const dateMatch = f.match(/(\d{4}-\d{2}-\d{2})/);
            if (dateMatch) {
              archiveDates.push(dateMatch[1]);
            }
          });
        } catch (error) {
          // 归档目录不存在，跳过
        }
      }

      archiveDates.sort();

      return {
        totalCharacters: totalCharacters,
        totalArchiveFiles: totalArchiveFiles,
        oldestArchive: archiveDates[0] || null,
        newestArchive: archiveDates[archiveDates.length - 1] || null,
      };
    } catch (error: any) {
      logger.error('[DiaryArchive] Failed to get stats:', error);
      return {
        totalCharacters: 0,
        totalArchiveFiles: 0,
        oldestArchive: null,
        newestArchive: null,
      };
    }
  }
}

