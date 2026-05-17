import Anthropic from '@anthropic-ai/sdk';
import type { AssessStreamSink } from '../lib/assess-stream.js';
import { getDashScopeClient } from '../lib/dashscope.js';
import { parseRiskAssessmentOutput } from '../lib/structured-output.js';
import type { RiskDeliberationConfig, RiskDeliberationInput, RiskDeliberationResult } from './risk-deliberation.js';
import {
  buildRiskDeliberationUserPrompt,
  RISK_DELIBERATION_SYSTEM_PROMPT,
} from './risk-deliberation-prompt.js';
import {
  buildRiskDeliberationSurface,
  deriveDecisionMode,
  inferCriticalUnknowns,
} from './risk-deliberation.js';

export async function streamStructuredDeliberation(
  input: RiskDeliberationInput,
  config: RiskDeliberationConfig,
  sink: AssessStreamSink,
): Promise<RiskDeliberationResult> {
  if (config.llm_provider === 'dashscope' && config.dashscope_api_key) {
    return streamDashScopeDeliberation(input, config, sink);
  }
  if (config.anthropic_api_key) {
    return streamAnthropicDeliberation(input, config, sink);
  }
  throw new Error('No LLM configured for streaming deliberation');
}

async function streamDashScopeDeliberation(
  input: RiskDeliberationInput,
  config: RiskDeliberationConfig,
  sink: AssessStreamSink,
): Promise<RiskDeliberationResult> {
  const client = getDashScopeClient(config.dashscope_api_key!);
  const userPrompt = buildRiskDeliberationUserPrompt(input);

  const stream = await client.chat.completions.create({
    model: config.dashscope_model ?? 'qwen3.6-plus',
    temperature: 0.1,
    max_tokens: 1024,
    stream: true,
    messages: [
      {
        role: 'system',
        content: `你是一位专门帮助乳腺癌患者评估治疗副作用风险的医学助手。\n${RISK_DELIBERATION_SYSTEM_PROMPT}`,
      },
      { role: 'user', content: userPrompt },
    ],
  });

  let fullText = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (!delta) continue;
    fullText += delta;
    sink.emit({ type: 'thinking', delta });
  }

  const parsed = parseRiskAssessmentOutput(fullText);
  if (!parsed) {
    throw new Error('LLM 返回内容无法解析为风险评估结果，请重试');
  }

  return buildDeliberationFromParsed(input, parsed);
}

async function streamAnthropicDeliberation(
  input: RiskDeliberationInput,
  config: RiskDeliberationConfig,
  sink: AssessStreamSink,
): Promise<RiskDeliberationResult> {
  const client = config.anthropic_client_factory
    ? config.anthropic_client_factory()
    : new Anthropic({
        apiKey: config.anthropic_api_key!,
        ...(config.anthropic_base_url ? { baseURL: config.anthropic_base_url } : {}),
      });

  const userPrompt = buildRiskDeliberationUserPrompt(input);
  const stream = client.messages.stream({
    model: config.anthropic_model ?? 'claude-opus-4-7',
    max_tokens: config.anthropic_max_tokens ?? 1024,
    system: RISK_DELIBERATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let fullText = '';
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      fullText += event.delta.text;
      sink.emit({ type: 'thinking', delta: event.delta.text });
    }
  }

  const parsed = parseRiskAssessmentOutput(fullText);
  if (!parsed) {
    throw new Error('LLM 返回内容无法解析为风险评估结果，请重试');
  }

  return buildDeliberationFromParsed(input, parsed);
}

function buildDeliberationFromParsed(
  input: RiskDeliberationInput,
  parsed: NonNullable<ReturnType<typeof parseRiskAssessmentOutput>>,
): RiskDeliberationResult {
  const criticalUnknowns = inferCriticalUnknowns(input);
  const decisionMode =
    parsed.decision_mode ?? deriveDecisionMode(parsed.risk_level, parsed.confidence, criticalUnknowns);
  const visibleUncertainty =
    parsed.visible_uncertainty ?? criticalUnknowns.map((item) => `仍需确认 ${item}`);

  return {
    risk_level: parsed.risk_level,
    risk_score: parsed.risk_score,
    reasoning: parsed.reasoning,
    warning_signs: parsed.warning_signs,
    immediate_action: parsed.immediate_action,
    follow_up: parsed.follow_up,
    confidence: parsed.confidence,
    decision_mode: decisionMode,
    visible_uncertainty: visibleUncertainty,
    next_step: parsed.next_step,
    surface: buildRiskDeliberationSurface({
      input,
      decisionMode,
      confidence: parsed.confidence,
      reasoning: parsed.reasoning,
      riskLevel: parsed.risk_level,
      riskScore: parsed.risk_score,
      criticalUnknowns,
    }),
  };
}
