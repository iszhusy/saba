/**
 * Patient Baseline 持久化（D1）。
 * 行为规格：docs/specs-ai-native/behavior/12-patient-baseline.md
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { PatientBaseline, TraceContext } from '../types/index.js';

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export class PatientBaselineRepository {
  constructor(private db: D1Database) {}

  async findByUserId(userId: string): Promise<PatientBaseline | null> {
    const row = await this.db
      .prepare('SELECT * FROM patient_baselines WHERE user_id = ?')
      .bind(userId)
      .first();
    if (!row) return null;
    return this.mapRow(row);
  }

  async findByTraceId(traceId: string): Promise<PatientBaseline[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM patient_baselines
        WHERE json_extract(trace_json, '$.trace_id') = ?
      `)
      .bind(traceId)
      .all();
    return result.results.map((row) => this.mapRow(row));
  }

  async upsert(baseline: PatientBaseline & { trace?: TraceContext }): Promise<PatientBaseline & { trace?: TraceContext }> {
    const updatedAt = baseline.updated_at || nowIso();
    const next: PatientBaseline & { trace?: TraceContext } = { ...baseline, updated_at: updatedAt };
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO patient_baselines (
          user_id, treatment_category, treatment_anchor, primary_regimen,
          treatment_type, treatment_phase, treatment_day,
          known_side_effects_json, trace_json, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        next.user_id,
        next.treatment_category ?? null,
        next.treatment_anchor ?? null,
        next.primary_regimen ?? null,
        next.treatment_type ?? null,
        next.treatment_phase ?? null,
        next.treatment_day ?? null,
        JSON.stringify(next.known_side_effects ?? []),
        next.trace ? JSON.stringify(next.trace) : null,
        next.updated_at,
      )
      .run();
    return next;
  }

  private mapRow(row: Record<string, unknown>): PatientBaseline & { trace?: TraceContext } {
    return {
      user_id: row.user_id as string,
      treatment_category: (row.treatment_category as string) || undefined,
      treatment_anchor: (row.treatment_anchor as string) || undefined,
      primary_regimen: (row.primary_regimen as string) || undefined,
      treatment_type: (row.treatment_type as string) || undefined,
      treatment_phase: (row.treatment_phase as string) || undefined,
      treatment_day: typeof row.treatment_day === 'number' ? row.treatment_day : undefined,
      known_side_effects: parseJson<string[]>(row.known_side_effects_json, []),
      trace: row.trace_json ? parseJson<TraceContext | undefined>(row.trace_json, undefined) : undefined,
      updated_at: row.updated_at as string,
    };
  }
}
