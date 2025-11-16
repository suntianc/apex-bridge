# Project Context

## Purpose

VCP IntelliCore (Brain) is a next-generation AI protocol server built on the VCP Protocol SDK, designed to provide a highly modular, scalable, and high-performance middleware architecture that enables seamless collaboration between AI Agents and external tools, memory systems, and multiple LLM providers.

Core Objectives:
1. **Unified Variable Standard** - Eliminates ambiguity through a namespace architecture (`{{namespace:key}}`).
2. **Complete Plugin Ecosystem** - Supports 6 types of plugins for flexible capability expansion.
3. **Distributed Tool Support** - Enables unified management of local and remote tools.
4. **Multi-LLM Compatibility** - Supports providers such as DeepSeek, Zhipu AI, Claude, Ollama, and more.
5. **VCPChat Compatibility** - Fully compatible with all core features of the VCPChat frontend.

## Tech Stack

### Core Tech Stack

- **Runtime**: Node.js >= 18.0.0
- **Development Language**: TypeScript 5.3+
- **Compilation Target**: ES2020, CommonJS
- **Web Framework**: Express 4.18
- **Real-Time Communication**: WebSocket (ws 8.17)
- **HTTP Client**: Axios 1.6
- **Logging System**: Winston 3.11
- **Configuration Management**: dotenv 16.3
- **Security Enhancements**: Helmet 7.1, CORS 2.8, Express Rate Limit 7.1
- **Data Validation**: Joi 17.11

### Development Toolchain

