-- Migration: Create Type Evolution History Table
-- Description: Tracks changes to type tags over time
-- Created: 2025-12-18

CREATE TABLE type_evolution_history (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'merged', 'deprecated', 'split', 'confidence_updated')),
  tag_name TEXT NOT NULL,
  previous_state TEXT, -- JSON object for previous state
  new_state TEXT, -- JSON object for new state
  reason TEXT NOT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('automatic', 'manual', 'llm_analysis')),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (tag_name) REFERENCES type_vocabulary(tag_name) ON DELETE CASCADE
);

-- Indexes for historical queries
CREATE INDEX idx_evolution_tag ON type_evolution_history(tag_name);
CREATE INDEX idx_evolution_date ON type_evolution_history(created_at DESC);
CREATE INDEX idx_evolution_type ON type_evolution_history(event_type);

