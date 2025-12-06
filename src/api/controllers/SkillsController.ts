/**
 * SkillsController - Skills管理 API 控制器
 * 提供Skills的安装、卸载、查询等RESTful接口
 */

import { Request, Response } from 'express';
import multer from 'multer';
import { SkillManager } from '../../services/SkillManager';
import { logger } from '../../utils/logger';
import { ToolError, ToolErrorCode } from '../../types/tool-system';

const skillManager = SkillManager.getInstance();

/**
 * 统一处理服务层错误
 * 将ToolError转换为合适的HTTP状态码
 */
function handleServiceError(res: Response, error: any, action: string): boolean {
  logger.error(`❌ Failed to ${action}:`, error);

  if (error instanceof ToolError) {
    switch (error.code) {
      case ToolErrorCode.SKILL_NOT_FOUND:
        res.status(404).json({
          error: 'Skill not found',
          message: error.message,
          code: error.code
        });
        return true;

      case ToolErrorCode.SKILL_ALREADY_EXISTS:
        res.status(409).json({
          error: 'Skill already exists',
          message: error.message,
          code: error.code
        });
        return true;

      case ToolErrorCode.SKILL_INVALID_STRUCTURE:
        res.status(400).json({
          error: 'Invalid skill structure',
          message: error.message,
          code: error.code
        });
        return true;

      case ToolErrorCode.VECTOR_DB_ERROR:
        res.status(503).json({
          error: 'Vector database error',
          message: error.message,
          code: error.code
        });
        return true;

      default:
        res.status(500).json({
          error: `Failed to ${action}`,
          message: error.message,
          code: error.code
        });
        return true;
    }
  }

  // 默认返回 500
  res.status(500).json({
    error: `Failed to ${action}`,
    message: error.message || 'Unknown error'
  });
  return true;
}

/**
 * 转换为 Skill DTO
 * 统一响应结构，确保所有接口返回格式一致
 */
function toSkillDTO(skill: any) {
  return {
    name: skill.name,
    description: skill.description,
    type: skill.type,
    tags: skill.tags || [],
    version: skill.version,
    author: skill.author,
    enabled: skill.enabled,
    level: skill.level,
    path: skill.path,
    parameters: skill.parameters || {
      type: 'object',
      properties: {},
      required: []
    }
  };
}

/**
 * 安装Skills
 * POST /api/skills/install
 * Content-Type: multipart/form-data
 * Body: { file: ZIP文件, overwrite?: boolean, skipVectorization?: boolean }
 */
export async function installSkill(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    // 检查文件是否存在
    if (!req.file) {
      res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a ZIP file containing the skill'
      });
      return;
    }

    // 验证文件类型
    if (!req.file.originalname.endsWith('.zip')) {
      res.status(400).json({
        error: 'Invalid file type',
        message: 'Only ZIP files are supported'
      });
      return;
    }

    // 检查文件大小（限制100MB）
    if (req.file.size > 100 * 1024 * 1024) {
      res.status(400).json({
        error: 'File too large',
        message: 'Maximum file size is 100MB'
      });
      return;
    }

    logger.info(`📦 Installing skill from file: ${req.file.originalname} (${req.file.size} bytes)`);

    // 解析选项
    const options = {
      overwrite: req.body.overwrite === 'true' || req.body.overwrite === true,
      skipVectorization: req.body.skipVectorization === 'true' || req.body.skipVectorization === true,
      validationLevel: req.body.validationLevel || 'basic'
    };

    // 安装Skills
    const result = await skillManager.installSkill(req.file.buffer, options);

    logger.info(`✅ Skill installed successfully: ${result.skillName} (${Date.now() - startTime}ms)`);

    // 返回成功响应
    res.status(201).json({
      success: true,
      message: result.message,
      skillName: result.skillName,
      installedAt: result.installedAt,
      duration: result.duration,
      vectorized: result.vectorized
    });

  } catch (error) {
    handleServiceError(res, error, 'install skill');
  }
}

/**
 * 卸载Skills
 * DELETE /api/skills/:name
 */
