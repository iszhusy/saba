import { describe, expect, it } from 'vitest';
import { createConversationExecutive } from '../agents/conversation-executive.js';
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
});