- **Build Tool**: TypeScript Compiler (tsc)
- **Development Server**: Nodemon + ts-node
- **Testing Framework**: Jest 29.7 + ts-jest
- **Code Standards**: ESLint + Prettier
- **TypeScript Configuration**:
  - Strict Mode (strict: true)
  - Path Aliases (@/*, @api/*, @services/*, @core/*, @types/*, @utils/*)
  - Declaration File Generation (declaration: true)

### Dependencies

- **vcp-sdk** (vcp-intellicore-sdk): Core Protocol SDK
  - Variable Engine (VariableEngine)
  - Plugin Runtime (PluginRuntime)
  - RAG Interface Definitions
  - VCP Protocol Parser

- **@vcp/rag** (Optional): RAG Service
  - Vector Retrieval
  - Diary Management
  - Semantic Search

## Project Conventions

### Code Style

#### TypeScript Standards
- Use strict mode (strict: true)
- Enable forceConsistentCasingInFileNames
- Use ESModuleInterop and allowSyntheticDefaultImports
- All exports must include explicit type declarations

#### Naming Conventions
- **File Naming**: kebab-case (e.g., `chat-service.ts`)
- **Class Naming**: PascalCase (e.g., `ChatService`, `VariableEngine`)
- **Interface Naming**: PascalCase, prefixed with `I` (e.g., `IPlugin`, `IProvider`)
- **Functions/Methods**: camelCase (e.g., `processMessage`, `resolveVariables`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_ITERATIONS`, `DEFAULT_PORT`)
- **Private Members**: Prefixed with `_` (e.g., `_internalCache`)

#### Code Organization
```
src/
├── api/           # API route handlers
├── services/      # Business logic services
├── core/          # Core engines (imported from vcp-sdk)
├── types/         # TypeScript type definitions
├── utils/         # Utility functions
└── server.ts      # Server entry point
```

### Architecture Patterns

#### 1. Modular Layered Architecture

```
┌─────────────────────────────────────┐
│   API Layer (Express Routes)       │  ← HTTP/WebSocket entry point
├─────────────────────────────────────┤
│   Service Layer                     │  ← Business logic
│   - ChatService                     │
│   - LLMClient                       │
│   - WebSocketManager                │
├─────────────────────────────────────┤
│   Core Engine Layer (from vcp-sdk) │  ← Core engines
│   - VariableEngine                  │
│   - PluginRuntime                   │
│   - VCPProtocolParser               │
├─────────────────────────────────────┤
│   Plugin Layer                      │  ← Plugin ecosystem
│   - Direct / Static / Service      │
└─────────────────────────────────────┘
```

#### 2. Dependency Injection Pattern

All plugins and services acquire core capabilities via dependency injection:

```typescript
interface IPluginContext {
  config: IConfig;
  logger: ILogger;
  ragService?: IRAGService;
  variableEngine: IVariableEngine;
}
```

#### 3. Provider Pattern (Variable Resolution)

The namespace variable system adopts the Provider pattern, with each namespace corresponding to a Provider:

- **TimeProvider** (Priority 10): `{{time}}`, `{{date}}`, `{{datetime}}`
- **EnvironmentProvider** (Priority 40): `{{env:*}}`, `{{Var:*}}`, `{{Tar:*}}`
- **PlaceholderProvider** (Priority 60): Static plugin placeholders
- **AgentProvider** (Priority 70): `{{agent:*}}`
- **DiaryProvider** (Priority 80): `{{diary:*}}`
- **ToolDescriptionProvider** (Priority 90): `{{tool:*}}`, `{{VCP*}}`
- **AsyncResultProvider** (Priority 95): `{{async:*}}`

#### 4. Plugin Lifecycle Management

```typescript
interface IPlugin {
  initialize(context: IPluginContext): Promise<void>;
  registerRoutes?(app: Express): void;
  shutdown?(): Promise<void>;
}
```

### Testing Strategy

#### Unit Testing (Jest)

- **Coverage**: All core engine logic
- **Mock Strategy**: Use Jest Mock to isolate external dependencies
- **Naming Convention**: `*.test.ts`
- **Location**: `tests/` directory

#### Integration Testing

- **LLM Provider Testing**: `tests/llm-provider-test.js`
- **WebSocket Testing**: `tests/websocket-test.js`
- **End-to-End Testing**: Refer to `tests/VCPChat_Complete_Test_Cases.md`

#### Testing Commands

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Generate coverage report
```

### Git Workflow

#### Branch Strategy

- **main**: Stable production releases
- **dev**: Main development branch
- **feature/***: Feature development branches
- **bugfix/***: Bugfix branches
- **hotfix/***: Hotfix branches

#### Commit Standards (Conventional Commits)

```
feat: New feature
fix: Bug fix
docs: Documentation updates
style: Code formatting adjustments
refactor: Refactoring
perf: Performance optimization
test: Testing-related
chore: Build/toolchain updates
```

Examples:
```
feat(variable-engine): Added circular dependency detection
fix(chat-service): Fixed streaming response interruption issue
docs(readme): Updated namespace standards documentation
```

## Domain Context

### Core Concepts

#### 1. Namespace Variable System (v2.0 Architecture)

**Design Principles**:
- Clarity - Variable types are immediately identifiable
- Conflict-Free - Isolation between different variable types
- Extensibility - Adding new types requires no changes to existing code
- Performance Optimization - Precise matching to avoid misjudgments

**Standard Format**: `{{namespace:key}}`

**Recursive Resolution**:
- Supports arbitrary nesting depth
- Triple termination protection (cycle detection, no-placeholder detection, unchanged-content detection)
- Maximum iteration depth: 10

#### 2. Plugin System

**6 Plugin Types**:

| Type | Purpose | Communication Method |
|------|---------|-----------------------|
| Direct | Synchronous tool invocation | Direct function call |
| Static | Scheduled data refresh | Cron scheduling |
| Service | HTTP service endpoints | Express Router |
| HybridService | Tool + HTTP hybrid | Dual mode |
| Distributed | Remote distributed tools | WebSocket |
| MessagePreprocessor | Message preprocessing | Pipeline mode |

**Plugin Lifecycle**:
1. **Loading** - Reads `plugin-manifest.json`
2. **Initialization** - Calls `initialize(context)`
3. **Registration** - Registers routes/scheduled tasks
4. **Execution** - Responds to invocations/scheduled triggers
5. **Shutdown** - Calls `shutdown()` to clean up resources

#### 3. ABP Protocol

**Tool Invocation Format** (ABP协议，JSON格式):
```json
[[ABP_TOOL:ToolName]]
{
  "param1": "value1",
  "param2": "value2"
}
```

**Asynchronous Result Subscription**:
```
{{async:PluginName::RequestId}}
```

**注意**: VCP协议已完全移除，系统仅支持ABP协议。

#### 4. RAG and Memory System

**Diary Namespace**: `{{diary:CharacterName}}`

**API Endpoints**:
- `POST /api/diary/search` - Search diary
- `POST /api/diary/write` - Write diary
- `GET /api/diary/:character` - Retrieve specified character's diary

#### 5. Distributed Tool Architecture

```
Client (Frontend)
    ↓
ApexBridge (Main Server)
    ↓ WebSocket (/abp-distributed-server 或 /distributed-server)
Distributed Nodes (Remote Nodes)
```

**Communication Protocol**:
- `register_tools` - Tool registration
- `execute_tool` - Tool execution
- `tool_result` - Result return

### Business Domain Knowledge

#### LLM Provider Adaptation

Supported Providers:
- **DeepSeek**: Cost-effective, supports deepseek-chat, deepseek-coder
- **Zhipu AI**: Domestic large model, supports coding mode
- **Claude**: Anthropic high-quality model
- **Ollama**: Locally deployed open-source models
- **Custom**: Any OpenAI-compatible endpoint

#### VCPChat Compatibility

Required Features:
- ✅ Namespace variable resolution
- ✅ Agent file loading
- ✅ Tool invocation loop
- ✅ Streaming response (SSE)
- ✅ WebSocket push (/ABPlog 或 /log，推荐使用新路径)
- ✅ Distributed tool management
- ✅ Asynchronous tool callback (`/plugin-callback`) - 已完成 2025-10-30
- ✅ Request abort API (`/v1/interrupt`) - 已完成 2025-10-30
- ✅ RAG advanced syntax (`{{rag:diary:角色:time}}`) - 已完成 2025-11-01

**所有核心功能已完成！** 🎉

## Important Constraints

### Technical Constraints

1. **Node.js Version**: >= 18.0.0
2. **TypeScript Version**: >= 5.3.0
3. **Maximum Recursion Depth**: 10 (prevents infinite loops)
4. **Tool Invocation Maximum Cycles**: 10 rounds
5. **Cache TTL**:
   - Agent files: 5 minutes
   - Diary content: 5 minutes
   - Regular expressions: LRU cache of 100 entries

### Business Constraints

1. **Namespace Standards**: All new variables must follow `{{namespace:key}}` format
2. **Backward Compatibility**: Must support VCPToolBox legacy formats (`{{Var:*}}`, `{{VCP*}}`)
3. **Security**:
   - API Key authentication required
   - Rate limiting enabled by default
   - CORS configuration must be explicit
4. **Performance Requirements**:
   - Variable resolution uses `matches()` pre-filtering
   - Regex caching and reuse
   - Avoid unnecessary file I/O

### Compliance Constraints

- **Data Privacy**: Diary data stored locally only, not uploaded to cloud
- **API Usage**: Compliance with LLM provider terms of use
- **Open-Source License**: MIT License

## External Dependencies

### Core Dependencies

#### vcp-sdk (Local Dependency)

**Location**: `../vcp-sdk`  
**Purpose**: Core protocol SDK  
**Key Modules**:
- `VCPEngine` - Core engine
- `VariableEngine` - Variable resolution engine
- `PluginRuntime` - Plugin runtime
- `VCPProtocolParser` - Protocol parser

#### @vcp/rag (Optional Dependency)

**Location**: `../vcp-rag`  
**Purpose**: RAG service  
**Key Features**:
- Embedding
- Similarity search
- Diary management

### LLM API Dependencies

| Provider | API Endpoint | Authentication Method |
|----------|--------------|------------------------|
| DeepSeek | https://api.deepseek.com | API Key (sk-*) |
| Zhipu AI | https://open.bigmodel.cn | API Key (*.* format) |
| Claude | https://api.anthropic.com | API Key (sk-ant-*) |
| Ollama | http://localhost:11434 | No authentication |

### External Services

- **Embedding API** (Optional): For RAG embedding
  - Default: OpenAI `text-embedding-ada-002`
  - Configuration: `EMBEDDING_API_URL`, `EMBEDDING_API_KEY`

- **Distributed Nodes** (Optional): VCPDistributedServer
  - Communication: WebSocket
  - Port: Configurable

### Development Dependencies

- **Jest**: Testing framework
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Nodemon**: Development hot-reload

---

**Last Updated**: 2025-01-30  
**Document Version**: v2.0.0  
**Maintainer**: VCP IntelliCore Development Team