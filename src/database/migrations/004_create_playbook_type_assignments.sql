-- Migration: Create Playbook Type Assignments Table
-- Description: Many-to-many relationship between playbooks and type tags
-- Created: 2025-12-18

CREATE TABLE playbook_type_assignments (
  playbook_id TEXT NOT NULL,
  tag_name TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0.0 AND confidence <= 1.0),
  assigned_method TEXT NOT NULL CHECK (assigned_method IN ('automatic', 'manual')),
  assigned_at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  verified_at INTEGER,
  verified_by TEXT,
  PRIMARY KEY (playbook_id, tag_name),
  FOREIGN KEY (tag_name) REFERENCES type_vocabulary(tag_name) ON DELETE CASCADE
);

-- Indexes for efficient lookups
CREATE INDEX idx_assignment_playbook ON playbook_type_assignments(playbook_id);
CREATE INDEX idx_assignment_tag ON playbook_type_assignments(tag_name);
CREATE INDEX idx_assignment_confidence ON playbook_type_assignments(confidence DESC);
CREATE INDEX idx_assignment_verified ON playbook_type_assignments(verified);

