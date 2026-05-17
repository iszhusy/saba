/**
 * SABA API 客户端
 * 前端调用后端 API 的封装
 */

import type {
  AssessRequest,
  AssessResponse,
  AssessStreamEvent,
  AssessmentDetail,
  HistoryQuery,
  HistoryResponse,
  FeedbackRequest,
  TeamNotifyRequest,
  TeamNotifyResponse,
  BehaviorEventRequest,
  BehaviorEventResponse,
  TraceContext,
} from './types/index';

const API_BASE = '/api/v1';

class SabaClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private createTraceHeaders(trace?: TraceContext): HeadersInit {
    if (!trace) {
      return { 'Content-Type': 'application/json' };
    }

    return {
      'Content-Type': 'application/json',
      'X-Trace-Id': trace.trace_id,
      'X-Span-Id': trace.span_id,
      ...(trace.parent_span_id ? { 'X-Parent-Span-Id': trace.parent_span_id } : {}),
      'X-Trace-Flow': trace.flow,
    };
  }

  /**
   * 提交评估
   */
  async assess(request: AssessRequest): Promise<AssessResponse> {
    const response = await fetch(`${this.baseUrl}/assess`, {
      method: 'POST',
      headers: this.createTraceHeaders(request.trace),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json() as {
        error?: { code?: string; message?: string };
      };
      const message = error.error?.message || 'Assessment failed';
      if (error.error?.code === 'AI_SERVICE_ERROR') {
        throw new Error(message);
      }
      throw new Error(message);
    }

    return response.json() as Promise<AssessResponse>;
  }

  /**
   * 流式评估（SSE）
   */
  async assessStream(
    request: AssessRequest,
    onEvent: (event: AssessStreamEvent) => void,
  ): Promise<AssessResponse> {
    const response = await fetch(`${this.baseUrl}/assess/stream`, {
      method: 'POST',
      headers: this.createTraceHeaders(request.trace),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json() as {
        error?: { code?: string; message?: string };
      };
      const message = error.error?.message || 'Assessment stream failed';
      throw new Error(message);
    }

    if (!response.body) {
      throw new Error('Assessment stream returned empty body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: AssessResponse | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data:')) continue;

        const payload = line.replace(/^data:\s*/, '');
        if (!payload) continue;

        const event = JSON.parse(payload) as AssessStreamEvent;
        onEvent(event);
        if (event.type === 'done') {
          finalResult = event.result;
        }
        if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }

    if (!finalResult) {
      throw new Error('Assessment stream ended without a result');
    }

    return finalResult;
  }

  /**
   * 获取评估详情
   */
  async getAssessment(id: string, trace?: TraceContext): Promise<AssessmentDetail> {
    const response = await fetch(`${this.baseUrl}/assessments/${id}`, {
      headers: this.createTraceHeaders(trace),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message || 'Failed to get assessment');
    }

    return response.json() as Promise<AssessmentDetail>;
  }

  /**
   * 获取评估历史
   */
  async getHistory(query: HistoryQuery, trace?: TraceContext): Promise<HistoryResponse> {
    const params = new URLSearchParams();
    if (query.user_id) params.append('user_id', query.user_id);
    if (query.page) params.append('page', query.page.toString());
    if (query.limit) params.append('limit', query.limit.toString());
    if (query.risk_level) params.append('risk_level', query.risk_level);

    const response = await fetch(`${this.baseUrl}/assessments?${params.toString()}`, {
      headers: this.createTraceHeaders(trace),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message || 'Failed to get history');
    }

    return response.json() as Promise<HistoryResponse>;
  }

  /**
   * 提交反馈
   */
  async submitFeedback(feedback: FeedbackRequest): Promise<{ feedback_id: string; created_at: string }> {
    const response = await fetch(`${this.baseUrl}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feedback),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message || 'Failed to submit feedback');
    }

    return response.json() as Promise<{ feedback_id: string; created_at: string }>;
  }

  /**
   * 发送团队通知
   */
  async notifyTeam(request: TeamNotifyRequest): Promise<TeamNotifyResponse> {
    const response = await fetch(`${this.baseUrl}/team/notify`, {
      method: 'POST',
      headers: this.createTraceHeaders(request.trace),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message || 'Failed to notify team');
    }

    return response.json() as Promise<TeamNotifyResponse>;
  }

  /**
   * 上报行为事件
   */
  async trackBehaviorEvent(event: BehaviorEventRequest): Promise<BehaviorEventResponse> {
    const response = await fetch(`${this.baseUrl}/events`, {
      method: 'POST',
      headers: this.createTraceHeaders(event.trace),
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      const error = await response.json() as { error?: { message?: string } };
      throw new Error(error.error?.message || 'Failed to track behavior event');
    }

    return response.json() as Promise<BehaviorEventResponse>;
  }

  /**
   * 健康检查
   */
  async health(): Promise<{ status: string; version: string; timestamp: string }> {
    const response = await fetch(`${this.baseUrl}/health`);

    if (!response.ok) {
      throw new Error('Health check failed');
    }

    return response.json() as Promise<{ status: string; version: string; timestamp: string }>;
  }
}

// 导出单例
export const sabaClient = new SabaClient();

// 导出类
export { SabaClient };
