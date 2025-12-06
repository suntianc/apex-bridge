## ADDED Requirements

### Requirement: LanceDB初始化与连接
The system MUST initialize LanceDB connection on application startup and automatically create the vector database if the data/skills.lance path does not exist.

#### Scenario: 首次初始化
- **GIVEN** a fresh installation with no LanceDB data files
- **WHEN** ToolRetrievalService.initialize() is invoked
- **THEN** create a new LanceDB connection at the ./data/skills.lance path
- **AND** create a vector table named "skills" with fields: id, name, description, tags, vector, metadata
- **AND** complete initialization within 5000ms
- **AND** log "LanceDB initialized with skills table"

#### Scenario: 重复初始化
- **GIVEN** existing LanceDB data files and skills table
- **WHEN** ToolRetrievalService.initialize() is invoked
- **THEN** open the existing skills table without creating a new one
- **AND** not delete or modify existing data
- **AND** complete initialization within 1000ms

### Requirement: Skills向量嵌入生成
The system MUST generate 384-dimensional vector embeddings based on Skills' name, description, and tags using the all-MiniLM-L6-v2 model.

#### Scenario: 生成Skills向量
- **GIVEN** a Skills object with:
  - name: "git-commit"
  - description: "自动分析Git改动并生成conventional commit信息"
  - tags: ["git", "commit", "versioning"]
- **WHEN** getEmbedding() is invoked
- **THEN** return a 384-dimensional vector array
- **AND** all values must be non-zero (valid vector)
- **AND** return identical vectors for identical inputs (deterministic)

#### Scenario: 中文Skills向量生成
- **GIVEN** a Chinese Skills description: "读取Excel文件并提取数据分析"
- **WHEN** getEmbedding() is invoked
- **THEN** successfully generate a 384-dimensional vector
- **AND** the vector quality MUST be sufficient for similarity search

### Requirement: Skills向量化索引
The system MUST store Skills metadata and vector embeddings in the vector database, supporting incremental updates.

#### Scenario: 索引新Skills
- **GIVEN** a valid Skills object:
  ```typescript
  {
    name: "file-read",
    description: "读取文件内容",
    tags: ["filesystem"],
    path: "./data/skills/file-read"
  }
  ```
- **WHEN** indexSkill() is invoked
- **THEN** generate a vector embedding
- **AND** store the vector in the LanceDB skills table
- **AND** store metadata (name, description, tags, path, indexedAt)
- **AND** perform idempotent operation (duplicate indexing of same name updates rather than creates a new record)

#### Scenario: 更新已索引Skills
- **GIVEN** an indexed Skills
- **WHEN** the Skills description is modified
- **THEN** call updateSkill() to regenerate the vector
- **AND** overwrite the old record in LanceDB

### Requirement: Skills向量检索
The system MUST generate vectors from user queries and execute similarity searches to return the most relevant Skills.

#### Scenario: 检索相关Skills
- **GIVEN** LanceDB has indexed the following Skills:
  - git-commit (description: 生成Git提交信息)
  - file-read (description: 读取文件)
  - calculate (description: 数学计算)
- **AND** user query: "帮我提交代码"
- **WHEN** findRelevantSkills() is invoked
- **THEN** return results including git-commit
- **AND** git-commit similarity score MUST be > 0.75
- **AND** return results within 20ms

#### Scenario: 中文查询检索
- **GIVEN** an indexed Chinese Skills: excel-analysis (读取Excel分析数据)
- **AND** user query: "分析Excel文件"
- **WHEN** findRelevantSkills() is invoked
- **THEN** return excel-analysis as one of the top 3 results
- **AND** similarity score MUST be > 0.7

#### Scenario: 检索结果限制
- **WHEN** findRelevantSkills() is invoked with limit: 5
- **THEN** return at most 5 Skills
- **AND** Skills MUST be sorted by similarity in descending order

#### Scenario: 相似度阈值过滤
- **WHEN** findRelevantSkills() is invoked with threshold: 0.6
- **THEN** only return Skills with similarity ≥ 0.6
- **AND** Skills below the threshold MUST be filtered out

### Requirement: Skills索引状态跟踪
The system MUST track each Skills' indexing status through .vectorized identifier files to determine if re-indexing is required.

#### Scenario: 首次索引Skills
- **GIVEN** an unindexed Skills directory (no .vectorized file)
- **WHEN** the system scans Skills directories during startup
- **THEN** index the Skills
- **AND** create a .vectorized file containing:
  ```json
  {
    "indexedAt": 1704067200000,
    "skillSize": 1024,
    "skillHash": "a1b2c3d4"
  }
  ```

