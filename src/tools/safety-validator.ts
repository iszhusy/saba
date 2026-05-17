/**
 * Safety Validator
 *
 * Orchestrator-controlled safety validation step.
 * Does not redo clinical reasoning; only enforces safety guardrails.
 */

import type { RiskLevel, SafetyConstraintSurface } from '../types/index.js';

export interface SafetyValidationInput {
  risk_level: RiskLevel;
  immediate_action: string;
  follow_up?: string;
  warning_signs?: string[];
}

export interface SafetyViolation {
  code:
    | 'missing_emergency_action'
    | 'missing_team_contact'
    | 'unsafe_medication_advice'
    | 'missing_warning_signs';
  severity: 'critical' | 'high' | 'medium';
  message: string;
}

export interface SafetyValidationResult {
  verdict: 'pass' | 'revise' | 'block';
  violations: SafetyViolation[];
  constraints: SafetyConstraintSurface['constraints'];
}

function ensureArray(value: string[] | undefined, fallback: string[]): string[] {
  return Array.isArray(value) && value.length > 0 ? value : fallback;
}

export function validateSafety(input: SafetyValidationInput): SafetyValidationResult {
  const violations: SafetyViolation[] = [];
  let immediateAction = input.immediate_action;
  let followUp = input.follow_up ?? '';
  let warningSigns = [...(input.warning_signs ?? [])];

  const serialized = `${immediateAction}\n${followUp}\n${warningSigns.join('\n')}`;

  if (/(\d+\s*(mg|mcg|g|ml|iu|单位)|剂量|每天\d|吃\d)/i.test(serialized) || /停药|不吃|减少.*药|自行停/i.test(serialized)) {
    violations.push({
      code: 'unsafe_medication_advice',
      severity: 'critical',
      message: '输出包含药物剂量、停药或改药建议，必须移除。',
    });
  }

  if (input.risk_level === 'high') {
    if (!/就医|急诊|120|急救|立即/.test(immediateAction)) {
      violations.push({
        code: 'missing_emergency_action',
        severity: 'critical',
        message: '高风险输出必须明确建议立即就医/急诊/120。',
      });
    }

    if (warningSigns.length === 0) {
      violations.push({
        code: 'missing_warning_signs',
        severity: 'high',
        message: '高风险输出必须包含警示信号。',
      });
      warningSigns = ['发热持续或体温继续升高', '呼吸困难加重', '意识改变', '症状迅速恶化'];
    }

    if (!followUp) {
      followUp = '急诊处理后请尽快联系您的医疗团队反馈情况；如有发热或其他危险信号，请不要延误。';
    }
  }

  if (input.risk_level === 'medium') {
    if (!/联系.*医疗团队|联系.*医生|联系.*护士|联系团队/.test(`${immediateAction} ${followUp}`)) {
      violations.push({
        code: 'missing_team_contact',
        severity: 'high',
        message: '中风险输出必须建议联系医疗团队。',
      });
    }

    if (warningSigns.length === 0) {
      warningSigns = ['症状加重', '出现发热', '无法进食或进水'];
    }
  }

  if (input.risk_level === 'low' && warningSigns.length === 0) {
    warningSigns = ['症状加重', '出现新的异常症状'];
  }

  const requiredActions: string[] = [];
  if (input.risk_level === 'high') {
    requiredActions.push('请立即就医或前往急诊；如症状明显加重，请拨打120。');
  }
  if (input.risk_level === 'medium') {
    requiredActions.push('请在24-48小时内联系您的医疗团队进一步评估。');
  }

  return {
    verdict: violations.some((violation) => violation.severity === 'critical') ? 'revise' : 'pass',
    violations,
    constraints: {
      required_actions: requiredActions,
      forbidden_claims: ['药物剂量建议', '自行停药', '自行改药'],
      required_warning_signals: warningSigns,
      risk_floor: input.risk_level,
      rewrite_reason: violations.map((violation) => violation.message).join('；') || undefined,
    },
  };
}
