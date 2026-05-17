/**
 * Architecture regression invariants (Spec as Code).
 *
 * Validates runtime contract alignment: executive_summary and reasoning_surfaces
 * are the only runtime source of truth in the fully AI-native chain.
 */

import type { AssessResponse } from '../types/index.js';

export interface ArchitectureViolation {
  code: string;
  message: string;
}

/** Error-level violations fail harness cases and vitest. */
export function checkAssessResponseArchitecture(response: AssessResponse): ArchitectureViolation[] {
  const violations: ArchitectureViolation[] = [];
  const executiveSummary = response.executive_summary;
  const reasoningSurfaces = response.reasoning_surfaces;
  const executiveMode = executiveSummary?.final_mode;
  const legacyFields = response as AssessResponse & {
    response_mode?: unknown;
    decision_mode?: unknown;
  };
  const intentFraming = reasoningSurfaces?.intent_framing;

  if (!executiveSummary) {
    violations.push({
      code: 'arch_missing_executive_summary',
      message: 'AssessResponse 缺少 executive_summary（runtime SoT）',
    });
  }

  if (!reasoningSurfaces) {
    violations.push({
      code: 'arch_missing_reasoning_surfaces',
      message: 'AssessResponse 缺少 reasoning_surfaces（runtime SoT）',
    });
  }

  if (!executiveMode) {
    violations.push({
      code: 'arch_missing_executive_final_mode',
      message: 'executive_summary 缺少 final_mode（runtime SoT）',
    });
  }

  if ('response_mode' in legacyFields) {
    violations.push({
      code: 'arch_legacy_response_mode_present',
      message: 'AssessResponse 不应再暴露 legacy response_mode 字段',
    });
  }

  if ('decision_mode' in legacyFields) {
    violations.push({
      code: 'arch_legacy_decision_mode_present',
      message: 'AssessResponse 不应再暴露 legacy decision_mode 字段',
    });
  }

  if (!intentFraming) {
    violations.push({
      code: 'arch_missing_intent_surface',
      message: 'reasoning_surfaces.intent_framing 缺失',
    });
  } else if (executiveMode && intentFraming.interaction_mode !== executiveMode) {
    violations.push({
      code: 'arch_mode_surface_mismatch',
      message: `intent_framing.interaction_mode=${intentFraming.interaction_mode} 但 executive_summary.final_mode=${executiveMode}`,
    });
  }

  if (executiveSummary?.status === 'escalated' && response.risk_level !== 'high') {
    violations.push({
      code: 'arch_escalated_risk_mismatch',
      message: `executive_summary.status=escalated 但 risk_level=${response.risk_level}`,
    });
  }

  return violations;
}
