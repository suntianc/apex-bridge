/**
 * Skills路由配置
 * 提供Skills管理的RESTful API路由
 */

import { Router } from "express";
import {
  installSkill,
  uninstallSkill,
  updateSkillDescription,
  listSkills,
  getSkill,
  checkSkillExists,
  getSkillStats,
  reindexAllSkills,
  upload,
} from "../controllers/SkillsController";

const router = Router();

/**
 * @route   POST /api/skills/install
 * @desc    安装Skills（ZIP文件上传）
 * @access  Private (需要API Key)
 * @body    { file: ZIP, overwrite?: boolean, skipVectorization?: boolean }
 */
router.post("/install", upload.single("file"), installSkill);

/**
 * @route   DELETE /api/skills/:name
 * @desc    卸载Skills
 * @access  Private (需要API Key)
 */
router.delete("/:name", uninstallSkill);

/**
 * @route   PUT /api/skills/:name/description
 * @desc    更新Skills描述
 * @access  Private (需要API Key)
 * @body    { description: string }
 */
router.put("/:name/description", updateSkillDescription);

/**
 * @route   GET /api/skills/stats
 * @desc    获取Skills统计信息
 * @access  Private (需要API Key)
 * @note    必须在 /:name 之前定义，否则 :name 会捕获 "stats"
 */
router.get("/stats", getSkillStats);

/**
 * @route   GET /api/skills
 * @desc    列出Skills（支持分页、过滤、排序）
 * @access  Private (需要API Key)
 * @query   page, limit, name, tags, sortBy, sortOrder
 */
router.get("/", listSkills);

/**
 * @route   GET /api/skills/:name
 * @desc    获取单个Skills详情
 * @access  Private (需要API Key)
 */
router.get("/:name", getSkill);

/**
 * @route   GET /api/skills/:name/exists
 * @desc    检查Skills是否存在
 * @access  Private (需要API Key)
 */
router.get("/:name/exists", checkSkillExists);

/**
 * @route   POST /api/skills/reindex
 * @desc    重新索引所有Skills（用于向量数据库重建）
 * @access  Private (需要API Key，建议仅限管理员）
 */
router.post("/reindex", reindexAllSkills);

export default router;
