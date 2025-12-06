## ADDED Requirements

### Requirement: Skills安装
The system MUST support Skills installation from ZIP archives via SkillManager, automatically validating structure, extracting, indexing, and registering.

#### Scenario: 首次安装Skills
- **GIVEN** user uploads valid Skill ZIP archive:
  ```
  git-commit.zip
  └── git-commit/
      ├── SKILL.md (contains valid YAML Frontmatter)
      └── scripts/
          └── execute.js
  ```
- **AND** Skills 'git-commit' is not installed
- **WHEN** SkillManager.installSkill(zipBuffer) is invoked
- **THEN** validate:
  - SKILL.md exists and contains required fields (name, description)
  - SKILL.md name field matches directory name
  - if scripts directory exists, scripts/execute.js is present
- **AND** extract to: data/skills/git-commit/
- **AND** call ToolRetrievalService.indexSkill() to generate vectors
- **AND** create .vectorized identifier file
- **AND** return: { success: true, name: 'git-commit', message: 'Skill installed successfully' }
- **AND** total installation time MUST be < 5000ms (including vectorization)

#### Scenario: 安装无效结构的Skills
- **GIVEN** user uploads invalid ZIP archive structure:
  - Missing SKILL.md
  - SKILL.md lacks name field
  - SKILL.md format is incorrect
- **WHEN** installSkill() is invoked
- **THEN** validation fails
- **AND** throw error: 'Invalid skill structure: {specific errors}'
- **AND** error.code MUST be 'INVALID_SKILL_STRUCTURE'
- **AND** not create Skills directory

#### Scenario: 安装已存在的Skills（无覆盖）
- **GIVEN** Skills 'git-commit' is installed at data/skills/git-commit/
- **WHEN** installSkill() is invoked (options.overwrite = false or unset)
- **THEN** throw error: 'Skill git-commit already exists. Use overwrite:true to replace.'
- **AND** error.code MUST be 'SKILL_ALREADY_EXISTS'
- **AND** keep existing Skills unchanged

#### Scenario: 覆盖安装已存在的Skills
- **GIVEN** Skills 'git-commit' is installed
- **WHEN** installSkill() is invoked (options.overwrite = true)
- **THEN** delete old data/skills/git-commit/
- **AND** install new Skills
- **AND** re-index vectors
- **AND** return success

### Requirement: ZIP压缩包解析
The system MUST correctly parse ZIP-format Skills archives and handle different ZIP structures through SkillManager.

#### Scenario: 正确结构的ZIP
- **GIVEN** ZIP structure:
  ```
  git-commit.zip
  └── git-commit/
      ├── SKILL.md
      └── scripts/
          └── execute.js
  ```
- **WHEN** parsing ZIP
- **THEN** correctly extract Skills name (directory name)
- **AND** successfully extract to temporary directory
- **AND** validation passes

#### Scenario: ZIP根目录直接包含文件（错误结构）
- **GIVEN** invalid ZIP structure:
  ```
  wrong.zip
  ├── SKILL.md       # Error: no root directory
  └── scripts/
      └── execute.js
  ```
- **WHEN** parsing ZIP
- **THEN** validation fails
- **AND** return error: 'Invalid ZIP structure: missing root directory'

#### Scenario: ZIP包含多层嵌套
- **GIVEN** ZIP structure:
  ```
  nested.zip
  └── some-folder/
      └── git-commit/
          ├── SKILL.md
          └── scripts/
              └── execute.js
  ```
- **WHEN** parsing ZIP
- **THEN** identify correct Skills directory (deepest level containing SKILL.md)
- **AND** validation passes

### Requirement: Skills卸载
The system MUST support Skills uninstallation through SkillManager, deleting files and vector indexes.

#### Scenario: 卸载存在的Skills
- **GIVEN** Skills 'git-commit' is installed at data/skills/git-commit/
- **AND** corresponding vectors exist in LanceDB
- **WHEN** uninstallSkill('git-commit') is invoked
- **THEN** delete data/skills/git-commit/ directory (recursive delete)
- **AND** call ToolRetrievalService.removeSkill() to delete vectors from LanceDB
- **AND** clean Skills Manager internal cache (if any)
- **AND** return: { success: true, name: 'git-commit', message: 'Skill uninstalled successfully' }

