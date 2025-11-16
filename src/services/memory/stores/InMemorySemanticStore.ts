import { randomUUID } from 'crypto';
import {
  SemanticMemoryQuery,
  SemanticMemoryRecord,
  SemanticMemoryResult
} from '../../../types/memory';
import { SemanticMemoryStore } from './SemanticMemoryStore';

export class InMemorySemanticStore implements SemanticMemoryStore {
  private records: SemanticMemoryResult[] = [];

  async save(record: SemanticMemoryRecord): Promise<SemanticMemoryResult> {
    const id = record.id ?? randomUUID();
    const timestamp = record.createdAt ?? Date.now();

    const result: SemanticMemoryResult = {
      id,
      userId: record.userId,
      householdId: record.householdId,
      personaId: record.personaId,
      content: record.content,
      summary: record.summary,
      metadata: record.metadata,
      similarity: 1,
      embedding: record.embedding.slice(),
      createdAt: timestamp,
      updatedAt: record.updatedAt ?? timestamp
    };

    this.records.push(result);
    return result;
  }

  async getById(id: string): Promise<SemanticMemoryResult | null> {
    return this.records.find((record) => record.id === id) ?? null;
  }

  async search(query: SemanticMemoryQuery): Promise<SemanticMemoryResult[]> {
    const scored = this.records
      .map((record) => ({
        ...record,
        similarity: this.cosineSimilarity(query.vector, record.embedding ?? [])
      }))
      .sort((a, b) => b.similarity - a.similarity);

    return scored;
  }

  async delete(id: string): Promise<void> {
    this.records = this.records.filter((record) => record.id !== id);
  }

  clear(): void {
    this.records = [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) {
      return 0;
    }
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < length; i += 1) {
      const av = a[i];
      const bv = b[i];
      dot += av * bv;
      magA += av * av;
      magB += bv * bv;
    }
    if (magA === 0 || magB === 0) {
      return 0;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }
}

