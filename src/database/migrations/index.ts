/**
 * Migration Scripts Index
 * Lists all available migration scripts
 */

export const MIGRATIONS = [
  {
    version: "001",
    name: "create_type_vocabulary",
    description: "Creates the type vocabulary table for storing type tags",
    filename: "001_create_type_vocabulary.sql",
  },
  {
    version: "002",
    name: "create_type_similarity_matrix",
    description: "Creates the type similarity matrix table",
    filename: "002_create_type_similarity_matrix.sql",
  },
  {
    version: "003",
    name: "create_type_evolution_history",
    description: "Creates the type evolution history table",
    filename: "003_create_type_evolution_history.sql",
  },
  {
    version: "004",
    name: "create_type_assignments",
    description: "Creates the type assignments table",
    filename: "004_create_type_assignments.sql",
  },
  {
    version: "005",
    name: "create_prompt_templates",
    description: "Creates the prompt templates table",
    filename: "005_create_prompt_templates.sql",
  },
] as const;

export type MigrationVersion = (typeof MIGRATIONS)[number]["version"];
