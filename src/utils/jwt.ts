/**
 * JWT 工具类
 * 用于管理员认证的 JWT token 生成和验证
 */

import * as crypto from "crypto";
import { logger } from "./logger";
import { ConfigService } from "../services/ConfigService";

export interface JWTPayload {
  username: string;
  iat: number; // issued at
  exp: number; // expiration time
}

export interface JWTConfig {
  secret: string;
  expiresIn: number; // seconds
  algorithm?: "HS256" | "HS384" | "HS512";
}

// 默认配置
const DEFAULT_EXPIRES_IN = 7 * 24 * 60 * 60; // 7天
const DEFAULT_ALGORITHM = "HS256";

/**
 * Base64 URL 安全编码（JWT标准）
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Base64 URL 安全解码
 */
function base64UrlDecode(str: string): string {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (str.length % 4)) % 4;
  str += "=".repeat(padding);
  return Buffer.from(str, "base64").toString("utf-8");
}

/**
 * 创建 HMAC 签名
 */
function createSignature(
  header: string,
  payload: string,
  secret: string,
  algorithm: string
): string {
  const signature = crypto
    .createHmac(algorithm.replace("HS", "sha"), secret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return signature;
}

/**
 * 验证 HMAC 签名
 */
function verifySignature(
  header: string,
  payload: string,
  signature: string,
  secret: string,
  algorithm: string
): boolean {
  const expectedSignature = createSignature(header, payload, secret, algorithm);
  // 使用常量时间比较防止时序攻击
  if (signature.length !== expectedSignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
}

/**
 * 生成 JWT token
 */
export function generateJWT(payload: Omit<JWTPayload, "iat" | "exp">, config: JWTConfig): string {
  const algorithm = config.algorithm || DEFAULT_ALGORITHM;
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (config.expiresIn || DEFAULT_EXPIRES_IN);

  const jwtPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: expiresAt,
  };

  // Header
  const header = {
    alg: algorithm,
    typ: "JWT",
  };

  // 编码
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(jwtPayload));

  // 签名
  const signature = createSignature(encodedHeader, encodedPayload, config.secret, algorithm);

  // 组合成 JWT
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * 验证 JWT token
 */
export function verifyJWT(
  token: string,
  config: JWTConfig
): { valid: boolean; payload?: JWTPayload; error?: string } {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid token format" };
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // 解码 header
    const header = JSON.parse(base64UrlDecode(encodedHeader));

    // 验证算法
    const algorithm = header.alg || DEFAULT_ALGORITHM;
    if (algorithm !== (config.algorithm || DEFAULT_ALGORITHM)) {
      return { valid: false, error: "Invalid algorithm" };
    }

    // 验证签名
    const isValidSignature = verifySignature(
      encodedHeader,
      encodedPayload,
      signature,
      config.secret,
      algorithm
    );

    if (!isValidSignature) {
      return { valid: false, error: "Invalid signature" };
    }

    // 解码 payload
    const payload: JWTPayload = JSON.parse(base64UrlDecode(encodedPayload));

    // 验证过期时间
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, payload };
  } catch (error: any) {
    logger.debug("JWT verification error:", error.message);
    return { valid: false, error: error.message || "Invalid token" };
  }
}

/**
 * 获取或生成 JWT 密钥
 * 从配置中读取，如果没有则生成并保存
 */
export function getOrGenerateJWTSecret(configService: ConfigService): string {
  const config = configService.readConfig();

  // 检查配置中是否已有 JWT secret（使用扁平结构：auth.jwtSecret）
  if (config.auth?.jwtSecret) {
    return config.auth.jwtSecret;
  }

  // 生成新的密钥（32字节，base64编码）
  const secret = crypto.randomBytes(32).toString("base64");

  // 保存到配置（使用扁平结构）
  configService.updateConfig({
    auth: {
      ...config.auth,
      jwtSecret: secret,
      jwtExpiresIn: `${DEFAULT_EXPIRES_IN}s`, // 转换为字符串格式（如 "604800s"）
    },
  });

  logger.info("✅ Generated new JWT secret");
  return secret;
}

/**
 * 获取 JWT 配置
 */
export function getJWTConfig(configService: ConfigService): JWTConfig {
  const config = configService.readConfig();
  const secret = config.auth?.jwtSecret || getOrGenerateJWTSecret(configService);

  // 解析 jwtExpiresIn（可能是 "7d", "24h", "604800s" 等格式）
  let expiresIn = DEFAULT_EXPIRES_IN;
  if (config.auth?.jwtExpiresIn) {
    const expiresInStr = config.auth.jwtExpiresIn;
    // 尝试解析字符串格式（如 "7d", "24h", "604800s"）
    const match = expiresInStr.match(/^(\d+)([dhms])?$/);
    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2] || "s";
      switch (unit) {
        case "d":
          expiresIn = value * 24 * 60 * 60;
          break;
        case "h":
          expiresIn = value * 60 * 60;
          break;
        case "m":
          expiresIn = value * 60;
          break;
        case "s":
        default:
          expiresIn = value;
          break;
      }
    } else {
      // 如果不是字符串格式，尝试直接解析为数字
      const parsed = parseInt(expiresInStr, 10);
      if (!isNaN(parsed)) {
        expiresIn = parsed;
      }
    }
  }

  return {
    secret,
    expiresIn,
    algorithm: DEFAULT_ALGORITHM, // 算法固定为 HS256，配置中不再存储
  };
}
