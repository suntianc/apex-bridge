#!/usr/bin/env ts-node
/**
 * Migration Runner Script
 * Run database migrations for the Playbook system
 *
 * Usage:
 *   npm run migrations --                Run all pending migrations
 *   npm run migrations -- --status       Check migration status
 *   npm run migrations -- --rollback=1   Rollback last migration
 *   npm run migrations -- --help         Show help
 */

import { MigrationRunner } from "./MigrationRunner";
import * as path from "path";

// Configuration
const DATABASE_PATH = process.env.PLAYBOOK_DB_PATH || ".data/playbook.db";
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

// Parse command line arguments
function parseArgs(): { action: string; count?: number; help?: boolean } {
  const args = process.argv.slice(2);
  const result: { action: string; count?: number; help?: boolean } = { action: "run" };

  for (const arg of args) {
    if (arg === "--status" || arg === "-s") {
      result.action = "status";
    } else if (arg === "--help" || arg === "-h") {
      result.action = "help";
    } else if (arg.startsWith("--rollback=")) {
      result.action = "rollback";
      const countStr = arg.split("=")[1];
      result.count = parseInt(countStr, 10);
      if (isNaN(result.count) || result.count <= 0) {
        console.error("Error: Rollback count must be a positive number");
        process.exit(1);
      }
    } else if (arg === "--rollback") {
      result.action = "rollback";
      result.count = 1;
    }
  }

  return result;
}

/**
 * Display help information
 */
function showHelp(): void {
  console.log(`
Migration Runner for Playbook System Database

Usage:
  npm run migrations [options]

Options:
  --status, -s         Check migration status without running
  --rollback [=n]      Rollback last n migrations (default: 1)
  --help, -h           Show this help message

Examples:
  npm run migrations                    # Run all pending migrations
  npm run migrations -- --status        # Check migration status
  npm run migrations -- --rollback=2    # Rollback last 2 migrations
`);
}

/**
 * Display migration status
 */
async function showStatus(runner: MigrationRunner): Promise<void> {
  console.log("Database Migration Status\n");
  console.log("=".repeat(60));

  const currentVersion = runner.getCurrentVersion();
  console.log(`Current Version: ${currentVersion || "None"}`);

  const isUpToDate = runner.isUpToDate();
  console.log(`Status: ${isUpToDate ? "✓ Up to date" : "✗ Out of date"}`);

  console.log("\nMigration History:");
  console.log("-".repeat(60));

  const history = runner.getMigrationHistory();

  if (history.length === 0) {
    console.log("No migrations have been executed yet.");
  } else {
    for (const migration of history) {
      const date = new Date(migration.executed_at).toLocaleString();
      console.log(
        `  ${migration.version} - ${migration.name.padEnd(40)} ` +
          `(${migration.duration}ms) - ${date}`
      );
    }
  }

  if (!isUpToDate) {
    console.log("\nPending Migrations:");
    console.log("-".repeat(60));
    // Note: We need to reload pending migrations from files
    // This is a simplified status check
  }

  console.log("\n");
}

/**
 * Main execution function
 */
async function main(): Promise<void> {
  const args = parseArgs();

  if (args.action === "help") {
    showHelp();
    process.exit(0);
  }

  // Ensure database directory exists
  const dbDir = path.dirname(DATABASE_PATH);
  const fs = require("fs");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Created database directory: ${dbDir}\n`);
  }

  const runner = new MigrationRunner(DATABASE_PATH, MIGRATIONS_DIR);

  try {
    switch (args.action) {
      case "status":
        await showStatus(runner);
        break;

      case "rollback": {
        console.log(`Rolling back last ${args.count || 1} migration(s)...\n`);
        const rollbackResults = runner.rollback(args.count || 1);

        for (const result of rollbackResults) {
          if (result.success) {
            console.log(`✓ Rolled back ${result.version}: ${result.name}`);
          } else {
            console.error(`✗ Failed to rollback ${result.version}: ${result.error}`);
          }
        }
        break;
      }

      case "run":
      default: {
        const results = await runner.run();

        console.log("\n" + "=".repeat(60));
        console.log("Migration Summary:");
        console.log("=".repeat(60));

        const successful = results.filter((r) => r.success).length;
        const failed = results.filter((r) => !r.success).length;

        console.log(`Total: ${results.length}`);
        console.log(`Successful: ${successful}`);
        console.log(`Failed: ${failed}`);

        if (failed > 0) {
          console.log("\nFailed Migrations:");
          for (const result of results) {
            if (!result.success) {
              console.log(`  ${result.version}: ${result.error}`);
            }
          }
          process.exit(1);
        }
        break;
      }
    }
  } catch (error) {
    console.error("\nError:", error);
    process.exit(1);
  } finally {
    runner.close();
  }
}

// Run main function
main().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