#### Scenario: 卸载不存在的Skills
- **GIVEN** Skills 'non-existent' is not installed
- **WHEN** uninstallSkill('non-existent') is invoked
- **THEN** throw error: 'Skills not found: non-existent'
- **AND** error.code MUST be 'SKILL_NOT_FOUND'

### Requirement: Skills描述修改
The system MUST allow modification of Skills' description field via SkillManager and re-index accordingly.

#### Scenario: 修改Skills描述
- **GIVEN** Skills 'git-commit' is installed
- **AND** new description: "自动生成Git提交信息，支持emoji和conventional commits格式"
- **WHEN** updateSkillDescription('git-commit', newDescription) is invoked
- **THEN** read data/skills/git-commit/SKILL.md
- **AND** modify description field in YAML Frontmatter
- **AND** regenerate vector index (as description changes affect semantics)
- **AND** update modification timestamp in .vectorized identifier file
- **AND** return: { success: true, name: 'git-commit', message: 'Description updated' }

#### Scenario: 修改Skills其他字段（不允许）
- **GIVEN** attempting to modify Skills' name or tags fields
- **WHEN** updateSkillDescription() is invoked
- **THEN** throw error: 'Only description field can be modified'
- **AND** reject modification of other fields

### Requirement: Skills列表查询
The system MUST provide query capability for installed Skills list through SkillManager, supporting filtering and pagination.

#### Scenario: 获取所有Skills列表
- **GIVEN** installed Skills: git-commit, file-read, calculate
- **WHEN** listSkills() is invoked (no filter parameters)
- **THEN** return array:
  ```typescript
  [
    { name: "git-commit", description: "...", version: "1.0.0", installedAt: ... },
    { name: "file-read", description: "...", version: "1.0.0", installedAt: ... },
    { name: "calculate", description: "...", version: "1.0.0", installedAt: ... }
  ]
  ```
- **AND** Skills MUST be sorted alphabetically by name

#### Scenario: 按名称过滤
- **GIVEN** installed Skills: git-commit, git-push, file-read
- **WHEN** listSkills({ name: 'git' }) is invoked
- **THEN** return matching Skills: [git-commit, git-push]

#### Scenario: 按标签过滤
- **GIVEN** Skills contain tag information
- **WHEN** listSkills({ tags: ['git'] }) is invoked
- **THEN** return all Skills containing 'git' tag

#### Scenario: 分页查询
- **WHEN** listSkills({ page: 2, limit: 10 }) is invoked
- **THEN** return at most 10 records for page 2
- **AND** include total count: { skills: [...], total: 25 }

### Requirement: Skills元数据验证
The system MUST validate Skills metadata (SKILL.md) format and required fields through SkillManager.

#### Scenario: 有效的YAML Frontmatter
- **GIVEN** SKILL.md content:
  ```yaml
  ---
  name: git-commit
  description: 自动生成提交信息
  version: 1.0.0
  tags: [git, commit]
  ---
  ```
- **WHEN** parsing metadata
- **THEN** successfully extract:
  - name: "git-commit"
  - description: "自动生成提交信息"
  - version: "1.0.0"
  - tags: ["git", "commit"]

#### Scenario: 缺少必需字段
- **GIVEN** SKILL.md lacks name or description fields
- **WHEN** validating metadata
- **THEN** return error: 'Missing required fields: name'
- **AND** installation MUST be rejected

#### Scenario: 名称不匹配
- **GIVEN** directory name: git-commit
- **AND** SKILL.md contains name: other-name
- **WHEN** validating metadata
- **THEN** return error: 'Skill name mismatch: expected "git-commit", got "other-name"'
- **AND** installation MUST be rejected

### Requirement: Skills元数据统计
The system MUST collect Skills installation and usage metrics through SkillManager.

#### Scenario: 统计总数
- **GIVEN** 25 Skills installed
- **WHEN** querying statistics
- **THEN** return: { total: 25 }

#### Scenario: 按标签统计
- **GIVEN** Skills categorized by tags
- **AND** git category: 10, filesystem category: 8, integration category: 7
- **WHEN** querying statistics
- **THEN** return:
  ```typescript
  {
    total: 25,
    byTag: {
      "git": 10,
      "filesystem": 8,
      "integration": 7
    }
  }
  ```

#### Scenario: Growth统计
- **WHEN** querying installation trends
- **THEN** return daily/weekly count of newly installed Skills
- **AND** format: { date: "2025-01-01", count: 5 }

## MODIFIED Requirements

*无修改现有需求*

## REMOVED Requirements

*无删除现有需求*
