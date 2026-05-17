/**
 * Conversation state service for SPEC-7 deeper implementation.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  AssessRequest,
  AssessResponse,
  ClarificationQuestion,
  ClarificationState,
  ConversationContext,
  Episode,
  EpisodeAssessmentRecord,
  EpisodeSymptom,
  PatientBaseline,
  Session,
  SessionHistory,
  Symptom,
  ExecutiveResponseMode,
  TraceContext,
  TreatmentContext,
} from '../types/index.js';
import { EpisodeRepository, SessionRepository } from '../storage/conversation-repository.js';
import { PatientBaselineRepository } from '../storage/patient-baseline-repository.js';
import { isBaselineComplete, mergeBaselineIntoContext } from '../lib/patient-baseline.js';

interface SessionRepoLike {
  findActiveByUserId(userId: string): Promise<Session | null>;
  findById(sessionId: string): Promise<Session | null>;
  save(session: Session): Promise<void>;
  expireIfNeeded(session: Session): Promise<Session>;
  create(userId: string, sessionId?: string): Promise<Session>;
}

interface EpisodeRepoLike {
  findById(episodeId: string): Promise<Episode | null>;
  save(episode: Episode): Promise<void>;
  create(params: {
    session: Session;
    userId: string;
    firstMessage: string;
    episodeId?: string;
    clarificationState?: ClarificationState;
  }): Promise<Episode>;
}

interface PatientBaselineRepoLike {
  findByUserId(userId: string): Promise<PatientBaseline | null>;
  upsert(baseline: PatientBaseline): Promise<PatientBaseline>;
}

interface ConversationStateServiceDeps {
  sessionRepo: SessionRepoLike;
  episodeRepo: EpisodeRepoLike;
  /** 可选；缺省时视为「无基线」，所有用户走澄清/建档路径。 */
  baselineRepo?: PatientBaselineRepoLike;
}

export interface PreparedConversationState {
  session: Session;
  episode: Episode;
  conversation_context: ConversationContext;
  request: AssessRequest;
  trace: TraceContext | undefined;
}

const SESSION_TTL_MINUTES = 30;
const CLARIFICATION_TTL_MINUTES = 10;
const EPISODE_REOPEN_WINDOW_HOURS = 24;

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

function addMinutesFrom(baseIso: string, minutes: number): string {
  return new Date(new Date(baseIso).getTime() + minutes * 60 * 1000).toISOString();
}

function inferTrend(currentText: string, previousTerms: string[]): 'worsening' | 'improving' | 'stable' | 'unknown' {
  if (/更严重|加重|更厉害|恶化/.test(currentText)) return 'worsening';
  if (/好转|减轻|缓解/.test(currentText)) return 'improving';
  if (previousTerms.length === 0) return 'unknown';
  return 'stable';
}

function buildSessionHistory(episode: Episode): SessionHistory {
  const previousSymptoms = episode.symptoms.extracted.map((s) => s.standard_term || s.term);
  const previousRiskLevels = episode.assessments.map((a) => a.risk_level);
  const symptomTrends = episode.symptoms.extracted.map((s) => s.trend ?? 'unknown');
  const lastTwo = episode.assessments.slice(-2);
  const time_between_assessments =
    lastTwo.length === 2
      ? new Date(lastTwo[1].timestamp).getTime() - new Date(lastTwo[0].timestamp).getTime()
      : undefined;

  return {
    previous_risk_levels: previousRiskLevels,
    previous_symptoms: previousSymptoms,
    symptom_trends: symptomTrends,
    time_between_assessments,
  };
}

function toEpisodeSymptoms(input: Symptom[] = [], rawInput: string, existing: EpisodeSymptom[]): EpisodeSymptom[] {
  return input.map((symptom) => ({
    term: symptom.name,
    standard_term: symptom.standard_term,
    category: 'general',
    severity: symptom.severity,
    trend: inferTrend(rawInput, existing.map((item) => item.term)),
  }));
}

function appendUniqueReported(list: string[], message: string): string[] {
  if (!message.trim()) return list;
  if (list[list.length - 1] === message) return list;
  return [...list, message];
}

