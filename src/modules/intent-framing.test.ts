import { describe, expect, it } from 'vitest';
import { createIntentFramer } from './intent-framing.js';
import type { TreatmentContext } from '../types/index.js';

const framer = createIntentFramer({
  llm_provider: 'dashscope',
  anthropic_api_key: 'test-key',
  anthropic_model: 'claude-opus-4-7',
});

/** 合规基线：treatment_category + treatment_anchor 均提供 → baseline_complete = true。 */
const COMPLETE_BASELINE: TreatmentContext = {
  treatment_category: 'chemotherapy',
  treatment_anchor: '化疗第2周期第3天',
  treatment_type: 'T-DXd',
  treatment_day: 3,
};

describe('IntentFramer', () => {
  it('routes medication-boundary questions out of the assessment path', async () => {
    const result = await framer.frame({
      user_input: '我能不能把药停一天？',
      context: COMPLETE_BASELINE,
    });

    expect(result.conversation_goal).toBe('medication_question');
    expect(result.interaction_mode).toBe('route_out');
    expect(result.answerability).toBe('insufficient');
    expect(result.is_medication_boundary).toBe(true);
    expect(result.is_possible_emergency).toBe(false);
  });

  it('escalates obvious emergency symptoms immediately, regardless of baseline', async () => {
    const result = await framer.frame({
      user_input: '喘不上气，胸口很闷',
    });

    expect(result.conversation_goal).toBe('emergency_help');
    expect(result.interaction_mode).toBe('escalation');
    expect(result.answerability).toBe('ready');
    expect(result.is_possible_emergency).toBe(true);
    expect(result.clarification_questions).toEqual([]);
  });

  it('uses structured intake when symptom description is too vague (with baseline)', async () => {
    const result = await framer.frame({
      user_input: '我不舒服',
      context: COMPLETE_BASELINE,
    });

    expect(result.conversation_goal).toBe('unclear');
    expect(result.interaction_mode).toBe('structured_intake');
    expect(result.answerability).toBe('needs_clarification');
    expect(result.clarification_questions).toHaveLength(1);
    expect(result.clinical_input).toBe('我不舒服');
  });

  it('marks worsening symptom updates as follow-up framing (with baseline)', async () => {
    const result = await framer.frame({
      user_input: '现在更严重了，还有点发热',
      context: COMPLETE_BASELINE,
      session_history: {
        previous_risk_levels: ['medium'],
        previous_symptoms: ['恶心', '呕吐'],
        symptom_trends: ['worsening'],
      },
    });

    expect(result.conversation_goal).toBe('followup_update');
    expect(result.is_follow_up).toBe(true);
    expect(result.interaction_mode).toBe('provisional_assessment');
    expect(result.answerability).toBe('ready');
  });

  // ── Baseline gate ────────────────────────────────────────────────────────────

  it('「今天开始恶心」无基线时不得进入 triage，转为澄清', async () => {
    const result = await framer.frame({
      user_input: '今天开始恶心',
    });

    expect(result.answerability).toBe('needs_clarification');
    expect(['structured_intake', 'clarify']).toContain(result.interaction_mode);
    expect(result.clarification_questions.length).toBeGreaterThanOrEqual(1);
    expect(result.clarification_questions.length).toBeLessThanOrEqual(2);
    // 问句应包含治疗/手术相关字眼
    const text = result.clarification_questions.map((q) => q.text).join(' ');
    expect(text).toMatch(/治疗|手术|周期/);
  });

  it('无基线但有红旗仍立即升级（不被档案门禁阻塞）', async () => {
    const result = await framer.frame({
      user_input: '喘不上气，胸口很闷',
    });

    expect(result.interaction_mode).toBe('escalation');
    expect(result.answerability).toBe('ready');
  });

  it('无基线时用药边界仍 route_out', async () => {
    const result = await framer.frame({
      user_input: '我能不能把药停一天？',
    });

    expect(result.interaction_mode).toBe('route_out');
    expect(result.answerability).toBe('insufficient');
  });

  it('仅有 treatment_category 缺 anchor 时仍视为不完整', async () => {
    const result = await framer.frame({
      user_input: '今天开始恶心',
      context: { treatment_category: 'chemotherapy' },
    });

    expect(result.answerability).toBe('needs_clarification');
    const ids = result.clarification_questions.map((q) => q.question_id);
    expect(ids).toContain('baseline_treatment_anchor');
  });
});
