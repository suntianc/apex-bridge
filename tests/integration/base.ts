/**
 * 集成测试基类
 * 提供服务器启动/停止管理和测试工具
 */

import { spawn, ChildProcess } from "child_process";
import path from "path";
import http from "http";

interface TestServerConfig {
  port?: number;
  env?: Record<string, string>;
  startupTimeout?: number;
}

interface TestServerInfo {
  baseUrl: string;
  port: number;
  process: ChildProcess;
}

/**
 * 测试服务器管理类
 */
export class TestServerManager {
  private server: ChildProcess | null = null;
  private port: number;
  private config: Required<TestServerConfig>;

  constructor(config: TestServerConfig = {}) {
    this.port = config.port || 0; // 0 表示随机端口
    this.config = {
      port: this.port,
      env: config.env || {},
      startupTimeout: config.startupTimeout || 30000,
    };
  }

  /**
   * 启动测试服务器
   */
  async start(): Promise<TestServerInfo> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Server startup timeout"));
      }, this.config.startupTimeout);

      const env = { ...process.env, ...this.config.env };
      env.NODE_ENV = "test";
      env.APEX_BRIDGE_AUTOSTART = "false";

      this.server = spawn("node", ["dist/server.js"], {
        env,
        cwd: path.resolve(__dirname, "../../"),
        stdio: ["pipe", "pipe", "pipe"],
      });

      let started = false;

      this.server.stdout?.on("data", (data) => {
        const output = data.toString();
        if (output.includes("ApexBridge running on") && !started) {
          started = true;
          clearTimeout(timeout);

          // 解析端口
          const match = output.match(/http:\/\/[^:]+:(\d+)/);
          const actualPort = match ? parseInt(match[1], 10) : this.port;

          resolve({
            baseUrl: `http://localhost:${actualPort}`,
            port: actualPort,
            process: this.server!,
          });
        }
      });

      this.server.stderr?.on("data", (data) => {
        console.error("Server error:", data.toString());
      });

      this.server.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      this.server.on("exit", (code) => {
        if (!started && code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`Server exited with code ${code}`));
        }
      });
    });
  }

  /**
   * 停止测试服务器
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.server) {
        resolve();
        return;
      }

      const cleanup = () => {
        this.server = null;
        resolve();
      };

      this.server.on("exit", cleanup);
      this.server.kill("SIGTERM");

      // 超时保护
      setTimeout(() => {
        this.server?.kill("SIGKILL");
        cleanup();
      }, 5000);
    });
  }

  /**
   * 获取服务器进程
   */
  getProcess(): ChildProcess | null {
    return this.server;
  }
}

/**
 * HTTP 请求辅助类
 */
export class HttpClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * 发送 GET 请求
   */
  async get(
    path: string,
    headers?: Record<string, string>
  ): Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: unknown;
  }> {
    return this.request("GET", path, undefined, headers);
  }

  /**
   * 发送 POST 请求
   */
  async post(
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: unknown;
  }> {
    return this.request("POST", path, body, headers);
  }

  /**
   * 发送请求
   */
  private request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<{
    status: number;
    headers: http.IncomingHttpHeaders;
    body: unknown;
  }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);

      const options: http.RequestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      };

      const req = http.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body: unknown;
          try {
            body = data ? JSON.parse(data) : undefined;
          } catch {
            body = data;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      });

      req.on("error", reject);

      if (body) {
        req.write(JSON.stringify(body));
      }

      req.end();
    });
  }
}

/**
 * 创建测试服务器的工厂函数
 */
export function createTestServer(config?: TestServerConfig): TestServerManager {
  return new TestServerManager(config);
}

/**
 * 等待服务器就绪
 */
export async function waitForServer(
  baseUrl: string,
  maxAttempts: number = 10,
  interval: number = 1000
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // 服务器还未就绪
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return false;
}