/** 每轮 assess 前记录用户输入，并在澄清 awaiting 时收口，避免陈旧 unresolved 卡死后续轮次。 */
function recordEpisodeUserTurn(episode: Episode, input: string): Episode {
  const trimmed = input.trim();
  if (!trimmed) {
    return episode;
  }

  const timestamp = nowIso();
  const reported = appendUniqueReported(episode.symptoms.reported, trimmed);
  let next: Episode = {
    ...episode,
    updated_at: timestamp,
    symptoms: {
      ...episode.symptoms,
      reported,
    },
  };

  if (episode.clarification_state?.status !== 'awaiting') {
    return next;
  }

  const answer = { question_id: 'free_text_reply', answer: trimmed };
  next = {
    ...next,
    clarification_state: {
      ...episode.clarification_state,
      answers: [...episode.clarification_state.answers, answer],
      status: 'completed',
    },
    clarification_history: episode.clarification_history.map((entry) =>
      entry.status === 'awaiting'
        ? {
            ...entry,
            answers: [...entry.answers, answer],
            status: 'completed' as const,
          }
        : entry,
    ),
    unresolved_uncertainties: [],
  };
  return next;
}

function upsertEpisodeSummary(session: Session, episode: Episode): Session['episodes'] {
  const existing = session.episodes.find((item) => item.episode_id === episode.episode_id);
  if (existing) {
    return session.episodes.map((item) =>
      item.episode_id === episode.episode_id
        ? { ...item, status: episode.status, last_activity: episode.updated_at }
        : item
    );
  }

  return [
    {
      episode_id: episode.episode_id,
      status: episode.status,
      started_at: episode.started_at,
      last_activity: episode.updated_at,
    },
    ...session.episodes,
  ];
}

function buildConversationContext(
  session: Session,
  episode: Episode,
  baseline?: PatientBaseline | null,
  mergedContext?: TreatmentContext,
): ConversationContext {
  const completeness = isBaselineComplete(mergedContext ?? baseline ?? undefined);
  return {
    session,
    episode,
    clarification_state: episode.clarification_state,
    session_history: buildSessionHistory(episode),
    baseline: baseline ?? undefined,
    baseline_complete: completeness,
  };
}

function deriveWorkingHypotheses(response: AssessResponse): Episode['working_hypotheses'] {
  const rationale = response.reasoning_surfaces?.risk_deliberation?.rationale;
  if (!rationale) {
    return { alternatives: [] };
  }
  return {
    primary: rationale,
    alternatives: [],
  };
}

function deriveUnresolvedUncertainties(response: AssessResponse): Episode['unresolved_uncertainties'] {
  const visible = response.visible_uncertainty ?? [];
  return visible.map((item) => ({
    item,
    impact: '可能影响当前结论资格或后续处理建议',
    status: 'open' as const,
  }));
}

function deriveExecutiveMode(response: AssessResponse): ExecutiveResponseMode | undefined {
  return response.executive_summary?.final_mode;
}

function deriveEpisodeStatusFromExecutive(response: AssessResponse): Episode['status'] {
  switch (response.executive_summary?.status) {
    case 'escalated':
      return 'escalated';
    case 'completed':
    case 'redirected':
      return 'resolved';
    case 'clarification_required':
    default:
      return 'active';
  }
}

function deriveSessionStatusFromExecutive(response: AssessResponse): Session['status'] {
  switch (response.executive_summary?.status) {
    case 'clarification_required':
      return 'clarifying';
    case 'completed':
    case 'redirected':
      return 'completed';
    case 'escalated':
    default:
      return 'active';
  }
}

function isSessionTerminal(status: Session['status']): boolean {
  return status === 'completed' || status === 'expired';
}

function hasMeaningfulSymptomOverlap(currentInput: string, previousSymptoms: string[]): boolean {
  if (!currentInput.trim() || previousSymptoms.length === 0) return false;
  return previousSymptoms.some((symptom) => currentInput.includes(symptom) || symptom.includes(currentInput));
}

function isFollowupPhrase(input: string): boolean {
  return /更严重|加重|恶化|还是这样|还没好|依然|继续|现在更|比刚才|比之前/.test(input);
}

