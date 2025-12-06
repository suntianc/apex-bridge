# Project Context

## Purpose
ApexBridge is a lightweight AI chat service focused on ABP (AI Bridge Protocol) and LLM integration. The project aims to provide a robust, extensible platform for multi-LLM chat conversations with tool calling, variable resolution, and a lightweight plugin system (Skills).

**Key Objectives:**
- Support multiple LLM providers (OpenAI, DeepSeek, Zhipu, Ollama) through adapter pattern
- Implement ABP protocol for standardized AI interaction
- Provide a Skills system for lightweight plugin-based tool execution
- Enable real-time streaming conversations via WebSocket
- Maintain a lightweight, focused architecture without over-engineering

**Recent Major Achievement:**
Successfully refactored ChatService (1406-line god class) into 6 cohesive services using Strategy Pattern, resulting in better maintainability and separation of concerns.

## Tech Stack

### Core Technologies
- **TypeScript 5.0+** - Primary language with strict mode enabled
- **Node.js >= 16.0.0** - Runtime environment
- **Express.js** - Web framework for REST APIs
- **SQLite (better-sqlite3)** - Primary database for LLM configurations and data persistence
- **WebSocket (ws)** - Real-time bidirectional communication

### AI & Data Processing
- **ABP Protocol** - Custom AI Bridge Protocol implementation (no external SDK dependency)
- **ChromaDB** - Vector database for RAG (Retrieval-Augmented Generation)
- **hnswlib-node** - Approximate nearest neighbor search for embeddings
- **Redis** - Caching and session management
- **gray-matter** - Markdown frontmatter parsing for Skills configuration

### Development & Quality
- **Jest + ts-jest** - Testing framework with TypeScript support
- **ESLint** - Code linting with TypeScript-specific rules
- **Prettier** - Code formatting (semi: true, singleQuote: true, printWidth: 100)
- **nodemon + ts-node** - Development server with auto-restart

### External Integrations
- Multiple LLM provider APIs (OpenAI, DeepSeek, Zhipu, Ollama)
- **abp-rag-sdk** - RAG (Retrieval-Augmented Generation) capabilities
- **axios** - HTTP client for API requests
- **winston** - Structured logging

## Project Conventions

### Code Style

#### TypeScript Configuration
- **Strict Mode:** Enabled (`strict: true`)
- **Target:** ES2020
- **Module System:** CommonJS
- **Type Checking:** Strict null checks enabled
- **Path Mapping:** `@/` alias maps to `src/` directory

#### Formatting (Prettier)
```javascript
{
  semi: true,              // Use semicolons
  singleQuote: true,       // Single quotes for strings
  trailingComma: 'es5',    // Trailing commas where valid in ES5
  printWidth: 100,         // Line width limit
  tabWidth: 2,             // 2 spaces for indentation
  useTabs: false,          // Spaces instead of tabs
  bracketSpacing: true,    // Space between brackets
  arrowParens: 'always',   // Always include parentheses around arrow function params
  endOfLine: 'lf'          // Unix line endings
}
```

#### ESLint Rules
- **TypeScript:** @typescript-eslint/recommended + strict rules
- **Imports:** Automatic sorting with groups (builtin → external → internal → parent → sibling)
- **Best Practices:** No console.log in production (warn), no unused variables, prefer const/arrow functions
- **Error Prevention:** No eval(), no implied eval, no floating promises

#### Naming Conventions
- **Classes:** PascalCase (`ProtocolEngine`, `LLMManager`, `ChatService`)
- **Functions/Variables:** camelCase (`loadConfig`, `systemPrompt`, `handleRequest`)
- **Constants:** UPPER_SNAKE_CASE (`DEFAULT_TIMEOUT`, `MAX_RETRIES`)
- **Files/Directories:** kebab-case (`protocol-engine.ts`, `chat-controller.ts`)
- **Interfaces:** PascalCase with 'I' prefix (`IChatStrategy`, `IPlugin`)
- **Types:** PascalCase (`ChatOptions`, `Message`)

