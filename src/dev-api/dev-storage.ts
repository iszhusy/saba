/**
 * dev-api 存储后端：默认本地 D1（wrangler），可回退内存。
 */
import type { D1Database } from '@cloudflare/workers-types';
import { ConversationStateService } from '../services/conversation-state.js';
import {
  AssessmentRepository,
  BehaviorEventRepository,
  TraceRepository,
} from '../storage/repository.js';
import { PatientBaselineRepository } from '../storage/patient-baseline-repository.js';
import type {
  AssessmentDetail,
  BehaviorEventRequest,
  HistoryQuery,
  HistoryResponse,
  PatientBaseline,
  TraceChainSnapshot,
} from '../types/index.js';
import { createMemoryConversationBundle } from './memory-conversation-store.js';
import { getLocalD1Database } from './d1-platform.js';

export type DevStorageMode = 'd1' | 'memory';

export interface DevBaselineRepo {
  findByUserId(userId: string): Promise<PatientBaseline | null>;
  upsert(baseline: PatientBaseline): Promise<PatientBaseline>;
  findByTraceId(traceId: string): Promise<PatientBaseline[]>;
}

export interface DevStorage {
  mode: DevStorageMode;
  stateService: ConversationStateService;
  baselineRepo: DevBaselineRepo;
  saveAssessment(detail: AssessmentDetail): Promise<void>;
  getAssessment(id: string): Promise<AssessmentDetail | null>;
  listAssessments(query: HistoryQuery): Promise<HistoryResponse>;
  saveBehaviorEvent(
    event: BehaviorEventRequest,
  ): Promise<{ event_id: string; created_at: string }>;
  getTraceChain(traceId: string): Promise<TraceChainSnapshot>;
}

function isD1Enabled(): boolean {
  const raw = process.env.SABA_DEV_STORAGE?.trim().toLowerCase();
  if (raw === 'memory' || raw === '0' || raw === 'false') return false;
  return true;
}

function createMemoryDevStorage(): DevStorage {
  const assessments = new Map<string, AssessmentDetail>();
  const behaviorEvents = new Map<
    string,
    BehaviorEventRequest & { event_id: string; created_at: string }
  >();
  const { service, baselineRepo } = createMemoryConversationBundle();

  return {
    mode: 'memory',
    stateService: service,
    baselineRepo: {
      findByUserId: (userId) => baselineRepo.findByUserId(userId),
      upsert: (baseline) => baselineRepo.upsert(baseline),
      findByTraceId: async (traceId) => baselineRepo.findByTraceId(traceId),
    },
    async saveAssessment(detail) {
      assessments.set(detail.assessment_id!, detail);
    },
    async getAssessment(id) {
      const detail = assessments.get(id);
      return detail ? structuredClone(detail) : null;
    },
    async listAssessments(query) {
      const all = [...assessments.values()]
        .filter((a) => a.user_id === query.user_id)
        .sort(
          (a, b) =>
            new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime(),
        );
      const page = query.page ?? 1;
      const limit = query.limit ?? 20;
      const start = (page - 1) * limit;
      const slice = all.slice(start, start + limit);
      const total = all.length;
      const riskLabels = { high: '高风险', medium: '中风险', low: '低风险' } as const;
      const riskColors = { high: '#EF4444', medium: '#F59E0B', low: '#22C55E' } as const;

      return {
        assessments: slice.map((detail) => {
          const level = detail.risk_level;
          const label =
            detail.result?.label ?? riskLabels[level] ?? '低风险';
          const color =
            detail.result?.color ?? riskColors[level] ?? '#22C55E';
          return {
            assessment_id: detail.assessment_id!,
            risk_level: level,
            result_label: label,
            result_color: color,
            symptom_summary:
              detail.symptoms?.map((s) => s.standard_term ?? s.name).join('、') ||
              detail.raw_input?.slice(0, 40) ||
              '—',
            immediate_action: detail.immediate_action,
            created_at: detail.created_at!,
            triggered_rules: detail.triggered_rules,
            rules_version: detail.metadata.rules_version,
          };
        }),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.max(1, Math.ceil(total / limit)),
        },
      };
    },
    async saveBehaviorEvent(event) {
      const event_id = crypto.randomUUID();
      const created_at = new Date().toISOString();
      behaviorEvents.set(event_id, { ...event, event_id, created_at });
      return { event_id, created_at };
    },
    async getTraceChain(traceId) {
      const matchedAssessments = [...assessments.values()].filter(
        (item) => item.trace?.trace_id === traceId,
      );
      const matchedEvents = [...behaviorEvents.values()].filter(
        (item) => item.trace?.trace_id === traceId,
      );
      const baselines = await baselineRepo.findByTraceId(traceId);
      const { buildTraceChainSnapshot } = await import('../lib/trace-chain.js');
      return {
        ...buildTraceChainSnapshot({
          traceId,
          assessments: matchedAssessments,
          behavior_events: matchedEvents,
        }),
        baselines,
        notifications: [],
      };
    },
  };
}

function createD1DevStorage(db: D1Database): DevStorage {
  const assessmentRepo = new AssessmentRepository(db);
  const behaviorRepo = new BehaviorEventRepository(db);
  const traceRepo = new TraceRepository(db);
  const baselineRepo = new PatientBaselineRepository(db);
  const stateService = ConversationStateService.createFromDb(db);

  return {
    mode: 'd1',
    stateService,
    baselineRepo,
    async saveAssessment(detail) {
      await assessmentRepo.create(detail);
    },
    async getAssessment(id) {
      return assessmentRepo.findById(id);
    },
    async listAssessments(query) {
      return assessmentRepo.findByUserId(query);
    },
    async saveBehaviorEvent(event) {
      const event_id = crypto.randomUUID();
      const created_at = new Date().toISOString();
      await behaviorRepo.create({ ...event, event_id });
      return { event_id, created_at };
    },
    async getTraceChain(traceId) {
      return traceRepo.getTraceChain(traceId);
    },
  };
}

let storagePromise: Promise<DevStorage> | null = null;

export function resolveDevStorage(): Promise<DevStorage> {
  if (!storagePromise) {
    storagePromise = initDevStorage();
  }
  return storagePromise;
}

async function initDevStorage(): Promise<DevStorage> {
  if (!isD1Enabled()) {
    console.info('[dev-api] 存储: memory（SABA_DEV_STORAGE=memory）');
    return createMemoryDevStorage();
  }

  try {
    const db = await getLocalD1Database();
    console.info('[dev-api] 存储: 本地 D1（.wrangler/state，与 Workers 同 schema）');
    return createD1DevStorage(db);
  } catch (err) {
    console.warn(
      '[dev-api] 本地 D1 初始化失败，回退 memory:',
      err instanceof Error ? err.message : err,
    );
    return createMemoryDevStorage();
  }
}
