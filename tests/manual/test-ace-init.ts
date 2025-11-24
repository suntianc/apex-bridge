import { AceService } from '../../src/services/AceService';
import { logger } from '../../src/utils/logger';

async function main() {
    console.log('🧪 Testing AceService Initialization...');

    try {
        const aceService = AceService.getInstance();
        await aceService.initialize();

        const engine = aceService.getEngine();
        if (engine) {
            console.log('✅ AceEngine initialized successfully');

            // Mock a trajectory evolution
            console.log('🧪 Testing Evolution Trigger...');
            await aceService.evolve({
                task_id: 'test-task-1',
                user_input: 'test input',
                steps: [],
                final_result: 'test result',
                outcome: 'SUCCESS',
                environment_feedback: 'Good job',
                used_rule_ids: [],
                timestamp: Date.now(),
                duration_ms: 100,
                evolution_status: 'PENDING'
            });

            console.log('✅ Evolution triggered (check logs for async results)');
        } else {
            console.error('❌ AceEngine failed to initialize (check config enabled status)');
        }
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

main();
