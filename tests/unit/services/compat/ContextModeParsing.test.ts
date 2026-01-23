/**
 * Context Mode Parser Tests
 */

import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { getClaudeCodeSkillParser } from "../../../../src/services/compat/ClaudeCodeSkillParser";

describe("Context Mode Parsing", () => {
  let parser: ReturnType<typeof getClaudeCodeSkillParser>;
  let tempDir: string;

  beforeEach(async () => {
    parser = getClaudeCodeSkillParser();
    tempDir = path.join(os.tmpdir(), `context-mode-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      if (process.env.DEBUG_TESTS === "true") {
        console.debug("Cleanup error (expected):", error);
      }
    }
  });

  it("should parse fork context mode", async () => {
    const skillPath = path.join(tempDir, "fork-skill");
    await fs.mkdir(skillPath, { recursive: true });

    const skillContent = `---
name: fork-skill
description: A skill with fork context mode
version: 1.0.0
context: fork
---

# Fork Skill

This skill runs in isolated fork mode.
`;
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

    const result = await parser.parse(skillPath);

    expect(result.compatibility.context).toBe("fork");
    expect(result.metadata.name).toBe("fork-skill");
  });

  it("should parse inline context mode", async () => {
    const skillPath = path.join(tempDir, "inline-skill");
    await fs.mkdir(skillPath, { recursive: true });

    const skillContent = `---
name: inline-skill
description: A skill with inline context mode
version: 1.0.0
context: inline
---

# Inline Skill

This skill runs in inline mode with shared context.
`;
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

    const result = await parser.parse(skillPath);

    expect(result.compatibility.context).toBe("inline");
    expect(result.metadata.name).toBe("inline-skill");
  });

  it("should default to undefined when context not specified", async () => {
    const skillPath = path.join(tempDir, "no-context-skill");
    await fs.mkdir(skillPath, { recursive: true });

    const skillContent = `---
name: no-context-skill
description: A skill without context mode specified
version: 1.0.0
---

# No Context Skill

This skill does not specify a context mode.
`;
    await fs.writeFile(path.join(skillPath, "SKILL.md"), skillContent);

    const result = await parser.parse(skillPath);

    // Context should be undefined when not specified
    expect(result.compatibility.context).toBeUndefined();
  });

  it("should parse multiple skills with different context modes", async () => {
    // 创建 fork 模式技能
    const forkSkillPath = path.join(tempDir, "skill-1");
    await fs.mkdir(forkSkillPath, { recursive: true });
    await fs.writeFile(
      path.join(forkSkillPath, "SKILL.md"),
      `---
name: skill-1
description: Fork mode skill
context: fork
---

# Skill 1
`
    );

    // 创建 inline 模式技能
    const inlineSkillPath = path.join(tempDir, "skill-2");
    await fs.mkdir(inlineSkillPath, { recursive: true });
    await fs.writeFile(
      path.join(inlineSkillPath, "SKILL.md"),
      `---
name: skill-2
description: Inline mode skill
context: inline
---

# Skill 2
`
    );

    const results = await parser.parseDirectory(tempDir);

    expect(results.size).toBe(2);

    const skill1 = results.get("skill-1");
    const skill2 = results.get("skill-2");

    expect(skill1?.compatibility.context).toBe("fork");
    expect(skill2?.compatibility.context).toBe("inline");
  });

  it("should handle parseContent for context mode", () => {
    const contentWithFork = `---
name: test-fork
description: Test skill
context: fork
---

Content here
`;

    const result = parser.parseContent(contentWithFork);

    expect(result.compatibility.context).toBe("fork");

    const contentWithInline = `---
name: test-inline
description: Test skill
context: inline
---

Content here
`;

    const result2 = parser.parseContent(contentWithInline);

    expect(result2.compatibility.context).toBe("inline");
  });
});
