import type { PatientBaseline, TreatmentContext } from '../types/index.js';

/**
 * MVP 基线完整性判定：`treatment_category` 与 `treatment_anchor` 均非空。
 * 见 docs/specs-ai-native/behavior/12-patient-baseline.md §2.2。
 */
export function isBaselineComplete(
  input?: Pick<PatientBaseline, 'treatment_category' | 'treatment_anchor'> | TreatmentContext | null,
): boolean {
  if (!input) return false;
  return Boolean(input.treatment_category?.trim() && input.treatment_anchor?.trim());
}

/**
 * 将 baseline 合并进单次请求的 TreatmentContext。
 * - request.context 字段优先覆盖 baseline（per-turn override）。
 * - 不修改 baseline 持久值；如需写回需调用 repo.upsert。
 */
export function mergeBaselineIntoContext(
  baseline: PatientBaseline | null | undefined,
  override?: TreatmentContext,
): TreatmentContext | undefined {
  if (!baseline && !override) return override;

  const baselineCtx: TreatmentContext = baseline
    ? {
        treatment_category: baseline.treatment_category,
        treatment_anchor: baseline.treatment_anchor,
        primary_regimen: baseline.primary_regimen,
        treatment_type: baseline.treatment_type,
        treatment_phase: baseline.treatment_phase,
        treatment_day: baseline.treatment_day,
        known_side_effects: baseline.known_side_effects,
      }
    : {};

  const merged: TreatmentContext = { ...baselineCtx };
  if (override) {
    for (const [key, value] of Object.entries(override) as [keyof TreatmentContext, unknown][]) {
      if (value !== undefined && value !== null && value !== '') {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return merged;
}
