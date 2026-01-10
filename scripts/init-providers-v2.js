#!/usr/bin/env node
/**
 * LLM Provider 初始化脚本 v2.0
 *
 * 功能：
 * 1. 创建完整的 SQLite 表结构（包括 ACE 层级支持）
 * 2. 初始化所有 6 个支持的 Provider 类型
 * 3. 仅插入提供商，不包含模型（模型需单独通过 API 或脚本添加）
 *
 * 特性：
 * - 幂等性：如果提供商已存在，跳过初始化
 * - 与服务器自动初始化互斥：服务器启动时会自动初始化提供商
 *
 * 使用方法：
 *   node scripts/init-providers-v2.js
 *
 * 环境变量（可选）：
 *   OPENAI_API_KEY    - OpenAI API Key
 *   DEEPSEEK_API_KEY  - DeepSeek API Key
 *   ZHIPU_API_KEY     - 智谱 AI API Key
 *   CLAUDE_API_KEY    - Anthropic Claude API Key
 *   CUSTOM_API_KEY    - Custom Provider API Key
 *
 * 注意：Ollama 为本地部署，不需要 API Key
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// ==================== 配置 ====================

const DATA_DIR = path.join(__dirname, "..", ".data");
const DB_FILENAME = "llm_providers.db";

// 所有支持的 Provider 定义（仅提供商，不包含模型）
const PROVIDERS = [
  {
    provider: "openai",
    name: "OpenAI",
    description: "OpenAI GPT 系列模型 - 功能强大，支持多模态",
    baseURL: "https://api.openai.com/v1",
    envApiKey: "OPENAI_API_KEY",
    enabled: false,
  },
  {
    provider: "deepseek",
    name: "DeepSeek",
    description: "DeepSeek AI - 高性价比聊天和代码模型",
    baseURL: "https://api.deepseek.com/v1",
    envApiKey: "DEEPSEEK_API_KEY",
    enabled: true,
  },
  {
    provider: "zhipu",
    name: "智谱 AI",
    description: "智谱清言 - 国产大模型，支持中英文",
    baseURL: "https://open.bigmodel.cn/api/paas/v4",
    envApiKey: "ZHIPU_API_KEY",
    enabled: false,
  },
  {
    provider: "claude",
    name: "Claude",
    description: "Anthropic Claude - 长上下文能力突出",
    baseURL: "https://api.anthropic.com/v1",
    envApiKey: "CLAUDE_API_KEY",
    enabled: false,
  },
  {
    provider: "ollama",
    name: "Ollama (本地)",
    description: "Ollama 本地部署 - 无需 API Key，支持自定义模型",
    baseURL: "http://localhost:11434",
    envApiKey: null,
    enabled: false,
  },
  {
    provider: "custom",
    name: "Custom (自定义)",
    description: "自定义 OpenAI 兼容 API - 用于其他兼容服务",
    baseURL: "https://api.openai.com/v1",
    envApiKey: "CUSTOM_API_KEY",
    enabled: false,
  },
];

// ==================== 辅助函数 ====================

function checkProvidersExist(db) {
  const count = db.prepare("SELECT COUNT(*) as count FROM llm_providers").get().count;
  return count > 0;
}

function getApiKey(providerInfo) {
  if (!providerInfo.envApiKey) {
    return null;
  }
  const envValue = process.env[providerInfo.envApiKey];
  if (envValue && envValue.trim() !== "" && !envValue.includes("your-")) {
    return envValue;
  }
  return `your-${providerInfo.provider}-api-key`;
}

function checkEnvVars() {
  const configured = [];
  const missing = [];

  PROVIDERS.forEach((p) => {
    if (p.envApiKey) {
      const value = process.env[p.envApiKey];
      if (value && value.trim() !== "" && !value.includes("your-")) {
        configured.push({ name: p.name, key: p.envApiKey, masked: value.substring(0, 7) + "..." });
      } else {
        missing.push({ name: p.name, key: p.envApiKey });
      }
    }
  });

  return { configured, missing };
}

function initDatabase(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS llm_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      base_config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK(enabled IN (0, 1))
    );

    CREATE TABLE IF NOT EXISTS llm_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id INTEGER NOT NULL,
      model_key TEXT NOT NULL,
      model_name TEXT NOT NULL,
      model_type TEXT NOT NULL,
      model_config TEXT NOT NULL,
      api_endpoint_suffix TEXT,
      enabled INTEGER DEFAULT 1,
      is_default INTEGER DEFAULT 0,
      is_ace_evolution INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (provider_id) REFERENCES llm_providers(id) ON DELETE CASCADE,
      UNIQUE(provider_id, model_key),
      CHECK(enabled IN (0, 1)),
      CHECK(is_default IN (0, 1)),
      CHECK(is_ace_evolution IN (0, 1))
    );

    CREATE INDEX IF NOT EXISTS idx_provider ON llm_providers(provider);
    CREATE INDEX IF NOT EXISTS idx_provider_enabled ON llm_providers(enabled);
    CREATE INDEX IF NOT EXISTS idx_model_provider ON llm_models(provider_id);
    CREATE INDEX IF NOT EXISTS idx_model_type ON llm_models(model_type);
    CREATE INDEX IF NOT EXISTS idx_model_enabled ON llm_models(enabled);
    CREATE INDEX IF NOT EXISTS idx_model_default ON llm_models(is_default);
    CREATE INDEX IF NOT EXISTS idx_model_key ON llm_models(model_key);
    CREATE INDEX IF NOT EXISTS idx_model_type_default ON llm_models(model_type, is_default);
  `);

  const columns = db.prepare("PRAGMA table_info(llm_models)").all();
  const columnNames = new Set(columns.map((c) => c.name));

  const aceLayerColumns = [
    "is_ace_layer_l1",
    "is_ace_layer_l2",
    "is_ace_layer_l3",
    "is_ace_layer_l4",
    "is_ace_layer_l5",
    "is_ace_layer_l6",
  ];

  aceLayerColumns.forEach((col) => {
    if (!columnNames.has(col)) {
      db.exec(`ALTER TABLE llm_models ADD COLUMN ${col} INTEGER DEFAULT 0`);
    }
  });

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_model_ace_l1 ON llm_models(is_ace_layer_l1);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l2 ON llm_models(is_ace_layer_l2);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l3 ON llm_models(is_ace_layer_l3);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l4 ON llm_models(is_ace_layer_l4);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l5 ON llm_models(is_ace_layer_l5);
    CREATE INDEX IF NOT EXISTS idx_model_ace_l6 ON llm_models(is_ace_layer_l6);
  `);
}

function insertProviders(db) {
  const providerStmt = db.prepare(`
    INSERT OR REPLACE INTO llm_providers (provider, name, description, base_config, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const results = [];

  PROVIDERS.forEach((p) => {
    const apiKey = getApiKey(p);
    const baseConfig = {
      apiKey: apiKey,
      baseURL: p.baseURL,
      timeout: 60000,
      maxRetries: 3,
    };

    try {
      const result = providerStmt.run(
        p.provider,
        p.name,
        p.description,
        JSON.stringify(baseConfig),
        p.enabled ? 1 : 0,
        now,
        now
      );

      results.push({
        success: true,
        provider: p,
        providerId: result.lastInsertRowid,
      });
    } catch (error) {
      results.push({
        success: false,
        provider: p,
        error: error.message,
      });
    }
  });

  return results;
}

function insertModels(db, providerResults) {
  const modelStmt = db.prepare(`
    INSERT OR REPLACE INTO llm_models (
      provider_id, model_key, model_name, model_type, model_config,
      api_endpoint_suffix, enabled, is_default, display_order, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = Date.now();
  const results = [];

  providerResults.forEach((result) => {
    if (!result.success) return;

    const provider = result.provider;
    const providerId = db
      .prepare("SELECT id FROM llm_providers WHERE provider = ?")
      .get(provider.provider).id;

    provider.models.forEach((model, idx) => {
      try {
        modelStmt.run(
          providerId,
          model.modelKey,
          model.modelName,
          model.modelType,
          JSON.stringify(model.modelConfig),
          model.apiEndpointSuffix,
          model.enabled ? 1 : 0,
          model.isDefault ? 1 : 0,
          idx,
          now,
          now
        );

        results.push({ success: true, model, provider: provider.name });
      } catch (error) {
        results.push({ success: false, model, provider: provider.name, error: error.message });
      }
    });
  });

  return results;
}

function getStats(db) {
  const providerStats = db
    .prepare(
      `
    SELECT p.id, p.provider, p.name, p.enabled,
           COUNT(m.id) as model_count,
           SUM(CASE WHEN m.enabled = 1 THEN 1 ELSE 0 END) as enabled_models
    FROM llm_providers p
    LEFT JOIN llm_models m ON p.id = m.provider_id
    GROUP BY p.id, p.provider, p.name, p.enabled
    ORDER BY p.id
  `
    )
    .all();

  return providerStats;
}

// ==================== 主程序 ====================

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const dbPath = path.join(DATA_DIR, DB_FILENAME);
  const db = new Database(dbPath);

  console.log("");
  console.log("=".repeat(70));
  console.log("  ApexBridge LLM Provider 初始化脚本 v2.0");
  console.log("=".repeat(70));
  console.log("");
  console.log("📦 数据库路径:", dbPath);
  console.log("");

  // 🔑 检查环境变量配置
  console.log("🔍 检查环境变量配置...\n");
  const { configured, missing } = checkEnvVars();

  if (configured.length > 0) {
    console.log("✅ 已配置的环境变量:");
    configured.forEach((c) => {
      console.log(`   ✓ ${c.name}: ${c.masked}...`);
    });
    console.log("");
  }

  if (missing.length > 0) {
    console.log("⚠️  未配置的环境变量 (将使用占位符):");
    missing.forEach((m) => {
      console.log(`   ○ ${m.name}: ${m.key}`);
    });
    console.log("");
  }

  console.log("🗄️  初始化数据库表结构...\n");
  initDatabase(db);
  console.log("✅ 数据库表结构已确认\n");

  // 🔍 检查提供商是否已存在（幂等性检查）
  console.log("🔍 检查现有提供商配置...\n");
  if (checkProvidersExist(db)) {
    console.log("⏭️  提供商已存在，跳过初始化");
    console.log("   (如需重新初始化，请先删除数据库: rm .data/llm_providers.db)");
    console.log("");

    // 仍然显示统计信息
    const stats = getStats(db);
    console.log("📊 当前配置统计:");
    stats.forEach((s) => {
      const status = s.enabled === 1 ? "✅" : "⚪";
      console.log(`  ${status} ${s.name}: ${s.model_count} 个模型 (${s.enabled_models} 个已启用)`);
    });
    console.log("");

    console.log("=".repeat(70));
    console.log("⏭️  跳过初始化 - 提供商配置已存在");
    console.log("=".repeat(70));
    console.log("");
    console.log("📋 下一步操作:");
    console.log("");
    console.log("1. 查看当前配置:");
    console.log("   curl http://localhost:8088/api/llm/providers");
    console.log("");
    console.log("2. 启用/禁用提供商:");
    console.log("   curl -X PUT http://localhost:8088/api/llm/providers/2 \\");
    console.log('     -H "Content-Type: application/json" \\');
    console.log("     -d '{\"enabled\": true}'");
    console.log("");
    console.log("3. 启动服务:");
    console.log("   npm run dev");
    console.log("");

    db.close();
    return;
  }

  console.log("📝 插入提供商配置...\n");
  const providerResults = insertProviders(db);

  providerResults.forEach((r) => {
    const status = r.provider.enabled ? "✅" : "⚪";
    const apiKeyStatus = r.provider.envApiKey
      ? process.env[r.provider.envApiKey]?.includes("your-")
        ? "(占位符)"
        : "(环境变量)"
      : "(本地服务)";
    console.log(`${status} ${r.provider.name} (${r.provider.provider}) ${apiKeyStatus}`);
    if (!r.success) {
      console.log(`   ❌ 失败: ${r.error}`);
    }
  });
  console.log("");

  // 移除模型插入逻辑（模型需单独配置）
  console.log("ℹ️  模型未包含在此脚本中，请通过 API 或单独脚本添加模型");
  console.log("   例如: curl -X POST http://localhost:8088/api/llm/providers/2/models \\");
  console.log('         -H "Content-Type: application/json" \\');
  console.log(
    '         -d \'{"modelKey": "deepseek-chat", "modelName": "DeepSeek Chat", "modelType": "nlp"}\''
  );
  console.log("");

  console.log("=".repeat(70));
  const stats = getStats(db);
  const totalProviders = stats.length;
  const totalModels = stats.reduce((sum, s) => sum + s.model_count, 0);
  const enabledModels = stats.reduce((sum, s) => sum + s.enabled_models, 0);
  console.log(
    `✅ 初始化完成: ${totalProviders} 个提供商, ${totalModels} 个模型 (${enabledModels} 个已启用)`
  );
  console.log("=".repeat(70));
  console.log("");

  console.log("📊 配置统计:");
  stats.forEach((s) => {
    const status = s.enabled === 1 ? "✅" : "⚪";
    console.log(`  ${status} ${s.name}: ${s.model_count} 个模型 (${s.enabled_models} 个已启用)`);
  });
  console.log("");

  console.log("=".repeat(70));
  console.log("📋 下一步操作:");
  console.log("=".repeat(70));
  console.log("");
  console.log("1. 配置 API Key (如果使用占位符):");
  console.log("   # 方法 A: 设置环境变量后重新运行");
  console.log('   export OPENAI_API_KEY="sk-..."');
  console.log("   node scripts/init-providers-v2.js");
  console.log("");
  console.log("   # 方法 B: 使用 API 接口更新");
  console.log("   curl -X PUT http://localhost:8088/api/llm/providers/1 \\");
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"baseConfig": {"apiKey": "sk-actual-key"}}\'');
  console.log("");
  console.log("2. 查看当前配置:");
  console.log("   curl http://localhost:8088/api/llm/providers");
  console.log("");
  console.log("3. 启用其他提供商:");
  console.log("   curl -X PUT http://localhost:8088/api/llm/providers/2 \\");
  console.log('     -H "Content-Type: application/json" \\');
  console.log("     -d '{\"enabled\": true}'");
  console.log("");
  console.log("4. 启动服务:");
  console.log("   npm run dev");
  console.log("");
  console.log("5. 测试聊天功能:");
  console.log("   curl -X POST http://localhost:8088/v1/chat/completions \\");
  console.log('     -H "Content-Type: application/json" \\');
  console.log(
    '     -d \'{"messages": [{"role": "user", "content": "你好"}], "model": "deepseek-chat"}\''
  );
  console.log("");

  db.close();
}

main();
