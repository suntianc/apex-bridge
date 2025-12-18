-- Migration: Create Type Vocabulary Table
-- Description: Stores all type tags extracted from playbooks
-- Created: 2025-12-18

CREATE TABLE type_vocabulary (
  tag_name TEXT PRIMARY KEY,
  keywords TEXT NOT NULL, -- JSON array of keywords
  confidence REAL NOT NULL DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  first_identified INTEGER NOT NULL,
  playbook_count INTEGER NOT NULL DEFAULT 0,
  discovered_from TEXT NOT NULL CHECK (discovered_from IN ('historical_clustering', 'manual_creation', 'llm_suggestion')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  metadata TEXT -- JSON object for additional information
);

-- Indexes for common queries
CREATE INDEX idx_type_vocabulary_confidence ON type_vocabulary(confidence DESC);
CREATE INDEX idx_type_vocabulary_playbook_count ON type_vocabulary(playbook_count DESC);
CREATE INDEX idx_type_vocabulary_created ON type_vocabulary(created_at DESC);