function shouldReuseEpisode(request: AssessRequest, episode: Episode): boolean {
  if (episode.status === 'active') return true;
  if (episode.status === 'resolved') return false;
  if (episode.status !== 'escalated') return false;

  if (request.session_history?.previous_risk_levels?.includes('medium') && isFollowupPhrase(request.input)) {
    return true;
  }

  const lastAssessment = episode.assessments.at(-1);
  if (!lastAssessment) return true;

  const elapsedMs = Date.now() - new Date(lastAssessment.timestamp).getTime();
  const withinWindow = elapsedMs <= EPISODE_REOPEN_WINDOW_HOURS * 60 * 60 * 1000;
  const overlap = hasMeaningfulSymptomOverlap(request.input, episode.symptoms.reported)
    || hasMeaningfulSymptomOverlap(request.input, episode.symptoms.extracted.map((item) => item.standard_term || item.term));

  return withinWindow && (overlap || isFollowupPhrase(request.input));
}

export class ConversationStateService {
  constructor(private deps: ConversationStateServiceDeps) {}

  static createFromDb(db: D1Database): ConversationStateService {
    return new ConversationStateService({
      sessionRepo: new SessionRepository(db),
      episodeRepo: new EpisodeRepository(db),
      baselineRepo: new PatientBaselineRepository(db),
    });
  }

  private async expireClarificationIfNeeded(session: Session, episode: Episode): Promise<{ session: Session; episode: Episode }> {
    const state = episode.clarification_state;
    if (!state || state.status !== 'awaiting' || !state.expires_at) {
      return { session, episode };
    }

    if (new Date(state.expires_at).getTime() > Date.now()) {
      return { session, episode };
    }

    const timestamp = nowIso();
    const updatedEpisode: Episode = {
      ...episode,
      updated_at: timestamp,
      clarification_state: {
        ...state,
        status: 'expired',
      },
    };

    const updatedSession: Session = {
      ...session,
      status: 'active',
      updated_at: timestamp,
      expires_at: addMinutes(SESSION_TTL_MINUTES),
      episodes: upsertEpisodeSummary(session, updatedEpisode),
      active_episode_id: updatedEpisode.episode_id,
    };

    await this.deps.episodeRepo.save(updatedEpisode);
    await this.deps.sessionRepo.save(updatedSession);

    return { session: updatedSession, episode: updatedEpisode };
  }

  async prepareRequest(request: AssessRequest): Promise<PreparedConversationState> {
    let session = request.session_id
      ? await this.deps.sessionRepo.findById(request.session_id)
      : await this.deps.sessionRepo.findActiveByUserId(request.user_id);

    session = session ? await this.deps.sessionRepo.expireIfNeeded(session) : null;
    if (!session || isSessionTerminal(session.status) || session.user_id !== request.user_id) {
      session = await this.deps.sessionRepo.create(request.user_id);
    }

    let episode = request.episode_id
      ? await this.deps.episodeRepo.findById(request.episode_id)
      : session.active_episode_id
        ? await this.deps.episodeRepo.findById(session.active_episode_id)
        : null;

    if (episode && (episode.session_id !== session.session_id || episode.user_id !== request.user_id)) {
      episode = null;
    }

    if (episode) {
      const expired = await this.expireClarificationIfNeeded(session, episode);
      session = expired.session;
      episode = expired.episode;
    }

    if (!episode || !shouldReuseEpisode(request, episode)) {
      episode = await this.deps.episodeRepo.create({
        session,
        userId: request.user_id,
        firstMessage: request.input,
      });

      session = {
        ...session,
        active_episode_id: episode.episode_id,
        episodes: upsertEpisodeSummary(session, episode),
        updated_at: episode.updated_at,
        expires_at: addMinutes(SESSION_TTL_MINUTES),
        status: 'active',
      };
      await this.deps.sessionRepo.save(session);
    } else {
      episode = recordEpisodeUserTurn(episode, request.input);
      await this.deps.episodeRepo.save(episode);
    }

    const baseline = this.deps.baselineRepo
      ? await this.deps.baselineRepo.findByUserId(request.user_id)
      : null;
    const mergedContext = mergeBaselineIntoContext(baseline, request.context);

    const mergedRequest: AssessRequest = {
      ...request,
      session_id: session.session_id,
      episode_id: episode.episode_id,
      session_history: request.session_history ?? buildSessionHistory(episode),
      context: mergedContext,
    };

    return {
      session,
      episode,
      request: mergedRequest,
      trace: mergedRequest.trace,
      conversation_context: buildConversationContext(session, episode, baseline, mergedContext),
    };
  }

  /** 写入或更新病人基线（供澄清回答 / 建档 UI 调用）。 */
  async upsertBaseline(baseline: PatientBaseline): Promise<PatientBaseline | null> {
    if (!this.deps.baselineRepo) return null;
    return this.deps.baselineRepo.upsert(baseline);
  }

