import type {
  AssessRequest,
  AssessResponse,
  ClarificationQuestion,
  ConversationContext,
  DecisionMode,
  ExecutiveResponseMode,
} from '../types/index.js';
import { createIntentFramer, type IntentFramingInput, type IntentFramingResult } from '../modules/intent-framing.js';
import { createClinicalTriage, type ClinicalTriageOutput } from '../modules/clinical-triage.js';
import { createEvidenceRetrievalTool } from '../modules/evidence-retrieval.js';
import { createRiskDeliberation, type RiskDeliberationResult } from '../modules/risk-deliberation.js';
import { validateSafety } from '../tools/safety-validator.js';
import { getConfig, type SABA_CONFIG } from '../lib/env.js';
import { resolveDeliberationRuntime } from '../lib/llm-config.js';
import { synthesizeExecutiveResponse } from '../lib/executive-synthesis.js';
import { isBaselineComplete } from '../lib/patient-baseline.js';

type ConversationExecutiveConfig = Partial<SABA_CONFIG> & {
  deliberation_runtime?: 'structured' | 'tool_native';
};

function deriveExecutiveResponseMode(
  decisionMode: DecisionMode,
  riskLevel: 'high' | 'medium' | 'low',
): ExecutiveResponseMode {
  if (riskLevel === 'high') {
    return 'escalation';
  }
  if (decisionMode === 'insufficient') {
    return 'clarify';
  }
  if (decisionMode === 'provisional') {
    return 'provisional_assessment';
  }
  return 'conclusive_assessment';
}

export class ConversationExecutive {
  private readonly config: ConversationExecutiveConfig;

  constructor(config: ConversationExecutiveConfig = {}) {
    this.config = { ...getConfig(), ...config };
  }

  async assess(request: AssessRequest): Promise<AssessResponse> {
    return this.execute(request);
  }

