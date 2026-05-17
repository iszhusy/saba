/**
 * SABA 核心类型定义
 * 基于 04-api-spec.md 和现有 RAG 类型
 */

// ============ 基础类型 ============

export type RiskLevel = 'high' | 'medium' | 'low';

export type ExecutiveResponseMode =
  | 'structured_intake'
  | 'clarify'
  | 'provisional_assessment'
  | 'conclusive_assessment'
  | 'insufficient'
  | 'escalation'
  | 'route_out';

export type DecisionMode = 'conclusive' | 'provisional' | 'insufficient';

export type FeedbackType = 'user_rating' | 'team_verdict' | 'behavior';
export type TeamVerdict = 'accurate' | 'inaccurate' | 'needs_adjustment';
export type NotificationType = 'high_risk' | 'medium_risk' | 'team_contact';
export type EvidenceType = 'rule_match' | 'rag_reference' | 'llm_reasoning';
export type SymptomSeverity = 'mild' | 'moderate' | 'severe';
export type TreatmentCategory = 'chemotherapy' | 'endocrine' | 'targeted' | 'immunotherapy' | 'radiation' | 'general';
export type AssessmentBehaviorEvent =
  | 'assessment_started'
  | 'assessment_submitted'
  | 'assessment_clarification_requested'
  | 'assessment_baseline_prompted'
  | 'assessment_baseline_submitted'
  | 'assessment_baseline_submit_failed'
  | 'history_viewed'
  | 'history_item_selected'
  | 'result_viewed'
  | 'contact_team_clicked'
  | 'assessment_closed';

// ============ 评估模块 ============

export interface TraceContext {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  flow: 'assessment' | 'baseline' | 'history' | 'team_notify' | 'behavior_event';
  started_at: string;
}

export interface TreatmentContext {  treatment_phase?: string;
  treatment_type?: string;
  treatment_day?: number;
  known_side_effects?: string[];
  treatment_category?: string;
  treatment_anchor?: string;
  primary_regimen?: string;
}

/**
 * 跨 Session 持久化的治疗基线（病人档案）。
 * 真相源按 user_id；每次 assess 由 prepareRequest 合并进 AssessRequest.context。
 * 详见 docs/specs-ai-native/behavior/12-patient-baseline.md
 */
export interface PatientBaseline {
  user_id: string;
  treatment_category?: string;
  treatment_anchor?: string;
  primary_regimen?: string;
  treatment_type?: string;
  treatment_phase?: string;
  treatment_day?: number;
  known_side_effects?: string[];
  updated_at: string;
  trace?: TraceContext;
}

export interface AssessRequest {
  user_id: string;
  input: string;
  context?: TreatmentContext;
  session_id?: string;
  episode_id?: string;
  session_history?: SessionHistory;
  trace?: TraceContext;
}

export interface RiskResult {
  level: string;
  label: string;
  color: string;
}

export interface TriggeredRule {
  id: string;
  name: string;
  confidence: number;
  source: string;
}

export interface AssessmentMetadata {
  model_version: string;
  rules_version: string;
  processing_time_ms: number;
}

export interface Symptom {
  name: string;
  standard_term: string;
  confidence: number;
  severity: SymptomSeverity;
}

export interface Evidence {
  step: number;
  type: EvidenceType;
  description: string;
  confidence: number;
  source?: string;
}

export interface StructuredInput {
  symptoms: Symptom[];
  duration?: string;
}

export interface ClinicalFinding {
  standard_term: string;
  severity: SymptomSeverity;
  confidence: number;
  duration?: string;
}

export interface TriageAssessmentSurface {
  current_risk_tendency: RiskLevel;
  urgency: 'immediate' | 'same_day' | 'within_24_48h' | 'observe_with_guardrails';
  confidence: number;
  reasoning_summary: string;
  basis: {
    known_facts: string[];
    inferred_facts: string[];
    unknowns: string[];
  };
  uncertainty_reasons: string[];
  critical_unknowns: string[];
  can_proceed_without_more_info: boolean;
  assessment_kind?: 'preliminary_rule_informed' | 'llm_reasoned';
  risk_level?: RiskLevel;
  risk_score?: number;
  triggered_rules?: TriggeredRule[];
  notes?: string[];
}

