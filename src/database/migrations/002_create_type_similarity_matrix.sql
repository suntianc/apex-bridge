-- Migration: Create Type Similarity Matrix Table
-- Description: Stores similarity scores between type tags
-- Created: 2025-12-18

CREATE TABLE type_similarity_matrix (
  tag1 TEXT NOT NULL,
  tag2 TEXT NOT NULL,
  similarity_score REAL NOT NULL CHECK (similarity_score >= 0.0 AND similarity_score <= 1.0),
  co_occurrence_count INTEGER NOT NULL DEFAULT 0,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (tag1, tag2),
  FOREIGN KEY (tag1) REFERENCES type_vocabulary(tag_name) ON DELETE CASCADE,
  FOREIGN KEY (tag2) REFERENCES type_vocabulary(tag_name) ON DELETE CASCADE
);

-- Indexes for efficient similarity lookups
CREATE INDEX idx_similarity_score ON type_similarity_matrix(similarity_score DESC);
CREATE INDEX idx_similarity_tags ON type_similarity_matrix(tag1, tag2);

-- Ensure tag1 < tag2 to avoid duplicates (symmetric matrix)
CREATE TRIGGER ensure_tag_order
  BEFORE INSERT ON type_similarity_matrix
  FOR EACH ROW
  WHEN NEW.tag1 > NEW.tag2
BEGIN
  UPDATE type_similarity_matrix
  SET tag1 = NEW.tag2, tag2 = NEW.tag1
  WHERE rowid = NEW.rowid;
END;

