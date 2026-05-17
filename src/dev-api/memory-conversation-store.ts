import type { Episode, Session } from '../types/index.js';
import { ConversationStateService } from '../services/conversation-state.js';
import { MemoryPatientBaselineRepository } from './memory-patient-baseline-store.js';

export class MemorySessionRepository {
  private sessions = new Map<string, Session>();

  async findActiveByUserId(userId: string): Promise<Session | null> {
    const active = [...this.sessions.values()].find(
      (session) =>
        session.user_id === userId &&
        session.status !== 'completed' &&
        session.status !== 'expired',
    );
    return active ? structuredClone(active) : null;
  }

  async findById(sessionId: string): Promise<Session | null> {
    const session = this.sessions.get(sessionId);
    return session ? structuredClone(session) : null;
  }

  async save(session: Session): Promise<void> {
    this.sessions.set(session.session_id, structuredClone(session));
  }

  async expireIfNeeded(session: Session): Promise<Session> {
    if (new Date(session.expires_at).getTime() > Date.now()) {
      return structuredClone(session);
    }
    const expired: Session = {
      ...session,
      status: 'expired',
      updated_at: new Date().toISOString(),
    };
    this.sessions.set(session.session_id, structuredClone(expired));
    return expired;
  }

  async create(userId: string, sessionId?: string): Promise<Session> {
    const now = new Date().toISOString();
    const created: Session = {
      session_id: sessionId ?? crypto.randomUUID(),
      user_id: userId,
      created_at: now,
      updated_at: now,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      status: 'active',
      episodes: [],
    };
    this.sessions.set(created.session_id, structuredClone(created));
    return created;
  }
}

export class MemoryEpisodeRepository {
  private episodes = new Map<string, Episode>();

  async findById(episodeId: string): Promise<Episode | null> {
    const episode = this.episodes.get(episodeId);
    return episode ? structuredClone(episode) : null;
  }

  async save(episode: Episode): Promise<void> {
    this.episodes.set(episode.episode_id, structuredClone(episode));
  }

  async create(params: {
    session: Session;
    userId: string;
    firstMessage: string;
    episodeId?: string;
  }): Promise<Episode> {
    const now = new Date().toISOString();
    const created: Episode = {
      episode_id: params.episodeId ?? crypto.randomUUID(),
      session_id: params.session.session_id,
      user_id: params.userId,
      started_at: now,
      updated_at: now,
      status: 'active',
      symptoms: { reported: [params.firstMessage], extracted: [] },
      assessments: [],
      clarification_history: [],
      working_hypotheses: { alternatives: [] },
      unresolved_uncertainties: [],
      context_summary: params.firstMessage.slice(0, 120),
    };
    this.episodes.set(created.episode_id, structuredClone(created));
    return created;
  }
}

export interface MemoryConversationBundle {
  service: ConversationStateService;
  baselineRepo: MemoryPatientBaselineRepository;
}

export function createMemoryConversationStateService(): ConversationStateService {
  return createMemoryConversationBundle().service;
}

/**
 * 同 createMemoryConversationStateService 但暴露内部 baseline repo，
 * 供 dev-api `/baseline` 端点直接读写。
 */
export function createMemoryConversationBundle(): MemoryConversationBundle {
  const baselineRepo = new MemoryPatientBaselineRepository();
  const service = new ConversationStateService({
    sessionRepo: new MemorySessionRepository(),
    episodeRepo: new MemoryEpisodeRepository(),
    baselineRepo,
  });
  return { service, baselineRepo };
}