### Architecture Patterns

#### Core Patterns
1. **Strategy Pattern** - ChatService uses different strategies (ReActStrategy, SingleRoundStrategy) based on conversation requirements
2. **Adapter Pattern** - LLMManager adapts multiple LLM providers to a unified interface
3. **Engine Pattern** - Core engines (ProtocolEngine, VariableEngine) encapsulate complex protocol and variable resolution logic
4. **Service Layer** - Clear separation between core engines, business services, and API controllers

#### Directory Structure
```
src/
├── core/           # Core engines (Protocol, LLM, Variable)
├── services/       # Business logic services (ChatService, LLMConfigService)
├── strategies/     # Chat execution strategies (ReAct, SingleRound)
├── api/            # API controllers and middleware
├── types/          # TypeScript type definitions
├── utils/          # Utility functions
└── config/         # Configuration management
```

#### Skills System Architecture
- **Skills Location:** Each skill is a directory with `SKILL.md` (configuration) and `scripts/execute.ts` (implementation)
- **Execution Types:**
  - **Direct:** Synchronous local execution (default)
  - **Internal:** Built-in system skills
- **Configuration:** Frontmatter in SKILL.md defines tool metadata (name, description, parameters, execution type)
- **Lightweight Design:** Focus on simplicity, no complex plugin lifecycle management

### Testing Strategy

#### Testing Stack
- **Framework:** Jest with ts-jest preset
- **Environment:** Node.js test environment
- **Coverage:** Minimum coverage thresholds enforced (configured in jest.config.js)

#### Test Organization
- **Unit Tests:** Colocated with source files (`*.test.ts`)
- **Integration Tests:** `tests/` directory for API and WebSocket integration tests
- **Coverage Targets:**
  - Core engines (ProtocolEngine, LLMManager, VariableEngine)
  - Services (ChatService, LLMConfigService)
  - API endpoints and WebSocket handlers
  - Skills execution and variable resolution

#### Test Naming
- Test files: `*.test.ts` or `*.spec.ts`
- Test suites: Describe the component/system under test
- Test cases: Use descriptive names following `should...when...` pattern

#### Testing Requirements
- All new features must include unit tests
- Bug fixes must include regression tests
- API changes must include integration tests
- Maintain >80% code coverage

### Git Workflow

#### Branching Strategy
- **Main Branch:** `main` (production-ready code)
- **Feature Branches:** `feature/feature-name` or `feat/feature-name`
- **Bugfix Branches:** `fix/bug-description`
- **Refactoring:** `refactor/component-name`
- **Current Active Branch:** `refactor/admin-auth-routing`

#### Commit Convention
Uses Conventional Commits with Chinese language:
- **feat:** New features
- **fix:** Bug fixes
- **refactor:** Code refactoring without behavior change
- **perf:** Performance improvements
- **chore:** Maintenance tasks (build, deps, etc.)
- **test:** Adding or updating tests
- **docs:** Documentation updates

**Commit Format:**
```
type: description

Optional detailed description of changes
```

**Examples from recent history:**
- `feat: 添加默认系统提示词功能（阶段1-2完成）`
- `fix: 修复代码中大括号被误解析的bug`
- `refactor: ChatService重构 - 应用策略模式`
- `perf: 优化深度思考响应速度并添加性能文档`

#### Pull Request Process
1. Create feature branch from `main`
2. Implement changes with appropriate tests
3. Ensure all tests pass (`npm test`)
4. Ensure code quality checks pass (`npm run lint`, `npm run format:check`)
5. Create PR with detailed description of changes
6. Code review by team members
7. Merge to `main` after approval

## Domain Context

### ABP Protocol (AI Bridge Protocol)
A custom protocol for standardized AI interaction that:
- Defines message format between client and AI service
- Supports tool calling through Skills system
- Handles variable resolution in messages
- Manages conversation context and history
- **Important:** No external SDK dependency - completely self-implemented

