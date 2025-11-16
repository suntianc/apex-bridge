## ADDED Requirements

### Requirement: Progressive Tool Descriptions in Prompt
The chat pipeline SHALL inject tool descriptions using three-stage progressive disclosure powered by SkillsToolDescriptionGenerator.

#### Scenario: Inject metadata only
- WHEN confidence < 0.15
- THEN only metadata descriptions are injected

#### Scenario: Inject brief descriptions
- WHEN 0.15 <= confidence < 0.7
- THEN brief descriptions (with parameters) are injected

#### Scenario: Inject full descriptions
- WHEN confidence >= 0.7
- THEN full descriptions (instructions and resources) are injected

### Requirement: Tool Execution via Skills
The chat pipeline SHALL map LLM tool calls to Skills execution and return structured results.

#### Scenario: Execute tool via Skills
- WHEN LLM returns a tool call with name and args
- THEN the system executes the skill with the same name and returns the result back to the model


