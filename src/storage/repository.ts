/**
 * SABA 数据库仓储层
 * 封装 D1 数据库操作
 */

import type { D1Database } from '@cloudflare/workers-types';
import {
  AssessmentDetail,
  BehaviorEventRequest,
  FeedbackRequest,
  HistoryQuery,
  HistoryResponse,
} from '../types/index.js';

export class AssessmentRepository {
  constructor(private db: D1Database) {}

  /**
   * 创建评估记录
   */
  async create(assessment: AssessmentDetail): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO assessments (
          id, user_id, raw_input, structured_input, risk_level, risk_score,
          immediate_action, reasoning, evidence, triggered_rules,
          team_contact_required, follow_up, warning_signs,
          metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        assessment.assessment_id,
        assessment.raw_input?.split('user_id:')[1]?.split(',')[0] || 'unknown',
        assessment.raw_input || '',
        JSON.stringify(assessment.structured_input),
        assessment.risk_level,
        assessment.risk_score,
        assessment.immediate_action,
        assessment.reasoning,
        JSON.stringify(assessment.evidence),
        JSON.stringify(assessment.triggered_rules),
        assessment.team_contact_required ? 1 : 0,
        assessment.follow_up || null,
        JSON.stringify(assessment.warning_signs),
        JSON.stringify(assessment.metadata),
        assessment.created_at
      )
      .run();
  }

  /**
   * 获取评估详情
   */
  async findById(id: string): Promise<AssessmentDetail | null> {
    const result = await this.db
      .prepare('SELECT * FROM assessments WHERE id = ?')
      .bind(id)
      .first();

    if (!result) return null;
    return this.mapToAssessment(result);
  }

  /**
   * 获取评估历史列表
   */
  async findByUserId(query: HistoryQuery): Promise<HistoryResponse> {
    let sql = 'SELECT * FROM assessments WHERE 1=1';
    const bindings: (string | number)[] = [];

    if (query.user_id) {
      sql += ' AND user_id = ?';
      bindings.push(query.user_id);
    }

    if (query.risk_level) {
      sql += ' AND risk_level = ?';
      bindings.push(query.risk_level);
    }

    if (query.start_date) {
      sql += ' AND created_at >= ?';
      bindings.push(query.start_date);
    }

    if (query.end_date) {
      sql += ' AND created_at <= ?';
      bindings.push(query.end_date);
    }

    // 统计总数
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as count');
    const countResult = await this.db.prepare(countSql).bind(...bindings).first();
    const total = (countResult?.count as number) || 0;

    // 分页
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    const offset = ((query.page || 1) - 1) * (query.limit || 20);
    bindings.push(query.limit || 20, offset);

    const results = await this.db.prepare(sql).bind(...bindings).all();

    return {
      assessments: results.results.map(r => this.mapToSummary(r)),
      pagination: {
        page: query.page || 1,
        limit: query.limit || 20,
        total,
        total_pages: Math.ceil(total / (query.limit || 20)),
      },
    };
  }

  /**
   * 映射到 AssessmentSummary
   */
  private mapToSummary(row: Record<string, unknown>): HistoryResponse['assessments'][0] {
    const riskColors = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' };
    const riskLabels = { high: '高风险', medium: '中风险', low: '低风险' };
    const riskLevel = row.risk_level as string;

    return {
      assessment_id: row.id as string,
      risk_level: riskLevel as 'high' | 'medium' | 'low',
      result_label: riskLabels[riskLevel as keyof typeof riskLabels] || '未知',
      result_color: riskColors[riskLevel as keyof typeof riskColors] || '#999999',
      symptom_summary: this.extractSymptomSummary(row.structured_input as string),
      immediate_action: row.immediate_action as string,
      created_at: row.created_at as string,
      triggered_rules: JSON.parse(row.triggered_rules as string || '[]'),
      rules_version: this.extractRulesVersion(row.metadata as string),
    };
  }

  /**
   * 映射到 AssessmentDetail
   */
  private mapToAssessment(row: Record<string, unknown>): AssessmentDetail {
    return {
      assessment_id: row.id as string,
      risk_level: row.risk_level as 'high' | 'medium' | 'low',
      risk_score: row.risk_score as number,
      result: {
        level: row.risk_level as string,
        label: row.risk_level === 'high' ? '高风险' : row.risk_level === 'medium' ? '中风险' : '低风险',
        color: row.risk_level === 'high' ? '#EF4444' : row.risk_level === 'medium' ? '#F59E0B' : '#22C55E',
      },
      immediate_action: row.immediate_action as string,
      reasoning: row.reasoning as string,
      triggered_rules: JSON.parse(row.triggered_rules as string || '[]'),
      team_contact_required: (row.team_contact_required as number) === 1,
      follow_up: row.follow_up as string | undefined,
      warning_signs: JSON.parse(row.warning_signs as string || '[]'),
      metadata: JSON.parse(row.metadata as string || '{}'),
      created_at: row.created_at as string,
      raw_input: row.raw_input as string,
      structured_input: row.structured_input ? JSON.parse(row.structured_input as string) : undefined,
      evidence: JSON.parse(row.evidence as string || '[]'),
      reasoning_chain: [],
    };
  }

  private extractRulesVersion(metadata: string): string {
    try {
      const parsed = JSON.parse(metadata) as Partial<AssessmentDetail['metadata']>;
      if (parsed.rules_version) {
        return parsed.rules_version;
      }
    } catch {
      return 'unknown';
    }
    return 'unknown';
  }

  /**
   * 提取症状摘要
   */
  private extractSymptomSummary(structuredInput: string): string {
    try {
      const data = JSON.parse(structuredInput);
      if (data?.symptoms) {
        return data.symptoms.map((s: { name: string }) => s.name).join(', ');
      }
    } catch {
      return '';
    }
    return '';
  }
}

export class BehaviorEventRepository {
  constructor(private db: D1Database) {}

  async create(event: BehaviorEventRequest & { event_id: string }): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO assessment_events (
          id, event_name, user_id, assessment_id, session_id, metadata, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        event.event_id,
        event.event,
        event.user_id,
        event.assessment_id ?? null,
        event.session_id ?? null,
        JSON.stringify(event.metadata ?? {}),
        new Date().toISOString()
      )
      .run();
  }
}

export class FeedbackRepository {
  constructor(private db: D1Database) {}

  /**
   * 创建反馈
   */
  async create(feedback: FeedbackRequest & { feedback_id: string }): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO feedback (
          id, assessment_id, feedback_type, is_helpful, rating,
          user_acted, user_sought_medical_help, team_verdict, team_comment, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        feedback.feedback_id,
        feedback.assessment_id,
        feedback.feedback_type,
        feedback.is_helpful !== undefined ? (feedback.is_helpful ? 1 : 0) : null,
        feedback.rating || null,
        feedback.user_acted !== undefined ? (feedback.user_acted ? 1 : 0) : null,
        feedback.user_sought_medical_help !== undefined ? (feedback.user_sought_medical_help ? 1 : 0) : null,
        feedback.team_verdict || null,
        feedback.team_comment || null,
        new Date().toISOString()
      )
      .run();
  }
}