  async getBaseline(userId: string): Promise<PatientBaseline | null> {
    if (!this.deps.baselineRepo) return null;
    return this.deps.baselineRepo.findByUserId(userId);
  }

  async markClarificationAwaiting(params: {
    session: Session;
    episode: Episode;
    questions: ClarificationQuestion[];
  }): Promise<ConversationContext> {
    const askedAt = nowIso();
    const state: ClarificationState = {
      round: (params.episode.clarification_state?.round ?? 0) + 1,
      questions: params.questions,
      answers: [],
      status: 'awaiting',
      asked_at: askedAt,
      expires_at: addMinutesFrom(askedAt, CLARIFICATION_TTL_MINUTES),
    };

    const updatedEpisode: Episode = {
      ...params.episode,
      updated_at: askedAt,
      clarification_state: state,
      clarification_history: [
        ...params.episode.clarification_history,
        {
          round: state.round,
          questions: state.questions,
          answers: state.answers,
          status: state.status,
          asked_at: state.asked_at,
          expires_at: state.expires_at,
        },
      ],
      unresolved_uncertainties: state.questions.map((question) => ({
        item: question.text,
        impact: '需要继续澄清后才能稳定进入下一步判断',
        status: 'open' as const,
      })),
      context_summary: params.episode.context_summary || params.episode.symptoms.reported[0] || '',
    };
    const updatedSession: Session = {
      ...params.session,
      status: 'clarifying',
      updated_at: updatedEpisode.updated_at,
      expires_at: addMinutes(SESSION_TTL_MINUTES),
      episodes: upsertEpisodeSummary(params.session, updatedEpisode),
      active_episode_id: updatedEpisode.episode_id,
    };

    await this.deps.episodeRepo.save(updatedEpisode);
    await this.deps.sessionRepo.save(updatedSession);

    const baseline = this.deps.baselineRepo
      ? await this.deps.baselineRepo.findByUserId(params.episode.user_id)
      : null;
    return buildConversationContext(updatedSession, updatedEpisode, baseline);
  }

  async finalizeAssessment(params: {
    request: AssessRequest;
    response: AssessResponse;
    session: Session;
    episode: Episode;
  }): Promise<AssessResponse> {
    const timestamp = params.response.created_at ?? nowIso();
    const newAssessment: EpisodeAssessmentRecord = {
      assessment_id: params.response.assessment_id ?? crypto.randomUUID(),
      risk_level: params.response.risk_level,
      risk_score: params.response.risk_score,
      timestamp,
      agent_source: 'conversation-executive',
    };

    const mergedSymptoms = [
      ...params.episode.symptoms.extracted,
      ...toEpisodeSymptoms(params.response.symptoms, params.request.input, params.episode.symptoms.extracted),
    ];

    const updatedEpisode: Episode = {
      ...params.episode,
      updated_at: timestamp,
      status: deriveEpisodeStatusFromExecutive(params.response),
      symptoms: {
        reported: appendUniqueReported(params.episode.symptoms.reported, params.request.input),
        extracted: mergedSymptoms,
      },
      assessments: [...params.episode.assessments, newAssessment],
      clarification_state: params.episode.clarification_state
        ? {
            ...params.episode.clarification_state,
            answers:
              params.episode.clarification_state.status === 'awaiting'
                ? [
                    ...params.episode.clarification_state.answers,
                    { question_id: 'free_text_reply', answer: params.request.input },
                  ]
                : params.episode.clarification_state.answers,
            status:
              params.episode.clarification_state.status === 'awaiting'
                ? 'completed'
                : params.episode.clarification_state.status,
          }
        : undefined,
      clarification_history: params.episode.clarification_history.map((entry) =>
        entry.status === 'awaiting'
          ? {
              ...entry,
              answers: [...entry.answers, { question_id: 'free_text_reply', answer: params.request.input }],
              status: 'completed',
            }
          : entry,
      ),
      working_hypotheses: deriveWorkingHypotheses(params.response),
      unresolved_uncertainties: deriveUnresolvedUncertainties(params.response),
      context_summary: params.request.input.slice(0, 120),
    };

    const updatedSession: Session = {
      ...params.session,
      status: deriveSessionStatusFromExecutive(params.response),
      active_episode_id: updatedEpisode.episode_id,
      updated_at: timestamp,
      expires_at: addMinutes(SESSION_TTL_MINUTES),
      episodes: upsertEpisodeSummary(params.session, updatedEpisode),
    };

    await this.deps.episodeRepo.save(updatedEpisode);
    await this.deps.sessionRepo.save(updatedSession);

    const baseline = this.deps.baselineRepo
      ? await this.deps.baselineRepo.findByUserId(params.episode.user_id)
      : null;
    return {
      ...params.response,
      assessment_id: newAssessment.assessment_id,
      created_at: timestamp,
      session_id: updatedSession.session_id,
      episode_id: updatedEpisode.episode_id,
      conversation_context: buildConversationContext(updatedSession, updatedEpisode, baseline),
    };
  }

