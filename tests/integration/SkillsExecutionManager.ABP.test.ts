/**
 * SkillsExecutionManager ABP Support Integration Tests
 * 
 * SkillsExecutionManager ABP协议支持集成测试
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  MetadataLoader,
  SkillsIndex,
  SkillsCache,
  InstructionLoader,
  ResourceLoader,
  SkillsLoader,
  SkillsExecutionManager,
  SkillsDirectExecutor,
  CodeGenerator,
  SecurityValidator,
  SandboxEnvironment,
  CodeCache
} from '../../src/core/skills';
import { ProtocolEngine } from '../../src/core/ProtocolEngine';
import { VCPConfig } from '../../src/types';
import type { ExecutionRequest } from '../../src/types';

/**
 * 创建测试技能目录结构
 */
async function createTestSkill(
  skillRoot: string,
  skillName: string,
  options: {
    hasCode?: boolean;
    protocol?: 'vcp' | 'abp';
    abpConfig?: any;
  } = {}
): Promise<string> {
  const skillDir = path.join(skillRoot, skillName);
  await fs.mkdir(skillDir, { recursive: true });

  const protocol = options.protocol || 'vcp';
  const abpConfig = options.abpConfig || (protocol === 'abp' ? {
    kind: 'action',
    tools: [{
      name: skillName,
      description: `Test ${skillName} skill`,
      parameters: {}
    }]
  } : undefined);

  // 创建SKILL.md
  let skillMd = `---
name: ${skillName}
displayName: ${skillName}测试
description: 这是一个测试技能：${skillName}
version: 1.0.0
type: direct
${protocol === 'abp' ? 'protocol: abp' : ''}
${abpConfig ? `abp:
  kind: ${abpConfig.kind}
  tools:
    - name: ${abpConfig.tools[0].name}
      description: ${abpConfig.tools[0].description}
      parameters: {}` : ''}
domain: test
keywords:
  - ${skillName}
  - test
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ${skillName}

## 描述
这是一个测试技能：${skillName}
`;

  if (options.hasCode) {
    skillMd += `
\`\`\`typescript
export async function execute(params: any): Promise<unknown> {
  const value = params && typeof params === 'object' && typeof (params as any).value === 'number'
    ? (params as any).value
    : 0;
  return { result: 'success', value };
}
\`\`\`
`;
  }

  await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

  if (options.hasCode) {
    const scriptsDir = path.join(skillDir, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'scripts', 'main.ts'),
      `export async function execute(params: any): Promise<unknown> {
  const value = params && typeof params === 'object' && typeof (params as any).value === 'number'
    ? (params as any).value
    : 0;
  return { result: 'success', value };
}`,
      'utf-8'
    );
  }

  return skillDir;
}

describe('SkillsExecutionManager ABP Support Integration', () => {
  let skillsRoot: string;
  let skillsIndex: SkillsIndex;
  let skillsLoader: SkillsLoader;
  let executionManager: SkillsExecutionManager;
  let protocolEngine: ProtocolEngine;

  beforeAll(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-execution-abp-'));
    
    const metadataLoader = new MetadataLoader();
    const skillsCache = new SkillsCache();
    skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    const instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    const resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);

    const codeGenerator = new CodeGenerator();
    const securityValidator = new SecurityValidator();
    const sandbox = new SandboxEnvironment();
    const codeCache = new CodeCache();
    const directExecutor = new SkillsDirectExecutor({
      loader: skillsLoader,
      codeGenerator,
      securityValidator,
      sandbox,
      codeCache
    });

    executionManager = new SkillsExecutionManager(skillsLoader, {
      executors: {
        direct: directExecutor
      }
    });

    const vcpConfig: VCPConfig = {
      protocol: {
        startMarker: '<<<[TOOL_REQUEST]>>>',
        endMarker: '<<<[END_TOOL_REQUEST]>>>',
        paramStartMarker: '「始」',
        paramEndMarker: '「末」'
      },
      plugins: {
        directory: './plugins'
      },
      debugMode: false,
      abp: {
        enabled: true,
        dualProtocolEnabled: true
      }
    } as any;

    protocolEngine = new ProtocolEngine(vcpConfig);

    await skillsIndex.buildIndex();
  });

  afterAll(async () => {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  describe('ABP Protocol Skill Execution', () => {
    it('should execute ABP protocol skill', async () => {
      const skillName = 'abp-test-skill';
      await createTestSkill(skillsRoot, skillName, {
        hasCode: true,
        protocol: 'abp',
        abpConfig: {
          kind: 'action',
          tools: [{
            name: skillName,
            description: `Test ${skillName} skill`,
            parameters: {
              value: {
                type: 'number',
                description: 'Test value',
                required: false
              }
            }
          }]
        }
      });

      // 重新构建索引
      await skillsIndex.buildIndex();

      const request: ExecutionRequest = {
        skillName,
        parameters: { value: 42 }
      };

      const response = await executionManager.execute(request);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('should execute VCP protocol skill', async () => {
      const skillName = 'vcp-test-skill';
      await createTestSkill(skillsRoot, skillName, {
        hasCode: true,
        protocol: 'vcp'
      });

      // 重新构建索引
      await skillsIndex.buildIndex();

      const request: ExecutionRequest = {
        skillName,
        parameters: { value: 42 }
      };

      const response = await executionManager.execute(request);

      expect(response).toBeDefined();
      expect(response.success).toBe(true);
      expect(response.result).toBeDefined();
    });

    it('should handle dual protocol execution', async () => {
      const abpSkillName = 'abp-dual-skill';
      const vcpSkillName = 'vcp-dual-skill';

      await createTestSkill(skillsRoot, abpSkillName, {
        hasCode: true,
        protocol: 'abp'
      });
      await createTestSkill(skillsRoot, vcpSkillName, {
        hasCode: true,
        protocol: 'vcp'
      });

      // 重新构建索引
      await skillsIndex.buildIndex();

      // 执行ABP技能
      const abpRequest: ExecutionRequest = {
        skillName: abpSkillName,
        parameters: { value: 42 }
      };
      const abpResponse = await executionManager.execute(abpRequest);

      expect(abpResponse).toBeDefined();
      expect(abpResponse.success).toBe(true);

      // 执行VCP技能
      const vcpRequest: ExecutionRequest = {
        skillName: vcpSkillName,
        parameters: { value: 42 }
      };
      const vcpResponse = await executionManager.execute(vcpRequest);

      expect(vcpResponse).toBeDefined();
      expect(vcpResponse.success).toBe(true);
    });
  });

  describe('Protocol Detection and Conversion', () => {
    it('should detect ABP protocol skill', async () => {
      const skillName = 'abp-detect-skill';
      await createTestSkill(skillsRoot, skillName, {
        protocol: 'abp'
      });

      // 重新构建索引
      await skillsIndex.buildIndex();

      const protocol = skillsLoader.detectProtocol(skillName);
      expect(protocol).toBe('abp');
    });

    it('should convert VCP skill to ABP format', async () => {
      const skillName = 'vcp-convert-skill';
      await createTestSkill(skillsRoot, skillName, {
        protocol: 'vcp'
      });

      // 重新构建索引
      await skillsIndex.buildIndex();

      const abpMetadata = skillsLoader.convertToABP(skillName);

      expect(abpMetadata).toBeDefined();
      expect(abpMetadata?.protocol).toBe('abp');
      expect(abpMetadata?.abp).toBeDefined();
      expect(abpMetadata?.abp?.kind).toBeDefined();
      expect(abpMetadata?.abp?.tools).toBeDefined();
    });
  });
});

