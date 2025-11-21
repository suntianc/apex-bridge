import { AceAgent, SQLiteAdapter, ChromaAdapter, DuckDBAdapter, Trajectory } from 'ace-engine-core';
import { ChromaClient } from 'chromadb';
import { LLMManager } from '../core/LLMManager';
import { ApexLLMAdapter } from '../core/ace/ApexLLMAdapter';
import { ConfigService } from './ConfigService';
import { LLMConfigService } from './LLMConfigService';
import { logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export class AceService {
    private static instance: AceService;
    private agent: AceAgent | null = null;
    private llmManager: LLMManager;
    private configService: ConfigService;
    private llmConfigService: LLMConfigService;
    private isInitializing: boolean = false;

    private constructor() {
        this.llmManager = new LLMManager();
        this.configService = ConfigService.getInstance();
        this.llmConfigService = LLMConfigService.getInstance();
    }

    public static getInstance(): AceService {
        if (!AceService.instance) {
            AceService.instance = new AceService();
        }
        return AceService.instance;
    }

    /**
     * Initialize ACE Engine
     */
    async initialize(): Promise<void> {
        if (this.agent || this.isInitializing) return;

        this.isInitializing = true;
        logger.info('🚀 Initializing ACE Engine...');

        try {
            // 1. Prepare Data Directories
            const dataDir = path.join(process.cwd(), 'data', 'ace');
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // 2. Initialize Adapters
            const sqlitePath = path.join(dataDir, 'trajectory.db');
            const sqliteStore = new SQLiteAdapter(sqlitePath);
            sqliteStore.init();
            logger.debug(`[ACE] SQLite initialized at ${sqlitePath}`);

            // TODO: Make ChromaDB URL configurable
            const chromaClient = new ChromaClient({ path: 'http://localhost:8000' });
            // Cast to any to bypass version mismatch between ace-engine-core (v1) and apex-bridge (v3)
            const chromaStore = new ChromaAdapter(chromaClient as any, 'apex_playbook');

            // Try to init Chroma, warn if fails (likely service not running)
            try {
                await chromaStore.init();
                logger.debug('[ACE] ChromaDB initialized');
            } catch (e: any) {
                logger.warn(`[ACE] Failed to connect to ChromaDB: ${e.message}. ACE will run in degraded mode.`);
                // We might want to throw here if vector store is critical, but for now let's proceed
            }

            const duckdbAnalysis = new DuckDBAdapter();
            // Note: DuckDB attach might fail if SQLite is locked, handle gracefully
            try {
                await duckdbAnalysis.connect(sqlitePath);
                logger.debug('[ACE] DuckDB Analysis Engine connected');
            } catch (e: any) {
                logger.warn(`[ACE] Failed to connect DuckDB: ${e.message}`);
            }

            // 3. Create LLM Adapter with Dual-Channel Strategy
            // 从数据库查询ACE进化专用模型
            const evolutionModel = this.llmConfigService.getAceEvolutionModel();

            if (!evolutionModel) {
                logger.warn('[ACE] No ACE evolution model configured in database. Please mark a model as ACE evolution model.');
                logger.warn('[ACE] ACE Engine will be disabled.');
                return;
            }

            logger.info(`[ACE] Using evolution model: ${evolutionModel.providerName}/${evolutionModel.modelKey}`);

            const llmAdapter = new ApexLLMAdapter(this.llmManager, {
                // Execution Model: Dynamic (will be overridden by ChatService context usually, but provide default)
                executionModelGetter: () => {
                    // Default to evolution model if no context
                    return { provider: evolutionModel.provider, model: evolutionModel.modelKey };
                },
                // Evolution Model: From database
                evolutionModel: { provider: evolutionModel.provider, model: evolutionModel.modelKey }
            });

            // 4. Instantiate Agent
            this.agent = new AceAgent({
                llm: llmAdapter,
                vectorStore: chromaStore,
                trajectoryStore: sqliteStore,
                analysisEngine: duckdbAnalysis,
                reflectionStrategy: 'on_failure',
                retrievalLimit: 5
            });

            // 5. Bind Events
            this.bindEvents();

            logger.info('✅ ACE Engine initialized successfully');
        } catch (error: any) {
            logger.error(`❌ Failed to initialize ACE Engine: ${error.message}`);
            this.agent = null;
        } finally {
            this.isInitializing = false;
        }
    }

    private bindEvents() {
        if (!this.agent) return;

        this.agent.on('status', (status) => {
            logger.debug(`[ACE Status] ${status}`);
        });

        this.agent.on('evolved', (deltas) => {
            logger.info(`✨ [ACE Evolution] Agent learned ${deltas.length} new things!`);
            // TODO: Push to WebSocket if needed
        });

        this.agent.on('reflected', (insight) => {
            logger.info(`🤔 [ACE Reflection] Insight: ${insight.outcome_analysis.substring(0, 100)}...`);
        });

        this.agent.on('error', (error) => {
            logger.error(`[ACE Error] ${error.message}`);
        });
    }

    public getAgent(): AceAgent | null {
        return this.agent;
    }

    /**
     * Trigger evolution asynchronously
     */
    public async evolve(trajectory: Trajectory): Promise<void> {
        if (!this.agent) return;

        // We need to access the private evolve method or expose it in AceAgent
        // Since AceAgent.evolve is private, we need to use the public run() method usually.
        // However, for this integration, we want to inject an externally executed trajectory.
        // We might need to modify AceAgent to expose evolve() or similar method.

        // WORKAROUND: Accessing private method via 'any' for now, 
        // SHOULD be fixed by updating AceAgent interface in core.
        try {
            logger.debug(`[ACE] Triggering evolution for task ${trajectory.task_id}`);
            await (this.agent as any).evolve(trajectory);
        } catch (error: any) {
            logger.error(`[ACE] Evolution failed: ${error.message}`);
        }
    }
}