export interface IntentFramingSurface {
  conversation_goal: string;
  interaction_mode: ExecutiveResponseMode;
  answerability: 'ready' | 'needs_clarification' | 'insufficient' | 'non_medical';
  is_possible_emergency: boolean;
  is_medication_boundary: boolean;
  is_follow_up: boolean;
  rationale: string;
  framing_kind?: 'llm_primary' | 'rule_fallback';
}

export interface SafetyConstraintSurface {
  verdict: 'pass' | 'revise' | 'block';
  violations: Array<{
    code: string;
    severity: 'critical' | 'high' | 'medium';
    message: string;
  }>;
  constraints: {
    required_actions: string[];
    forbidden_claims: string[];
    required_warning_signals: string[];
    risk_floor?: RiskLevel;
    rewrite_reason?: string;
  };
}

export interface EvidenceRetrievalSurface {
  retrieval_focus: string;
  should_retrieve: boolean;
  coverage: 'full' | 'partial' | 'minimal' | 'none';
  rag_sources: string[];
  matched_rule_ids: string[];
  critical_unknowns: string[];
  snippets: Array<{
    source: string;
    relevance: number;
    applicability: string;
  }>;
}

export interface RiskDeliberationSurface {
  decision_mode: DecisionMode;
  confidence: number;
  rationale: string;
  risk_level: RiskLevel;
  risk_score: number;
  supporting_signals: string[];
  critical_unknowns: string[];
  what_would_change_the_assessment: string[];
  continuity_considered?: {
    previous_risk_levels: RiskLevel[];
    previous_symptoms: string[];
    symptom_trends: Array<'worsening' | 'improving' | 'stable' | 'unknown'>;
    clarification_open: boolean;
  };
  constraints_applied?: {
    risk_floor?: RiskLevel;
    required_actions: string[];
    forbidden_claims: string[];
  };
}

export interface ReasoningSurfaces {
  intent_framing?: IntentFramingSurface;
  clinical_triage?: TriageAssessmentSurface;
  safety_constraints?: SafetyConstraintSurface;
  evidence_retrieval?: EvidenceRetrievalSurface;
  risk_deliberation?: RiskDeliberationSurface;
}

export interface ExecutiveSummary {
  status: 'clarification_required' | 'completed' | 'redirected' | 'escalated' | 'insufficient';
  summary: string;
  final_mode?: ExecutiveResponseMode;
  decision_mode?: DecisionMode;
  used_constraints?: string[];
}

export interface AssessResponse {
  assessment_id?: string;
  user_id?: string;
  session_id?: string;
  episode_id?: string;
  clarification_questions?: ClarificationQuestion[];
  conversation_context?: ConversationContext;
  executive_summary?: ExecutiveSummary;
  reasoning_surfaces?: ReasoningSurfaces;
  visible_uncertainty?: string[];
  next_step?: string;
  risk_level: RiskLevel;
  risk_score: number;
  symptoms?: Symptom[];
  result?: RiskResult;
  immediate_action: string;
  reasoning?: string;
  triggered_rules: TriggeredRule[];
  team_contact_required?: boolean;
  follow_up?: string;
  warning_signs?: string[];
  evidence?: Evidence[];
  reasoning_chain?: string[];
  metadata: AssessmentMetadata;
  created_at?: string;
  trace?: TraceContext;
}

export interface AssessmentDetail extends AssessResponse {
  raw_input?: string;
  structured_input?: StructuredInput;
  decision_chain?: Evidence[];
  rag_sources?: string[];
}

// ============ 流式评估 ============

export type AssessPipelineStepId =
  | 'intent_framing'
  | 'clinical_triage'
  | 'evidence_retrieval'
  | 'risk_deliberation'
  | 'safety_check'
  | 'executive_synthesis';

export interface AssessStreamStepEvent {
  type: 'step';
  step: AssessPipelineStepId;
  status: 'start' | 'done';
  label: string;
  detail?: string;
}

export interface AssessStreamThinkingEvent {
  type: 'thinking';
  delta: string;
}

export interface AssessStreamMessageEvent {
  type: 'message';
  delta: string;
}

export interface AssessStreamDoneEvent {
  type: 'done';
  result: AssessResponse;
}

