import type {
  AssessRequest,
  AssessResponse,
  ClarificationQuestion,
  ConversationContext,
  DecisionMode,
  ExecutiveResponseMode,
  ReasoningSurfaces,
} from '../types/index.js';

type ExecutiveStatus = 'clarification_required' | 'completed' | 'redirected' | 'escalated';

type ExecutiveBundle = {
  request: AssessRequest;
  responseMode: ExecutiveResponseMode;
  decisionMode: DecisionMode;
  status: ExecutiveStatus;
  summary: string;
  reasoningSurfaces: ReasoningSurfaces;
  conversationContext?: ConversationContext;
  clarificationQuestions?: ClarificationQuestion[];
  visibleUncertainty?: string[];
  nextStep?: string;
  riskLevel: 'high' | 'medium' | 'low';
  riskScore: number;
  warningSigns: string[];
  immediateAction: string;
  followUp: string;
  teamContactRequired: boolean;
};

function buildExecutiveMessage(bundle: ExecutiveBundle): string {
  const lines: string[] = [];

  if (bundle.responseMode === 'route_out') {
    lines.push(bundle.immediateAction);
    return lines.join('\n');
  }

  lines.push(bundle.immediateAction);

  if (bundle.followUp.trim()) {
    lines.push(bundle.followUp);
  }

  if (bundle.visibleUncertainty && bundle.visibleUncertainty.length > 0) {
    lines.push(`当前仍需说明：${bundle.visibleUncertainty.join('；')}`);
  }

  if (bundle.nextStep?.trim()) {
    lines.push(bundle.nextStep);
  }

  return lines.join('\n');
}

export function synthesizeExecutiveResponse(bundle: ExecutiveBundle): AssessResponse {
  const message = buildExecutiveMessage(bundle);

  return {
    user_id: bundle.request.user_id,
    session_id: bundle.request.session_id,
    episode_id: bundle.request.episode_id,
    clarification_questions: bundle.clarificationQuestions,
    conversation_context: bundle.conversationContext,
    executive_summary: {
      status: bundle.status,
      summary: bundle.summary,
      final_mode: bundle.responseMode,
      decision_mode: bundle.decisionMode,
    },
    reasoning_surfaces: bundle.reasoningSurfaces,
    visible_uncertainty: bundle.visibleUncertainty,
    next_step: bundle.nextStep,
    risk_level: bundle.riskLevel,
    risk_score: bundle.riskScore,
    immediate_action: message,
    follow_up: bundle.followUp,
    warning_signs: bundle.warningSigns,
    triggered_rules: [],
    team_contact_required: bundle.teamContactRequired,
    reasoning: bundle.summary,
    reasoning_chain: [bundle.summary],
    metadata: {
      processing_time_ms: 0,
      model_version: 'conversation-executive',
      rules_version: '1.0.0',
    },
  };
}
