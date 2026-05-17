/**
 * SABA API Handler
 * Cloudflare Workers 入口
 */

import { Saba } from '../index.js';
import { AssessmentRepository, BehaviorEventRepository, FeedbackRepository, TraceRepository } from '../storage/repository.js';
import { TeamNotificationRepository } from '../storage/conversation-repository.js';
import { PatientBaselineRepository } from '../storage/patient-baseline-repository.js';
import { ConversationStateService } from '../services/conversation-state.js';
import { runAssessPipeline } from '../services/assess-pipeline.js';
import { LlmNotConfiguredError } from '../lib/llm-config.js';
import { createAssessStreamSink, encodeSseEvent } from '../lib/assess-stream.js';
import { createTraceContext, createChildTraceContext } from '../lib/trace.js';
import { getConfig } from '../lib/env.js';
import {
  AssessRequest,
  FeedbackRequest,
  BehaviorEventRequest,
  TeamNotifyRequest,
  HistoryQuery,
  ApiError,
  PatientBaseline,
} from '../types/index.js';

// 环境变量类型声明
declare const ENV: {
  ASSESSMENTS_KV: KVNamespace;
  D1_DATABASE: D1Database;
};

export interface Env {
  ASSESSMENTS_KV: KVNamespace;
  D1_DATABASE: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS 预检请求
    if (method === 'OPTIONS') {
      return handleCORS();
    }

    try {
      // 路由匹配
      if (path === '/api/v1/assess/stream' && method === 'POST') {
        return handleAssessStream(request, env);
      }

      if (path === '/api/v1/assess' && method === 'POST') {
        return handleAssess(request, env);
      }

      if (path.match(/^\/api\/v1\/assessments\/([^/]+)$/) && method === 'GET') {
        const id = path.match(/^\/api\/v1\/assessments\/([^/]+)$/)?.[1];
        return handleGetAssessment(id!, env, request);
      }

      if (path === '/api/v1/assessments' && method === 'GET') {
        return handleGetAssessments(request, env);
      }

      if (path === '/api/v1/session' && method === 'GET') {
        return handleGetActiveSession(request, env);
      }

      if (path.match(/^\/api\/v1\/sessions\/([^/]+)$/) && method === 'GET') {
        const id = path.match(/^\/api\/v1\/sessions\/([^/]+)$/)?.[1];
        return handleGetSession(id!, request, env);
      }

      if (path.match(/^\/api\/v1\/sessions\/([^/]+)\/complete$/) && method === 'POST') {
        const id = path.match(/^\/api\/v1\/sessions\/([^/]+)\/complete$/)?.[1];
        return handleCompleteSession(id!, request, env);
      }

      if (path.match(/^\/api\/v1\/episodes\/([^/]+)$/) && method === 'GET') {
        const id = path.match(/^\/api\/v1\/episodes\/([^/]+)$/)?.[1];
        return handleGetEpisode(id!, request, env);
      }

      if (path.match(/^\/api\/v1\/episodes\/([^/]+)\/resolve$/) && method === 'POST') {
        const id = path.match(/^\/api\/v1\/episodes\/([^/]+)\/resolve$/)?.[1];
        return handleResolveEpisode(id!, request, env);
      }

      if (path === '/api/v1/baseline' && method === 'POST') {
        return handleUpsertBaseline(request, env);
      }

      if (path === '/api/v1/baseline' && method === 'GET') {
        return handleGetBaseline(request, env);
      }

      if (path === '/api/v1/feedback' && method === 'POST') {
        return handleFeedback(request, env);
      }

      if (path === '/api/v1/events' && method === 'POST') {
        return handleBehaviorEvent(request, env);
      }

      if (path === '/api/v1/team/notify' && method === 'POST') {
        return handleTeamNotify(request, env);
      }

      if (path === '/api/v1/team/notify/dispatch' && method === 'POST') {
        return handleTeamNotifyDispatch(request, env);
      }

      if (path === '/api/v1/health' && method === 'GET') {
        return handleHealth();
      }

      if (path.match(/^\/api\/v1\/debug\/trace\/([^/]+)$/) && method === 'GET') {
        const id = path.match(/^\/api\/v1\/debug\/trace\/([^/]+)$/)?.[1];
        return handleGetTraceChain(id!, env);
      }

      if (path === '/api/v1/rules/versions' && method === 'GET') {
        return handleRulesVersions();
      }

      // 404
      return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
    } catch (error) {
      console.error('Request error:', error);
      return errorResponse(
        'INTERNAL_ERROR',
        error instanceof Error ? error.message : 'Internal server error',
        500
      );
    }
  },
};

