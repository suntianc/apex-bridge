import { promises as fs } from 'fs';
import * as path from 'path';
import matter from 'gray-matter';
import logger from '../../utils/logger';
import {
  InstructionLoaderOptions,
  SkillContent,
  SkillContentSection,
  SkillCodeBlock
} from '../../types';
import { SkillsIndex } from './SkillsIndex';
import { SkillsCache } from './SkillsCache';

const DEFAULT_MAX_CONTENT_TOKENS = 5000;

export class InstructionLoader {
  private readonly skillsIndex: SkillsIndex;
  private readonly cache: SkillsCache;
  private readonly maxContentTokens: number;

  constructor(
    skillsIndex: SkillsIndex,
    cache: SkillsCache,
    options: InstructionLoaderOptions = {}
  ) {
    this.skillsIndex = skillsIndex;
    this.cache = cache;
    this.maxContentTokens =
      options.maxContentTokens ?? DEFAULT_MAX_CONTENT_TOKENS;
  }

  async loadInstruction(skillName: string): Promise<SkillContent | undefined> {
    const cached = this.cache.getContent(skillName);
    if (cached) {
      return cached;
    }

    const skillPath = this.skillsIndex.getSkillPath(skillName);
    if (!skillPath) {
      logger.warn(`[InstructionLoader] 未找到技能路径: ${skillName}`);
      return undefined;
    }

    const skillFile = path.join(skillPath, 'SKILL.md');
    let rawContent: string;

    try {
      rawContent = await fs.readFile(skillFile, 'utf-8');
    } catch (error) {
      logger.warn(
        `[InstructionLoader] 读取 SKILL.md 失败 (${skillFile}): ${(error as Error).message}`
      );
      return undefined;
    }

    const tokenEstimate = this.estimateTokens(rawContent);
    if (tokenEstimate > this.maxContentTokens) {
      logger.warn(
        `[InstructionLoader] 技能 ${skillName} 指令大小 ${tokenEstimate} tokens 超出限制 ${this.maxContentTokens}`
      );
    }

    const parsed = matter(rawContent);

    const sections = this.extractSections(parsed.content);
    const codeBlocks = this.extractCodeBlocks(parsed.content);

    const skillContent: SkillContent = {
      name: skillName,
      raw: parsed.content,
      sections,
      codeBlocks,
      frontMatter:
        typeof parsed.data === 'object' ? (parsed.data as Record<string, unknown>) : undefined,
      path: skillFile,
      loadedAt: Date.now()
    };

    this.cache.setContent(skillName, skillContent);
    return skillContent;
  }

  private extractSections(content: string): SkillContentSection[] {
    const lines = content.split('\n');
    const sections: SkillContentSection[] = [];

    let currentTitle: string | null = null;
    let currentBody: string[] = [];

    const flushSection = () => {
      if (currentTitle !== null) {
        sections.push({
          title: currentTitle.trim(),
          body: currentBody.join('\n').trim()
        });
      }
      currentTitle = null;
      currentBody = [];
    };

    for (const line of lines) {
      const headingMatch = /^#{2,3}\s+(.*)$/.exec(line);
      if (headingMatch) {
        flushSection();
        currentTitle = headingMatch[1];
      } else {
        currentBody.push(line);
      }
    }

    flushSection();
    return sections;
  }

  private extractCodeBlocks(content: string): SkillCodeBlock[] {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks: SkillCodeBlock[] = [];
    let match: RegExpExecArray | null;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({
        language: match[1] ?? 'text',
        code: match[2].trim()
      });
    }

    return codeBlocks;
  }

  private estimateTokens(text: string): number {
    return text.split(/\s+/).filter(Boolean).length;
  }
}

