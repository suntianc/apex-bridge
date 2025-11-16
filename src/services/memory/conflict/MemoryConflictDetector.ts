import {
  ConflictDetectionOptions,
  ConflictDetectionResult,
  ConflictSignal,
  MemoryConflictCandidate
} from '../../../types/memory';

export class MemoryConflictDetector {
  constructor(private readonly options: ConflictDetectionOptions = {}) {}

  detectConflicts(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate[],
    overrides?: ConflictDetectionOptions
  ): ConflictDetectionResult {
    const config = { ...this.options, ...overrides };
    const conflicts: ConflictSignal[] = [];
    const matchedRecords: MemoryConflictCandidate[] = [];

    for (const record of existing) {
      if (record.userId !== candidate.userId) {
        continue;
      }

      const signals = this.detectForRecord(candidate, record, config);
      if (signals.length > 0) {
        conflicts.push(...signals);
        matchedRecords.push(record);
      }
    }

    return {
      candidate,
      conflicts,
      matchedRecords
    };
  }

  private detectForRecord(
    candidate: MemoryConflictCandidate,
    record: MemoryConflictCandidate,
    config: ConflictDetectionOptions
  ): ConflictSignal[] {
    const signals: ConflictSignal[] = [];
    const targetId = record.id;

    const semanticScore = this.computeSemanticScore(candidate, record);
    const semanticThreshold = config.semanticThreshold ?? 0.8;
    if (semanticScore >= semanticThreshold) {
      signals.push({
        type: 'semantic',
        score: semanticScore,
        targetId,
        details: { threshold: semanticThreshold }
      });
    }

    const keywordScore = this.computeKeywordOverlap(candidate, record);
    const keywordThreshold = config.keywordOverlapThreshold ?? 0.5;
    if (keywordScore >= keywordThreshold) {
      signals.push({
        type: 'keyword',
        score: keywordScore,
        targetId,
        details: { threshold: keywordThreshold }
      });
    }

    const timeScore = this.computeTimeScore(candidate, record, config.timeWindowMs ?? 5 * 60 * 1000);
    if (timeScore > 0) {
      signals.push({
        type: 'time',
        score: timeScore,
        targetId,
        details: { windowMs: config.timeWindowMs ?? 5 * 60 * 1000 }
      });
    }

    const importanceScore = this.computeImportanceScore(
      candidate,
      record,
      config.importanceDelta ?? 0.4
    );
    if (importanceScore > 0) {
      signals.push({
        type: 'importance',
        score: importanceScore,
        targetId,
        details: { delta: config.importanceDelta ?? 0.4 }
      });
    }

    return signals;
  }

  private computeSemanticScore(
    candidate: MemoryConflictCandidate,
    record: MemoryConflictCandidate
  ): number {
    if (!candidate.embedding || !record.embedding) {
      return 0;
    }
    const a = candidate.embedding;
    const b = record.embedding;
    if (!a.length || !b.length) {
      return 0;
    }
    const length = Math.min(a.length, b.length);
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < length; i += 1) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (magA === 0 || magB === 0) {
      return 0;
    }
    return dot / (Math.sqrt(magA) * Math.sqrt(magB));
  }

  private computeKeywordOverlap(
    candidate: MemoryConflictCandidate,
    record: MemoryConflictCandidate
  ): number {
    const a = this.extractKeywords(candidate);
    const b = this.extractKeywords(record);
    if (!a.size || !b.size) {
      return 0;
    }
    let overlap = 0;
    for (const keyword of a) {
      if (b.has(keyword)) {
        overlap += 1;
      }
    }
    return overlap / Math.min(a.size, b.size);
  }

  private computeTimeScore(
    candidate: MemoryConflictCandidate,
    record: MemoryConflictCandidate,
    windowMs: number
  ): number {
    if (!candidate.timestamp || !record.timestamp || windowMs <= 0) {
      return 0;
    }
    const delta = Math.abs(candidate.timestamp - record.timestamp);
    if (delta > windowMs) {
      return 0;
    }
    return 1 - delta / windowMs; // closer means higher score
  }

  private computeImportanceScore(
    candidate: MemoryConflictCandidate,
    record: MemoryConflictCandidate,
    deltaThreshold: number
  ): number {
    if (
      candidate.importance === undefined ||
      record.importance === undefined ||
      deltaThreshold <= 0
    ) {
      return 0;
    }
    const delta = Math.abs(candidate.importance - record.importance);
    if (delta < deltaThreshold) {
      return 0;
    }
    return Math.min(1, delta / (1 - deltaThreshold));
  }

  private extractKeywords(candidate: MemoryConflictCandidate): Set<string> {
    if (candidate.keywords && candidate.keywords.length) {
      return new Set(candidate.keywords.map((k) => k.toLowerCase()));
    }
    if (!candidate.content) {
      return new Set();
    }
    return new Set(
      candidate.content
        .toLowerCase()
        .split(/[^a-zA-Z0-9\u4e00-\u9fa5]+/u)
        .filter((token) => token.length > 1)
    );
  }
}