export interface AssessStreamErrorEvent {
  type: 'error';
  message: string;
}

export type AssessStreamEvent =
  | AssessStreamStepEvent
  | AssessStreamThinkingEvent
  | AssessStreamMessageEvent
  | AssessStreamDoneEvent
  | AssessStreamErrorEvent;

// ============ 反馈模块 ============

export interface FeedbackRequest {
  assessment_id: string;
  feedback_type: FeedbackType;
  is_helpful?: boolean;
  rating?: number;
  user_acted?: boolean;
  user_sought_medical_help?: boolean;
  team_verdict?: TeamVerdict;
  team_comment?: string;
  user_id?: string;
  session_id?: string;
  behavior_event?: AssessmentBehaviorEvent;
  metadata?: BehaviorEventMetadata;
}

export interface FeedbackResponse {
  feedback_id: string;
  created_at: string;
}

export interface BehaviorEventMetadata {
  source?: 'conversation' | 'history' | 'exit';
  risk_level?: RiskLevel;
  input_length?: number;
  had_assessment_id?: boolean;
  notification_type?: NotificationType;
  clarification_question_count?: number;
  baseline_question_count?: number;
  treatment_category?: string;
  history_count?: number;
  selected_assessment_id?: string;
  error_message?: string;
}

export interface BehaviorEventRequest {
  event: AssessmentBehaviorEvent;
  user_id: string;
  assessment_id?: string;
  session_id?: string;
  metadata?: BehaviorEventMetadata;
  trace?: TraceContext;
}

export interface BehaviorEventResponse {
  event_id: string;
  created_at: string;
}

// ============ 团队通知模块 ============

export interface TeamNotifyRequest {
  assessment_id: string;
  patient_id: string;
  notification_type: NotificationType;
  message?: string;
  trace?: TraceContext;
}

export interface TeamNotifyResponse {
  notification_id: string;
  assessment_id: string;
  sent_at?: string;
  recipients: string[];
  status?: 'queued' | 'sent' | 'failed';
  created_at: string;
  trace?: TraceContext;
}

export interface SessionHistory {
  previous_risk_levels: RiskLevel[];
  previous_symptoms: string[];
  symptom_trends: Array<'worsening' | 'improving' | 'stable' | 'unknown'>;
  time_between_assessments?: number;
}

export interface ClarificationAnswer {
  question_id: string;
  answer: string;
}

export interface ClarificationQuestion {
  question_id: string;
  text: string;
}

export interface ClarificationState {
  round: number;
  questions: ClarificationQuestion[];
  answers: ClarificationAnswer[];
  status: 'awaiting' | 'completed' | 'expired';
  asked_at?: string;
  expires_at?: string;
}

export interface EpisodeAssessmentRecord {
  assessment_id: string;
  risk_level: RiskLevel;
  risk_score: number;
  timestamp: string;
  agent_source: string;
}

export interface EpisodeSummaryItem {
  episode_id: string;
  status: 'active' | 'resolved' | 'escalated';
  started_at: string;
  last_activity: string;
}

export interface EpisodeSymptom {
  term: string;
  standard_term: string;
  category: string;
  severity: SymptomSeverity;
  duration?: string;
  trend?: 'worsening' | 'improving' | 'stable' | 'unknown';
}

export interface Episode {
  episode_id: string;
  session_id: string;
  user_id: string;
  started_at: string;
  updated_at: string;
  status: 'active' | 'resolved' | 'escalated';
  symptoms: {
    reported: string[];
    extracted: EpisodeSymptom[];
  };
  assessments: EpisodeAssessmentRecord[];
  clarification_state?: ClarificationState;
  clarification_history: Array<{
    round: number;
    questions: ClarificationQuestion[];
    answers: ClarificationAnswer[];
    status: 'awaiting' | 'completed' | 'expired';
    asked_at?: string;
    expires_at?: string;
  }>;
  working_hypotheses: {
    primary?: string;
    alternatives: string[];
  };
  unresolved_uncertainties: Array<{
    item: string;
    impact: string;
    status: 'open' | 'resolved';
  }>;
  context_summary: string;
}