  async getActiveSession(userId: string): Promise<ConversationContext | null> {
    let session = await this.deps.sessionRepo.findActiveByUserId(userId);
    if (!session) return null;

    session = await this.deps.sessionRepo.expireIfNeeded(session);
    if (session.status === 'expired') {
      return { session };
    }

    const episode = session.active_episode_id ? await this.deps.episodeRepo.findById(session.active_episode_id) : null;
    if (!episode) return { session };

    const expired = await this.expireClarificationIfNeeded(session, episode);
    const baseline = this.deps.baselineRepo ? await this.deps.baselineRepo.findByUserId(userId) : null;
    return buildConversationContext(expired.session, expired.episode, baseline);
  }

  async getSessionById(sessionId: string, userId?: string): Promise<ConversationContext | null> {
    let session = await this.deps.sessionRepo.findById(sessionId);
    if (!session) return null;
    if (userId && session.user_id !== userId) return null;

    session = await this.deps.sessionRepo.expireIfNeeded(session);
    const episode = session.active_episode_id ? await this.deps.episodeRepo.findById(session.active_episode_id) : null;
    if (!episode) return { session };

    const expired = await this.expireClarificationIfNeeded(session, episode);
    const baseline = this.deps.baselineRepo ? await this.deps.baselineRepo.findByUserId(session.user_id) : null;
    return buildConversationContext(expired.session, expired.episode, baseline);
  }

  async getEpisodeById(episodeId: string, userId?: string): Promise<ConversationContext | null> {
    const episode = await this.deps.episodeRepo.findById(episodeId);
    if (!episode) return null;
    if (userId && episode.user_id !== userId) return null;

    const session = await this.deps.sessionRepo.findById(episode.session_id);
    if (!session) return { episode, clarification_state: episode.clarification_state, session_history: buildSessionHistory(episode) };

    const expiredSession = await this.deps.sessionRepo.expireIfNeeded(session);
    const expired = await this.expireClarificationIfNeeded(expiredSession, episode);
    const baseline = this.deps.baselineRepo ? await this.deps.baselineRepo.findByUserId(episode.user_id) : null;
    return buildConversationContext(expired.session, expired.episode, baseline);
  }

  async completeSession(sessionId: string, userId?: string): Promise<Session | null> {
    const session = await this.deps.sessionRepo.findById(sessionId);
    if (!session) return null;
    if (userId && session.user_id !== userId) return null;

    const updated: Session = {
      ...session,
      status: 'completed',
      active_episode_id: undefined,
      updated_at: nowIso(),
    };
    await this.deps.sessionRepo.save(updated);
    return updated;
  }

  async resolveEpisode(episodeId: string, userId?: string): Promise<ConversationContext | null> {
    const episode = await this.deps.episodeRepo.findById(episodeId);
    if (!episode) return null;
    if (userId && episode.user_id !== userId) return null;

    const session = await this.deps.sessionRepo.findById(episode.session_id);
    if (!session) return null;

    const timestamp = nowIso();
    const updatedEpisode: Episode = {
      ...episode,
      status: 'resolved',
      updated_at: timestamp,
    };
    const updatedSession: Session = {
      ...session,
      status: 'completed',
      active_episode_id: session.active_episode_id === episodeId ? undefined : session.active_episode_id,
      updated_at: timestamp,
      episodes: upsertEpisodeSummary(session, updatedEpisode),
    };

    await this.deps.episodeRepo.save(updatedEpisode);
    await this.deps.sessionRepo.save(updatedSession);

    return buildConversationContext(updatedSession, updatedEpisode);
  }
}
