import type {
  AssessmentBehaviorEvent,
  BehaviorEventMetadata,
  BehaviorEventRequest,
} from '../types/index.js';

export interface CreateBehaviorEventInput {
  event: AssessmentBehaviorEvent;
  userId: string;
  assessmentId?: string;
  sessionId?: string;
  metadata?: BehaviorEventMetadata;
}

export function createBehaviorEventRequest(
  input: CreateBehaviorEventInput,
): BehaviorEventRequest {
  return {
    event: input.event,
    user_id: input.userId,
    assessment_id: input.assessmentId,
    session_id: input.sessionId,
    metadata: input.metadata,
  };
}
