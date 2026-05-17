import type { AssessRequest, AssessResponse } from '../types/index.js';
import { ConversationStateService } from './conversation-state.js';
import { createConversationExecutive, type ConversationExecutive } from '../agents/conversation-executive.js';
import type { AssessStreamSink } from '../lib/assess-stream.js';
import { streamAssessResponse } from '../lib/assess-stream.js';
import { createChildTraceContext } from '../lib/trace.js';

function isClarificationResult(response: AssessResponse): boolean {
  return response.executive_summary?.status === 'clarification_required';
}

export async function runAssessPipeline(params: {
  request: AssessRequest;
  stateService: ConversationStateService;
  /** Optional override for tests / harness to avoid module-level singleton state. */
  executive?: ConversationExecutive;
  stream?: AssessStreamSink;
}): Promise<AssessResponse> {
  const prepared = await params.stateService.prepareRequest(params.request);
  const executive = params.executive ?? createConversationExecutive();
  const execOptions = params.stream ? { stream: params.stream } : undefined;

  const rawResult = await executive.execute(
    prepared.request,
    {
      session_id: prepared.session.session_id,
      episode_id: prepared.episode.episode_id,
      conversation_context: prepared.conversation_context,
    },
    execOptions,
  );
  const tracedRawResult = prepared.trace
    ? { ...rawResult, trace: createChildTraceContext(prepared.trace, 'assessment') }
    : rawResult;

  if (isClarificationResult(tracedRawResult)) {
    const refreshed = await params.stateService.prepareRequest({
      ...params.request,
      session_id: prepared.session.session_id,
      episode_id: prepared.episode.episode_id,
    });

    const refreshedResult = await executive.execute(
      refreshed.request,
      {
        session_id: refreshed.session.session_id,
        episode_id: refreshed.episode.episode_id,
        conversation_context: refreshed.conversation_context,
      },
      execOptions,
    );
    const tracedRefreshedResult = refreshed.trace
      ? { ...refreshedResult, trace: createChildTraceContext(refreshed.trace, 'assessment') }
      : refreshedResult;

    if (!isClarificationResult(tracedRefreshedResult)) {
      const finalized = await params.stateService.finalizeAssessment({
        request: refreshed.request,
        response: tracedRefreshedResult,
        session: refreshed.session,
        episode: refreshed.episode,
      });
      if (params.stream) {
        await streamAssessResponse(params.stream, finalized);
      }
      return finalized;
    }

    const context = await params.stateService.markClarificationAwaiting({
      session: refreshed.session,
      episode: refreshed.episode,
      questions: tracedRefreshedResult.clarification_questions ?? tracedRawResult.clarification_questions ?? [],
    });
    const clarificationResponse = {
      ...tracedRefreshedResult,
      conversation_context: context,
      session_id: context.session?.session_id ?? tracedRefreshedResult.session_id,
      episode_id: context.episode?.episode_id ?? tracedRefreshedResult.episode_id,
    };
    if (params.stream) {
      await streamAssessResponse(params.stream, clarificationResponse);
    }
    return clarificationResponse;
  }

  if (isClarificationResult(tracedRawResult)) {
    if (params.stream) {
      await streamAssessResponse(params.stream, tracedRawResult);
    }
    return tracedRawResult;
  }

  const finalized = await params.stateService.finalizeAssessment({
    request: prepared.request,
    response: tracedRawResult,
    session: prepared.session,
    episode: prepared.episode,
  });
  if (params.stream) {
    await streamAssessResponse(params.stream, finalized);
  }
  return finalized;
}