export interface Session {
  session_id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  expires_at: string;
  status: 'active' | 'clarifying' | 'assessing' | 'completed' | 'expired';
  episodes: EpisodeSummaryItem[];
  active_episode_id?: string;
}

export interface ConversationContext {
  session?: Session;
  episode?: Episode;
  clarification_state?: ClarificationState;
  session_history?: SessionHistory;
  executive_message?: string;
  baseline?: PatientBaseline;
  baseline_complete?: boolean;
}

export interface OutboxNotificationRecord extends TeamNotifyResponse {
  assessment_id: string;
  patient_id: string;
  notification_type: NotificationType;
  message?: string;
  created_at: string;
  last_error?: string;
  attempt_count?: number;
}

// ============ 历史记录模块 ============

export interface HistoryQuery {
  user_id: string;
  page?: number;
  limit?: number;
  risk_level?: RiskLevel;
  start_date?: string;
  end_date?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface AssessmentSummary {
  assessment_id: string;
  risk_level: RiskLevel;
  result_label: string;
  result_color: string;
  symptom_summary: string;
  immediate_action: string;
  created_at: string;
  triggered_rules: TriggeredRule[];
  rules_version: string;
  trace?: TraceContext;
}

export interface HistoryResponse {
  assessments: AssessmentSummary[];
  pagination: Pagination;
}

export interface TraceChainSnapshot {
  trace_id: string;
  assessments: AssessmentDetail[];
  behavior_events: Array<BehaviorEventRequest & { event_id: string; created_at: string }>;
  baselines: PatientBaseline[];
  notifications: OutboxNotificationRecord[];
  session_ids: string[];
  episode_ids: string[];
  assessment_ids: string[];
}

// ============ 错误处理 ============

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'AI_SERVICE_ERROR';

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

// ============ RAG 类型 (来自 rag_types.ts) ============

export interface SideEffectEntry {
  category: TreatmentCategory;
  symptom: string;
  standard_term: string;
  keywords: string[];
  severity_levels: {
    mild: string;
    moderate: string;
    severe: string;
  };
  risk_criteria: {
    high: string;
    medium: string;
    low: string;
  };
  management: {
    immediate: string;
    follow_up: string;
    warning_signs: string[];
  };
  source: string;
}

export interface RiskRule {
  id: string;
  name: string;
  trigger_keywords: string[];
  risk_level: RiskLevel;
  immediate_action: string;
  reasoning?: string;
  duration_threshold?: string;
}

export interface SymptomCategory {
  id: string;
  name: string;
  symptoms: string[];
  common_treatments: string[];
}

export interface RAGKnowledgeBase {
  metadata: {
    name: string;
    version: string;
    created: string;
    source: string;
    description: string;
  };
  symptom_categories: SymptomCategory[];
  side_effect_entries: SideEffectEntry[];
  high_risk_rules: RiskRule[];
  medium_risk_rules: RiskRule[];
  low_risk_rules: RiskRule[];
}

// ============ Tool 输出类型 ============

export interface SymptomParserOutput {
  symptoms: Symptom[];
  duration?: string;
  rag_sources: string[];
  confidence: number;
}

export interface RiskAssessorOutput {
  risk_level: RiskLevel;
  risk_score: number;
  triggered_rules: TriggeredRule[];
  rag_references: Array<{
    source: string;
    relevance: number;
  }>;
  decision_chain: Evidence[];
  confidence?: number; // 规则置信度（可选）
}

export interface AdviceGeneratorOutput {
  immediate_action: string;
  follow_up: string;
  warning_signs: string[];
  reasoning_chain: string[];
  references: Array<{
    id: string;
    source: string;
  }>;
  team_contact_required: boolean;
}

// ============ 评估编排器 ============

export interface AssessmentContext {
  request: AssessRequest;
  symptomResult?: SymptomParserOutput;
  riskResult?: RiskAssessorOutput;
  adviceResult?: AdviceGeneratorOutput;
  createdAt: Date;
}

// ============ 规则引擎 ============

export interface RuleMatchResult {
  matched: boolean;
  rule?: RiskRule;
  confidence: number;
  evidence: string;
}

export interface RuleEvaluationResult {
  risk_level: RiskLevel;
  risk_score: number;
  matched_rules: RiskRule[];
  evidence: Evidence[];
}