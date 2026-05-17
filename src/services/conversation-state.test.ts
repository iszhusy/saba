import { describe, expect, it } from 'vitest';
import type { AssessResponse } from '../types/index.js';
import { ConversationStateService } from './conversation-state.js';
import { MemoryEpisodeRepository, MemorySessionRepository } from '../dev-api/memory-conversation-store.js';

function createAssessmentResponse(partial: Partial<AssessResponse>): AssessResponse {
  return {
    user_id: 'state-test-user',
    session_id: 'session-1',
    episode_id: 'episode-1',
    risk_level: 'medium',
    risk_score: 55,
    immediate_action: '请联系医疗团队。',
    triggered_rules: [],
    metadata: {
      processing_time_ms: 1,
      model_version: 'test',
      rules_version: '1.0.0',
    },
    executive_summary: {
      status: 'completed',
      summary: '已完成评估',
      final_mode: 'conclusive_assessment',
      decision_mode: 'conclusive',
    },
    reasoning_surfaces: {
      intent_framing: {
        conversation_goal: 'symptom_assessment',
        interaction_mode: 'conclusive_assessment',
        answerability: 'ready',
        is_possible_emergency: false,
        is_medication_boundary: false,
        is_follow_up: false,
        rationale: '信息充分',
        framing_kind: 'llm_primary',
      },
      risk_deliberation: {
        decision_mode: 'conclusive',
        confidence: 0.9,
        rationale: '综合判断后可直接给出结论。',
        risk_level: 'medium',
        risk_score: 55,
        supporting_signals: ['持续恶心'],
        critical_unknowns: [],
        what_would_change_the_assessment: [],
      },
    },
    visible_uncertainty: ['需继续观察摄入情况'],
    ...partial,
  };
}

describe('ConversationStateService source-of-truth persistence', () => {
  it('stores only episode clinical continuity state and keeps mode SoT on executive_summary', async () => {
    const sessionRepo = new MemorySessionRepository();
    const episodeRepo = new MemoryEpisodeRepository();
    const stateService = new ConversationStateService({ sessionRepo, episodeRepo });

    const prepared = await stateService.prepareRequest({
      user_id: 'state-test-user',
      input: '恶心两天了',
    });

    const finalized = await stateService.finalizeAssessment({
      request: prepared.request,
      response: createAssessmentResponse({
        session_id: prepared.session.session_id,
        episode_id: prepared.episode.episode_id,
      }),
      session: prepared.session,
      episode: prepared.episode,
    });

    expect(finalized.executive_summary?.final_mode).toBe('conclusive_assessment');
    expect(finalized.executive_summary?.decision_mode).toBe('conclusive');

    const storedEpisode = await episodeRepo.findById(prepared.episode.episode_id);
    expect(storedEpisode).toBeTruthy();
    expect('current_response_mode' in (storedEpisode as object)).toBe(false);
    expect(storedEpisode?.working_hypotheses.primary).toBe('综合判断后可直接给出结论。');
    expect(storedEpisode?.unresolved_uncertainties).toEqual([
      {
        item: '需继续观察摄入情况',
        impact: '可能影响当前结论资格或后续处理建议',
        status: 'open',
      },
    ]);
  });
});
