# skills Specification

## Purpose
TBD - created by archiving change define-skills-and-chat-pipeline-specs. Update Purpose after archive.
## Requirements
### Requirement: Skills Capability Model
The system SHALL provide a Skills capability that replaces the legacy plugin system.
It SHALL define a canonical package structure:
- SKILL.md (instructions + ABP config front matter)
- scripts/execute.ts (default exported async function)
- references/ and assets/ (optional resources)

#### Scenario: Load skill metadata
- WHEN the system scans `skills/` directory
- THEN it indexes skill metadata (name, description, version, type, abp.tools)

#### Scenario: Execute a skill
- WHEN ChatService requests execution of a skill by name with parameters
- THEN SkillsExecutionManager runs scripts/execute.ts and returns a structured result

### Requirement: Three-Stage Tool Description (Skills)
The system SHALL support progressive disclosure for tool descriptions:
- Phase 1: metadata (name/description)
- Phase 2: brief (parameters)
- Phase 3: full (instructions + resources)

#### Scenario: Select phase by confidence
- WHEN confidence >= 0.7
- THEN full description is returned
- WHEN 0.15 <= confidence < 0.7
- THEN brief description is returned
- WHEN confidence < 0.15
- THEN metadata description is returned

### Requirement: Security and Isolation
The system SHALL validate code, sandbox execution, and enforce timeouts.

#### Scenario: Enforce execution timeout
- WHEN a skill exceeds configured timeout
- THEN execution is aborted and an error is returned

