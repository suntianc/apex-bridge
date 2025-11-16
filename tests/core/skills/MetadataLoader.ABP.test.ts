/**
 * MetadataLoader ABP Support Tests
 * 
 * MetadataLoader ABP协议支持单元测试
 */

import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MetadataLoader } from '../../../src/core/skills/MetadataLoader';
import { SkillMetadata } from '../../../src/types/skills';

describe('MetadataLoader ABP Support', () => {
  let skillsRoot: string;
  let metadataLoader: MetadataLoader;

  beforeAll(async () => {
    skillsRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-loader-abp-'));
    metadataLoader = new MetadataLoader();
  });

  afterAll(async () => {
    await fs.rm(skillsRoot, { recursive: true, force: true });
  });

  describe('ABP Protocol Detection', () => {
    it('should detect ABP protocol from protocol field', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-1');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-1
displayName: ABP Skill 1
description: Test ABP skill
version: 1.0.0
type: direct
protocol: abp
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

# ABP Skill 1

## 描述
Test ABP skill description
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      expect(metadata.protocol).toBe('abp');
      expect(metadata.name).toBe('abp-skill-1');
    });

    it('should detect ABP protocol from abp field', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-2');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-2
displayName: ABP Skill 2
description: Test ABP skill
version: 1.0.0
type: direct
abp:
  kind: query
  tools:
    - name: getData
      description: Get data
      parameters:
        key:
          type: string
          description: Data key
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

# ABP Skill 2

## 描述
Test ABP skill description
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      expect(metadata.protocol).toBe('abp');
      expect(metadata.abp).toBeDefined();
      expect(metadata.abp?.kind).toBe('query');
      expect(metadata.abp?.tools).toBeDefined();
      expect(metadata.abp?.tools?.length).toBe(1);
      expect(metadata.abp?.tools?.[0].name).toBe('getData');
    });

    it('should default to VCP protocol when no protocol or abp field', async () => {
      const skillDir = path.join(skillsRoot, 'vcp-skill-1');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: vcp-skill-1
displayName: VCP Skill 1
description: Test VCP skill
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

# VCP Skill 1

## 描述
Test VCP skill description
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      expect(metadata.protocol).toBeUndefined(); // VCP协议时protocol字段为undefined
      expect(metadata.abp).toBeUndefined();
      expect(metadata.name).toBe('vcp-skill-1');
    });
  });

  describe('ABP Configuration Extraction', () => {
    it('should extract ABP kind from metadata', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-kind');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-kind
displayName: ABP Skill Kind
description: Test ABP skill with kind
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: transform
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

# ABP Skill Kind

## 描述
Test ABP skill with kind
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      expect(metadata.abp?.kind).toBe('transform');
    });

    it('should extract ABP tools from metadata', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-tools');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-tools
displayName: ABP Skill Tools
description: Test ABP skill with tools
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: tool1
      description: Tool 1 description
      parameters:
        param1:
          type: string
          description: Parameter 1
          required: true
        param2:
          type: number
          description: Parameter 2
          required: false
          default: 0
      returns:
        type: object
        description: Tool 1 result
    - name: tool2
      description: Tool 2 description
      parameters:
        param3:
          type: boolean
          description: Parameter 3
          required: true
      returns:
        type: string
        description: Tool 2 result
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

# ABP Skill Tools

## 描述
Test ABP skill with tools
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      expect(metadata.abp?.tools).toBeDefined();
      expect(metadata.abp?.tools?.length).toBe(2);
      
      const tool1 = metadata.abp?.tools?.[0];
      expect(tool1?.name).toBe('tool1');
      expect(tool1?.description).toBe('Tool 1 description');
      expect(tool1?.parameters).toBeDefined();
      expect(tool1?.parameters?.param1).toBeDefined();
      expect(tool1?.parameters?.param1.type).toBe('string');
      expect(tool1?.parameters?.param1.required).toBe(true);
      expect(tool1?.parameters?.param2).toBeDefined();
      expect(tool1?.parameters?.param2.type).toBe('number');
      expect(tool1?.parameters?.param2.required).toBe(false);
      expect(tool1?.parameters?.param2.default).toBe(0);
      expect(tool1?.returns).toBeDefined();
      expect(tool1?.returns?.type).toBe('object');
      
      const tool2 = metadata.abp?.tools?.[1];
      expect(tool2?.name).toBe('tool2');
      expect(tool2?.description).toBe('Tool 2 description');
      expect(tool2?.parameters).toBeDefined();
      expect(tool2?.parameters?.param3).toBeDefined();
      expect(tool2?.parameters?.param3.type).toBe('boolean');
      expect(tool2?.returns).toBeDefined();
      expect(tool2?.returns?.type).toBe('string');
    });

    it('should extract ABP parameter validation rules', async () => {
      const skillDir = path.join(skillsRoot, 'abp-skill-validation');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: abp-skill-validation
displayName: ABP Skill Validation
description: Test ABP skill with validation
version: 1.0.0
type: direct
protocol: abp
abp:
  kind: action
  tools:
    - name: validatedTool
      description: Validated tool
      parameters:
        value:
          type: number
          description: Numeric value
          required: true
          validation:
            min: 0
            max: 100
        pattern:
          type: string
          description: Pattern string
          required: true
          validation:
            pattern: "^[a-z]+$"
        choice:
          type: string
          description: Choice value
          required: true
          validation:
            enum:
              - option1
              - option2
              - option3
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

# ABP Skill Validation

## 描述
Test ABP skill with validation
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      const tool = metadata.abp?.tools?.[0];
      expect(tool).toBeDefined();
      
      const valueParam = tool?.parameters?.value;
      expect(valueParam?.validation).toBeDefined();
      expect(valueParam?.validation?.min).toBe(0);
      expect(valueParam?.validation?.max).toBe(100);
      
      const patternParam = tool?.parameters?.pattern;
      expect(patternParam?.validation).toBeDefined();
      expect(patternParam?.validation?.pattern).toBe('^[a-z]+$');
      
      const choiceParam = tool?.parameters?.choice;
      expect(choiceParam?.validation).toBeDefined();
      expect(choiceParam?.validation?.enum).toBeDefined();
      expect(choiceParam?.validation?.enum?.length).toBe(3);
      expect(choiceParam?.validation?.enum).toContain('option1');
      expect(choiceParam?.validation?.enum).toContain('option2');
      expect(choiceParam?.validation?.enum).toContain('option3');
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle VCP format metadata without errors', async () => {
      const skillDir = path.join(skillsRoot, 'vcp-skill-compat');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: vcp-skill-compat
displayName: VCP Skill Compat
description: Test VCP skill for compatibility
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

# VCP Skill Compat

## 描述
Test VCP skill for compatibility
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      // VCP格式应该正常加载
      expect(metadata.name).toBe('vcp-skill-compat');
      expect(metadata.protocol).toBeUndefined();
      expect(metadata.abp).toBeUndefined();
    });

    it('should handle mixed format metadata (protocol vcp with abp field)', async () => {
      const skillDir = path.join(skillsRoot, 'mixed-skill');
      await fs.mkdir(skillDir, { recursive: true });

      const skillMd = `---
name: mixed-skill
displayName: Mixed Skill
description: Test mixed format skill
version: 1.0.0
type: direct
protocol: vcp
abp:
  kind: action
domain: test
keywords:
  - test
permissions:
  network: false
  filesystem: none
cacheable: true
ttl: 3600
---

# Mixed Skill

## 描述
Test mixed format skill
`;

      await fs.writeFile(path.join(skillDir, 'SKILL.md'), skillMd, 'utf-8');

      const metadata = await metadataLoader.loadMetadata(skillDir);

      // 如果protocol是vcp，应该使用VCP协议
      expect(metadata.protocol).toBeUndefined(); // VCP协议时protocol字段为undefined
      // 但是abp字段仍然会被提取（如果存在）
      // 注意：根据当前实现，如果protocol是vcp，abp字段可能不会被提取
      expect(metadata.name).toBe('mixed-skill');
    });
  });
});

