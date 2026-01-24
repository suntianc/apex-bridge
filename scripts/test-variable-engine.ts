#!/usr/bin/env node
/**
 * 测试变量引擎和工具描述生成
 */

import { LLMConfigService } from "@/services/LLMConfigService";
import { ModelRegistry } from "@/services/ModelRegistry";
import { ProtocolEngine } from "@/core/ProtocolEngine";
import { SkillsIndex } from "@/core/skills/SkillsIndex";
import { SkillsLoader } from "@/core/skills/SkillsLoader";
import { InstructionLoader } from "@/core/skills/InstructionLoader";
import { ResourceLoader } from "@/core/skills/ResourceLoader";
import { SkillsCache } from "@/core/skills/SkillsCache";
import { SkillsToolDescriptionGenerator } from "@/core/skills/SkillsToolDescriptionGenerator";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ProtocolConfig {
  api: {
    port: number;
  };
  auth: {
    enabled: boolean;
  };
}

async function test(): Promise<void> {
  console.log("");
  console.log("=".repeat(70));
  console.log("  测试变量引擎和工具描述生成");
  console.log("=".repeat(70));
  console.log("");

  try {
    // 1. 创建 ProtocolEngine
    console.log("1️⃣  初始化 ProtocolEngine...");
    const config: ProtocolConfig = { api: { port: 8088 }, auth: { enabled: false } };
    const protocolEngine = new ProtocolEngine(config);
    await protocolEngine.initialize();
    console.log("✅ ProtocolEngine 初始化完成");
    console.log("");

    // 2. 创建 Skills 组件
    console.log("2️⃣  初始化 Skills 组件...");
    const skillsRoot = path.join(__dirname, "..", "skills");
    const skillsIndex = new SkillsIndex({ skillsRoot });
    await skillsIndex.buildIndex();

    const skillsCache = new SkillsCache();
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache, {});
    const skillsLoader = new SkillsLoader(
      skillsIndex,
      instructionLoader,
      resourceLoader,
      skillsCache
    );

    console.log(`✅ Skills 索引: ${skillsIndex.getAllMetadata().length} 个技能`);
    console.log("");

    // 3. 创建工具描述生成器
    console.log("3️⃣  创建工具描述生成器...");
    const descGenerator = new SkillsToolDescriptionGenerator(skillsIndex, skillsLoader);

    // 注入到 ProtocolEngine
    protocolEngine.setSkillsDescriptionGenerator(descGenerator);
    console.log("✅ 工具描述生成器已注入");
    console.log("");

    // 4. 测试直接调用生成器
    console.log("4️⃣  测试直接调用生成器...");
    const description = await descGenerator.getAllToolsDescription("metadata");
    console.log("📝 生成的工具描述:");
    console.log(description);
    console.log("");
    console.log(`📊 长度: ${description.length} 字符`);
    console.log("");

    // 5. 测试变量引擎解析
    console.log("5️⃣  测试变量引擎解析...");
    const testContent = "可用工具:\n{{ABPAllTools}}";
    const resolved = await protocolEngine.variableEngine.resolveAll(testContent);
    console.log("原文:", testContent);
    console.log("解析后:", resolved.substring(0, 200) + "...");
    console.log(`长度变化: ${testContent.length} → ${resolved.length}`);
    console.log("");

    if (resolved.includes("工具:")) {
      console.log("✅ 变量解析成功！");
    } else {
      console.log("❌ 变量解析失败！");
    }
  } catch (error) {
    console.error("❌ 测试失败:", error);
  }

  process.exit(0);
}

test();
