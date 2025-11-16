import {
  ArbitrationAction,
  ArbitrationOptions,
  ArbitrationResult,
  ConflictDetectionResult,
  ConflictSignal,
  MemoryConflictCandidate
} from '../../../types/memory';

export class MemoryConflictArbiter {
  private readonly defaultOptions: Required<ArbitrationOptions> = {
    priorityImportance: true,
    priorityRecency: true,
    prioritySource: true,
    factorWeights: {
      importance: 0.4,
      recency: 0.3,
      source: 0.2,
      semantic: 0.1
    },
    sourcePriority: {
      user: 10,
      conversation: 8,
      skill: 6,
      system: 4,
      inferred: 2
    },
    allowMerge: true,
    mergeThreshold: 0.2,
    defaultStrategy: 'keep-candidate'
  };

  constructor(private readonly options: ArbitrationOptions = {}) {}

  /**
   * 仲裁冲突检测结果
   */
  arbitrate(
    detectionResult: ConflictDetectionResult,
    overrides?: ArbitrationOptions
  ): ArbitrationResult {
    const config = this.resolveOptions(overrides);
    const { candidate, conflicts, matchedRecords } = detectionResult;

    if (matchedRecords.length === 0 || conflicts.length === 0) {
      return {
        action: 'keep',
        winner: candidate,
        reason: 'No conflicts detected',
        confidence: 1.0
      };
    }

    // 如果只有一个匹配记录，直接仲裁
    if (matchedRecords.length === 1) {
      return this.arbitrateSingle(candidate, matchedRecords[0], conflicts, config);
    }

    // 多个匹配记录时，选择冲突最严重的进行仲裁
    const mostSevere = this.selectMostSevereConflict(candidate, matchedRecords, conflicts);
    return this.arbitrateSingle(candidate, mostSevere.record, mostSevere.signals, config);
  }

  /**
   * 仲裁单个冲突
   */
  private arbitrateSingle(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate,
    signals: ConflictSignal[],
    config: Required<ArbitrationOptions>
  ): ArbitrationResult {
    // 1. 基于重要性评分
    if (config.priorityImportance) {
      const importanceResult = this.selectByImportance(candidate, existing);
      if (importanceResult) {
        return {
          action: 'keep',
          winner: importanceResult.winner,
          loser: importanceResult.loser,
          reason: `Importance-based: ${importanceResult.winner.importance} > ${importanceResult.loser.importance}`,
          confidence: this.computeImportanceConfidence(candidate, existing),
          factors: { importance: importanceResult.winner.importance || 0 }
        };
      }
    }

    // 2. 基于时间戳
    if (config.priorityRecency) {
      const recencyResult = this.selectByTimestamp(candidate, existing);
      if (recencyResult) {
        return {
          action: 'keep',
          winner: recencyResult.winner,
          loser: recencyResult.loser,
          reason: `Recency-based: ${recencyResult.winner.timestamp} > ${recencyResult.loser.timestamp}`,
          confidence: this.computeRecencyConfidence(candidate, existing),
          factors: { recency: recencyResult.winner.timestamp || 0 }
        };
      }
    }

    // 3. 基于来源类型
    if (config.prioritySource) {
      const sourceResult = this.selectBySource(candidate, existing, config.sourcePriority);
      if (sourceResult) {
        return {
          action: 'keep',
          winner: sourceResult.winner,
          loser: sourceResult.loser,
          reason: `Source-based: ${sourceResult.winner.source} (priority: ${sourceResult.priority}) > ${sourceResult.loser.source} (priority: ${sourceResult.loserPriority})`,
          confidence: 0.7,
          factors: { source: sourceResult.priority }
        };
      }
    }

    // 4. 多因素综合评分
    const multiFactorResult = this.computeMultiFactorScore(
      candidate,
      existing,
      signals,
      config.factorWeights
    );

    // 如果综合评分差异小于合并阈值，建议合并
    if (config.allowMerge && Math.abs(multiFactorResult.candidateScore - multiFactorResult.existingScore) < config.mergeThreshold) {
      return {
        action: 'merge',
        winner: candidate,
        loser: existing,
        reason: `Multi-factor scores are close (${multiFactorResult.candidateScore.toFixed(3)} vs ${multiFactorResult.existingScore.toFixed(3)}), suggesting merge`,
        confidence: 0.6,
        factors: {
          candidateScore: multiFactorResult.candidateScore,
          existingScore: multiFactorResult.existingScore,
          ...multiFactorResult.factors
        }
      };
    }

    // 5. 默认策略
    const winner = multiFactorResult.candidateScore >= multiFactorResult.existingScore ? candidate : existing;
    const loser = winner === candidate ? existing : candidate;
    const defaultAction = config.defaultStrategy === 'reject' ? 'reject' : 'keep';

    return {
      action: defaultAction,
      winner: defaultAction === 'keep' ? winner : undefined,
      loser: defaultAction === 'keep' ? loser : undefined,
      reason: `Default strategy (${config.defaultStrategy}): candidate score ${multiFactorResult.candidateScore.toFixed(3)} vs existing score ${multiFactorResult.existingScore.toFixed(3)}`,
      confidence: 0.5,
      factors: {
        candidateScore: multiFactorResult.candidateScore,
        existingScore: multiFactorResult.existingScore,
        ...multiFactorResult.factors
      }
    };
  }

