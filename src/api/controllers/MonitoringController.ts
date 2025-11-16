import { Request, Response } from 'express';
import { ProductionMonitor } from '../../core/skills/ProductionMonitor';
import logger from '../../utils/logger';

/**
 * 监控控制器
 * 
 * 提供监控数据的API接口
 */
export class MonitoringController {
  constructor(private readonly monitor: ProductionMonitor) {}

  /**
   * 获取当前监控指标
   * GET /api/monitoring/metrics
   */
  getMetrics(req: Request, res: Response): void {
    try {
      const metrics = this.monitor.getCurrentMetrics();
      if (!metrics) {
        res.status(503).json({
          success: false,
          error: '监控数据不可用'
        });
        return;
      }

      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      logger.error('[MonitoringController] 获取指标失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取指标历史
   * GET /api/monitoring/metrics/history?limit=100
   */
  getMetricsHistory(req: Request, res: Response): void {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const history = this.monitor.getMetricsHistory(limit);

      res.json({
        success: true,
        data: {
          count: history.length,
          metrics: history
        }
      });
    } catch (error) {
      logger.error('[MonitoringController] 获取指标历史失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取健康状态
   * GET /api/monitoring/health
   */
  getHealth(req: Request, res: Response): void {
    try {
      const health = this.monitor.getHealthStatus();

      const statusCode = health.status === 'healthy' ? 200
        : health.status === 'degraded' ? 200
        : 503;

      res.status(statusCode).json({
        success: health.status !== 'unhealthy',
        data: health
      });
    } catch (error) {
      logger.error('[MonitoringController] 获取健康状态失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取活跃告警
   * GET /api/monitoring/alerts/active
   */
  getActiveAlerts(req: Request, res: Response): void {
    try {
      const alerts = this.monitor.getActiveAlerts();

      res.json({
        success: true,
        data: {
          count: alerts.length,
          alerts
        }
      });
    } catch (error) {
      logger.error('[MonitoringController] 获取活跃告警失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取所有告警
   * GET /api/monitoring/alerts?limit=100
   */
  getAllAlerts(req: Request, res: Response): void {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 100;
      const alerts = this.monitor.getAllAlerts(limit);

      res.json({
        success: true,
        data: {
          count: alerts.length,
          alerts
        }
      });
    } catch (error) {
      logger.error('[MonitoringController] 获取告警失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取监控配置
   * GET /api/monitoring/config
   */
  getConfig(req: Request, res: Response): void {
    try {
      const config = this.monitor.getConfig();

      res.json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('[MonitoringController] 获取配置失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 更新监控配置
   * PUT /api/monitoring/config
   */
  updateConfig(req: Request, res: Response): void {
    try {
      const updates = req.body;
      this.monitor.updateConfig(updates);

      res.json({
        success: true,
        message: '配置已更新'
      });
    } catch (error) {
      logger.error('[MonitoringController] 更新配置失败:', error);
      res.status(500).json({
        success: false,
        error: (error as Error).message
      });
    }
  }

  /**
   * 获取路由
   */
  getRouter() {
    const express = require('express');
    const router = express.Router();

    router.get('/metrics', (req: Request, res: Response) => this.getMetrics(req, res));
    router.get('/metrics/history', (req: Request, res: Response) => this.getMetricsHistory(req, res));
    router.get('/health', (req: Request, res: Response) => this.getHealth(req, res));
    router.get('/alerts/active', (req: Request, res: Response) => this.getActiveAlerts(req, res));
    router.get('/alerts', (req: Request, res: Response) => this.getAllAlerts(req, res));
    router.get('/config', (req: Request, res: Response) => this.getConfig(req, res));
    router.put('/config', (req: Request, res: Response) => this.updateConfig(req, res));

    return router;
  }
}