  async execute(
    request: AssessRequest,
    state?: {
      session_id?: string;
      episode_id?: string;
      conversation_context?: AssessResponse['conversation_context'];
    },
  ): Promise<AssessResponse> {
    const episode = state?.conversation_context?.episode;
    const clarificationState = episode?.clarification_state;
    const unresolvedUncertainties = episode?.unresolved_uncertainties ?? [];
    const clarificationHistory = episode?.clarification_history ?? [];
    const framingInput: IntentFramingInput = {
      user_input: request.input,
      context: request.context,
      session_history: request.session_history ?? state?.conversation_context?.session_history,
      clarification_state: episode?.clarification_state,
      reported_messages: episode?.symptoms.reported,
    };
    const framingResult = await createIntentFramer(this.config).frame(framingInput);

    const enrichedRequest: AssessRequest = {
      ...request,
      input: framingResult.clinical_input,
      session_id: state?.session_id ?? request.session_id,
      episode_id: state?.episode_id ?? request.episode_id,
      session_history: framingInput.session_history,
    };

    if (framingResult.interaction_mode === 'route_out') {
      return this.buildShortCircuitResponse({
        request: enrichedRequest,
        framing: framingResult,
        conversationContext: state?.conversation_context,
        status: 'redirected',
        responseMode: 'route_out',
        decisionMode: 'insufficient',
        immediateAction: '您的问题属于非医疗咨询范畴，建议您通过医院官方渠道（如客服电话、医院App或官网）获取相关信息。',
        followUp: '',
        warningSigns: [],
        teamContactRequired: false,
        clarificationQuestions: [],
        riskLevel: 'low',
        riskScore: 10,
      });
    }

    if (framingResult.interaction_mode === 'escalation') {
      return this.buildShortCircuitResponse({
        request: enrichedRequest,
        framing: framingResult,
        conversationContext: state?.conversation_context,
        status: 'escalated',
        responseMode: 'escalation',
        decisionMode: 'conclusive',
        immediateAction: '请立即就医或前往急诊；如症状明显加重，请拨打120。',
        followUp: '急诊处理后请尽快联系您的医疗团队反馈情况。',
        warningSigns: ['呼吸困难加重', '意识改变', '症状迅速恶化'],
        teamContactRequired: true,
        clarificationQuestions: [],
        riskLevel: 'high',
        riskScore: 95,
      });
    }

    // Defensive eligibility guard：basline 不全 + 非急症/非用药边界 → 强制澄清，
    // 即使 framing 误判 provisional/conclusive 也不得给分级建议。
    // 详见 docs/specs-ai-native/behavior/12-patient-baseline.md §3.2
    const baselineComplete = isBaselineComplete(enrichedRequest.context)
      || state?.conversation_context?.baseline_complete === true;
    if (!baselineComplete) {
      const baselineQuestions: ClarificationQuestion[] = framingResult.clarification_questions.length > 0
        ? framingResult.clarification_questions
        : [
            {
              question_id: 'baseline_treatment_category',
              text: '您目前主要在做什么治疗？例如化疗、靶向、内分泌、免疫、放疗或术后随访。',
            },
            {
              question_id: 'baseline_treatment_anchor',
              text: '最近一次手术或当前治疗周期大概是什么时候？例如「上周三手术」或「化疗第2周期第3天」。',
            },
          ];
      const intakeMode: 'structured_intake' | 'clarify' =
        framingResult.interaction_mode === 'structured_intake' ? 'structured_intake' : 'clarify';
      return this.buildShortCircuitResponse({
        request: enrichedRequest,
        framing: framingResult,
        conversationContext: state?.conversation_context,
        status: 'clarification_required',
        responseMode: intakeMode,
        decisionMode: 'insufficient',
        immediateAction: '在给出风险判断前，请先告诉我您当前的治疗背景。',
        followUp: '请按上方问题补充治疗类型与时间锚点（如手术日或当前周期）。',
        warningSigns: [],
        teamContactRequired: false,
        clarificationQuestions: baselineQuestions.slice(0, 2),
        visibleUncertainty: ['缺少必要的治疗基线信息（治疗类型/时间锚点）'],
        nextStep: '回答治疗类型与最近一次手术/当前治疗周期，系统将更新档案后继续评估。',
        riskLevel: 'low',
        riskScore: 0,
      });
    }

    if (
      clarificationState?.status === 'awaiting' &&
      clarificationHistory.length > 0 &&
      unresolvedUncertainties.length > 0 &&
      framingResult.interaction_mode === 'provisional_assessment'
    ) {
      return this.buildShortCircuitResponse({
        request: enrichedRequest,
        framing: framingResult,
        conversationContext: state?.conversation_context,
        status: 'clarification_required',
        responseMode: 'clarify',
        decisionMode: 'insufficient',
        immediateAction: '在继续给出判断前，还需要先补全上一轮尚未解决的关键信息。',
        followUp: '请优先回答仍未解决的不确定项。',
        warningSigns: [],
        teamContactRequired: false,
        clarificationQuestions: unresolvedUncertainties.map((item, index) => ({
          question_id: `uncertainty-${index + 1}`,
          text: item.item,
        })),
        visibleUncertainty: unresolvedUncertainties.map((item) => item.item),
        nextStep: '请先补充仍未解决的高影响信息。',
        riskLevel: 'low',
        riskScore: 0,
      });
    }

    if (
      framingResult.interaction_mode === 'structured_intake' ||
      framingResult.interaction_mode === 'clarify'
    ) {
      return this.buildShortCircuitResponse({
        request: enrichedRequest,
        framing: framingResult,
        conversationContext: state?.conversation_context,
        status: 'clarification_required',
        responseMode: framingResult.interaction_mode,
        decisionMode: 'insufficient',
        immediateAction: '为了给出更准确的风险判断，需要先了解几个关键信息。',
        followUp: '请按上方问题补充：主要症状、持续时间、严重程度，以及是否有其他不适。',
        warningSigns: [],
        teamContactRequired: false,
        clarificationQuestions: framingResult.clarification_questions,
        visibleUncertainty: ['当前仍缺少足以安全判断的关键信息'],
        nextStep:
          framingResult.interaction_mode === 'structured_intake'
            ? '请按顺序补充主要症状、持续时间、严重程度和伴随症状。'
            : '请先回答上方 1-2 个高价值澄清问题。',
        riskLevel: 'low',
        riskScore: 0,
      });
    }

    const triageResult = await createClinicalTriage().assess({
      user_input: enrichedRequest.input,
      context: enrichedRequest.context,
    });

    const evidenceRetriever = createEvidenceRetrievalTool();
    const evidenceResult = evidenceRetriever.retrieve({
      parsed_symptoms: triageResult.findings.map((finding) => ({
        standard_term: finding.standard_term,
        severity: finding.severity,
      })),
      context: enrichedRequest.context,
      critical_unknowns: triageResult.assessment.critical_unknowns,
      should_retrieve: triageResult.retrieval_strategy.should_retrieve,
    });

    const deliberation = createRiskDeliberation({
      llm_provider:
        this.config.llm_provider === 'anthropic' || this.config.llm_provider === 'dashscope'
          ? this.config.llm_provider
          : 'dashscope',
      anthropic_api_key: this.config.anthropic_api_key ?? '',
      anthropic_base_url: this.config.anthropic_base_url,
      anthropic_model: this.config.anthropic_model,
      anthropic_max_tokens: this.config.anthropic_max_tokens,
      dashscope_api_key: this.config.dashscope_api_key ?? '',
      dashscope_model: this.config.dashscope_model,
      deliberation_runtime: resolveDeliberationRuntime(this.config),
    });
    const deliberationResult = await deliberation.deliberate({
      request: enrichedRequest,
      framing: framingResult,
      triage: triageResult,
      evidence: evidenceResult,
    });

    if (deliberationResult.decision_mode === 'insufficient') {
      return this.buildShortCircuitResponse({
        request: enrichedRequest,
        framing: framingResult,
        conversationContext: state?.conversation_context,
        status: 'clarification_required',
        responseMode: 'clarify',
        decisionMode: deliberationResult.decision_mode,
        immediateAction: '为了安全判断当前风险，还需要补充少量关键信息。',
        followUp: '请优先补充会明显改变判断边界的信息。',
        warningSigns: [],
        teamContactRequired: false,
        clarificationQuestions: triageResult.clarification_targets.map((target) => ({
          question_id: target.question_goal,
          text: target.question_goal,
        })),
        visibleUncertainty: deliberationResult.visible_uncertainty,
        nextStep: deliberationResult.next_step ?? '请继续补充上述澄清信息。',
        riskLevel: deliberationResult.risk_level,
        riskScore: deliberationResult.risk_score,
      });
    }

    return this.synthesizeAssessmentResponse({
      request: enrichedRequest,
      framing: framingResult,
      triage: triageResult,
      evidence: evidenceResult,
      deliberation: deliberationResult,
      conversationContext: state?.conversation_context,
    });
  }