function readTraceHeaders(request: Request, flow: 'assessment' | 'baseline' | 'history' | 'team_notify' | 'behavior_event') {
  const traceId = request.headers.get('X-Trace-Id');
  const spanId = request.headers.get('X-Span-Id');
  const parentSpanId = request.headers.get('X-Parent-Span-Id') ?? undefined;

  if (!traceId || !spanId) {
    return createTraceContext(flow);
  }

  return {
    trace_id: traceId,
    span_id: spanId,
    parent_span_id: parentSpanId,
    flow,
    started_at: new Date().toISOString(),
  };
}

function shouldPersistAssessment(result: Awaited<ReturnType<typeof runAssessPipeline>>): boolean {
  return result.executive_summary?.status !== 'clarification_required';
}

/**
 * 处理评估请求
 */
async function handleAssess(request: Request, env: Env): Promise<Response> {
  const repo = new AssessmentRepository(env.D1_DATABASE);
  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);

  const trace = readTraceHeaders(request, 'assessment');

  // 解析请求体
  const body = await request.json() as AssessRequest;

  // 验证必填字段
  if (!body.user_id || !body.input) {
    return errorResponse('VALIDATION_ERROR', 'Missing required fields', 400, [
      { field: !body.user_id ? 'user_id' : 'input', message: 'Required field' },
    ]);
  }

  let persistedResult: Awaited<ReturnType<typeof runAssessPipeline>>;
  try {
    persistedResult = await runAssessPipeline({
      request: { ...body, trace },
      stateService,
    });
  } catch (error) {
    if (error instanceof LlmNotConfiguredError) {
      return errorResponse('AI_SERVICE_ERROR', error.message, 503);
    }
    throw error;
  }

  const created_at = persistedResult.created_at ?? new Date().toISOString();
  const assessment_id = persistedResult.assessment_id ?? crypto.randomUUID();
  const detail = {
    ...persistedResult,
    assessment_id,
    user_id: body.user_id,
    created_at,
    raw_input: body.input,
    structured_input: {
      symptoms: persistedResult.symptoms ?? [],
    },
    evidence: persistedResult.evidence ?? [],
    trace: persistedResult.trace ?? createChildTraceContext(trace, 'assessment'),
  };

  if (shouldPersistAssessment(persistedResult)) {
    await env.ASSESSMENTS_KV.put(
      `assessment:${assessment_id}`,
      JSON.stringify({ ...detail, assessment_id, created_at }),
      { expirationTtl: 60 * 60 * 24 * 30 },
    );
    await repo.create(detail as any);
  }

  return jsonResponse({ ...detail, assessment_id, created_at });
}

/**
 * 流式评估（SSE）
 */
