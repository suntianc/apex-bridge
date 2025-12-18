-- Migration: Create Prompt Templates Table
-- Description: Stores reusable prompt templates for different type tags
-- Created: 2025-12-18

CREATE TABLE prompt_templates (
  template_id TEXT PRIMARY KEY,
  template_type TEXT NOT NULL CHECK (template_type IN ('guidance', 'constraint', 'framework', 'example')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  variables TEXT NOT NULL, -- JSON array of variable names
  applicable_tags TEXT NOT NULL, -- JSON array of applicable tag names
  guidance_level TEXT CHECK (guidance_level IN ('light', 'medium', 'intensive')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  usage_count INTEGER NOT NULL DEFAULT 0,
  effectiveness_score REAL CHECK (effectiveness_score >= 0.0 AND effectiveness_score <= 1.0),
  metadata TEXT -- JSON object for additional metadata
);

-- Indexes for template queries
CREATE INDEX idx_template_type ON prompt_templates(template_type);
CREATE INDEX idx_template_effectiveness ON prompt_templates(effectiveness_score DESC);
CREATE INDEX idx_template_usage_count ON prompt_templates(usage_count DESC);

