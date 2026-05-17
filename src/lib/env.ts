/**
 * SABA 环境配置
 * 支持 Cloudflare Workers 环境变量和本地 .env 开发
 */

import { config as loadDotenvFile } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 本地开发时读取 .env 文件
// Cloudflare Workers 使用 wrangler secret put 或直接在 wrangler.toml 绑定
// 生产环境请通过 Cloudflare Dashboard 设置或 wrangler secret

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

export function bootstrapEnvFiles(): void {
  loadDotenvFile({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });
  loadDotenvFile({ path: path.join(PROJECT_ROOT, '.env.local'), override: true, quiet: true });
}

bootstrapEnvFiles();

export type LLMProvider = 'anthropic' | 'dashscope';

export interface SABA_CONFIG {
  // LLM 配置
  llm_provider: LLMProvider;
  anthropic_api_key: string;
  anthropic_base_url: string;
  anthropic_model: string;
  anthropic_max_tokens: number;
  dashscope_api_key: string;
  dashscope_model: string;

  // RAG 配置
  rag_enabled: boolean;

  // 应用配置
  app_env: 'development' | 'production';
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

// 默认配置（本地开发使用）
const DEFAULT_CONFIG: SABA_CONFIG = {
  llm_provider: 'dashscope',
  anthropic_api_key: process.env['ANTHROPIC_API_KEY'] || '',
  anthropic_base_url: process.env['ANTHROPIC_BASE_URL'] || '',
  anthropic_model: 'claude-opus-4-7',
  anthropic_max_tokens: 1024,
  dashscope_api_key: process.env['DASHSCOPE_API_KEY'] || '',
  dashscope_model: 'qwen3.6-plus',
  rag_enabled: true,
  app_env: (process.env['NODE_ENV'] as SABA_CONFIG['app_env']) || 'development',
  log_level: 'info',
};

// 从环境变量加载配置
export function loadConfig(): SABA_CONFIG {
  const config: SABA_CONFIG = { ...DEFAULT_CONFIG };

  if (typeof process !== 'undefined' && process.env) {
    config.llm_provider = (process.env['LLM_PROVIDER'] as LLMProvider) || config.llm_provider;
    config.anthropic_api_key = process.env['ANTHROPIC_API_KEY'] || config.anthropic_api_key;
    config.anthropic_base_url = process.env['ANTHROPIC_BASE_URL'] || config.anthropic_base_url;
    config.anthropic_model = process.env['ANTHROPIC_MODEL'] || config.anthropic_model;
    config.anthropic_max_tokens = parseInt(process.env['ANTHROPIC_MAX_TOKENS'] || String(config.anthropic_max_tokens));
    config.dashscope_api_key = process.env['DASHSCOPE_API_KEY'] || config.dashscope_api_key;
    config.dashscope_model = process.env['DASHSCOPE_MODEL'] || config.dashscope_model;
    config.rag_enabled = process.env['RAG_ENABLED'] !== 'false';
    config.app_env = (process.env['APP_ENV'] as SABA_CONFIG['app_env']) || config.app_env;
    config.log_level = (process.env['LOG_LEVEL'] as SABA_CONFIG['log_level']) || config.log_level;
  }

  return config;
}

// 单例配置实例
let _config: SABA_CONFIG | null = null;

export function getConfig(): SABA_CONFIG {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

/** 重新读取 .env 与 process.env（开发服务热重载后调用） */
export function reloadConfig(): SABA_CONFIG {
  bootstrapEnvFiles();
  _config = loadConfig();
  return _config;
}

// Cloudflare Workers 环境变量类型声明
export interface Env {
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

/**
 * 从 Cloudflare Workers Env 获取配置
 */
export function loadConfigFromEnv(env: Env): SABA_CONFIG {
  return {
    llm_provider: (env['LLM_PROVIDER'] as LLMProvider) || (process.env['LLM_PROVIDER'] as LLMProvider) || 'dashscope',
    anthropic_api_key: env['ANTHROPIC_API_KEY'] || process.env['ANTHROPIC_API_KEY'] || '',
    anthropic_base_url: env['ANTHROPIC_BASE_URL'] || process.env['ANTHROPIC_BASE_URL'] || '',
    anthropic_model: env['ANTHROPIC_MODEL'] || process.env['ANTHROPIC_MODEL'] || 'claude-sonnet-4-20250514',
    anthropic_max_tokens: 1024,
    dashscope_api_key: env['DASHSCOPE_API_KEY'] || process.env['DASHSCOPE_API_KEY'] || '',
    dashscope_model: env['DASHSCOPE_MODEL'] || process.env['DASHSCOPE_MODEL'] || 'qwen3.6-plus',
    rag_enabled: env['RAG_ENABLED'] !== 'false' && process.env['RAG_ENABLED'] !== 'false',
    app_env: (env['APP_ENV'] as SABA_CONFIG['app_env']) || (process.env['APP_ENV'] as SABA_CONFIG['app_env']) || 'production',
    log_level: (env['LOG_LEVEL'] as SABA_CONFIG['log_level']) || (process.env['LOG_LEVEL'] as SABA_CONFIG['log_level']) || 'info',
  };
}
