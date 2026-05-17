import type { AssessRequest, AssessResponse } from '../types/index.js';
import { ConversationStateService } from './conversation-state.js';
import { createConversationExecutive, type ConversationExecutive } from '../agents/conversation-executive.js';

function isClarificationResult(response: AssessResponse): boolean {
  return response.executive_summary?.status === 'clarification_required';
}

export async function runAssessPipeline(params: {
  request: AssessRequest;
  stateService: ConversationStateService;
  /** Optional override for tests / harness to avoid module-level singleton state. */
  executive?: ConversationExecutive;
}): Promise<AssessResponse> {
  const prepared = await params.stateService.prepareRequest(params.request);
  const executive = params.executive ?? createConversationExecutive();

  const rawResult = await executive.execute(prepared.request, {
    session_id: prepared.session.session_id,
    episode_id: prepared.episode.episode_id,
    conversation_context: prepared.conversation_context,
  });

  if (isClarificationResult(rawResult)) {
    const context = await params.stateService.markClarificationAwaiting({
      session: prepared.session,
      episode: prepared.episode,
      questions: rawResult.clarification_questions ?? [],
    });
    return {
      ...rawResult,
      conversation_context: context,
      session_id: context.session?.session_id ?? rawResult.session_id,
      episode_id: context.episode?.episode_id ?? rawResult.episode_id,
    };
  }

  return params.stateService.finalizeAssessment({
    request: prepared.request,
    response: rawResult,
    session: prepared.session,
    episode: prepared.episode,
  });
}