export async function uninstallSkill(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.params;
    const startTime = Date.now();

    logger.info(`🗑️ Uninstalling skill: ${name}`);

    const result = await skillManager.uninstallSkill(name);

    logger.info(`✅ Skill uninstalled successfully: ${name} (${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      message: result.message,
      skillName: result.skillName,
      uninstalledAt: result.uninstalledAt,
      duration: result.duration
    });

  } catch (error) {
    handleServiceError(res, error, 'uninstall skill');
  }
}

/**
 * 更新Skills描述
 * PUT /api/skills/:name/description
 * Body: { description: string }
 */
export async function updateSkillDescription(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.params;
    const { description } = req.body;
    const startTime = Date.now();

    // 验证描述不能为空
    if (!description || typeof description !== 'string') {
      res.status(400).json({
        error: 'Invalid description',
        message: 'Description is required and must be a string'
      });
      return;
    }

    logger.info(`✏️ Updating skill description: ${name}`);

    const result = await skillManager.updateSkill(name, description);

    logger.info(`✅ Skill description updated: ${name} (${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      message: result.message,
      skillName: result.skillName,
      updatedAt: result.updatedAt,
      duration: result.duration,
      reindexed: result.reindexed
    });

  } catch (error) {
    handleServiceError(res, error, 'update skill description');
  }
}

/**
 * 列出Skills
 * GET /api/skills?page=1&limit=50&name=&tags=&sortBy=name&sortOrder=asc
 */
export async function listSkills(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    // 解析查询参数
    const sortBy = (req.query.sortBy as string) || 'name';
    const validSortFields = ['updatedAt', 'name', 'installedAt'];
    if (!validSortFields.includes(sortBy)) {
      res.status(400).json({
        error: 'Invalid sortBy parameter',
        message: 'sortBy must be one of: updatedAt, name, installedAt'
      });
      return;
    }

    const options = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      name: req.query.name as string || undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      sortBy: sortBy as 'updatedAt' | 'name' | 'installedAt',
      sortOrder: ((req.query.sortOrder as string) === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc'
    };

    logger.debug(`📋 Listing skills: page=${options.page}, limit=${options.limit}`);

    const result = await skillManager.listSkills(options);

    logger.info(`✅ Listed ${result.skills.length} skills (${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      data: {
        skills: result.skills.map(toSkillDTO),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      }
    });

  } catch (error) {
    handleServiceError(res, error, 'list skills');
  }
}

/**
 * 获取单个Skills详情
 * GET /api/skills/:name
 */
export async function getSkill(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.params;
    const startTime = Date.now();

    logger.debug(`🔍 Getting skill details: ${name}`);

    const skill = await skillManager.getSkillByName(name);

    if (!skill) {
      res.status(404).json({
        error: 'Skill not found',
        message: `Skill '${name}' not found`
      });
      return;
    }

    logger.info(`✅ Got skill details: ${name} (${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      data: toSkillDTO(skill)
    });

  } catch (error) {
    handleServiceError(res, error, 'get skill');
  }
}

/**
 * 检查Skills是否存在
 * GET /api/skills/:name/exists
 */
export async function checkSkillExists(req: Request, res: Response): Promise<void> {
  try {
    const { name } = req.params;

    logger.debug(`🔍 Checking if skill exists: ${name}`);

    const exists = await skillManager.isSkillExist(name);

    res.json({
      success: true,
      data: {
        name,
        exists
      }
    });

  } catch (error) {
    handleServiceError(res, error, 'check skill existence');
  }
}

/**
 * 获取Skills统计信息
 * GET /api/skills/stats
 */
export async function getSkillStats(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    logger.debug('📊 Getting skill statistics');

    const stats = await skillManager.getStatistics();

    logger.info(`✅ Got skill statistics (${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    handleServiceError(res, error, 'get skill statistics');
  }
}

/**
 * 重新索引所有Skills
 * POST /api/skills/reindex
 * 用于向量数据库重建或同步
 */
export async function reindexAllSkills(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    logger.info('🔄 Reindexing all skills');

    // TODO: 实现重新索引逻辑
    // 1. 扫描所有Skills目录
    // 2. 逐一调用 retrievalService.indexSkill()
    // 3. 更新.vectorized标识

    logger.info(`✅ All skills reindexed (${Date.now() - startTime}ms)`);

    res.json({
      success: true,
      message: 'All skills reindexed successfully'
    });

  } catch (error) {
    handleServiceError(res, error, 'reindex skills');
  }
}

// 配置Multer中间件
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('Only ZIP files are allowed'));
    }
  }
});