async function handleAssessStream(request: Request, env: Env): Promise<Response> {
  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);
  const repo = new AssessmentRepository(env.D1_DATABASE);
  const trace = readTraceHeaders(request, 'assessment');
  const body = await request.json() as AssessRequest;

  if (!body.user_id || !body.input) {
    return errorResponse('VALIDATION_ERROR', 'Missing required fields', 400, [
      { field: !body.user_id ? 'user_id' : 'input', message: 'Required field' },
    ]);
  }

  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  const sink = createAssessStreamSink((event) => {
    void writer.write(encoder.encode(encodeSseEvent(event)));
  });

  void (async () => {
    try {
      const persistedResult = await runAssessPipeline({
        request: { ...body, trace },
        stateService,
        stream: sink,
      });

      const created_at = persistedResult.created_at ?? new Date().toISOString();
      const assessment_id = persistedResult.assessment_id ?? crypto.randomUUID();
      const detail = {
        ...persistedResult,
        assessment_id,
        user_id: body.user_id,
        created_at,
        raw_input: body.input,
        structured_input: { symptoms: persistedResult.symptoms ?? [] },
        evidence: persistedResult.evidence ?? [],
        trace: persistedResult.trace ?? createChildTraceContext(trace, 'assessment'),
      };

      if (shouldPersistAssessment(persistedResult)) {
        await env.ASSESSMENTS_KV.put(
          `assessment:${assessment_id}`,
          JSON.stringify({ ...detail, assessment_id, created_at }),
          { expirationTtl: 60 * 60 * 24 * 30 },
        );
        await repo.create(detail as Parameters<AssessmentRepository['create']>[0]);
      }
    } catch (error) {
      const message =
        error instanceof LlmNotConfiguredError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Internal server error';
      await writer.write(
        encoder.encode(encodeSseEvent({ type: 'error', message })),
      );
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * 获取评估详情
 */
async function handleGetAssessment(id: string, env: Env, request: Request): Promise<Response> {
  const trace = readTraceHeaders(request, 'history');
  const repo = new AssessmentRepository(env.D1_DATABASE);
  const kvData = await env.ASSESSMENTS_KV.get(`assessment:${id}`);

  if (kvData) {
    const detail = JSON.parse(kvData) as Record<string, unknown>;
    return jsonResponse({ ...detail, trace: detail.trace ?? createChildTraceContext(trace, 'history') });
  }

  const assessment = await repo.findById(id);
  if (!assessment) {
    return errorResponse('NOT_FOUND', 'Assessment not found', 404);
  }

  return jsonResponse({ ...assessment, trace: assessment.trace ?? createChildTraceContext(trace, 'history') });
}

/**
 * 获取评估历史列表
 */
async function handleGetAssessments(request: Request, env: Env): Promise<Response> {
  const trace = readTraceHeaders(request, 'history');
  const repo = new AssessmentRepository(env.D1_DATABASE);
  const url = new URL(request.url);
  const query: HistoryQuery = {
    user_id: url.searchParams.get('user_id') || '',
    page: parseInt(url.searchParams.get('page') || '1'),
    limit: Math.min(parseInt(url.searchParams.get('limit') || '20'), 100),
    risk_level: url.searchParams.get('risk_level') as HistoryQuery['risk_level'],
    start_date: url.searchParams.get('start_date') || undefined,
    end_date: url.searchParams.get('end_date') || undefined,
  };

  if (!query.user_id) {
    return errorResponse('VALIDATION_ERROR', 'user_id is required', 400);
  }

  const history = await repo.findByUserId(query);
  return jsonResponse({
    ...history,
    assessments: history.assessments.map((assessment) => ({
      ...assessment,
      trace: createChildTraceContext(trace, 'history'),
    })),
  });
}

/**
 * 按 trace_id 聚合评估、行为事件与基线（开发排障）
 */
async function handleGetTraceChain(traceId: string, env: Env): Promise<Response> {
  if (getConfig().app_env !== 'development') {
    return errorResponse('NOT_FOUND', 'Endpoint not found', 404);
  }

  const repo = new TraceRepository(env.D1_DATABASE);
  const chain = await repo.getTraceChain(traceId);
  if (chain.behavior_events.length === 0 && chain.assessments.length === 0 && chain.baselines.length === 0) {
    return errorResponse('NOT_FOUND', `No records for trace_id ${traceId}`, 404);
  }
  return jsonResponse(chain);
}

/**
 * 获取当前活跃会话
 */
async function handleGetActiveSession(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id') || '';
  if (!userId) {
    return errorResponse('VALIDATION_ERROR', 'user_id is required', 400);
  }

  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);
  const ctx = await stateService.getActiveSession(userId);
  if (!ctx) {
    return errorResponse('NOT_FOUND', 'No active session', 404);
  }

  return jsonResponse(ctx);
}

/**
 * 获取指定 session
 */
async function handleGetSession(id: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id') || undefined;
  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);
  const ctx = await stateService.getSessionById(id, userId);
  if (!ctx) {
    return errorResponse('NOT_FOUND', 'Session not found', 404);
  }
  return jsonResponse(ctx);
}

/**
 * 关闭 session
 */
async function handleCompleteSession(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const userId = (body as { user_id?: string }).user_id;
  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);
  const result = await stateService.completeSession(id, userId);
  if (!result) {
    return errorResponse('NOT_FOUND', 'Session not found', 404);
  }
  return jsonResponse(result);
}

