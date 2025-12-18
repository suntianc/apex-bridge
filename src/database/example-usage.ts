/**
 * Example Usage of Playbook System Database
 * Demonstrates how to use the migration runner and interact with the database
 */

import { MigrationRunner } from './MigrationRunner';
import * as path from 'path';
import Database from 'better-sqlite3';

/**
 * Example 1: Running Migrations
 */
async function example1_RunMigrations(): Promise<void> {
  console.log('=== Example 1: Running Migrations ===\n');

  const dbPath = 'data/playbook.db';
  const runner = new MigrationRunner(dbPath);

  try {
    // Check current status
    const isUpToDate = runner.isUpToDate();
    console.log(`Database is up to date: ${isUpToDate}`);

    const currentVersion = runner.getCurrentVersion();
    console.log(`Current version: ${currentVersion || 'None'}\n`);

    if (!isUpToDate) {
      // Run all pending migrations
      const results = await runner.run();

      console.log('\nMigration Results:');
      results.forEach(result => {
        if (result.success) {
          console.log(`  ✓ ${result.version}: ${result.name} (${result.duration}ms)`);
        } else {
          console.log(`  ✗ ${result.version}: ${result.name} - ${result.error}`);
        }
      });
    }
  } finally {
    runner.close();
  }

  console.log('\n');
}

/**
 * Example 2: Querying the Database
 */
function example2_QueryDatabase(): void {
  console.log('=== Example 2: Querying the Database ===\n');

  const dbPath = 'data/playbook.db';
  const db = new Database(dbPath);

  try {
    // Query type vocabulary
    console.log('Type Vocabulary:');
    const types = db.prepare('SELECT * FROM type_vocabulary ORDER BY confidence DESC LIMIT 5').all();
    types.forEach((type: any) => {
      console.log(`  - ${type.tag_name}: confidence=${type.confidence}, count=${type.playbook_count}`);
    });

    // Query playbook assignments
    console.log('\nPlaybook Assignments:');
    const assignments = db.prepare(`
      SELECT pta.*, tv.confidence as avg_confidence
      FROM playbook_type_assignments pta
      JOIN type_vocabulary tv ON pta.tag_name = tv.tag_name
      ORDER BY pta.confidence DESC
      LIMIT 5
    `).all();
    assignments.forEach((assignment: any) => {
      console.log(`  - Playbook ${assignment.playbook_id}: ${assignment.tag_name} (${assignment.confidence})`);
    });

    // Query prompt templates
    console.log('\nPrompt Templates:');
    const templates = db.prepare('SELECT * FROM prompt_templates ORDER BY usage_count DESC LIMIT 5').all();
    templates.forEach((template: any) => {
      console.log(`  - ${template.name}: type=${template.template_type}, usage=${template.usage_count}`);
    });
  } finally {
    db.close();
  }

  console.log('\n');
}

/**
 * Example 3: Inserting Data
 */
