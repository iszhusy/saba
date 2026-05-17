/**
 * Conversation state repositories and outbox persistence.
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  ClarificationState,
  Episode,
  OutboxNotificationRecord,
  Session,
  TeamNotifyRequest,
  TeamNotifyResponse,
} from '../types/index.js';

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function addMinutes(baseIso: string, minutes: number): string {
  return new Date(new Date(baseIso).getTime() + minutes * 60 * 1000).toISOString();
}

export class SessionRepository {
  constructor(private db: D1Database) {}

  async findActiveByUserId(userId: string): Promise<Session | null> {
    const row = await this.db
      .prepare(`
        SELECT * FROM sessions
        WHERE user_id = ? AND status != 'completed'
        ORDER BY updated_at DESC
        LIMIT 1
      `)
      .bind(userId)
      .first();

    if (!row) return null;
    return this.mapSession(row);
  }

  async findById(sessionId: string): Promise<Session | null> {
    const row = await this.db.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first();
    if (!row) return null;
    return this.mapSession(row);
  }

  async save(session: Session): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO sessions (
          id, user_id, status, active_episode_id, episodes_json,
          created_at, updated_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        session.session_id,
        session.user_id,
        session.status,
        session.active_episode_id ?? null,
        JSON.stringify(session.episodes ?? []),
        session.created_at,
        session.updated_at,
        session.expires_at
      )
      .run();
  }

  async expireIfNeeded(session: Session): Promise<Session> {
    if (new Date(session.expires_at).getTime() > Date.now()) return session;
    const expired: Session = {
      ...session,
      status: 'expired',
      updated_at: nowIso(),
    };
    await this.save(expired);
    return expired;
  }

  async create(userId: string, sessionId?: string): Promise<Session> {
    const createdAt = nowIso();
    const session: Session = {
      session_id: sessionId ?? crypto.randomUUID(),
      user_id: userId,
      created_at: createdAt,
      updated_at: createdAt,
      expires_at: addMinutes(createdAt, 30),
      status: 'active',
      episodes: [],
    };
    await this.save(session);
    return session;
  }

  private mapSession(row: Record<string, unknown>): Session {
    return {
      session_id: row.id as string,
      user_id: row.user_id as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      expires_at: row.expires_at as string,
      status: row.status as Session['status'],
      active_episode_id: (row.active_episode_id as string) || undefined,
      episodes: parseJson(row.episodes_json, []),
    };
  }
}

export class EpisodeRepository {
  constructor(private db: D1Database) {}

  async findById(episodeId: string): Promise<Episode | null> {
    const row = await this.db.prepare('SELECT * FROM episodes WHERE id = ?').bind(episodeId).first();
    if (!row) return null;
    return this.mapEpisode(row);
  }

  async save(episode: Episode): Promise<void> {
    await this.db
      .prepare(`
        INSERT OR REPLACE INTO episodes (
          id, session_id, user_id, status,
          symptoms_reported_json, symptoms_extracted_json, assessments_json,
          clarification_state_json, context_summary, started_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        episode.episode_id,
        episode.session_id,
        episode.user_id,
        episode.status,
        JSON.stringify(episode.symptoms.reported ?? []),
        JSON.stringify(episode.symptoms.extracted ?? []),
        JSON.stringify(episode.assessments ?? []),
        episode.clarification_state ? JSON.stringify(episode.clarification_state) : null,
        episode.context_summary,
        episode.started_at,
        episode.updated_at
      )
      .run();
  }

  async create(params: {
    session: Session;
    userId: string;
    firstMessage: string;
    episodeId?: string;
    clarificationState?: ClarificationState;
  }): Promise<Episode> {
    const timestamp = nowIso();
    const episode: Episode = {
      episode_id: params.episodeId ?? crypto.randomUUID(),
      session_id: params.session.session_id,
      user_id: params.userId,
      started_at: timestamp,
      updated_at: timestamp,
      status: 'active',
      symptoms: {
        reported: [params.firstMessage],
        extracted: [],
      },
      assessments: [],
      clarification_state: params.clarificationState,
      clarification_history: [],
      working_hypotheses: { alternatives: [] },
      unresolved_uncertainties: [],
      context_summary: params.firstMessage.slice(0, 120),
    };
    await this.save(episode);
    return episode;
  }

  private mapEpisode(row: Record<string, unknown>): Episode {
    return {
      episode_id: row.id as string,
      session_id: row.session_id as string,
      user_id: row.user_id as string,
      status: row.status as Episode['status'],
      started_at: row.started_at as string,
      updated_at: row.updated_at as string,
      symptoms: {
        reported: parseJson(row.symptoms_reported_json, []),
        extracted: parseJson(row.symptoms_extracted_json, []),
      },
      assessments: parseJson(row.assessments_json, []),
      clarification_state: parseJson<ClarificationState | undefined>(row.clarification_state_json, undefined),
      clarification_history: [],
      working_hypotheses: { alternatives: [] },
      unresolved_uncertainties: [],
      context_summary: row.context_summary as string,
    };
  }
}

export class TeamNotificationRepository {
  constructor(private db: D1Database) {}

  async createQueued(notification: TeamNotifyRequest & { notification_id: string; recipients: string[] }): Promise<TeamNotifyResponse> {
    const createdAt = nowIso();
    await this.db
      .prepare(`
        INSERT INTO team_notifications (
          id, assessment_id, patient_id, notification_type, message,
          status, recipients, created_at, sent_at, last_error, attempt_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        notification.notification_id,
        notification.assessment_id,
        notification.patient_id,
        notification.notification_type,
        notification.message || null,
        'queued',
        JSON.stringify(notification.recipients),
        createdAt,
        null,
        null,
        0
      )
      .run();

    return {
      notification_id: notification.notification_id,
      assessment_id: notification.assessment_id,
      created_at: createdAt,
      recipients: notification.recipients,
      status: 'queued',
    };
  }

  async listPending(limit = 20): Promise<OutboxNotificationRecord[]> {
    const result = await this.db
      .prepare(`
        SELECT * FROM team_notifications
        WHERE status IN ('queued', 'failed')
        ORDER BY created_at ASC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    return result.results.map((row) => this.mapNotification(row));
  }

  async markSent(notificationId: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE team_notifications
        SET status = 'sent', sent_at = ?, last_error = NULL, attempt_count = attempt_count + 1
        WHERE id = ?
      `)
      .bind(nowIso(), notificationId)
      .run();
  }

  async markFailed(notificationId: string, errorMessage: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE team_notifications
        SET status = 'failed', last_error = ?, attempt_count = attempt_count + 1
        WHERE id = ?
      `)
      .bind(errorMessage.slice(0, 500), notificationId)
      .run();
  }

  private mapNotification(row: Record<string, unknown>): OutboxNotificationRecord {
    return {
      notification_id: row.id as string,
      assessment_id: row.assessment_id as string,
      patient_id: row.patient_id as string,
      notification_type: row.notification_type as OutboxNotificationRecord['notification_type'],
      message: (row.message as string) || undefined,
      created_at: row.created_at as string,
      sent_at: (row.sent_at as string) || undefined,
      recipients: parseJson(row.recipients, []),
      status: row.status as OutboxNotificationRecord['status'],
      last_error: (row.last_error as string) || undefined,
      attempt_count: Number(row.attempt_count ?? 0),
    };
  }
}
