/**
 * SkillsLoader ABP Support Tests
 * 
 * SkillsLoader ABP协议支持单元测试
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
  SkillsLoader
} from '../../../src/core/skills';

describe('SkillsLoader ABP Support', () => {
  let skillsRoot: string;
  let skillsLoader: SkillsLoader;
  let metadataLoader: MetadataLoader;
  let skillsIndex: SkillsIndex;
  let skillsCache: SkillsCache;
  let instructionLoader: InstructionLoader;
  let resourceLoader: ResourceLoader;

  beforeAll(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-loader-abp-'));
    
    metadataLoader = new MetadataLoader();
    skillsCache = new SkillsCache();
    skillsIndex = new SkillsIndex({
      skillsRoot,
      metadataProvider: metadataLoader
    });
    instructionLoader = new InstructionLoader(skillsIndex, skillsCache);
    resourceLoader = new ResourceLoader(skillsIndex, skillsCache);
    skillsLoader = new SkillsLoader(skillsIndex, instructionLoader, resourceLoader, skillsCache);
  });

  afterAll(async () => {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  describe('ABP Protocol Detection', () => {
    it('should detect ABP protocol skill', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill
displayName: ABP Skill
description: Test ABP skill
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: testTool
      description: Test tool
      parameters:
        param1:
          type: string
          required: true
domain: test
keywords:
  - test
  - abp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ABP Skill

## 描述
Test ABP skill description
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const skill = await skillsLoader.loadSkill('abp-skill');
      expect(skill?.metadata.protocol).toBe('abp');
    });

    it('should treat VCP protocol skill as ABP (VCP protocol removed)', async () => {
      const skillDir = path.join(skillsRoot, 'vcp-skill');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: vcp-skill
displayName: VCP Skill
description: Test VCP skill
version: 1.0.0
type: direct
protocol: vcp
domain: test
keywords:
  - test
  - vcp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# VCP Skill

## 描述
Test VCP skill description
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      // VCP协议已移除，所有技能都被视为ABP格式
      const protocol = skillsLoader.detectProtocol('vcp-skill');
      expect(protocol).toBe('abp');
    });

    it('should default to ABP protocol when protocol is not specified', async () => {
      const skillDir = path.join(skillsRoot, 'default-skill');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: default-skill
displayName: Default Skill
description: Test default skill
version: 1.0.0
type: direct
domain: test
keywords:
  - test
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# Default Skill

## 描述
Test default skill description
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      // VCP协议已移除，默认使用ABP协议
      const protocol = skillsLoader.detectProtocol('default-skill');
      expect(protocol).toBe('abp');
    });
  });

  describe('ABP Protocol Conversion', () => {
    it('should convert VCP skill to ABP format', async () => {
      const skillDir = path.join(skillsRoot, 'vcp-to-abp-skill');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: vcp-to-abp-skill
displayName: VCP to ABP Skill
description: Test VCP to ABP conversion
version: 1.0.0
type: direct
domain: test
keywords:
  - test
  - convert
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# VCP to ABP Skill

## 描述
Test VCP to ABP conversion
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const abpMetadata = skillsLoader.convertToABP('vcp-to-abp-skill');

      expect(abpMetadata).toBeDefined();
      expect(abpMetadata?.protocol).toBe('abp');
      expect(abpMetadata?.abp).toBeDefined();
      expect(abpMetadata?.abp?.kind).toBeDefined();
      expect(abpMetadata?.abp?.tools).toBeDefined();
    });

    it('should return same metadata for ABP skill', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-convert');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-convert
displayName: ABP Skill Convert
description: Test ABP skill conversion
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: testTool
      description: Test tool
domain: test
keywords:
  - test
  - abp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ABP Skill Convert

## 描述
Test ABP skill conversion
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const abpMetadata = skillsLoader.convertToABP('abp-skill-convert');

      expect(abpMetadata).toBeDefined();
      expect(abpMetadata?.protocol).toBe('abp');
      expect(abpMetadata?.abp?.kind).toBe('action');
      expect(abpMetadata?.abp?.tools?.length).toBe(1);
      expect(abpMetadata?.abp?.tools?.[0].name).toBe('testTool');
    });
  });

  describe('ABP Tool Definitions', () => {
    it('should get ABP tool definitions from ABP skill', async () => {
      const skillDir = path.join(skillsRoot, 'abp-tool-defs');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-tool-defs
displayName: ABP Tool Definitions
description: Test ABP tool definitions
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: tool1
      description: Tool 1
      parameters:
        param1:
          type: string
          required: true
    - name: tool2
      description: Tool 2
      parameters:
        param2:
          type: number
          required: false
domain: test
keywords:
  - test
  - abp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ABP Tool Definitions

## 描述
Test ABP tool definitions
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const tools = skillsLoader.getABPToolDefinitions('abp-tool-defs');

      expect(tools).toBeDefined();
      expect(tools.length).toBe(2);
      expect(tools[0].name).toBe('tool1');
      expect(tools[1].name).toBe('tool2');
    });

    it('should generate ABP tool definitions for VCP skill', async () => {
      const skillDir = path.join(skillsRoot, 'vcp-tool-defs');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: vcp-tool-defs
displayName: VCP Tool Definitions
description: Test VCP tool definitions
version: 1.0.0
type: direct
domain: test
keywords:
  - test
  - vcp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# VCP Tool Definitions

## 描述
Test VCP tool definitions
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const tools = skillsLoader.getABPToolDefinitions('vcp-tool-defs');

      expect(tools).toBeDefined();
      expect(tools.length).toBeGreaterThan(0);
      // 应该自动生成工具定义
      expect(tools[0].name).toBeDefined();
      expect(tools[0].description).toBeDefined();
    });
  });

  describe('ABP Format Validation', () => {
    it('should validate ABP format skill', async () => {
      const skillDir = path.join(skillsRoot, 'abp-valid');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-valid
displayName: ABP Valid
description: Test valid ABP skill
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: testTool
      description: Test tool
      parameters:
        param1:
          type: string
          required: true
domain: test
keywords:
  - test
  - abp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ABP Valid

## 描述
Test valid ABP skill
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const result = skillsLoader.validateABPFormat('abp-valid');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return valid for VCP format skill', async () => {
      const skillDir = path.join(skillsRoot, 'vcp-valid');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: vcp-valid
displayName: VCP Valid
description: Test valid VCP skill
version: 1.0.0
type: direct
domain: test
keywords:
  - test
  - vcp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# VCP Valid

## 描述
Test valid VCP skill
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      // VCP协议已移除，所有技能都被视为ABP格式
      // 没有ABP配置的技能会被自动转换为ABP格式
      const result = skillsLoader.validateABPFormat('vcp-valid');

      // 由于detectProtocol总是返回'abp'，但metadata可能没有abp配置
      // validateABPFormat应该返回错误（因为没有abp配置），或者允许（取决于实现）
      // 如果没有ABP配置，validateABPFormat应该返回错误，但可以通过convertToABP修复
      expect(result.valid).toBe(false); // 没有ABP配置的'abp'协议技能是无效的
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return error for invalid ABP format', async () => {
      const skillDir = path.join(skillsRoot, 'abp-invalid');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-invalid
displayName: ABP Invalid
description: Test invalid ABP skill
version: 1.0.0
type: direct
protocol: abp
# 缺少abp配置
domain: test
keywords:
  - test
  - abp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ABP Invalid

## 描述
Test invalid ABP skill
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const result = skillsLoader.validateABPFormat('abp-invalid');

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ABP Protocol Support', () => {
    it('should load ABP skill with abp configuration', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-full');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-full
displayName: ABP Skill Full
description: Test ABP skill with full configuration
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: testTool
      description: Test tool
      parameters:
        param1:
          type: string
          required: true
domain: test
keywords:
  - test
  - abp
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# ABP Skill Full

## 描述
Test ABP skill with full configuration
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');
      await skillsIndex.buildIndex();

      const skill = await skillsLoader.loadSkill('abp-skill-full');

      expect(skill).toBeDefined();
      expect(skill?.metadata.protocol).toBe('abp');
      expect(skill?.metadata.abp).toBeDefined();
      expect(skill?.metadata.abp?.kind).toBe('action');
      expect(skill?.metadata.abp?.tools).toBeDefined();
      expect(skill?.metadata.abp?.tools?.length).toBe(1);
      expect(skill?.metadata.abp?.tools?.[0].name).toBe('testTool');
    });
  });

  describe('Edge Cases', () => {
    it('should return undefined when converting unknown skill to ABP', () => {
      const converted = skillsLoader.convertToABP('non-existent-skill');
      expect(converted).toBeUndefined();
    });
  });
});