#### Scenario: Skills内容未变更
- **GIVEN** an indexed Skills (with .vectorized file)
- **AND** SKILL.md file size and hash match the .vectorized record
- **WHEN** the system scans Skills directories during startup
- **THEN** skip indexing for that Skills
- **AND** log "Skipping unchanged skill: {name}"

#### Scenario: Skills描述变更
- **GIVEN** an indexed Skills
- **AND** SKILL.md file has been modified (size or hash changed)
- **WHEN** the system scans Skills directories during startup
- **THEN** detect mismatch between .vectorized and actual file
- **AND** re-index the Skills
- **AND** update the .vectorized file

### Requirement: 向量相似度计算
The system MUST calculate similarity between query vectors and Skills vectors using cosine similarity.

#### Scenario: 相似度计算验证
- **GIVEN** query vector Q and Skills vectors V1, V2
- **WHEN** cosine similarity is calculated
- **THEN** sim(Q, V1) close to 1 indicates high similarity
- **AND** sim(Q, V2) close to 0 indicates low similarity
- **AND** sim(V1, V1) = 1 (self-similarity)

### Requirement: 错误处理和降级
The system MUST provide fallback mechanisms (keyword-based fuzzy matching) when vector retrieval fails.

#### Scenario: LanceDB连接失败
- **GIVEN** LanceDB service is not accessible
- **WHEN** findRelevantSkills() is invoked
- **THEN** throw error with code "LANCE_SEARCH_ERROR"
- **AND** error.message MUST include "LanceDB connection failed"

#### Scenario: 嵌入模型加载失败
- **GIVEN** embedding model fails to load
- **WHEN** getEmbedding() is invoked
- **THEN** log a warning message
- **AND** fall back to keyword matching (based on name and description inclusion)
- **AND** return Skills filtered by keywords

### Requirement: Embedding模型配置读取
The system MUST read Embedding model configuration from SQLite database through LLMConfigService, supporting both local models and external API modes.

#### Scenario: 读取本地Embedding模型配置
- **GIVEN** SQLite contains Embedding model configuration:
  ```typescript
  {
    modelKey: 'all-MiniLM-L6-v2',
    modelType: 'embedding',
    modelConfig: {
      local: true,
      modelPath: './models/embedding/all-MiniLM-L6-v2',
      dimensions: 384,
      quantized: true
    },
    isDefault: true
  }
  ```
- **WHEN** ToolRetrievalService.initialize() is invoked
- **THEN** retrieve configuration via LLMConfigService.getDefaultModel('embedding')
- **AND** parse modelConfig.local=true to determine local model
- **AND** load the model from specified path using transformers.js
- **AND** log "Loaded local embedding model: all-MiniLM-L6-v2"

#### Scenario: 读取外部API Embedding配置
- **GIVEN** SQLite contains external Embedding model configuration:
  ```typescript
  {
    modelKey: 'text-embedding-3-small',
    modelType: 'embedding',
    modelConfig: {
      local: false,
      apiEndpoint: '/embeddings',
      dimensions: 512,
      timeout: 10000
    },
    isDefault: true
  }
  ```
- **AND** the corresponding Provider has baseURL and apiKey configured
- **WHEN** getEmbedding() generates vectors
- **THEN** call LLMManager.generateEmbedding() to send API request
- **AND** construct full URL using provider's baseURL + apiEndpoint
- **AND** authenticate using provider's apiKey
- **AND** return vector results within timeout period

