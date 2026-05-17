/**
 * 本地开发 API：会话状态 + 真实 assess 流水线（与 Workers handler 对齐）
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { Saba } from '../index.js';
import { runAssessPipeline } from '../services/assess-pipeline.js';
import { LlmNotConfiguredError } from '../lib/llm-config.js';
import { hasLlmApiKey } from '../lib/llm-config.js';
import { getConfig } from '../lib/env.js';
import type {
  AssessRequest,
  AssessmentDetail,
  AssessmentSummary,
  BehaviorEventRequest,
  HistoryQuery,
  PatientBaseline,
} from '../types/index.js';
import { createMemoryConversationBundle } from './memory-conversation-store.js';

const assessments = new Map<string, AssessmentDetail>();
const behaviorEvents = new Map<string, BehaviorEventRequest & { event_id: string; created_at: string }>();
const { service: stateService, baselineRepo } = createMemoryConversationBundle();

function json(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(body));
}

function error(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  json(res, status, { error: { code, message } });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function toDetail(
  result: Awaited<ReturnType<typeof runAssessPipeline>>,
  request: AssessRequest,
  assessmentId: string,
  createdAt: string,
): AssessmentDetail {
  return {
    ...result,
    assessment_id: assessmentId,
    user_id: request.user_id,
    created_at: createdAt,
    raw_input: request.input,
    structured_input: {
      symptoms: result.symptoms ?? [],
    },
    evidence: result.evidence ?? [],
    reasoning_chain:
      result.reasoning_chain ??
      (result.reasoning ? [result.reasoning] : []),
  };
}

function toSummary(detail: AssessmentDetail): AssessmentSummary {
  const label =
    detail.result?.label ??
    (detail.risk_level === 'high'
      ? '高风险'
      : detail.risk_level === 'medium'
        ? '中风险'
        : '低风险');
  const color =
    detail.result?.color ??
    (detail.risk_level === 'high'
      ? '#EF4444'
      : detail.risk_level === 'medium'
        ? '#F59E0B'
        : '#22C55E');

  return {
    assessment_id: detail.assessment_id!,
    risk_level: detail.risk_level,
    result_label: label,
    result_color: color,
    symptom_summary:
      detail.symptoms?.map(s => s.standard_term ?? s.name).join('、') ||
      detail.raw_input?.slice(0, 40) ||
      '—',
    immediate_action: detail.immediate_action,
    created_at: detail.created_at!,
    triggered_rules: detail.triggered_rules,
    rules_version: detail.metadata.rules_version,
  };
}

function shouldPersistAssessment(result: Awaited<ReturnType<typeof runAssessPipeline>>): boolean {
  return result.executive_summary?.status !== 'clarification_required';
}

async function handleAssess(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as AssessRequest;
  if (!body.user_id || !body.input?.trim()) {
    error(res, 400, 'VALIDATION_ERROR', 'Missing required fields');
    return;
  }

  try {
    const result = await runAssessPipeline({
      request: body,
      stateService,
    });

    const assessmentId = result.assessment_id ?? crypto.randomUUID();
    const createdAt = result.created_at ?? new Date().toISOString();
    const detail = toDetail(
      { ...result, assessment_id: assessmentId, created_at: createdAt },
      body,
      assessmentId,
      createdAt,
    );

    if (shouldPersistAssessment(result)) {
      assessments.set(assessmentId, detail);
    }

    json(res, 200, detail);
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      error(res, 503, 'AI_SERVICE_ERROR', err.message);
      return;
    }
    const message = err instanceof Error ? err.message : 'Assessment failed';
    console.error('[dev-api] assess failed:', err);
    error(res, 503, 'AI_SERVICE_ERROR', message);
  }
}

async function handleUpsertBaseline(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as Partial<PatientBaseline> & { user_id?: string };
  if (!body.user_id?.trim()) {
    error(res, 400, 'VALIDATION_ERROR', 'user_id is required');
    return;
  }
  const existing = await baselineRepo.findByUserId(body.user_id);
  const merged: PatientBaseline = {
    ...(existing ?? { user_id: body.user_id, updated_at: new Date().toISOString() }),
    ...body,
    user_id: body.user_id,
    updated_at: new Date().toISOString(),
  };
  const saved = await baselineRepo.upsert(merged);
  json(res, 200, saved);
}

async function handleGetBaseline(
  url: URL,
  res: ServerResponse,
): Promise<void> {
  const userId = url.searchParams.get('user_id') || '';
  if (!userId) {
    error(res, 400, 'VALIDATION_ERROR', 'user_id is required');
    return;
  }
  const baseline = await baselineRepo.findByUserId(userId);
  if (!baseline) {
    error(res, 404, 'NOT_FOUND', 'baseline not found');
    return;
  }
  json(res, 200, baseline);
}

async function handleBehaviorEvent(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as BehaviorEventRequest;
  if (!body.event || !body.user_id) {
    error(res, 400, 'VALIDATION_ERROR', 'Missing required fields');
    return;
  }

  const event_id = crypto.randomUUID();
  const created_at = new Date().toISOString();
  behaviorEvents.set(event_id, { ...body, event_id, created_at });
  json(res, 201, { event_id, created_at });
}

function handleGetAssessment(
  id: string,
  res: ServerResponse,
): void {
  const detail = assessments.get(id);
  if (!detail) {
    error(res, 404, 'NOT_FOUND', 'Assessment not found');
    return;
  }
  json(res, 200, detail);
}

function handleGetAssessments(
  url: URL,
  res: ServerResponse,
): void {
  const query: HistoryQuery = {
    user_id: url.searchParams.get('user_id') || '',
    page: parseInt(url.searchParams.get('page') || '1', 10),
    limit: Math.min(parseInt(url.searchParams.get('limit') || '20', 10), 100),
    risk_level: url.searchParams.get('risk_level') as HistoryQuery['risk_level'],
  };

  if (!query.user_id) {
    error(res, 400, 'VALIDATION_ERROR', 'user_id is required');
    return;
  }

  const all = [...assessments.values()]
    .filter(a => a.user_id === query.user_id)
    .sort(
      (a, b) =>
        new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(),
    );

  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  const start = (page - 1) * limit;
  const slice = all.slice(start, start + limit);
  const total = all.length;

  json(res, 200, {
    assessments: slice.map(toSummary),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
}

export function createSabaDevApiMiddleware(): Connect.NextHandleFunction {
  const config = getConfig();
  if (!hasLlmApiKey(config)) {
    console.warn(
      '[dev-api] 未检测到 LLM API Key（DASHSCOPE_API_KEY / ANTHROPIC_API_KEY）。评估接口将返回 503，请在 .env 中配置后重启。',
    );
  } else {
    console.info(`[dev-api] LLM 已配置，provider=${config.llm_provider}`);
  }

  return async (req, res, next) => {
    if (!req.url) return next();

    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/v1')) {
      res.statusCode = 204;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.end();
      return;
    }

    if (!url.pathname.startsWith('/api/v1')) {
      return next();
    }

    try {
      if (url.pathname === '/api/v1/health' && req.method === 'GET') {
        json(res, 200, {
          status: 'ok',
          version: 'dev',
          timestamp: new Date().toISOString(),
          llm_configured: hasLlmApiKey(getConfig()),
          llm_provider: config.llm_provider,
        });
        return;
      }

      if (url.pathname === '/api/v1/assess' && req.method === 'POST') {
        await handleAssess(req, res);
        return;
      }

      if (url.pathname === '/api/v1/events' && req.method === 'POST') {
        await handleBehaviorEvent(req, res);
        return;
      }

      if (url.pathname === '/api/v1/baseline' && req.method === 'POST') {
        await handleUpsertBaseline(req, res);
        return;
      }

      if (url.pathname === '/api/v1/baseline' && req.method === 'GET') {
        await handleGetBaseline(url, res);
        return;
      }

      const detailMatch = url.pathname.match(/^\/api\/v1\/assessments\/([^/]+)$/);
      if (detailMatch && req.method === 'GET') {
        handleGetAssessment(detailMatch[1]!, res);
        return;
      }

      if (url.pathname === '/api/v1/assessments' && req.method === 'GET') {
        handleGetAssessments(url, res);
        return;
      }

      error(res, 404, 'NOT_FOUND', 'Endpoint not found');
    } catch (err) {
      console.error('[dev-api]', err);
      error(
        res,
        500,
        'INTERNAL_ERROR',
        err instanceof Error ? err.message : 'Internal server error',
      );
    }
  };
}
