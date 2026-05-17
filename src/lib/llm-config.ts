import type { SABA_CONFIG } from './env.js';
import { getConfig } from './env.js';

export type LlmKeyConfig = Pick<
  SABA_CONFIG,
  'llm_provider' | 'anthropic_api_key' | 'dashscope_api_key'
>;

export class LlmNotConfiguredError extends Error {
  readonly code = 'AI_SERVICE_ERROR' as const;

  constructor(message?: string) {
    super(
      message ??
        '未配置 LLM API Key。请在项目根目录 .env 中设置 DASHSCOPE_API_KEY 或 ANTHROPIC_API_KEY，并重启开发服务。',
    );
    this.name = 'LlmNotConfiguredError';
  }
}

export function isConfiguredApiKey(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (/your_[a-z_]+_here|^xxx+$|^changeme$/i.test(trimmed)) return false;
  return true;
}

export type DeliberationRuntime = 'structured' | 'tool_native';

/** tool_native 仅在与主 provider 一致的 Anthropic 有效 key 时使用。 */
export function resolveDeliberationRuntime(
  config: Partial<LlmKeyConfig> & { deliberation_runtime?: DeliberationRuntime },
): DeliberationRuntime {
  if (config.deliberation_runtime) {
    return config.deliberation_runtime;
  }
  if (config.llm_provider === 'dashscope') {
    return 'structured';
  }
  if (config.llm_provider === 'anthropic' && isConfiguredApiKey(config.anthropic_api_key)) {
    return 'tool_native';
  }
  return 'structured';
}

export function hasLlmApiKey(config: Partial<LlmKeyConfig>): boolean {
  if (config.llm_provider === 'anthropic') {
    return isConfiguredApiKey(config.anthropic_api_key);
  }
  if (config.llm_provider === 'dashscope') {
    return isConfiguredApiKey(config.dashscope_api_key);
  }
  return (
    isConfiguredApiKey(config.anthropic_api_key) ||
    isConfiguredApiKey(config.dashscope_api_key)
  );
}

export function assertLlmConfigured(config: Partial<LlmKeyConfig> = getConfig()): void {
  if (!hasLlmApiKey(config)) {
    throw new LlmNotConfiguredError();
  }
}