#### Scenario: Embedding模型配置不存在时的降级
- **GIVEN** no Embedding model is configured in SQLite
- **WHEN** ToolRetrievalService initializes
- **THEN** call ensureDefaultEmbeddingModel() to create default configuration
- **AND** automatically create local provider (if it doesn't exist)
- **AND** create default all-MiniLM-L6-v2 model configuration
- **AND** set isDefault=true, enabled=true
- **AND** enable normal operation after initialization

#### Scenario: 运行时切换Embedding模型
- **GIVEN** existing Embedding model A (isDefault=true)
- **AND** new Embedding model B created (currently isDefault=false)
- **WHEN** calling LLMConfigService.updateModel(modelB.id, { isDefault: true })
- **THEN** ToolRetrievalService MUST use model B on next getEmbedding() call
- **AND** take effect without service restart
- **AND** retain old Embedding model configuration in database

#### Scenario: LLMManager embed()方法调用流程
- **GIVEN** ToolRetrievalService needs to generate Skills vector embeddings
- **AND** the text is: "自动分析Git改动并生成conventional commit信息"
- **WHEN** invoking LLMManager.embed([text], { provider: 'openai', model: 'text-embedding-3-small' })
- **THEN** LLMManager MUST execute the following steps:
  1. Parse parameters to obtain specified provider and model
  2. Call this.modelRegistry.findModel('openai', 'text-embedding-3-small')
  3. Read model configuration and provider configuration from SQLite database
  4. Call this.getOrCreateAdapter(model) to obtain adapter
  5. Call adapter.embed([text], 'text-embedding-3-small')
  6. Adapter sends POST request to `/embeddings` via Axios
  7. Receive response and parse embedding array
  8. Return `[[0.123, 0.456, 0.789, ...]]` (1536-dimensional vector)
- **AND** entire call chain MUST complete within < 1000ms
- **AND** vector dimensions MUST match model configuration (1536-dimensional)

#### Scenario: 适配器embed方法实现（OpenAIAdapter）
- **GIVEN** OpenAIAdapter has implemented embed method
- **AND** input contains 3 texts: ['Git提交工具', '文件读取工具', '计算工具']
- **WHEN** calling adapter.embed(texts, 'text-embedding-3-small')
- **THEN** send request to OpenAI API:
  ```typescript
  {
    input: ['Git提交工具', '文件读取工具', '计算工具'],
    model: 'text-embedding-3-small',
    encoding_format: 'float'
  }
  ```
- **AND** include in request header: Authorization: Bearer ${apiKey}
- **AND** parse response and return:
  ```typescript
  [
    [0.123, 0.456, 0.789, ...],  // 1536-dimensional
    [0.234, 0.567, 0.890, ...],
    [0.345, 0.678, 0.901, ...]
  ]
  ```
- **AND** returned array length MUST be 3 (matching input text count)

#### Scenario: OllamaAdapter embed方法实现
- **GIVEN** OllamaAdapter has implemented embed method
- **AND** input text: ['代码分析工具']
- **WHEN** calling adapter.embed(texts, 'nomic-embed-text')
- **THEN** send request to Ollama API at `/api/embed`:
  ```typescript
  {
    model: 'nomic-embed-text',
    input: '代码分析工具',
    options: { truncate: true }
  }
  ```
- **AND** Ollama computes vector embeddings locally (offline operation)
- **AND** parse response and return 768-dimensional vector
- **AND** total time MUST be < 500ms (local computation)

#### Scenario: 本地Embedding模型加载和缓存
- **GIVEN** ToolRetrievalService first invocation of getEmbedding to generate vectors
- **AND** configuration uses local model: all-MiniLM-L6-v2, modelPath='./models/embedding/all-MiniLM-L6-v2'
- **WHEN** calling generateLocalEmbedding(['Git提交'], 'all-MiniLM-L6-v2')
- **THEN** execute the following steps:
  1. Check if model is loaded (not loaded on first call)
  2. Call `await import('@xenova/transformers')` to dynamically load library
  3. Call `await pipeline('feature-extraction', modelPath)` to load model
  4. Model loading completes, taking approximately 2000-5000ms (first time)
  5. Call loadedModel(['Git提交']) to generate vector
  6. Return 384-dimensional vector
  7. Cache loaded model instance (reuse on next call)
- **AND** on second call (with cached model):
  - Skip steps 1-4
  - Directly execute steps 5-6
  - Total time MUST be < 100ms

#### Scenario: 批量文本Embedding生成优化
- **GIVEN** need to generate vectors for 100 Skills (batch processing)
- **WHEN** calling LLMManager.embed(skillTexts, { provider: 'openai' })
- **THEN** LLMManager MUST pass batch texts to adapter
- **AND** OpenAIAdapter MUST send all texts in a single API call:
  ```typescript
  {
    input: skillTexts,  // 100 texts
    model: 'text-embedding-3-small'
  }
  ```
- **AND** OpenAI processes in parallel, returning 100 vectors
- **AND** total time MUST be approximately 2000-3000ms (batch processing)
- **AND** be 10-20x faster than loop calls (100 API calls)

#### Scenario: Embedding配置缓存（减少数据库查询）
- **GIVEN** ToolRetrievalService needs multiple getEmbedding invocations
- **AND** Embedding model configuration was read from SQLite on first call
- **WHEN** calling getEmbedding() on second and subsequent calls
- **THEN** ToolRetrievalService MUST reuse in-memory model configuration
- **AND** not repeat SQLite database queries
- **AND** reduce query time from 10ms → < 1ms
- **AND** automatically invalidate cache after 5 minutes if configuration is updated at runtime

## MODIFIED Requirements

*无修改现有需求*

## REMOVED Requirements

*无删除现有需求*
