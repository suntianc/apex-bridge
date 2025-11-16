import {
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemoryResult
} from '../../../types/memory';

export interface SemanticMemoryStore {
  save(record: SemanticMemoryRecord): Promise<SemanticMemoryResult>;
  getById(id: string): Promise<SemanticMemoryResult | null>;
  search(query: SemanticMemoryQuery): Promise<SemanticMemoryResult[]>;
  delete?(id: string): Promise<void>;
}

