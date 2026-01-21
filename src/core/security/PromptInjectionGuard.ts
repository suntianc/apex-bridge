/**
 * ApexBridge - 提示注入防护
 * 提供全面的提示注入攻击检测和防护功能
 */

import { logger } from "../../utils/logger";

/**
 * 注入防护配置选项
 */
export interface InjectionGuardOptions {
  /** 是否启用直接注入检测 */
  enableDirectDetection?: boolean;
  /** 是否启用间接注入检测 */
  enableIndirectDetection?: boolean;
  /** 是否启用越狱检测 */
  enableJailbreakDetection?: boolean;
  /** 是否启用XML注入检测 */
  enableXmlDetection?: boolean;
  /** 是否自动清理检测到的注入内容 */
  autoSanitize?: boolean;
  /** 风险等级阈值 (low/medium/high/critical) */
  riskThreshold?: "low" | "medium" | "high" | "critical";
}

/**
 * 检测到的注入模式
 */
export interface DetectedPattern {
  /** 注入类型 */
  type: "direct" | "jailbreak" | "xml" | "indirect" | "obfuscation";
  /** 匹配的 pattern */
  pattern: string;
  /** 在内容中的位置 */
  position: number;
  /** 严重程度 */
  severity: "low" | "medium" | "high" | "critical";
}

/**
 * 注入检测结果
 */
export interface InjectionDetectionResult {
  /** 是否清洁 (无检测到注入) */
  isClean: boolean;
  /** 风险等级 */
  riskLevel: "low" | "medium" | "high" | "critical";
  /** 检测到的 pattern 列表 */
  detectedPatterns: DetectedPattern[];
  /** 清理后的内容 (如果启用自动清理) */
  sanitizedContent?: string;
}

/**
 * 提示注入防护类
 *
 * 提供多种注入攻击的检测和防护:
 * - 直接注入: 覆盖系统指令
 * - 间接注入: 通过变量、模板注入
 * - 越狱攻击: 绕过安全限制
 * - XML注入: 利用XML解析漏洞
 */
export class PromptInjectionGuard {
  /** 单例实例 */
  private static instance: PromptInjectionGuard;

  /** 配置选项 */
  private options: Required<InjectionGuardOptions>;

  /** 缓存的检测结果 */
  private resultCache: Map<string, InjectionDetectionResult> = new Map();

  /** 最大缓存大小 */
  private readonly MAX_CACHE_SIZE = 1000;

  // ========================================
  // 直接注入 patterns - SQL, Code, Shell
  // ========================================

