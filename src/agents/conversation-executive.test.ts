import { describe, expect, it } from 'vitest';
import { createConversationExecutive } from '../agents/conversation-executive.js';
import { LlmNotConfiguredError } from '../lib/llm-config.js';
import type { TreatmentContext } from '../types/index.js';

const executive = createConversationExecutive({
  llm_provider: 'dashscope',
  anthropic_api_key: '',
  dashscope_api_key: '',
  dashscope_model: 'qwen3.6-plus',
  deliberation_runtime: 'structured',
});

const COMPLETE_BASELINE: TreatmentContext = {
  treatment_category: 'chemotherapy',
  treatment_anchor: '化疗第2周期第3天',
  treatment_type: 'T-DXd',
  treatment_day: 3,
};

describe('ConversationExecutive AI-native modes', () => {
  it('returns structured_intake for extremely underspecified intake', async () => {
    const response = await executive.execute({
      user_id: 'mode-test-1',
      input: '我不舒服',
      context: COMPLETE_BASELINE,
    });

    expect(response.executive_summary?.status).toBe('clarification_required');
    expect(response.executive_summary?.final_mode).toBe('structured_intake');
    expect(response.executive_summary?.decision_mode).toBe('insufficient');
    expect(response.reasoning_surfaces?.intent_framing?.interaction_mode).toBe('structured_intake');
    expect(response.reasoning_surfaces?.intent_framing?.answerability).toBe('needs_clarification');
  });

  it('returns route_out for medication boundary questions', async () => {
    const response = await executive.execute({
      user_id: 'mode-test-2',
      input: '我能不能把药停一天？',
      context: COMPLETE_BASELINE,
    });

    expect(response.executive_summary?.status).toBe('redirected');
    expect(response.executive_summary?.final_mode).toBe('route_out');
    expect(response.executive_summary?.decision_mode).toBe('insufficient');
    expect(response.reasoning_surfaces?.intent_framing?.conversation_goal).toBe('medication_question');
    expect(response.reasoning_surfaces?.intent_framing?.answerability).toBe('insufficient');
  });

  it('returns escalation for red-flag emergencies', async () => {
    const response = await executive.execute({
      user_id: 'mode-test-3',
      input: '喘不上气，胸口很闷',
      context: { treatment_type: 'T-DXd', treatment_day: 3 },
    });

    expect(response.executive_summary?.status).toBe('escalated');
    expect(response.executive_summary?.final_mode).toBe('escalation');
    expect(response.executive_summary?.decision_mode).toBe('conclusive');
    expect(response.risk_level).toBe('high');
    expect(response.reasoning_surfaces?.intent_framing?.interaction_mode).toBe('escalation');
  });

  // ── Baseline eligibility guard ──────────────────────────────────────────────

  it('baseline 不全时「今天开始恶心」不得进入 conclusive/provisional', async () => {
    const response = await executive.execute({
      user_id: 'baseline-gate-1',
      input: '今天开始恶心',
    });

    expect(response.executive_summary?.status).toBe('clarification_required');
    expect(response.executive_summary?.decision_mode).toBe('insufficient');
    expect(['structured_intake', 'clarify']).toContain(response.executive_summary?.final_mode);
    expect(response.risk_level).toBe('low');
    expect(response.risk_score).toBe(0);
    expect(response.clarification_questions?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(response.clarification_questions?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('baseline 不全时仍升级急症', async () => {
    const response = await executive.execute({
      user_id: 'baseline-gate-2',
      input: '喘不上气，胸口很闷',
    });

    expect(response.executive_summary?.status).toBe('escalated');
    expect(response.risk_level).toBe('high');
  });

  it('澄清后补充足够症状信息时不应再卡在重复澄清', async () => {
    const staleEpisode = {
      episode_id: 'ep-loop-1',
      session_id: 'sess-loop-1',
      user_id: 'clarify-loop-user',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'active' as const,
      symptoms: {
        reported: ['你好'],
        extracted: [],
      },
      assessments: [],
      clarification_state: {
        round: 1,
        questions: [
          {
            question_id: 'intake_overview',
            text: '请按顺序补充：当前最主要的不适、持续多久、严重程度，以及是否还有其他症状。',
          },
        ],
        answers: [],
        status: 'awaiting' as const,
      },
      clarification_history: [],
      working_hypotheses: { alternatives: [] },
      unresolved_uncertainties: [
        {
          item: '请按顺序补充：当前最主要的不适、持续多久、严重程度，以及是否还有其他症状。',
          impact: '需要继续澄清后才能稳定进入下一步判断',
          status: 'open' as const,
        },
      ],
      context_summary: '你好',
    };

    try {
      const response = await executive.execute(
        {
          user_id: 'clarify-loop-user',
          input: '上周开始感到恶心，吃饭也吃不下，脑袋隐隐做痛',
          context: COMPLETE_BASELINE,
        },
        {
          conversation_context: {
            episode: staleEpisode,
            baseline_complete: true,
          },
        },
      );

      expect(response.executive_summary?.status).not.toBe('clarification_required');
      expect(response.immediate_action).not.toContain(
        '在继续给出判断前，还需要先补全上一轮尚未解决的关键信息',
      );
    } catch (error) {
      // 无 API Key 时会进入 risk_deliberation 才抛错，说明已越过重复澄清短路
      expect(error).toBeInstanceOf(LlmNotConfiguredError);
    }
  });
});
