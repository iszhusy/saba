import { describe, expect, it, vi } from 'vitest';
import { createRiskDeliberation } from './risk-deliberation.js';

const fakeToolLoopResult = {
  risk_level: 'medium' as const,
  risk_score: 58,
  reasoning: '综合症状、未知项和证据后，当前更偏向中风险。',
  warning_signs: ['持续无法进食', '症状明显加重'],
  immediate_action: '请尽快联系您的医疗团队。',
  follow_up: '如症状持续加重请及时就医。',
  confidence: 0.74,
  decision_mode: 'provisional' as const,
  visible_uncertainty: ['仍需确认 oral_intake'],
  next_step: '补充口服摄入与脱水情况。',
  tool_calls: [
    {
      tool: 'parse_symptoms',
      tool_input: { user_input: '恶心想吐两天了，今天吃不下东西' },
      tool_output: { symptoms: [{ standard_term: '恶心呕吐', confidence: 0.9, severity: 'moderate' }] },
    },
  ],
};

describe('RiskDeliberation tool-native mapping', () => {
  it('maps tool-native deliberation output into the shared surface shape', async () => {
    const toolLoopRunner = vi.fn().mockResolvedValue(fakeToolLoopResult);
    const deliberation = createRiskDeliberation({
      llm_provider: 'anthropic',
      anthropic_api_key: 'test-key',
      dashscope_api_key: '',
      anthropic_model: 'claude-opus-4-7',
      deliberation_runtime: 'tool_native',
      anthropic_client_factory: () => ({}) as never,
      tool_loop_runner: toolLoopRunner,
    });

    const result = await deliberation.deliberate({
      request: {
        user_id: 'rd-tool-1',
        input: '恶心想吐两天了，今天吃不下东西',
        context: { treatment_phase: '化疗周期第2天' },
      },
      framing: {
        conversation_goal: 'symptom_assessment',
        interaction_mode: 'provisional_assessment',
        answerability: 'ready',
        is_possible_emergency: false,
        is_medication_boundary: false,
        is_follow_up: false,
        rationale: '症状信息基本够用，可进入评估。',
        clarification_questions: [],
        clinical_input: '恶心想吐两天了，今天吃不下东西',
        framing_kind: 'rule_fallback',
      },
      triage: {
        findings: [
          {
            standard_term: '恶心呕吐',
            severity: 'moderate',
            confidence: 0.9,
            duration: '两天',
          },
        ],
        assessment: {
          current_risk_tendency: 'medium',
          urgency: 'within_24_48h',
          confidence: 0.72,
          reasoning_summary: '规则初判中风险。',
          basis: {
            known_facts: ['恶心呕吐（moderate）', '持续时间：两天'],
            inferred_facts: ['已识别 1 个标准化症状'],
            unknowns: ['oral_intake'],
          },
          uncertainty_reasons: ['仍缺少 oral_intake 相关信息'],
          critical_unknowns: ['oral_intake'],
          can_proceed_without_more_info: true,
          assessment_kind: 'preliminary_rule_informed',
        },
        retrieval_strategy: {
          should_retrieve: true,
          focus: '补充升级边界与警示信号',
          critical_unknowns: ['oral_intake'],
        },
        clarification_targets: [
          { question_goal: '确认 oral_intake', priority: 'critical' },
        ],
        tool_calls: [],
      },
      evidence: {
        rag_sources: ['ctcae_v5'],
        knowledge_snippets: [
          {
            source: 'ctcae_v5',
            content: '恶心呕吐持续且影响摄入时需尽快联系医疗团队。',
            relevance: 0.8,
          },
        ],
        matched_rule_ids: ['nausea-intake'],
        surface: {
          retrieval_focus: '症状风险与处置证据',
          should_retrieve: true,
          coverage: 'partial',
          rag_sources: ['ctcae_v5'],
          matched_rule_ids: ['nausea-intake'],
          critical_unknowns: ['oral_intake'],
          snippets: [
            {
              source: 'ctcae_v5',
              relevance: 0.8,
              applicability: '恶心呕吐持续且影响摄入时需尽快联系医疗团队。',
            },
          ],
        },
      },
    });

    expect(toolLoopRunner).toHaveBeenCalledOnce();
    expect(result.decision_mode).toBe('provisional');
    expect(result.surface.decision_mode).toBe(result.decision_mode);
    expect(result.surface.risk_level).toBe(result.risk_level);
    expect(result.surface.risk_score).toBe(result.risk_score);
    expect(result.surface.critical_unknowns).toContain('oral_intake');
  });
});
