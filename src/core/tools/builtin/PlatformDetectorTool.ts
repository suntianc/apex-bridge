/**
 * PlatformDetectorTool - 平台检测内置工具
 * 检测操作系统、Node.js版本、硬件架构等信息
 */

import { ToolResult, BuiltInTool, ToolType } from "../../../types/tool-system";
import * as os from "os";

/**
 * PlatformDetectorTool参数接口
 */
export interface PlatformDetectorArgs {
  // 无参数，工具自动检测所有信息
}

/**
 * 平台信息接口
 */
export interface PlatformInfo {
  os: {
    platform: string;
    type: string;
    release: string;
    arch: string;
    uptime: number;
    hostname: string;
    homedir: string;
    tmpdir: string;
  };
  node: {
    version: string;
    v8Version: string;
    uvVersion: string;
    zlibVersion: string;
    aresVersion: string;
  };
  system: {
    cpus: number;
    cpuModel: string;
    memory: {
      total: number;
      free: number;
      used: number;
      usagePercent: number;
    };
    loadAverage: number[];
  };
  network: {
    interfaces: Record<string, os.NetworkInterfaceInfo[]>;
  };
}

/**
 * 平台检测工具
 * 提供详细的系统环境信息
 */
export class PlatformDetectorTool {
  /**
   * 执行平台检测
   * @param args 检测参数
   * @returns 检测结果
   */
  static async execute(args: PlatformDetectorArgs): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      logger.debug("Detecting platform information...");

      // 收集平台信息
      const platformInfo = await this.collectPlatformInfo();

      const duration = Date.now() - startTime;

      // 格式化输出
      const formattedOutput = this.formatPlatformInfo(platformInfo);

      return {
        success: true,
        output: formattedOutput,
        duration,
        exitCode: 0,
      };
    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error("Platform detection failed:", error);