  /**
   * 基于重要性评分选择
   */
  private selectByImportance(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate
  ): { winner: MemoryConflictCandidate; loser: MemoryConflictCandidate } | null {
    const candidateImportance = candidate.importance ?? 0;
    const existingImportance = existing.importance ?? 0;

    if (candidateImportance === existingImportance) {
      return null;
    }

    return candidateImportance > existingImportance
      ? { winner: candidate, loser: existing }
      : { winner: existing, loser: candidate };
  }

  /**
   * 基于时间戳选择
   */
  private selectByTimestamp(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate
  ): { winner: MemoryConflictCandidate; loser: MemoryConflictCandidate } | null {
    const candidateTimestamp = candidate.timestamp ?? 0;
    const existingTimestamp = existing.timestamp ?? 0;

    if (candidateTimestamp === existingTimestamp) {
      return null;
    }

    // 时间戳越大越新，优先保留新的
    return candidateTimestamp > existingTimestamp
      ? { winner: candidate, loser: existing }
      : { winner: existing, loser: candidate };
  }

  /**
   * 基于来源类型选择
   */
  private selectBySource(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate,
    sourcePriority: Record<string, number>
  ): { winner: MemoryConflictCandidate; loser: MemoryConflictCandidate; priority: number; loserPriority: number } | null {
    const candidateSource = candidate.source ?? 'unknown';
    const existingSource = existing.source ?? 'unknown';

    const candidatePriority = sourcePriority[candidateSource] ?? 0;
    const existingPriority = sourcePriority[existingSource] ?? 0;

    if (candidatePriority === existingPriority) {
      return null;
    }

    return candidatePriority > existingPriority
      ? { winner: candidate, loser: existing, priority: candidatePriority, loserPriority: existingPriority }
      : { winner: existing, loser: candidate, priority: existingPriority, loserPriority: candidatePriority };
  }

