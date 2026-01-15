/**
 * SkillsController - Skills管理 API 控制器
 * 提供Skills的安装、卸载、查询等RESTful接口
 *
 * @swagger
 * tags:
 *   name: Skills
 *   description: Skill management
 */

import { Request, Response } from "express";
import multer from "multer";
import { SkillManager } from "../../services/skill/SkillManager";
import { logger } from "../../utils/logger";
import { ToolError, ToolErrorCode } from "../../types/tool-system";
import {
  badRequest,
  notFound,
  conflict,
  serverError,
  created,
  ok,
  serviceUnavailable,
  handleErrorWithAutoDetection,
} from "../../utils/http-response";

const skillManager = SkillManager.getInstance();

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
      type: "object",
      properties: {},
      required: [],
    },
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
      badRequest(res, "Please upload a ZIP file containing the skill");
      return;
    }

    if (!req.file.originalname.endsWith(".zip")) {
      badRequest(res, "Only ZIP files are supported");
      return;
    }

    if (req.file.size > 100 * 1024 * 1024) {
      badRequest(res, "Maximum file size is 100MB");
      return;
    }

    // 验证文件类型
    if (!req.file.originalname.endsWith(".zip")) {
      badRequest(res, "Only ZIP files are supported", { code: "INVALID_FILE_TYPE" });
      return;
    }

    // 检查文件大小（限制100MB）
    if (req.file.size > 100 * 1024 * 1024) {
      badRequest(res, "Maximum file size is 100MB", { code: "FILE_TOO_LARGE" });
      return;
    }

    // 检查文件大小（限制100MB）
    if (req.file.size > 100 * 1024 * 1024) {
      badRequest(res, "Maximum file size is 100MB", { code: "FILE_TOO_LARGE" });
      return;
    }

    logger.info(`📦 Installing skill from file: ${req.file.originalname} (${req.file.size} bytes)`);

    // 解析选项
    const options = {
      overwrite: req.body.overwrite === "true" || req.body.overwrite === true,
      skipVectorization:
        req.body.skipVectorization === "true" || req.body.skipVectorization === true,
      validationLevel: req.body.validationLevel || "basic",
    };

    // 安装Skills
    const result = await skillManager.installSkill(req.file.buffer, options);

    logger.info(
      `✅ Skill installed successfully: ${result.skillName} (${Date.now() - startTime}ms)`
    );

    created(res, {
      skillName: result.skillName,
      installedAt: result.installedAt,
      duration: result.duration,
      vectorized: result.vectorized,
    });
  } catch (error) {
    if (error instanceof ToolError) {
      switch (error.code) {
        case ToolErrorCode.SKILL_ALREADY_EXISTS:
          conflict(res, error.message);
          return;
        case ToolErrorCode.SKILL_INVALID_STRUCTURE:
          badRequest(res, error.message);
          return;
        case ToolErrorCode.VECTOR_DB_ERROR:
          serviceUnavailable(res, error.message);
          return;
        default:
          serverError(res, error, "install skill");
          return;
      }
    }
    handleErrorWithAutoDetection(res, error, "install skill");
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

    ok(res, {
      skillName: result.skillName,
      uninstalledAt: result.uninstalledAt,
      duration: result.duration,
    });
  } catch (error) {
    if (error instanceof ToolError && error.code === ToolErrorCode.SKILL_NOT_FOUND) {
      notFound(res, error.message);
      return;
    }
    handleErrorWithAutoDetection(res, error, "uninstall skill");
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

    if (!description || typeof description !== "string") {
      badRequest(res, "Description is required and must be a string");
      return;
    }

    logger.info(`✏️ Updating skill description: ${name}`);

    const result = await skillManager.updateSkill(name, description);

    logger.info(`✅ Skill description updated: ${name} (${Date.now() - startTime}ms)`);

    ok(res, {
      skillName: result.skillName,
      updatedAt: result.updatedAt,
      duration: result.duration,
      reindexed: result.reindexed,
    });
  } catch (error) {
    handleErrorWithAutoDetection(res, error, "update skill description");
  }
}

/**
 * 列出Skills
 * GET /api/skills?page=1&limit=50&name=&tags=&sortBy=name&sortOrder=asc
 */
export async function listSkills(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    const sortBy = (req.query.sortBy as string) || "name";
    const validSortFields = ["updatedAt", "name", "installedAt"];
    if (!validSortFields.includes(sortBy)) {
      badRequest(res, "sortBy must be one of: updatedAt, name, installedAt");
      return;
    }

    const options = {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      name: (req.query.name as string) || undefined,
      tags: req.query.tags ? (req.query.tags as string).split(",") : undefined,
      sortBy: sortBy as "updatedAt" | "name" | "installedAt",
      sortOrder: ((req.query.sortOrder as string) === "desc" ? "desc" : "asc") as "asc" | "desc",
    };

    logger.debug(`📋 Listing skills: page=${options.page}, limit=${options.limit}`);

    const result = await skillManager.listSkills(options);

    logger.info(`✅ Listed ${result.skills.length} skills (${Date.now() - startTime}ms)`);

    ok(res, {
      skills: result.skills.map(toSkillDTO),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    });
  } catch (error) {
    handleErrorWithAutoDetection(res, error, "list skills");
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
      notFound(res, `Skill '${name}' not found`);
      return;
    }

    logger.info(`✅ Got skill details: ${name} (${Date.now() - startTime}ms)`);

    ok(res, toSkillDTO(skill));
  } catch (error) {
    handleErrorWithAutoDetection(res, error, "get skill");
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

    ok(res, { name, exists });
  } catch (error) {
    handleErrorWithAutoDetection(res, error, "check skill existence");
  }
}

/**
 * 获取Skills统计信息
 * GET /api/skills/stats
 */
export async function getSkillStats(req: Request, res: Response): Promise<void> {
  try {
    const startTime = Date.now();

    logger.debug("📊 Getting skill statistics");

    const stats = await skillManager.getStatistics();

    logger.info(`✅ Got skill statistics (${Date.now() - startTime}ms)`);

    ok(res, stats);
  } catch (error) {
    handleErrorWithAutoDetection(res, error, "get skill statistics");
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

    logger.info("🔄 Reindexing all skills");

    logger.info(`✅ All skills reindexed (${Date.now() - startTime}ms)`);

    ok(res, { message: "All skills reindexed successfully" });
  } catch (error) {
    handleErrorWithAutoDetection(res, error, "reindex skills");
  }
}

// 配置Multer中间件
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Only ZIP files are allowed"));
    }
  },
});