function example3_InsertData(): void {
  console.log('=== Example 3: Inserting Data ===\n');

  const dbPath = 'data/playbook.db';
  const db = new Database(dbPath);

  try {
    const now = Date.now();

    // Insert a new type tag
    db.prepare(`
      INSERT OR REPLACE INTO type_vocabulary (
        tag_name, keywords, confidence, first_identified, playbook_count,
        discovered_from, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'rapid_iteration',
      JSON.stringify(['快速', '迭代', '实验', '验证']),
      0.95,
      now,
      10,
      'historical_clustering',
      now,
      now,
      JSON.stringify({
        description: '快速迭代问题解决方法',
        usage_examples: ['MVP开发', 'A/B测试', '原型验证']
      })
    );
    console.log('✓ Inserted type: rapid_iteration');

    // Insert playbook assignment
    db.prepare(`
      INSERT OR REPLACE INTO playbook_type_assignments (
        playbook_id, tag_name, confidence, assigned_method, assigned_at, verified
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'pb_001',
      'rapid_iteration',
      0.92,
      'automatic',
      now,
      1
    );
    console.log('✓ Inserted playbook assignment: pb_001 -> rapid_iteration');

    // Insert prompt template
    db.prepare(`
      INSERT OR REPLACE INTO prompt_templates (
        template_id, template_type, name, content, variables,
        applicable_tags, guidance_level, created_at, updated_at,
        usage_count, effectiveness_score, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'rapid_iteration_guidance',
      'guidance',
      '快速迭代指导模板',
      '根据以下最佳实践指导本次任务：\n\n【目标】{goal}\n【关键步骤】{steps}',
      JSON.stringify(['goal', 'steps']),
      JSON.stringify(['rapid_iteration']),
      'medium',
      now,
      now,
      10,
      0.88,
      JSON.stringify({
        language: 'zh',
        tone: 'professional'
      })
    );
    console.log('✓ Inserted prompt template: rapid_iteration_guidance');

  } finally {
    db.close();
  }

  console.log('\n');
}

/**
 * Example 4: Using Type Evolution History
 */
function example4_TypeEvolution(): void {
  console.log('=== Example 4: Type Evolution History ===\n');

  const dbPath = 'data/playbook.db';
  const db = new Database(dbPath);

  try {
    const now = Date.now();

    // Record a type merge event
    db.prepare(`
      INSERT INTO type_evolution_history (
        id, event_type, tag_name, previous_state, new_state,
        reason, triggered_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `teh_${Date.now()}`,
      'merged',
      'agile_execution',
      JSON.stringify({ confidence: 0.6, playbook_count: 15 }),
      JSON.stringify({ confidence: 0.85, playbook_count: 28 }),
      '与 rapid_iteration 高度相似 (0.85)，合并以提高匹配准确性',
      'automatic',
      now
    );
    console.log('✓ Recorded type evolution event: merged agile_execution');

    // Query evolution history
    console.log('\nEvolution History:');
    const history = db.prepare(`
      SELECT * FROM type_evolution_history
      ORDER BY created_at DESC
      LIMIT 5
    `).all();

    history.forEach((event: any) => {
      const date = new Date(event.created_at).toLocaleString();
      console.log(`  - ${event.event_type}: ${event.tag_name} (${date})`);
      console.log(`    Reason: ${event.reason}`);
    });

  } finally {
    db.close();
  }

  console.log('\n');
}

/**
 * Example 5: Checking Migration Status
 */
async function example5_CheckStatus(): Promise<void> {
  console.log('=== Example 5: Checking Migration Status ===\n');

  const dbPath = 'data/playbook.db';
  const runner = new MigrationRunner(dbPath);

  try {
    // Get migration history
    const history = runner.getMigrationHistory();

    console.log('Migration History:');
    console.log('=' .repeat(60));

    if (history.length === 0) {
      console.log('No migrations have been executed yet.');
    } else {
      history.forEach(migration => {
        const date = new Date(migration.executed_at).toLocaleString();
        console.log(`${migration.version} - ${migration.name}`);
        console.log(`  Executed: ${date}`);
        console.log(`  Duration: ${migration.duration}ms`);
        console.log(`  Checksum: ${migration.checksum.substring(0, 16)}...`);
        console.log('');
      });
    }

    console.log(`Current Version: ${runner.getCurrentVersion() || 'None'}`);
    console.log(`Is Up to Date: ${runner.isUpToDate()}`);

  } finally {
    runner.close();
  }

  console.log('\n');
}

/**
 * Example 6: Rollback Example (Use with caution!)
 */
async function example6_Rollback(): Promise<void> {
  console.log('=== Example 6: Rollback Example ===\n');
  console.log('⚠️  WARNING: This is a demonstration. Always backup before rolling back!\n');

  const dbPath = 'data/playbook.db';
  const runner = new MigrationRunner(dbPath);

  try {
    // Show current status
    const currentVersion = runner.getCurrentVersion();
    console.log(`Current version: ${currentVersion || 'None'}`);

    // Ask for confirmation (in real code, you'd have user input)
    console.log('\nRolling back last migration...');
    const results = runner.rollback(1);

    results.forEach(result => {
      if (result.success) {
        console.log(`✓ Rolled back: ${result.version}: ${result.name}`);
      } else {
        console.log(`✗ Failed to rollback: ${result.version}: ${result.error}`);
      }
    });

    // Show new status
    const newVersion = runner.getCurrentVersion();
    console.log(`\nNew version: ${newVersion || 'None'}`);

  } finally {
    runner.close();
  }

  console.log('\n');
}

/**
 * Main function to run all examples
 */
async function main(): Promise<void> {
  console.log('\n');
  console.log('=' .repeat(70));
  console.log('Playbook System Database - Migration Runner Examples');
  console.log('=' .repeat(70));
  console.log('\n');

  // Ensure data directory exists
  const fs = require('fs');
  if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
  }

  try {
    // Run migrations first
    await example1_RunMigrations();

    // Insert some data
    example3_InsertData();

    // Query the database
    example2_QueryDatabase();

    // Use type evolution history
    example4_TypeEvolution();

    // Check status
    await example5_CheckStatus();

    // Example of rollback (commented out by default)
    // await example6_Rollback();

    console.log('=' .repeat(70));
    console.log('All examples completed successfully!');
    console.log('=' .repeat(70));
    console.log('\n');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export {
  example1_RunMigrations,
  example2_QueryDatabase,
  example3_InsertData,
  example4_TypeEvolution,
  example5_CheckStatus,
  example6_Rollback
};
