/**
 * Reset admin configuration file to default template.
 */
import { ConfigService } from '../src/services/ConfigService';

async function main(): Promise<void> {
  const service = ConfigService.getInstance();
  service.resetConfig();
  console.log('✅ admin-config.json has been reset to defaults (setup_completed=false).');
  console.log('👉 Please re-run the setup wizard to configure the system again.');
}

main().catch((error) => {
  console.error('❌ Failed to reset config:', error);
  process.exit(1);
});

