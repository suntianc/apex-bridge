/**
 * Migration Runner for Playbook System Database
 * Executes SQL migration scripts in order and tracks execution history
 */

import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';

export interface Migration {
  version: string;
  name: string;
  sql: string;
  timestamp: number;
}

export interface MigrationResult {
  success: boolean;
  version: string;
  name: string;
  duration: number;
  error?: string;
}

export class MigrationRunner {
  private db: Database.Database;
  private migrationsDir: string;

  constructor(dbPath: string, migrationsDir: string = path.join(__dirname, 'migrations')) {
    this.db = new Database(dbPath);
    this.migrationsDir = migrationsDir;

    // Initialize migrations tracking table
    this.initializeMigrationsTable();
  }

  /**
   * Create migrations tracking table if it doesn't exist
   */
  private initializeMigrationsTable(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        executed_at INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        checksum TEXT NOT NULL
      );
    `;

    const createIndexSQL = `
      CREATE INDEX IF NOT EXISTS idx_migrations_executed_at ON schema_migrations(executed_at DESC);
    `;

    this.db.exec(createTableSQL);
    this.db.exec(createIndexSQL);
  }

  /**
   * Calculate checksum for SQL file
   */
  private calculateChecksum(sql: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(sql).digest('hex');
  }

  /**
   * Get all migration files from migrations directory
   */
  private getMigrationFiles(): string[] {
    if (!fs.existsSync(this.migrationsDir)) {
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(file => file.match(/^\d+_.*\.sql$/))
      .sort();

    return files.map(file => path.join(this.migrationsDir, file));
  }

  /**
   * Parse migration filename to extract version and name
   */
  private parseMigrationFilename(filename: string): { version: string; name: string } {
    const basename = path.basename(filename);
    const match = basename.match(/^(\d+)_([^.]+)\.sql$/);

    if (!match) {
      throw new Error(`Invalid migration filename: ${filename}`);
    }

    const version = match[1].padStart(3, '0'); // Pad with zeros for proper sorting
    const name = match[2];

    return { version, name };
  }

  /**
   * Load all pending migrations
   */
  private loadPendingMigrations(): Migration[] {
    const migrationFiles = this.getMigrationFiles();
    const pendingMigrations: Migration[] = [];

    for (const file of migrationFiles) {
      const { version, name } = this.parseMigrationFilename(file);
      const sql = fs.readFileSync(file, 'utf-8');
      const checksum = this.calculateChecksum(sql);

      // Check if migration was already executed
      const row = this.db
        .prepare('SELECT checksum FROM schema_migrations WHERE version = ?')
        .get(version) as { checksum: string } | undefined;

      if (row) {
        // Migration exists, check if checksum matches
        if (row.checksum === checksum) {
          continue; // Migration already executed with same content
        } else {
          throw new Error(
            `Migration ${version} (${name}) has already been executed with different content. ` +
            `Expected checksum: ${checksum}, found: ${row.checksum}`
          );
        }
      }

      pendingMigrations.push({
        version,
        name,
        sql,
        timestamp: Date.now()
      });
    }

    return pendingMigrations;
  }

  /**
   * Execute a single migration
   */
  private executeMigration(migration: Migration): MigrationResult {
    const startTime = Date.now();

    try {
      // Begin transaction
      this.db.exec('BEGIN TRANSACTION');

      // Execute the migration SQL
      this.db.exec(migration.sql);

      // Record migration in schema_migrations table
      const checksum = this.calculateChecksum(migration.sql);
      this.db.prepare(`
        INSERT INTO schema_migrations (version, name, executed_at, duration, checksum)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        migration.version,
        migration.name,
        migration.timestamp,
        0, // Will update with actual duration after commit
        checksum
      );

      // Commit transaction
      this.db.exec('COMMIT');

      const duration = Date.now() - startTime;

      // Update duration
      this.db.prepare(`
        UPDATE schema_migrations
        SET duration = ?
        WHERE version = ?
      `).run(duration, migration.version);

      return {
        success: true,
        version: migration.version,
        name: migration.name,
        duration
      };
    } catch (error) {
      // Rollback on error
      this.db.exec('ROLLBACK');

      return {
        success: false,
        version: migration.version,
        name: migration.name,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Run all pending migrations
   */
  public async run(): Promise<MigrationResult[]> {
    const pendingMigrations = this.loadPendingMigrations();

    if (pendingMigrations.length === 0) {
      console.log('No pending migrations to execute.');
      return [];
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s).`);
    console.log('Starting migration process...\n');

    const results: MigrationResult[] = [];

    for (const migration of pendingMigrations) {
      console.log(`Executing migration ${migration.version}: ${migration.name}...`);

      const result = this.executeMigration(migration);
      results.push(result);

      if (result.success) {
        console.log(`  ✓ Completed in ${result.duration}ms`);
      } else {
        console.error(`  ✗ Failed: ${result.error}`);
        console.error('\nMigration process halted. Please resolve the error and try again.');
        break;
      }
    }

    console.log('\nMigration process completed.');
    return results;
  }

  /**
   * Get migration history
   */
  public getMigrationHistory(): Array<{
    version: string;
    name: string;
    executed_at: number;
    duration: number;
    checksum: string;
  }> {
    const rows = this.db
      .prepare(`
        SELECT version, name, executed_at, duration, checksum
        FROM schema_migrations
        ORDER BY version ASC
      `)
      .all() as Array<{
        version: string;
        name: string;
        executed_at: number;
        duration: number;
        checksum: string;
      }>;

    return rows;
  }

  /**
   * Rollback last N migrations
   */
  public rollback(count: number = 1): MigrationResult[] {
    if (count <= 0) {
      throw new Error('Rollback count must be positive');
    }

    console.log(`Rolling back last ${count} migration(s)...\n`);

    const results: MigrationResult[] = [];

    try {
      // Get the last N migrations to rollback
      const migrationsToRollback = this.db
        .prepare(`
          SELECT version, name
          FROM schema_migrations
          ORDER BY version DESC
          LIMIT ?
        `)
        .all(count) as Array<{ version: string; name: string }>;

      if (migrationsToRollback.length === 0) {
        console.log('No migrations to rollback.');
        return [];
      }

      // For simplicity, we'll delete the migration records
      // In production, you would create rollback scripts for each migration
      for (const migration of migrationsToRollback) {
        try {
          const startTime = Date.now();

          this.db
            .prepare('DELETE FROM schema_migrations WHERE version = ?')
            .run(migration.version);

          console.log(`Rolled back migration ${migration.version}: ${migration.name}`);

          results.push({
            success: true,
            version: migration.version,
            name: migration.name,
            duration: Date.now() - startTime
          });
        } catch (error) {
          results.push({
            success: false,
            version: migration.version,
            name: migration.name,
            duration: 0,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      console.log('\nRollback process completed.');
    } catch (error) {
      console.error('Rollback failed:', error);
    }

    return results;
  }

  /**
   * Get database version (latest executed migration)
   */
  public getCurrentVersion(): string | null {
    const row = this.db
      .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
      .get() as { version: string } | undefined;

    return row?.version || null;
  }

  /**
   * Check if database is up to date
   */
  public isUpToDate(): boolean {
    return this.loadPendingMigrations().length === 0;
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }
}

// Example usage:
// const runner = new MigrationRunner('.data/playbook.db');
// const results = await runner.run();
// console.log('Migration results:', results);
// runner.close();
