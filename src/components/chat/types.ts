export type ConversationPhase = 'chat';

import type { StreamingStepState } from '../../lib/assess-stream';
import type { AssessPipelineStepId, RiskLevel } from '../../types/index';

export interface ChatMessageItem {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

export interface ChatStreamState {
  steps: Partial<Record<AssessPipelineStepId, StreamingStepState>>;
  thinking: string;
  message: string;
  riskLevel?: RiskLevel;
  riskScore?: number;
}
