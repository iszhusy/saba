import type {
  AssessRequest,
  ClinicalFinding,
  TriageAssessmentSurface,
} from '../types/index.js';
import { toolParseSymptoms, toolRiskAssess } from '../lib/llm-tools.js';
import type { LLMToolResult } from '../lib/llm-tools.js';

export interface ClinicalTriageInput {
  user_input: string;
  context?: AssessRequest['context'];
}

export interface ClinicalTriageOutput {
  findings: ClinicalFinding[];
  assessment: TriageAssessmentSurface;
  retrieval_strategy: {
    should_retrieve: boolean;
    focus: string;
    critical_unknowns: string[];
  };
  clarification_targets: Array<{
    question_goal: string;
    priority: 'critical' | 'important';
  }>;
  tool_calls: LLMToolResult[];
}

function deriveUrgency(riskLevel: 'high' | 'medium' | 'low'): TriageAssessmentSurface['urgency'] {
  if (riskLevel === 'high') {
    return 'immediate';
  }
  if (riskLevel === 'medium') {
    return 'within_24_48h';
  }
  return 'observe_with_guardrails';
}

function detectRedFlagSignals(rawInput: string): string[] {
  const redFlagPatterns: Array<{ pattern: RegExp; label: string }> = [
    { pattern: /呼吸困难|喘不上气|胸闷|气促/, label: '呼吸困难/胸闷' },
    { pattern: /胸痛/, label: '胸痛' },
    { pattern: /意识模糊|说话不清|昏迷/, label: '意识改变' },
    { pattern: /吐血|黑便|大量出血/, label: '严重出血' },
    { pattern: /喝不下水|无法进水|水都喝不下/, label: '无法进水' },
    { pattern: /39|高热|寒颤/, label: '高热/寒颤' },
  ];

  return redFlagPatterns
    .filter(({ pattern }) => pattern.test(rawInput))
    .map(({ label }) => label);
}

export class ClinicalTriage {
  async assess(input: ClinicalTriageInput): Promise<ClinicalTriageOutput> {
    const parsed = await toolParseSymptoms({
      user_input: input.user_input,
      treatment_type: input.context?.treatment_type,
      treatment_phase: input.context?.treatment_phase,
    });

    const findings: ClinicalFinding[] = parsed.symptoms.map((symptom) => ({
      standard_term: symptom.standard_term,
      severity: symptom.severity as ClinicalFinding['severity'],
      confidence: symptom.confidence,
      duration: parsed.duration,
    }));

    const parsedSymptoms = findings.map((symptom) => ({
      standard_term: symptom.standard_term,
      severity: symptom.severity,
    }));

    const ruleResult = await toolRiskAssess({
      symptoms: parsedSymptoms,
      raw_input: input.user_input,
      treatment_type: input.context?.treatment_type,
      treatment_phase: input.context?.treatment_phase,
      treatment_day: input.context?.treatment_day,
    });

    const redFlagSignals = detectRedFlagSignals(input.user_input);
    const criticalUnknowns: string[] = [];

    if (!parsed.duration) {
      criticalUnknowns.push('duration');
    }
    if (/发热|烧/.test(input.user_input) && !/\d+\s*度|\d+\.\d+/.test(input.user_input)) {
      criticalUnknowns.push('temperature');
    }
    if (/吐|恶心|吃不下/.test(input.user_input) && !/喝水|进水|脱水/.test(input.user_input)) {
      criticalUnknowns.push('oral_intake');
    }

    const knownFacts = findings.map((symptom) => `${symptom.standard_term}（${symptom.severity}）`);
    if (parsed.duration) {
      knownFacts.push(`持续时间：${parsed.duration}`);
    }

    const inferredFacts = parsedSymptoms.length > 0
      ? [`已识别 ${parsedSymptoms.length} 个标准化症状`]
      : [];

    const triggeredRules = ruleResult.triggered_rules.map((rule) => ({
      id: rule.id,
      name: rule.name,
      confidence: ruleResult.confidence,
      source: 'clinical-triage',
    }));

    const unknowns = [...criticalUnknowns];
    const canProceedWithoutMoreInfo = redFlagSignals.length > 0 || criticalUnknowns.length <= 1;
    const shouldRetrieve = redFlagSignals.length > 0 || parsedSymptoms.length > 0;
    const clarificationTargets = criticalUnknowns.map((item) => ({
      question_goal: `确认 ${item}`,
      priority: item === 'temperature' || item === 'oral_intake' ? 'critical' as const : 'important' as const,
    }));

    return {
      findings,
      assessment: {
        current_risk_tendency: ruleResult.risk_level,
        urgency: deriveUrgency(ruleResult.risk_level),
        confidence: ruleResult.confidence,
        reasoning_summary: `规则初判为 ${ruleResult.risk_level}(${ruleResult.risk_score})，后续需由 deliberation 结合未知项与证据继续收口。`,
        basis: {
          known_facts: knownFacts,
          inferred_facts: inferredFacts,
          unknowns,
        },
        uncertainty_reasons: unknowns.map((item) => `仍缺少 ${item} 相关信息`),
        critical_unknowns: criticalUnknowns,
        can_proceed_without_more_info: canProceedWithoutMoreInfo,
        assessment_kind: 'preliminary_rule_informed',
      },
      retrieval_strategy: {
        should_retrieve: shouldRetrieve,
        focus: shouldRetrieve ? '补充升级边界与警示信号' : '当前无需检索',
        critical_unknowns: criticalUnknowns,
      },
      clarification_targets: clarificationTargets,
      tool_calls: [
        {
          tool: 'parse_symptoms',
          tool_input: { user_input: input.user_input },
          tool_output: parsed,
        },
        {
          tool: 'risk_assessor_tool',
          tool_input: { symptoms: parsedSymptoms, raw_input: input.user_input },
          tool_output: ruleResult,
        },
      ],
    };
  }
}

export function createClinicalTriage(): ClinicalTriage {
  return new ClinicalTriage();
}
