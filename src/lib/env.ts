/**
 * SABA 环境配置
 * Cloudflare Workers：handler 入口调用 bindWorkerEnv(env)
 * 本地开发：vite / scripts/ensure-env.mjs 预先写入 process.env
 */

export type LLMProvider = 'anthropic' | 'dashscope';

export interface SABA_CONFIG {
  llm_provider: LLMProvider;
  anthropic_api_key: string;
  anthropic_base_url: string;
  anthropic_model: string;
  anthropic_max_tokens: number;
  dashscope_api_key: string;
  dashscope_model: string;
  rag_enabled: boolean;
  app_env: 'development' | 'production';
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

const DEFAULT_CONFIG: SABA_CONFIG = {
  llm_provider: 'dashscope',
  anthropic_api_key: '',
  anthropic_base_url: '',
  anthropic_model: 'claude-opus-4-7',
  anthropic_max_tokens: 1024,
  dashscope_api_key: '',
  dashscope_model: 'qwen3.6-plus',
  rag_enabled: true,
  app_env: 'development',
  log_level: 'info',
};

function readProcessEnv(): Partial<SABA_CONFIG> {
  if (typeof process === 'undefined' || !process.env) {
    return {};
  }
  const e = process.env;
  return {
    llm_provider: (e['LLM_PROVIDER'] as LLMProvider) || undefined,
    anthropic_api_key: e['ANTHROPIC_API_KEY'] || undefined,
    anthropic_base_url: e['ANTHROPIC_BASE_URL'] || undefined,
    anthropic_model: e['ANTHROPIC_MODEL'] || undefined,
    anthropic_max_tokens: e['ANTHROPIC_MAX_TOKENS']
      ? parseInt(e['ANTHROPIC_MAX_TOKENS'], 10)
      : undefined,
    dashscope_api_key: e['DASHSCOPE_API_KEY'] || undefined,
    dashscope_model: e['DASHSCOPE_MODEL'] || undefined,
    rag_enabled: e['RAG_ENABLED'] !== undefined ? e['RAG_ENABLED'] !== 'false' : undefined,
    app_env: (e['APP_ENV'] as SABA_CONFIG['app_env']) || (e['NODE_ENV'] as SABA_CONFIG['app_env']) || undefined,
    log_level: (e['LOG_LEVEL'] as SABA_CONFIG['log_level']) || undefined,
  };
}

export function loadConfig(): SABA_CONFIG {
  const fromEnv = readProcessEnv();
  return {
    ...DEFAULT_CONFIG,
    ...fromEnv,
    llm_provider: fromEnv.llm_provider ?? DEFAULT_CONFIG.llm_provider,
    rag_enabled: fromEnv.rag_enabled ?? DEFAULT_CONFIG.rag_enabled,
    app_env: fromEnv.app_env ?? DEFAULT_CONFIG.app_env,
    log_level: fromEnv.log_level ?? DEFAULT_CONFIG.log_level,
  };
}

let _config: SABA_CONFIG | null = null;

export function getConfig(): SABA_CONFIG {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/** Workers 请求入口：从 env binding / secret 加载配置 */
export function bindWorkerEnv(env: Env): void {
  _config = loadConfigFromEnv(env);
}

/** 本地开发热重载后重新读取 process.env（Workers 上勿调用） */
export function reloadConfig(): SABA_CONFIG {
  _config = loadConfig();
  return _config;
}

export interface Env {
  ASSETS: Fetcher;
  ASSESSMENTS_KV: KVNamespace;
  D1_DATABASE: D1Database;
  LLM_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MODEL?: string;
  DASHSCOPE_API_KEY?: string;
  DASHSCOPE_MODEL?: string;
  RAG_ENABLED?: string;
  APP_ENV?: string;
  LOG_LEVEL?: string;
}

export function loadConfigFromEnv(env: Env): SABA_CONFIG {
  const fromProcess = readProcessEnv();
  return {
    llm_provider:
      (env.LLM_PROVIDER as LLMProvider) ||
      fromProcess.llm_provider ||
      DEFAULT_CONFIG.llm_provider,
    anthropic_api_key: env.ANTHROPIC_API_KEY || fromProcess.anthropic_api_key || '',
    anthropic_base_url: env.ANTHROPIC_BASE_URL || fromProcess.anthropic_base_url || '',
    anthropic_model: env.ANTHROPIC_MODEL || fromProcess.anthropic_model || 'claude-sonnet-4-20250514',
    anthropic_max_tokens: fromProcess.anthropic_max_tokens ?? DEFAULT_CONFIG.anthropic_max_tokens,
    dashscope_api_key: env.DASHSCOPE_API_KEY || fromProcess.dashscope_api_key || '',
    dashscope_model: env.DASHSCOPE_MODEL || fromProcess.dashscope_model || 'qwen3.6-plus',
    rag_enabled:
      env.RAG_ENABLED !== 'false' &&
      (fromProcess.rag_enabled ?? DEFAULT_CONFIG.rag_enabled),
    app_env:
      (env.APP_ENV as SABA_CONFIG['app_env']) ||
      fromProcess.app_env ||
      'production',
    log_level:
      (env.LOG_LEVEL as SABA_CONFIG['log_level']) ||
      fromProcess.log_level ||
      'info',
  };
}