### Skills System
Lightweight plugin architecture that replaces traditional plugins:
- **Definition:** Each Skill is a self-contained capability (tool)
- **Configuration:** SKILL.md with frontmatter defines tool metadata
- **Execution:** TypeScript files in `scripts/` directory
- **Types:**
  - Direct: Synchronous, local execution
  - Internal: Built-in system capabilities
- **Use Cases:** Data processing, API calls, calculations, file operations

### Chat Strategies
- **ReAct Strategy:** Multi-turn reasoning with tool calls, suitable for complex queries requiring research or calculations
- **Single Round Strategy:** Fast single-turn responses, suitable for simple Q&A
- **Strategy Selection:** Automatically selected based on `options.selfThinking.enabled`

### Variable Resolution System
- **Time Variables:** `{time.current}`, `{time.iso}`, etc.
- **Environment Variables:** `{env:VARIABLE_NAME}`
- **Placeholder Variables:** Custom-defined placeholders with 30-second caching
- **Format:** Variables use `{variable.name}` syntax in messages

### Session Management
- **Session Lifecycle:** Managed by SessionManager service
- **Storage:** SQLite database with conversation history
- **Metadata:** Tracks model, strategy, timestamps, tool calls
- **WebSocket Integration:** Real-time session management with connection state tracking

### Request Tracking
- **Active Request Management:** RequestTracker service monitors in-flight requests
- **Cancellation Support:** WebSocket messages can cancel active requests
- **Cleanup:** Automatic resource cleanup on cancellation
- **ACE Integration:** Trajectory recording for analytics and debugging

## Important Constraints

### Technical Constraints
- **Node.js Version:** Must support Node.js >= 16.0.0
- **TypeScript:** Strict mode enabled - all code must pass strict type checking
- **Dependencies:** Minimize external dependencies - prefer lightweight libraries
- **Memory:** Optimize for memory efficiency - streaming responses, proper cleanup
- **Storage:** SQLite-based - design queries with SQLite limitations in mind

### Architecture Constraints
- **ABP-only:** Protocol implementation must not depend on external SDKs
- **Skills System:** Tool execution must remain lightweight - avoid heavy plugin frameworks
- **Strategy Pattern:** All chat processing must go through strategy interface
- **Layer Separation:** Strict separation between core, services, and API layers

### Performance Constraints
- **Response Time:** Streaming responses should begin within 500ms
- **Memory Usage:** Keep memory footprint low - clean up unused resources
- **Concurrent Requests:** Support multiple concurrent WebSocket connections
- **Variable Cache:** Variable resolution cached for 30 seconds

### Security Constraints
- **API Keys:** Never commit API keys or secrets - use environment variables
- **Input Validation:** All user inputs must be validated and sanitized
- **Path Traversal:** Prevent directory traversal in file operations
- **Rate Limiting:** Implement rate limiting for API endpoints

### Development Constraints
- **Test Coverage:** Maintain >80% code coverage
- **Type Safety:** No `any` types without explicit justification
- **Code Reviews:** All changes require peer review
- **Documentation:** Update docs for all API changes

## External Dependencies

### Core Services
- **OpenAI API** - Primary LLM provider for GPT models
- **DeepSeek API** - Alternative LLM provider
- **Zhipu AI API** - Chinese LLM provider (智谱AI)
- **Ollama** - Local LLM deployment option

### Infrastructure Services
- **Redis** - (Optional) Caching and session storage
- **ChromaDB** - Vector database for RAG capabilities
- **SQLite** - Primary application database

### Development Tools
- **GitHub** - Source control and issue tracking
- **npm registry** - Package management

### Monitoring & Observability
- **Winston** - Application logging
- **Request Tracking** - Custom request lifecycle monitoring
- **ACE Integration** - Trajectory recording for analytics
