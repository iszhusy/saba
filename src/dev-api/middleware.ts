/**
 * 本地开发 API：会话状态 + 真实 assess 流水线（与 Workers handler 对齐）
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect } from 'vite';
import { Saba } from '../index.js';
import { runAssessPipeline } from '../services/assess-pipeline.js';
import { createAssessStreamSink, encodeSseEvent } from '../lib/assess-stream.js';
import { LlmNotConfiguredError } from '../lib/llm-config.js';
import { hasLlmApiKey } from '../lib/llm-config.js';
import { getConfig } from '../lib/env.js';
import type {
  AssessRequest,
  AssessStreamEvent,
  AssessmentDetail,
  BehaviorEventRequest,
  HistoryQuery,
  PatientBaseline,
} from '../types/index.js';
import { resolveDevStorage, type DevStorage } from './dev-storage.js';

let devStorage: DevStorage | null = null;

async function storage(): Promise<DevStorage> {
  if (!devStorage) {
    devStorage = await resolveDevStorage();
  }
  return devStorage;
}

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

function shouldPersistAssessment(result: Awaited<ReturnType<typeof runAssessPipeline>>): boolean {
  return result.executive_summary?.status !== 'clarification_required';
}

async function collectDevTraceChain(traceId: string): Promise<import('../types/index.js').TraceChainSnapshot> {
  return (await storage()).getTraceChain(traceId);
}

function writeSse(res: ServerResponse, event: AssessStreamEvent): void {
  res.write(encodeSseEvent(event));
}

async function handleAssessStream(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = JSON.parse(await readBody(req)) as AssessRequest;
  if (!body.user_id || !body.input?.trim()) {
    error(res, 400, 'VALIDATION_ERROR', 'Missing required fields');
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const sink = createAssessStreamSink((event) => writeSse(res, event));

  try {
    const store = await storage();
    const result = await runAssessPipeline({
      request: body,
      stateService: store.stateService,
      stream: sink,
    });

    if (shouldPersistAssessment(result)) {
      const assessmentId = result.assessment_id ?? crypto.randomUUID();
      const createdAt = result.created_at ?? new Date().toISOString();
      const detail = toDetail(
        { ...result, assessment_id: assessmentId, created_at: createdAt },
        body,
        assessmentId,
        createdAt,
      );
      await store.saveAssessment(detail);
    }
  } catch (err) {
    if (err instanceof LlmNotConfiguredError) {
      writeSse(res, { type: 'error', message: err.message });
    } else {
      const message = err instanceof Error ? err.message : 'Assessment failed';
      console.error('[dev-api] assess stream failed:', err);
      writeSse(res, { type: 'error', message });
    }
  }

  res.end();
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
    const store = await storage();
    const result = await runAssessPipeline({
      request: body,
      stateService: store.stateService,
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
      await store.saveAssessment(detail);
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
  const store = await storage();
  const existing = await store.baselineRepo.findByUserId(body.user_id);
  const merged: PatientBaseline = {
    ...(existing ?? { user_id: body.user_id, updated_at: new Date().toISOString() }),
    ...body,
    user_id: body.user_id,
    updated_at: new Date().toISOString(),
  };
  const saved = await store.baselineRepo.upsert(merged);
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
  const baseline = await (await storage()).baselineRepo.findByUserId(userId);
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

  const saved = await (await storage()).saveBehaviorEvent(body);
  json(res, 201, saved);
}

async function handleGetAssessment(
  id: string,
  res: ServerResponse,
): Promise<void> {
  const detail = await (await storage()).getAssessment(id);
  if (!detail) {
    error(res, 404, 'NOT_FOUND', 'Assessment not found');
    return;
  }
  json(res, 200, detail);
}

async function handleGetAssessments(
  url: URL,
  res: ServerResponse,
): Promise<void> {
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

  const history = await (await storage()).listAssessments(query);
  json(res, 200, history);
}

export function createSabaDevApiMiddleware(): Connect.NextHandleFunction {
  const config = getConfig();
  void resolveDevStorage().then((store) => {
    console.info(`[dev-api] 存储后端: ${store.mode}`);
  });
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
        const store = await storage();
        json(res, 200, {
          status: 'ok',
          version: 'dev',
          timestamp: new Date().toISOString(),
          llm_configured: hasLlmApiKey(getConfig()),
          llm_provider: config.llm_provider,
          storage: store.mode,
        });
        return;
      }

      const traceMatch = url.pathname.match(/^\/api\/v1\/debug\/trace\/([^/]+)$/);
      if (traceMatch && req.method === 'GET') {
        const chain = await collectDevTraceChain(traceMatch[1]!);
        if (
          chain.behavior_events.length === 0 &&
          chain.assessments.length === 0 &&
          chain.baselines.length === 0
        ) {
          error(res, 404, 'NOT_FOUND', `No records for trace_id ${traceMatch[1]}`);
          return;
        }
        json(res, 200, chain);
        return;
      }

      if (url.pathname === '/api/v1/assess/stream' && req.method === 'POST') {
        await handleAssessStream(req, res);
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
        await handleGetAssessment(detailMatch[1]!, res);
        return;
      }

      if (url.pathname === '/api/v1/assessments' && req.method === 'GET') {
        await handleGetAssessments(url, res);
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
