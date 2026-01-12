/**
 * ApexBridge - 简化日志系统
 */

import winston from "winston";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    let log = `[${timestamp}] ${message}`;
    if (stack) {
      log += `\n${stack}`;
    }
    return log;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "warn",
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.colorize(), logFormat),
    }),
  ],
});

// 生产环境只输出 warn 和 error
if (process.env.NODE_ENV === "production") {
  logger.level = "warn";
}

export default logger;
