/**
 * 数据库迁移脚本：为 llm_models 表添加 is_ace_evolution 字段
 * 并提供交互式标记 ACE 进化模型的功能
 */

import { LLMConfigService } from '../src/services/LLMConfigService';
import { logger } from '../src/utils/logger';

async function main() {
    console.log('🔧 ACE Evolution Model Configuration');
    console.log('=====================================\n');

    const configService = LLMConfigService.getInstance();

    // 1. 列出所有可用的 NLP 模型
    console.log('📋 Available NLP Models:\n');
    const nlpModels = configService.getModelsByType('nlp' as any);

    if (nlpModels.length === 0) {
        console.log('❌ No NLP models found in database.');
        console.log('💡 Please configure LLM providers first via the admin API.\n');
        process.exit(1);
    }

    nlpModels.forEach((model, index) => {
        const marker = model.isAceEvolution ? '✅ [ACE EVOLUTION]' : '';
        console.log(`${index + 1}. ${model.providerName} / ${model.modelName} (${model.modelKey}) ${marker}`);
    });

    console.log('\n📌 Recommendation: Choose a high-intelligence model like GPT-4 or DeepSeek for ACE evolution.');
    console.log('This model will be used for reflection and rule curation (background tasks).\n');

    // 2. 获取当前ACE进化模型
    const currentAceModel = configService.getAceEvolutionModel();
    if (currentAceModel) {
        console.log(`✅ Current ACE Evolution Model: ${currentAceModel.providerName}/${currentAceModel.modelKey}\n`);
    } else {
        console.log('⚠️  No ACE evolution model is currently set.\n');
    }

    // 3. 提示用户选择（如果是自动化脚本，可以传入参数）
    const modelIndex = process.argv[2] ? parseInt(process.argv[2]) - 1 : -1;

    if (modelIndex >= 0 && modelIndex < nlpModels.length) {
        const selectedModel = nlpModels[modelIndex];

        console.log(`🔄 Setting ${selectedModel.providerName}/${selectedModel.modelKey} as ACE evolution model...`);

        configService.updateModel(selectedModel.id, {
            isAceEvolution: true
        });

        console.log('✅ ACE evolution model updated successfully!\n');
        console.log('💡 Tip: Restart your ApexBridge server to apply changes.');
    } else {
        console.log('Usage: npx ts-node scripts/configure-ace-model.ts [model_number]');
        console.log('Example: npx ts-node scripts/configure-ace-model.ts 1\n');
    }

    configService.close();
}

main().catch(error => {
    console.error('❌ Error:', error);
    process.exit(1);
});