      return {
        success: false,
        error: `Platform detection failed: ${this.formatError(error)}`,
        duration,
        errorCode: "PLATFORM_DETECTION_ERROR",
        exitCode: 1,
      };
    }
  }

  /**
   * 收集平台信息
   */
  private static async collectPlatformInfo(): Promise<PlatformInfo> {
    const [totalMem, freeMem, cpus, networkInterfaces] = await Promise.all([
      Promise.resolve(os.totalmem()),
      Promise.resolve(os.freemem()),
      Promise.resolve(os.cpus()),
      Promise.resolve(os.networkInterfaces()),
    ]);

    const usedMem = totalMem - freeMem;
    const memoryUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);

    return {
      os: {
        platform: os.platform(),
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime(),
        hostname: os.hostname(),
        homedir: os.homedir(),
        tmpdir: os.tmpdir(),
      },
      node: {
        version: process.version,
        v8Version: process.versions.v8,
        uvVersion: process.versions.uv,
        zlibVersion: process.versions.zlib,
        aresVersion: process.versions.ares,
      },
      system: {
        cpus: cpus.length,
        cpuModel: cpus[0]?.model || "Unknown",
        memory: {
          total: totalMem,
          free: freeMem,
          used: usedMem,
          usagePercent: parseFloat(memoryUsagePercent),
        },
        loadAverage: os.loadavg(),
      },
      network: {
        interfaces: networkInterfaces,
      },
    };
  }

  /**
   * 格式化平台信息
   */
  private static formatPlatformInfo(info: PlatformInfo): string {
    let output = "Platform Detection Results\n";
    output += "=".repeat(50) + "\n\n";

    // 操作系统信息
    output += "🖥️  Operating System\n";
    output += "─".repeat(30) + "\n";
    output += `Platform: ${info.os.platform}\n`;
    output += `Type: ${info.os.type}\n`;
    output += `Release: ${info.os.release}\n`;
    output += `Architecture: ${info.os.arch}\n`;
    output += `Uptime: ${this.formatUptime(info.os.uptime)}\n`;
    output += `Hostname: ${info.os.hostname}\n`;
    output += `Home Directory: ${info.os.homedir}\n`;
    output += `Temp Directory: ${info.os.tmpdir}\n\n`;

    // Node.js信息
    output += "⬢  Node.js Runtime\n";
    output += "─".repeat(30) + "\n";
    output += `Node.js Version: ${info.node.version}\n`;
    output += `V8 Version: ${info.node.v8Version}\n`;
    output += `libuv Version: ${info.node.uvVersion}\n`;
    output += `zlib Version: ${info.node.zlibVersion}\n`;
    output += `c-ares Version: ${info.node.aresVersion}\n\n`;

    // 系统硬件信息
    output += "🔧  System Hardware\n";
    output += "─".repeat(30) + "\n";
    output += `CPU Cores: ${info.system.cpus}\n`;
    output += `CPU Model: ${info.system.cpuModel}\n`;
    output += `Memory: ${this.formatBytes(info.system.memory.total)} Total\n`;
    output += `Memory: ${this.formatBytes(info.system.memory.free)} Free\n`;
    output += `Memory: ${this.formatBytes(info.system.memory.used)} Used\n`;
    output += `Memory Usage: ${info.system.memory.usagePercent}%\n`;
    output += `Load Average (1m): ${info.system.loadAverage[0]}\n`;
    output += `Load Average (5m): ${info.system.loadAverage[1]}\n`;
    output += `Load Average (15m): ${info.system.loadAverage[2]}\n\n`;

    // 网络接口信息（可选，可能包含敏感信息）
    output += "🌐  Network Interfaces\n";
    output += "─".repeat(30) + "\n";
    output += this.formatNetworkInterfaces(info.network.interfaces);

    return output;
  }

  /**
   * 格式化正常运行时间
   */
  private static formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days} day${days > 1 ? "s" : ""}, ${hours} hour${hours !== 1 ? "s" : ""}`;
    }
    if (hours > 0) {
      return `${hours} hour${hours !== 1 ? "s" : ""}, ${minutes} minute${minutes !== 1 ? "s" : ""}`;
    }
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  /**
   * 格式化字节数
   */
  private static formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * 格式化网络接口
   */
  private static formatNetworkInterfaces(
    interfaces: Record<string, os.NetworkInterfaceInfo[]>
  ): string {
    let output = "";
    const displayedInterfaces: string[] = [];

    for (const [name, info] of Object.entries(interfaces)) {
      // 忽略一些常见但不重要的接口
      if (name.includes("docker") || name.includes("br-") || name.includes("veth")) {
        continue;
      }

      displayedInterfaces.push(name);
      output += `${name}:\n`;

      const ipv4Info = info.find((i) => {
        const family = i.family as string | number;
        return i.family === "IPv4" || family === 4;
      });
      const ipv6Info = info.find((i) => {
        const family = i.family as string | number;
        return i.family === "IPv6" || family === 6;
      });

      if (ipv4Info) {
        output += `  IPv4: ${ipv4Info.address}\n`;
      }
      if (ipv6Info) {
        output += `  IPv6: ${ipv6Info.address}\n`;
      }
    }

    if (displayedInterfaces.length === 0) {
      output += "No network interfaces detected (or only Docker/virtual interfaces)\n";
    }

    return output;
  }

  /**
   * 获取系统性能评分
   */
  private static getPerformanceScore(info: PlatformInfo): number {
    let score = 50; // 基础分

    // CPU加分
    if (info.system.cpus >= 8) score += 20;
    else if (info.system.cpus >= 4) score += 10;
    else if (info.system.cpus >= 2) score += 5;

    // 内存加分
    if (info.system.memory.total >= 16 * 1024 * 1024 * 1024)
      score += 20; // 16GB+
    else if (info.system.memory.total >= 8 * 1024 * 1024 * 1024)
      score += 10; // 8GB+
    else if (info.system.memory.total >= 4 * 1024 * 1024 * 1024) score += 5; // 4GB+

    // 负载减分
    const load1m = info.system.loadAverage[0] / info.system.cpus;
    if (load1m > 0.8) score -= 10;
    else if (load1m > 0.5) score -= 5;

    return Math.min(100, Math.max(0, score));
  }

  /**
   * 格式化错误信息
   */
  private static formatError(error: any): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown platform detection error";
  }

  /**
   * 获取工具元数据
   */
  static getMetadata() {
    return {
      name: "platform-detector",
      description:
        "Detect and provide detailed information about the current system platform, OS, Node.js runtime, hardware, and performance metrics. Useful for debugging environment issues or understanding system capabilities.",
      category: "system",
      level: 2,
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    };
  }

  /**
   * 计算搜索查询的向量嵌入（备用方法）
   */
  private static async getQueryEmbedding(query: string): Promise<number[]> {
    // 这个方法将由ToolRetrievalService实现
    // 这里只是占位符
    throw new Error("getQueryEmbedding not implemented");
  }

  /**
   * 从搜索结果中提取工具参数模式（用于动态生成工具调用）
   */
  private static extractParametersFromResults(results: any[]): string {
    if (results.length === 0) {
      return "No tools found";
    }

    const tool = results[0].tool;
    if (!tool.parameters || !tool.parameters.properties) {
      return "No parameters defined";
    }

    const params = Object.entries(tool.parameters.properties).map(
      ([name, schema]: [string, any]) => {
        const required = tool.parameters.required?.includes(name) ? " (required)" : "";
        return `    ${name}${required}: ${schema.type} - ${schema.description}`;
      }
    );

    return params.join("\n");
  }
}

// 简单的logger占位符
const logger = {
  debug: (msg: string, ...args: any[]) => console.log(`[DEBUG] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) => console.error(`[ERROR] ${msg}`, ...args),
};

/**
 * 创建PlatformDetectorTool实例（用于注册表）
 */
export function createPlatformDetectorTool() {
  return {
    ...PlatformDetectorTool.getMetadata(),
    type: ToolType.BUILTIN,
    enabled: true,
    execute: async (args: Record<string, any>) => {
      return PlatformDetectorTool.execute(args as PlatformDetectorArgs);
    },
  } as BuiltInTool;
}
