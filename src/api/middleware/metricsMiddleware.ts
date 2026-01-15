/**
 * Metrics Middleware
 *
 * 自动收集 HTTP 请求指标
 */

import { Request, Response, NextFunction } from "express";
import { metricsService } from "../../services/monitoring/MetricsService";

export function createMetricsMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    // 记录响应完成
    res.on("finish", () => {
      const duration = Date.now() - startTime;
      metricsService.recordRequest(req.method, req.path, res.statusCode, duration);
      metricsService.completeRequest();
    });

    next();
  };
}