  private buildShortCircuitResponse(params: {
    request: AssessRequest;
    framing: IntentFramingResult;
    conversationContext?: ConversationContext;
    status: 'clarification_required' | 'completed' | 'redirected' | 'escalated';
    responseMode: 'structured_intake' | 'clarify' | 'route_out' | 'escalation';
    decisionMode: 'conclusive' | 'provisional' | 'insufficient';
    immediateAction: string;
    followUp: string;
    warningSigns: string[];
    teamContactRequired: boolean;
    clarificationQuestions: ClarificationQuestion[];
    visibleUncertainty?: string[];
    nextStep?: string;
    riskLevel: 'high' | 'medium' | 'low';
    riskScore: number;
  }): AssessResponse {
    return synthesizeExecutiveResponse({
      request: params.request,
      responseMode: params.responseMode,
      decisionMode: params.decisionMode,
      status: params.status,
      summary: params.framing.rationale,
      reasoningSurfaces: {
        intent_framing: params.framing,
      },
      conversationContext: params.conversationContext,
      clarificationQuestions: params.clarificationQuestions,
      visibleUncertainty: params.visibleUncertainty,
      nextStep: params.nextStep,
      riskLevel: params.riskLevel,
      riskScore: params.riskScore,
      warningSigns: params.warningSigns,
      immediateAction: params.immediateAction,
      followUp: params.followUp,
      teamContactRequired: params.teamContactRequired,
    });
  }

  private synthesizeAssessmentResponse(params: {
    request: AssessRequest;
    framing: IntentFramingResult;
    triage: ClinicalTriageOutput;
    evidence: ReturnType<ReturnType<typeof createEvidenceRetrievalTool>['retrieve']>;
    deliberation: RiskDeliberationResult;
    conversationContext?: ConversationContext;
  }): AssessResponse {
    const safety = validateSafety({
      risk_level: params.deliberation.risk_level,
      immediate_action: params.deliberation.immediate_action,
      follow_up: params.deliberation.follow_up,
      warning_signs: params.deliberation.warning_signs,
    });

    const requiredActions = safety.constraints.required_actions;
    const immediateAction = requiredActions[0] ?? params.deliberation.immediate_action;
    const followUp = requiredActions.length > 1
      ? requiredActions.slice(1).join('；')
      : params.deliberation.follow_up;

    const responseMode = deriveExecutiveResponseMode(
      params.deliberation.decision_mode,
      params.deliberation.risk_level,
    );

    return synthesizeExecutiveResponse({
      request: params.request,
      responseMode,
      decisionMode: params.deliberation.decision_mode,
      status: responseMode === 'escalation' ? 'escalated' : 'completed',
      summary: params.deliberation.reasoning,
      reasoningSurfaces: {
        intent_framing: params.framing,
        clinical_triage: params.triage.assessment,
        evidence_retrieval: params.evidence.surface,
        risk_deliberation: params.deliberation.surface,
        safety_constraints: {
          verdict: safety.verdict,
          violations: safety.violations,
          constraints: safety.constraints,
        },
      },
      conversationContext: params.conversationContext,
      visibleUncertainty: params.deliberation.visible_uncertainty,
      nextStep: params.deliberation.next_step,
      riskLevel: params.deliberation.risk_level,
      riskScore: params.deliberation.risk_score,
      warningSigns: safety.constraints.required_warning_signals,
      immediateAction,
      followUp,
      teamContactRequired: params.deliberation.risk_level !== 'low',
    });
  }
}

export function createConversationExecutive(config?: ConversationExecutiveConfig): ConversationExecutive {
  return new ConversationExecutive(config);
}
