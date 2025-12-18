# Playbook System Database Migration Guide

This directory contains database migration scripts for the Playbook system's SQLite database.

## Overview

The migration system manages schema changes for the Playbook system, which includes:
- Type vocabulary management
- Type similarity matrix
- Type evolution history tracking
- Playbook-type assignments
- Prompt templates

## Files

### Migration Scripts
- `001_create_type_vocabulary.sql` - Creates the type vocabulary table
- `002_create_type_similarity_matrix.sql` - Creates the type similarity matrix
- `003_create_type_evolution_history.sql` - Creates the type evolution history table
- `004_create_playbook_type_assignments.sql` - Creates playbook-type assignments table
- `005_create_prompt_templates.sql` - Creates the prompt templates table

### Core Files
- `MigrationRunner.ts` - Core migration execution engine
- `run-migrations.ts` - CLI script for running migrations

## Usage

### Run All Pending Migrations

```bash
npm run migrations
```

### Check Migration Status

```bash
npm run migrations -- --status
```

### Rollback Last Migration

```bash
npm run migrations -- --rollback
```

### Rollback Last N Migrations

```bash
npm run migrations -- --rollback=2
```

### Show Help

```bash
npm run migrations -- --help
```

## Programmatic Usage

```typescript
import { MigrationRunner } from './src/database/MigrationRunner';
import * as path from 'path';

// Initialize runner
const runner = new MigrationRunner('data/playbook.db');

// Run migrations
const results = await runner.run();

// Check status
const isUpToDate = runner.isUpToDate();
const currentVersion = runner.getCurrentVersion();

// Get migration history
const history = runner.getMigrationHistory();

// Rollback migrations
const rollbackResults = runner.rollback(1);

// Clean up
runner.close();
```

## Migration Tracking

All executed migrations are tracked in the `schema_migrations` table with:
- Version number
- Name
- Execution timestamp
- Duration
- Checksum (for change detection)

## Safety Features

1. **Checksum Verification**: Prevents running migrations that have been modified
2. **Transaction Safety**: Each migration runs in a transaction
3. **Error Handling**: Automatic rollback on failure
4. **Change Detection**: Warns if a migration was already run with different content

## Database Schema

### Type Vocabulary Table
Stores all type tags extracted from playbooks with metadata and confidence scores.

### Type Similarity Matrix
Tracks similarity scores between type tags for clustering and merging.

### Type Evolution History
Maintains a complete audit trail of all changes to type tags.

### Playbook Type Assignments
Many-to-many relationship between playbooks and their assigned type tags.

### Prompt Templates
Reusable prompt templates associated with specific type tags.

## Environment Variables

- `PLAYBOOK_DB_PATH` - Path to the SQLite database file (default: `data/playbook.db`)

## Troubleshooting

### Migration Already Executed Error
If you see an error about a migration already being executed with different content:
1. Check if the SQL file was modified
2. Use rollback to revert the migration
3. Re-run the migration

### Database Locked Error
If the database is locked:
1. Ensure no other processes are using the database
2. Check for stuck transactions
3. Restart the application

### Rollback Limitations
The current rollback implementation simply removes migration records. For production, you should:
1. Create explicit rollback scripts for each migration
2. Test rollback procedures thoroughly
3. Maintain database backups

## Best Practices

1. **Always backup** your database before running migrations
2. **Test migrations** on a copy of production data
3. **Review SQL** before executing migrations in production
4. **Monitor execution** time for large migrations
5. **Version control** all migration scripts