/**
 * 获取指定 episode
 */
async function handleGetEpisode(id: string, request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id') || undefined;
  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);
  const ctx = await stateService.getEpisodeById(id, userId);
  if (!ctx) {
    return errorResponse('NOT_FOUND', 'Episode not found', 404);
  }
  return jsonResponse(ctx);
}

/**
 * 关闭 episode
 */
async function handleResolveEpisode(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json().catch(() => ({}));
  const userId = (body as { user_id?: string }).user_id;
  const stateService = ConversationStateService.createFromDb(env.D1_DATABASE);
  const ctx = await stateService.resolveEpisode(id, userId);
  if (!ctx) {
    return errorResponse('NOT_FOUND', 'Episode not found', 404);
  }
  return jsonResponse(ctx);
}

/**
 * 写入/更新 Patient Baseline
 */
async function handleUpsertBaseline(request: Request, env: Env): Promise<Response> {
  const trace = readTraceHeaders(request, 'baseline');
  const body = (await request.json().catch(() => ({}))) as Partial<PatientBaseline> & { user_id?: string };
  if (!body.user_id?.trim()) {
    return errorResponse('VALIDATION_ERROR', 'user_id is required', 400);
  }
  const repo = new PatientBaselineRepository(env.D1_DATABASE);
  const existing = await repo.findByUserId(body.user_id);
  const merged: PatientBaseline = {
    ...(existing ?? { user_id: body.user_id, updated_at: new Date().toISOString() }),
    ...body,
    user_id: body.user_id,
    updated_at: new Date().toISOString(),
  };
  const saved = await repo.upsert(merged);
  return jsonResponse({ ...saved, trace: createChildTraceContext(trace, 'baseline') });
}

/**
 * 读取 Patient Baseline
 */
async function handleGetBaseline(request: Request, env: Env): Promise<Response> {
  const trace = readTraceHeaders(request, 'baseline');
  const url = new URL(request.url);
  const userId = url.searchParams.get('user_id') || '';
  if (!userId) {
    return errorResponse('VALIDATION_ERROR', 'user_id is required', 400);
  }
  const repo = new PatientBaselineRepository(env.D1_DATABASE);
  const baseline = await repo.findByUserId(userId);
  if (!baseline) {
    return errorResponse('NOT_FOUND', 'baseline not found', 404);
  }
  return jsonResponse({ ...baseline, trace: createChildTraceContext(trace, 'baseline') });
}

/**
 * 处理反馈
 */
async function handleFeedback(request: Request, env: Env): Promise<Response> {
  const repo = new FeedbackRepository(env.D1_DATABASE);
  const body = await request.json() as FeedbackRequest;

  if (!body.assessment_id || !body.feedback_type) {
    return errorResponse('VALIDATION_ERROR', 'Missing required fields', 400);
  }

  const feedback_id = crypto.randomUUID();
  await repo.create({ ...body, feedback_id });

  return jsonResponse(
    {
      feedback_id,
      created_at: new Date().toISOString(),
    },
    201
  );
}

