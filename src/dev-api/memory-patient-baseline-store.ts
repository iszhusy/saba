import type { PatientBaseline } from '../types/index.js';

export class MemoryPatientBaselineRepository {
  private baselines = new Map<string, PatientBaseline>();

  async findByUserId(userId: string): Promise<PatientBaseline | null> {
    const baseline = this.baselines.get(userId);
    return baseline ? structuredClone(baseline) : null;
  }

  async upsert(baseline: PatientBaseline): Promise<PatientBaseline> {
    const stored: PatientBaseline = {
      ...baseline,
      updated_at: baseline.updated_at || new Date().toISOString(),
    };
    this.baselines.set(stored.user_id, structuredClone(stored));
    return structuredClone(stored);
  }

  findByTraceId(traceId: string): PatientBaseline[] {
    return [...this.baselines.values()]
      .filter((baseline) => baseline.trace?.trace_id === traceId)
      .map((baseline) => structuredClone(baseline));
  }

  listAll(): PatientBaseline[] {
    return [...this.baselines.values()].map((baseline) => structuredClone(baseline));
  }

  /** 测试夹具：直接注入基线，不更新 updated_at 处理。 */
  seed(baseline: PatientBaseline): void {
    this.baselines.set(baseline.user_id, structuredClone(baseline));
  }

  clear(): void {
    this.baselines.clear();
  }
}
