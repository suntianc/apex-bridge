import { performance } from 'node:perf_hooks';
import {
  CodeGenerationMetrics,
  CodeGenerationPhase
} from '../../types';

const PHASES: CodeGenerationPhase[] = [
  'total',
  'extraction',
  'dependency',
  'compilation',
  'security',
  'sandbox'
];

export class CodeGenerationProfiler {
  private readonly active = new Map<CodeGenerationPhase, number>();
  private readonly durations = new Map<CodeGenerationPhase, number>();
  private metadata: Record<string, unknown> | undefined;

  startPhase(phase: CodeGenerationPhase): void {
    if (this.active.has(phase)) {
      throw new Error(`Phase ${phase} already started`);
    }
    this.active.set(phase, performance.now());
  }

  endPhase(phase: CodeGenerationPhase): number {
    const start = this.active.get(phase);
    if (start === undefined) {
      return 0;
    }
    const duration = performance.now() - start;
    this.active.delete(phase);
    const current = this.durations.get(phase) ?? 0;
    this.durations.set(phase, current + duration);
    return duration;
  }

  async measure<T>(phase: CodeGenerationPhase, fn: () => Promise<T> | T): Promise<T> {
    this.startPhase(phase);
    try {
      return await Promise.resolve(fn());
    } finally {
      this.endPhase(phase);
    }
  }

  record(phase: CodeGenerationPhase, durationMs: number): void {
    const current = this.durations.get(phase) ?? 0;
    this.durations.set(phase, current + durationMs);
  }

  getDuration(phase: CodeGenerationPhase): number {
    return this.durations.get(phase) ?? 0;
  }

  setMetadata(metadata: Record<string, unknown>): void {
    this.metadata = { ...(this.metadata ?? {}), ...metadata };
  }

  reset(): void {
    this.active.clear();
    this.durations.clear();
    this.metadata = undefined;
  }

  finalize(metadata?: Record<string, unknown>): CodeGenerationMetrics {
    // Ensure no active phases remain
    for (const phase of Array.from(this.active.keys())) {
      this.endPhase(phase);
    }

    const phases: Record<CodeGenerationPhase, number> = {
      total: 0,
      extraction: 0,
      dependency: 0,
      compilation: 0,
      security: 0,
      sandbox: 0
    };

    for (const phase of PHASES) {
      phases[phase] = this.getDuration(phase);
    }

    let total = phases.total;
    if (!total) {
      total = phases.extraction + phases.dependency + phases.compilation + phases.security + phases.sandbox;
    }

    return {
      phases,
      totalMs: total,
      timestamp: Date.now(),
      metadata: metadata ?? this.metadata
    };
  }
}