async function handleBehaviorEvent(request: Request, env: Env): Promise<Response> {
  const trace = readTraceHeaders(request, 'behavior_event');
  const repo = new BehaviorEventRepository(env.D1_DATABASE);
  const body = await request.json() as BehaviorEventRequest;

  if (!body.event || !body.user_id) {
    return errorResponse('VALIDATION_ERROR', 'Missing required fields', 400);
  }

  const event_id = crypto.randomUUID();
  await repo.create({ ...body, trace, event_id });

  return jsonResponse(
    {
      event_id,
      created_at: new Date().toISOString(),
      trace: createChildTraceContext(trace, 'behavior_event'),
    },
    201
  );
}

/**
 * 处理团队通知
 */
async function handleTeamNotify(request: Request, env: Env): Promise<Response> {
  const trace = readTraceHeaders(request, 'team_notify');
  const repo = new TeamNotificationRepository(env.D1_DATABASE);
  const body = await request.json() as TeamNotifyRequest;

  if (!body.assessment_id || !body.patient_id || !body.notification_type) {
    return errorResponse('VALIDATION_ERROR', 'Missing required fields', 400);
  }

  const notification_id = crypto.randomUUID();
  const recipients = ['team_oncall_queue'];
  const queued = await repo.createQueued({
    ...body,
    trace,
    notification_id,
    recipients,
  });

  return jsonResponse(
    {
      notification_id: queued.notification_id,
      assessment_id: queued.assessment_id,
      created_at: queued.created_at,
      sent_at: queued.sent_at,
      recipients: queued.recipients,
      status: queued.status,
      trace: createChildTraceContext(trace, 'team_notify'),
    },
    201
  );
}

async function handleTeamNotifyDispatch(request: Request, env: Env): Promise<Response> {
  const repo = new TeamNotificationRepository(env.D1_DATABASE);
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const dryRun = url.searchParams.get('dry_run') === 'true';
  const pending = await repo.listPending(limit);

  const results: Array<{ notification_id: string; status: 'sent' | 'failed' | 'queued'; detail: string }> = [];
  for (const item of pending) {
    try {
      if (dryRun) {
        results.push({
          notification_id: item.notification_id,
          status: 'queued',
          detail: 'dry_run: skipped sending',
        });
        continue;
      }

      await repo.markSent(item.notification_id);
      results.push({
        notification_id: item.notification_id,
        status: 'sent',
        detail: `delivered to ${item.recipients.join(', ') || 'team_oncall_queue'}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown dispatch error';
      await repo.markFailed(item.notification_id, message);
      results.push({
        notification_id: item.notification_id,
        status: 'failed',
        detail: message,
      });
    }
  }

  return jsonResponse({
    dispatched: results.length,
    dry_run: dryRun,
    results,
  });
}

/**
 * 健康检查
 */
function handleHealth(): Response {
  return jsonResponse({
    status: 'healthy',
    version: 'v1.0.0',
    timestamp: new Date().toISOString(),
  });
}

/**
 * 获取规则版本
 */
function handleRulesVersions(): Response {
  return jsonResponse({
    current_version: 'v1.0.0',
    updated_at: '2026-01-15T10:00:00Z',
    rules_summary: {
      high_risk: 6,
      medium_risk: 6,
      low_risk: 5,
    },
  });
}

/**
 * CORS 处理
 */
function handleCORS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}


/**
 * JSON 响应
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

/**
 * 错误响应
 */
function errorResponse(
  code: ApiError['error']['code'],
  message: string,
  status: number,
  details?: ApiError['error']['details']
): Response {
  return new Response(
    JSON.stringify({ error: { code, message, details } }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}