  /** 直接注入 patterns - SQL 注入 */
  private readonly DIRECT_PATTERNS: Array<{
    regex: RegExp;
    severity: "low" | "medium" | "high" | "critical";
  }> = [
    // SQL 注入 patterns
    {
      regex: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b)/gi,
      severity: "high" as const,
    },
    {
      regex:
        /(\b(UNION|SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\b.*\b(ALL|DISTINCT|INTO|FROM|WHERE)\b)/gi,
      severity: "high" as const,
    },
    {
      regex: /(\'\ OR \'1\'=\'1)|(\"\ OR \"1\"=\"1)|(\'\ OR 1=1)|(\" OR 1=1)/gi,
      severity: "critical" as const,
    },
    { regex: /(\-\-|\#|\/\*|\*\/)/g, severity: "high" as const }, // SQL 注释
    { regex: /(EXEC|EXECUTE)\s*\(/gi, severity: "critical" as const }, // SQL Server 执行
    { regex: /(xp_cmdshell|xp_)/gi, severity: "critical" as const }, // SQL Server 危险扩展
    { regex: /(LOAD_FILE|INTO OUTFILE|INTO DUMPFILE)/gi, severity: "critical" as const }, // 文件操作
    { regex: /(\w+)\s*=\s*(\w+)\s*OR\s*(\w+)\s*=\s*(\w+)/gi, severity: "medium" as const }, // OR 条件注入
    { regex: /(\'\;.*)/g, severity: "high" as const }, // 分号注入
    { regex: /(SLEEP\(|BENCHMARK\()/gi, severity: "high" as const }, // 时间盲注

    // 代码注入 patterns
    {
      regex: /(eval|exec|system|popen|shell_exec|passthru|proc_open|popen)\s*\(/gi,
      severity: "critical" as const,
    },
    {
      regex: /(require|include|require_once|include_once)\s*[\(\'\"]/gi,
      severity: "high" as const,
    },
    { regex: /\$_(GET|POST|REQUEST|SERVER|FILES|ENV)/g, severity: "medium" as const }, // 全局变量访问
    { regex: /(document\.|window\.|location\.|navigator\.)/gi, severity: "medium" as const }, // DOM 访问
    { regex: /(\.innerHTML|\.outerHTML|\.innerText|\.outerText)/g, severity: "high" as const }, // DOM 注入
    { regex: /(<script|javascript:|vbscript:|data:)/gi, severity: "critical" as const }, // XSS
    { regex: /(\bon\w+\s*=|expression\()/gi, severity: "critical" as const }, // 事件处理器
    { regex: /(<iframe|<object|<embed|<link)/gi, severity: "high" as const }, // 嵌入元素
    { regex: /(\$\$|\$GLOBALS|\$HTTP_RAW_POST_DATA)/g, severity: "high" as const }, // PHP 全局变量

    // Shell 命令 patterns
    {
      regex: /(\b(rm|cp|mv|chmod|chown|mkdir|rmdir|tar|gzip|bzip2|zip|unzip)\b)/gi,
      severity: "high" as const,
    },
    { regex: /(\||;|&|\$\(|\`)/g, severity: "high" as const }, // Shell 元字符
    { regex: /(sudo|su|passwd|shadow|etc\/passwd|etc\/shadow)/gi, severity: "critical" as const }, // 提权尝试
    { regex: /(\/etc\/|\/var\/log\/|\/root\/.ssh\/)/gi, severity: "high" as const }, // 敏感路径
    { regex: /\.\.\/|\.\.\\/g, severity: "medium" as const }, // 路径遍历
    { regex: /(%2e%2e|\.\.%2f|\.%2e\/)/gi, severity: "medium" as const }, // URL 编码遍历
    { regex: /(\/proc\/|\/sys\/|\/dev\/)/gi, severity: "high" as const }, // Linux 敏感路径
    { regex: /win\.ini|boot\.ini|autoexec\.bat/gi, severity: "high" as const }, // Windows 敏感文件

    // XML/HTML 注入 patterns
    { regex: /<!DOCTYPE/gi, severity: "medium" as const },
    { regex: /<svg/gi, severity: "high" as const },
    { regex: /<math/gi, severity: "high" as const },
    // 控制字符检测 patterns 移到 CONTROL_CHAR_PATTERNS
  ];

  // 控制字符检测 patterns - 移到独立数组避免 ESLint 解析问题
  private readonly CONTROL_CHAR_PATTERNS: Array<{
    regex: RegExp;
    severity: "low" | "medium" | "high" | "critical";
  }> = [
    // eslint-disable-next-line no-control-regex
    { regex: /\u0000/g, severity: "critical" as const },
    // eslint-disable-next-line no-control-regex
    { regex: /%00/g, severity: "critical" as const }, // URL-encoded null byte
    // eslint-disable-next-line no-control-regex
    { regex: /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, severity: "high" as const },
    { regex: /[\u200B-\u200D\u2060\uFEFF]/g, severity: "medium" as const }, // Zero-width characters
  ];

  // ========================================
  // 编译的正则表达式 patterns - Jailbreak
  // ========================================

  /** 越狱攻击 patterns */
  private readonly JAILBREAK_PATTERNS = [
    { regex: /\bDAN\b/gi, severity: "critical" as const },
    { regex: /do\s+anything\s+now/gi, severity: "critical" as const },
    { regex: /jailbreak/gi, severity: "critical" as const },
    { regex: /roleplay\s+as/gi, severity: "high" as const },
    { regex: /developer\s+mode/gi, severity: "high" as const },
    { regex: /ignore\s+safety/gi, severity: "critical" as const },
    { regex: /unrestricted\s+mode/gi, severity: "critical" as const },
    { regex: /evil\s+(?:mode|bot)/gi, severity: "critical" as const },
    { regex: /no\s+(?:ethics|rules|limits)/gi, severity: "critical" as const },
    { regex: /ignore\s+(?:all\s+)?(?:previous\s+)?instructions/gi, severity: "critical" as const },
    {
      regex: /forget\s+all\s+(?:previous\s+)?(?:instructions|rules)/gi,
      severity: "critical" as const,
    },
    { regex: /you\s+are\s+now\s+(?:a\s+)?/gi, severity: "critical" as const },
    {
      regex: /bypass\s+(?:your\s+)?(?:safety|guidelines|restrictions)/gi,
      severity: "critical" as const,
    },
    { regex: /new\s+instructions\s+(?:from\s+(?:user|me|the))/gi, severity: "high" as const },
    { regex: /act\s+as\s+if\s+you\s+were\s+(?:a\s+)?/gi, severity: "high" as const },
    { regex: /ignore\s+all\s+(?:content|guidelines)/gi, severity: "critical" as const },
    { regex: /evil\s+version/gi, severity: "critical" as const },
    { regex: /hypothetical\s+(?:scenario|response)/gi, severity: "medium" as const },
    { regex: /what\s+if\s+(?:you\s+)?(?:could|might)/gi, severity: "medium" as const },
    { regex: /play\s+the\s+role\s+of/gi, severity: "high" as const },
    { regex: /assume\s+the\s+role\s+of/gi, severity: "high" as const },
  ];

  // ========================================
  // 编译的正则表达式 patterns - XML Injection
  // ========================================

  /** XML/HTML 注入 patterns */
  private readonly XML_PATTERNS = [
    { regex: /<!--/g, severity: "medium" as const },
    { regex: /-->/g, severity: "medium" as const },
    { regex: /<\?/g, severity: "medium" as const },
    { regex: /\?>/g, severity: "medium" as const },
    { regex: /\]\]\>/g, severity: "medium" as const },
    { regex: /<script/gi, severity: "critical" as const },
    { regex: /<\/script>/gi, severity: "critical" as const },
    { regex: /<iframe/gi, severity: "critical" as const },
    { regex: /<\/iframe>/gi, severity: "critical" as const },
    { regex: /<object/gi, severity: "critical" as const },
    { regex: /<\/object>/gi, severity: "critical" as const },
    { regex: /<embed/gi, severity: "critical" as const },
    { regex: /<link/gi, severity: "medium" as const },
    { regex: /<style/gi, severity: "medium" as const },
    { regex: /<!\[CDATA\[/g, severity: "medium" as const },
    { regex: /<!DOCTYPE/gi, severity: "medium" as const },
    { regex: /<svg/gi, severity: "high" as const },
    { regex: /<math/gi, severity: "high" as const },
    // 控制字符检测使用 CONTROL_CHAR_PATTERNS
  ];

  // ========================================
  // 编译的正则表达式 patterns - Indirect Injection
  // ========================================

  /** 间接注入 patterns - 变量和模板 */
  private readonly INDIRECT_PATTERNS = [
    { regex: /\{\{[^}]+\}\}/g, severity: "medium" as const }, // {{variable}}
    { regex: /\$\{[^}]+\}/g, severity: "medium" as const }, // ${variable}
    { regex: /#\{[^}]+\}/g, severity: "medium" as const }, // #{variable}
    { regex: /<%[^%]+%>/g, severity: "medium" as const }, // <%template%>
    { regex: /\$\([^)]+\)/g, severity: "high" as const }, // $(command)
    { regex: /`[^`]+`/g, severity: "medium" as const }, // Backtick command substitution
    { regex: /\|[a-zA-Z]+(\|[a-zA-Z]+)*/g, severity: "medium" as const }, // Shell pipe chains
    { regex: /;&amp;|\|;|&amp;&amp;/g, severity: "high" as const }, // Command chaining
    { regex: /\$[a-zA-Z_][a-zA-Z0-9_]*/g, severity: "low" as const }, // $variable
    { regex: /%[a-zA-Z_][a-zA-Z0-9_]*/g, severity: "low" as const }, // %variable%
  ];

  /**
   * 私有构造函数 - 单例模式
   */
  private constructor(options?: InjectionGuardOptions) {
    this.options = {
      enableDirectDetection: options?.enableDirectDetection ?? true,
      enableIndirectDetection: options?.enableIndirectDetection ?? true,
      enableJailbreakDetection: options?.enableJailbreakDetection ?? true,
      enableXmlDetection: options?.enableXmlDetection ?? true,
      autoSanitize: options?.autoSanitize ?? false,
      riskThreshold: options?.riskThreshold ?? "medium",
    };
  }

  /**
   * 获取单例实例
   */
  static getInstance(options?: InjectionGuardOptions): PromptInjectionGuard {
    if (!PromptInjectionGuard.instance) {
      PromptInjectionGuard.instance = new PromptInjectionGuard(options);
    }
    return PromptInjectionGuard.instance;
  }

  /**
   * 重置单例实例（仅用于测试）
   */
  static resetInstance(): void {
    PromptInjectionGuard.instance = undefined as any;
  }

  /**
   * 主要检测方法 - 综合分析内容
   *
   * @param content - 要检测的内容
   * @returns 检测结果
   */
  detect(content: string): InjectionDetectionResult {
    if (!content || typeof content !== "string") {
      return {
        isClean: true,
        riskLevel: "low",
        detectedPatterns: [],
      };
    }

    // 检查缓存
    const cacheKey = this.hashContent(content);
    if (this.resultCache.has(cacheKey)) {
      return this.resultCache.get(cacheKey)!;
    }

    const detectedPatterns: DetectedPattern[] = [];

    // 根据配置执行检测
    if (this.options.enableDirectDetection) {
      detectedPatterns.push(...this.scanDirectInjection(content));
    }

    if (this.options.enableJailbreakDetection) {
      detectedPatterns.push(...this.scanJailbreak(content));
    }

    if (this.options.enableXmlDetection) {
      detectedPatterns.push(...this.scanXmlInjection(content));
    }

    if (this.options.enableIndirectDetection) {
      detectedPatterns.push(...this.scanIndirectInjection(content));
    }

    // 计算风险等级
    const riskLevel = this.calculateRiskLevel(detectedPatterns);

    // 检查是否超过阈值
    const isClean = riskLevel === "low" || this.isRiskLevelBelowThreshold(riskLevel);

    // 生成结果
    const result: InjectionDetectionResult = {
      isClean,
      riskLevel,
      detectedPatterns,
    };

    // 如果启用自动清理，生成清理后的内容
    if (this.options.autoSanitize && !isClean) {
      result.sanitizedContent = this.sanitize(content);
    }

    // 记录警告日志
    if (!isClean) {
      logger.warn(
        `[PromptInjectionGuard] 检测到 ${detectedPatterns.length} 个注入 pattern，风险等级: ${riskLevel}`
      );
    }

    // 维护缓存
    this.maintainCache(cacheKey, result);

    return result;
  }

  /**
   * 检测直接注入
   *
   * @param content - 要检测的内容
   * @returns 是否检测到直接注入
   */
  detectDirectInjection(content: string): boolean {
    const patterns = this.scanDirectInjection(content);
    return patterns.length > 0;
  }

  /**
   * 检测间接注入
   *
   * @param content - 要检测的内容
   * @returns 是否检测到间接注入
   */
  detectIndirectInjection(content: string): boolean {
    const patterns = this.scanIndirectInjection(content);
    return patterns.length > 0;
  }

  /**
   * 检测越狱攻击
   *
   * @param content - 要检测的内容
   * @returns 是否检测到越狱攻击
   */
  detectJailbreak(content: string): boolean {
    const patterns = this.scanJailbreak(content);
    return patterns.length > 0;
  }

  /**
   * 检测XML注入
   *
   * @param content - 要检测的内容
   * @returns 是否检测到XML注入
   */
  detectXmlInjection(content: string): boolean {
    const patterns = this.scanXmlInjection(content);
    return patterns.length > 0;
  }

  /**
   * 清理注入内容
   *
   * @param content - 要清理的内容
   * @returns 清理后的内容
   */
  sanitize(content: string): string {
    if (!content || typeof content !== "string") {
      return content;
    }

    let sanitized = content;

    // 移除 XML/HTML 注入
    for (const pattern of this.XML_PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, "");
    }

    // 移除直接注入 pattern
    for (const pattern of this.DIRECT_PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, "");
    }

    // 移除越狱 pattern
    for (const pattern of this.JAILBREAK_PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, "");
    }

    // 移除间接注入 pattern (变量替换)
    for (const pattern of this.INDIRECT_PATTERNS) {
      sanitized = sanitized.replace(pattern.regex, "[REDACTED]");
    }

    // 清理 null 字节和控制字符
    sanitized = sanitized.replace(
      // eslint-disable-next-line no-control-regex
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B-\u200D\u2060\uFEFF]/g,
      ""
    );

    // 规范化空白
    sanitized = sanitized.replace(/\s+/g, " ").trim();

    return sanitized;
  }

  /**
   * 获取检测结果 - 是否清洁
   */
  get isClean(): boolean {
    return this.detectedPatterns.length === 0;
  }

  /**
   * 获取最后检测的风险等级
   */
  get riskLevel(): "low" | "medium" | "high" | "critical" {
    return this.lastRiskLevel;
  }

  // ========================================
  // 私有方法
  // ========================================

  /**
   * 扫描直接注入
   */
  private scanDirectInjection(content: string): DetectedPattern[] {
    const results: DetectedPattern[] = [];

    for (const { regex, severity } of this.DIRECT_PATTERNS) {
      let match: RegExpExecArray | null;

      // Reset regex state
      regex.lastIndex = 0;

      while ((match = regex.exec(content)) !== null) {
        results.push({
          type: "direct",
          pattern: match[0],
          position: match.index,
          severity,
        });

        // 防止无限循环
        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return results;
  }

  /**
   * 扫描越狱攻击
   */
  private scanJailbreak(content: string): DetectedPattern[] {
    const results: DetectedPattern[] = [];

    for (const { regex, severity } of this.JAILBREAK_PATTERNS) {
      let match: RegExpExecArray | null;

      regex.lastIndex = 0;

      while ((match = regex.exec(content)) !== null) {
        results.push({
          type: "jailbreak",
          pattern: match[0],
          position: match.index,
          severity,
        });

        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return results;
  }

  /**
   * 扫描XML注入
   */
  private scanXmlInjection(content: string): DetectedPattern[] {
    const results: DetectedPattern[] = [];

    for (const { regex, severity } of this.XML_PATTERNS) {
      let match: RegExpExecArray | null;

      regex.lastIndex = 0;

      while ((match = regex.exec(content)) !== null) {
        results.push({
          type: "xml",
          pattern: match[0],
          position: match.index,
          severity,
        });

        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    // Also scan for control characters when XML detection is enabled
    for (const { regex, severity } of this.CONTROL_CHAR_PATTERNS) {
      let match: RegExpExecArray | null;

      regex.lastIndex = 0;

      while ((match = regex.exec(content)) !== null) {
        results.push({
          type: "xml",
          pattern: match[0],
          position: match.index,
          severity,
        });

        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return results;
  }

  /**
   * 扫描间接注入
   */
  private scanIndirectInjection(content: string): DetectedPattern[] {
    const results: DetectedPattern[] = [];

    for (const { regex, severity } of this.INDIRECT_PATTERNS) {
      let match: RegExpExecArray | null;

      regex.lastIndex = 0;

      while ((match = regex.exec(content)) !== null) {
        results.push({
          type: "indirect",
          pattern: match[0],
          position: match.index,
          severity,
        });

        if (match.index === regex.lastIndex) {
          regex.lastIndex++;
        }
      }
    }

    return results;
  }

  /**
   * 计算风险等级
   */
  private calculateRiskLevel(patterns: DetectedPattern[]): "low" | "medium" | "high" | "critical" {
    if (patterns.length === 0) {
      return "low";
    }

    // 统计各严重程度的数量
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };

    for (const pattern of patterns) {
      counts[pattern.severity]++;
    }

    // 关键逻辑: 任何 critical 都提升到 critical
    if (counts.critical > 0) {
      return "critical";
    }

    // 多个 high 也提升到 critical
    if (counts.high >= 2) {
      return "critical";
    }

    // 至少一个 high
    if (counts.high === 1) {
      return "high";
    }

    // 多个 medium
    if (counts.medium >= 3) {
      return "high";
    }

    // 至少一个 medium
    if (counts.medium > 0) {
      return "medium";
    }

    // 只有 low
    return "low";
  }

  /**
   * 检查风险等级是否低于阈值
   */
  private isRiskLevelBelowThreshold(level: "low" | "medium" | "high" | "critical"): boolean {
    const levels = ["low", "medium", "high", "critical"];
    const levelIndex = levels.indexOf(level);
    const thresholdIndex = levels.indexOf(this.options.riskThreshold);

    return levelIndex < thresholdIndex;
  }

  /**
   * 计算内容的 hash (用于缓存)
   */
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * 维护缓存
   */
  private maintainCache(key: string, result: InjectionDetectionResult): void {
    if (this.resultCache.size >= this.MAX_CACHE_SIZE) {
      // 清理最老的 10% 缓存
      const keysToDelete = Array.from(this.resultCache.keys()).slice(
        0,
        Math.floor(this.MAX_CACHE_SIZE * 0.1)
      );
      for (const k of keysToDelete) {
        this.resultCache.delete(k);
      }
    }
    this.resultCache.set(key, result);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.resultCache.clear();
  }

  /**
   * 更新配置
   */
  updateOptions(options: Partial<InjectionGuardOptions>): void {
    this.options = {
      ...this.options,
      ...options,
    };
    this.clearCache();
  }

  // ========================================
  // 临时存储检测结果 (供 isClean 和 riskLevel 使用)
  // ========================================

  private detectedPatterns: DetectedPattern[] = [];
  private lastRiskLevel: "low" | "medium" | "high" | "critical" = "low";
}

export default PromptInjectionGuard.getInstance();