  /**
   * 计算多因素综合评分
   */
  private computeMultiFactorScore(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate,
    signals: ConflictSignal[],
    weights: Required<ArbitrationOptions>['factorWeights']
  ): {
    candidateScore: number;
    existingScore: number;
    factors: Record<string, number>;
  } {
    // 重要性评分（归一化到 0-1）
    const candidateImportance = candidate.importance ?? 0.5;
    const existingImportance = existing.importance ?? 0.5;
    const importanceDiff = (candidateImportance - existingImportance) * weights.importance;

    // 时间戳评分（归一化到 0-1，越新分数越高）
    const candidateTimestamp = candidate.timestamp ?? Date.now();
    const existingTimestamp = existing.timestamp ?? Date.now();
    const maxTimestamp = Math.max(candidateTimestamp, existingTimestamp, Date.now());
    const minTimestamp = Math.min(candidateTimestamp, existingTimestamp, 0);
    const timeRange = maxTimestamp - minTimestamp;
    const candidateRecency = timeRange > 0 ? (candidateTimestamp - minTimestamp) / timeRange : 0.5;
    const existingRecency = timeRange > 0 ? (existingTimestamp - minTimestamp) / timeRange : 0.5;
    const recencyDiff = (candidateRecency - existingRecency) * weights.recency;

    // 来源类型评分（归一化到 0-1）
    const candidateSource = candidate.source ?? 'unknown';
    const existingSource = existing.source ?? 'unknown';
    const maxSourcePriority = Math.max(...Object.values(this.defaultOptions.sourcePriority), 1);
    const candidateSourceScore = (this.defaultOptions.sourcePriority[candidateSource] ?? 0) / maxSourcePriority;
    const existingSourceScore = (this.defaultOptions.sourcePriority[existingSource] ?? 0) / maxSourcePriority;
    const sourceDiff = (candidateSourceScore - existingSourceScore) * weights.source;

    // 语义相似度评分（从 signals 中提取）
    const semanticSignal = signals.find((s) => s.type === 'semantic');
    const semanticScore = semanticSignal?.score ?? 0.5;
    const semanticDiff = (semanticScore - 0.5) * weights.semantic;

    // 综合评分
    const candidateScore = 0.5 + importanceDiff + recencyDiff + sourceDiff + semanticDiff;
    const existingScore = 0.5 - importanceDiff - recencyDiff - sourceDiff - semanticDiff;

    return {
      candidateScore: Math.max(0, Math.min(1, candidateScore)),
      existingScore: Math.max(0, Math.min(1, existingScore)),
      factors: {
        importance: importanceDiff,
        recency: recencyDiff,
        source: sourceDiff,
        semantic: semanticDiff
      }
    };
  }

  /**
   * 计算重要性置信度
   */
  private computeImportanceConfidence(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate
  ): number {
    const candidateImportance = candidate.importance ?? 0;
    const existingImportance = existing.importance ?? 0;
    const diff = Math.abs(candidateImportance - existingImportance);
    return Math.min(1, diff * 2); // 差异越大，置信度越高
  }

  /**
   * 计算时间戳置信度
   */
  private computeRecencyConfidence(
    candidate: MemoryConflictCandidate,
    existing: MemoryConflictCandidate
  ): number {
    const candidateTimestamp = candidate.timestamp ?? Date.now();
    const existingTimestamp = existing.timestamp ?? Date.now();
    const diff = Math.abs(candidateTimestamp - existingTimestamp);
    const hours = diff / (1000 * 60 * 60);
    return Math.min(1, hours / 24); // 时间差越大，置信度越高（最多24小时）
  }

  /**
   * 选择最严重的冲突
   */
  private selectMostSevereConflict(
    candidate: MemoryConflictCandidate,
    matchedRecords: MemoryConflictCandidate[],
    signals: ConflictSignal[]
  ): { record: MemoryConflictCandidate; signals: ConflictSignal[] } {
    // 按信号类型和分数排序，选择最严重的
    const recordSignals = new Map<MemoryConflictCandidate, ConflictSignal[]>();
    for (const record of matchedRecords) {
      const recordSignalsList = signals.filter((s) => s.targetId === record.id);
      recordSignals.set(record, recordSignalsList);
    }

    let maxSeverity = 0;
    let mostSevere: { record: MemoryConflictCandidate; signals: ConflictSignal[] } | null = null;

    for (const [record, recordSignalsList] of recordSignals) {
      const severity = recordSignalsList.reduce((sum, s) => sum + s.score, 0);
      if (severity > maxSeverity) {
        maxSeverity = severity;
        mostSevere = { record, signals: recordSignalsList };
      }
    }

    return mostSevere || { record: matchedRecords[0], signals: signals.filter((s) => s.targetId === matchedRecords[0].id) };
  }

  /**
   * 解析选项
   */
  private resolveOptions(overrides?: ArbitrationOptions): Required<ArbitrationOptions> {
    const merged = {
      ...this.defaultOptions,
      ...this.options,
      ...overrides,
      factorWeights: {
        ...this.defaultOptions.factorWeights,
        ...this.options.factorWeights,
        ...overrides?.factorWeights
      },
      sourcePriority: {
        ...this.defaultOptions.sourcePriority,
        ...this.options.sourcePriority,
        ...overrides?.sourcePriority
      }
    };
    return merged as Required<ArbitrationOptions>;
  }
}

